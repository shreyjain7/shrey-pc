import {
  ATTENDANCE,
  DAYS,
  EXAMS,
  GRID,
  PERIODS,
  SUBJECTS,
  type AttendanceRecord,
  type DayId,
  type ScheduledClass,
  attendanceView,
  classesOn,
  currentClass,
  dayIdFor,
  formatTime,
  nextClass,
  overallAttendance,
  semester,
  subjectsByCode,
  toMinutes,
} from '../../data/timetable';
import { SPRING, Spring, stagger } from '../anim';
import { settings } from '../settings';
import { telemetry } from '../../world/telemetry';
import { el } from '../ui';

/**
 * Timetable & Attendance.
 *
 * Three views over the same data: the week as a grid, today as a running
 * timeline that knows which period you are actually in, and the attendance
 * ledger with the only number that matters — how many more classes you can
 * miss before the institute stops letting you sit the exam.
 *
 * Edits to the ledger are written to localStorage, so marking yourself present
 * survives a reload without touching `src/data/timetable.ts`.
 */

const STORAGE_KEY = 'shrey-pc:attendance:v1';

type View = 'week' | 'today' | 'attendance';

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

function loadRecords(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ATTENDANCE.map((record) => ({ ...record }));

    const stored = JSON.parse(raw) as AttendanceRecord[];
    const byCode = new Map(stored.map((record) => [record.code, record]));

    // Seed order wins, so a subject added to the data file appears even if the
    // saved ledger predates it.
    return ATTENDANCE.map((seed) => {
      const saved = byCode.get(seed.code);
      return saved ? { ...seed, held: saved.held, attended: saved.attended } : { ...seed };
    });
  } catch {
    return ATTENDANCE.map((record) => ({ ...record }));
  }
}

function saveRecords(records: AttendanceRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Not persisting an edit is survivable; the session still shows it.
  }
}

/* -------------------------------------------------------------------------- */
/* Shared pieces — the browser's timetable page reuses these                   */
/* -------------------------------------------------------------------------- */

const hourFormat = () => settings.state.clock24;

function subjectChip(code: string) {
  const subject = subjectsByCode.get(code);
  const chip = el('span', 'tt-chip', subject?.short ?? code);
  if (subject) chip.style.setProperty('--hue', String(subject.hue));
  return chip;
}

/** The week, as a grid. `highlightToday` draws the live column marker. */
export function renderWeekGrid(highlightToday = true) {
  const today = dayIdFor(new Date());

  const table = el('div', 'tt-grid');
  table.style.setProperty('--cols', String(DAYS.length));

  // Header row: a blank corner cell, then the days.
  table.append(el('div', 'tt-grid__corner', 'Period'));
  for (const day of DAYS) {
    const head = el('div', 'tt-grid__day', day.short);
    if (highlightToday && day.id === today) head.classList.add('is-today');
    table.append(head);
  }

  for (const period of PERIODS) {
    const time = el('div', 'tt-grid__time');
    time.append(el('span', 'tt-grid__start', formatTime(period.start, hourFormat())));
    time.append(el('span', 'tt-grid__end', formatTime(period.end, hourFormat())));
    if (period.break) time.classList.add('is-break');
    table.append(time);

    for (const day of DAYS) {
      const slot = GRID[day.id][period.id];
      const cell = el('div', 'tt-grid__cell');
      if (highlightToday && day.id === today) cell.classList.add('is-today');

      if (period.break) {
        cell.classList.add('is-break');
        cell.textContent = period.label ?? '';
      } else if (!slot?.subject) {
        cell.classList.add('is-free');
        cell.textContent = '—';
      } else {
        const subject = subjectsByCode.get(slot.subject);
        cell.classList.add('is-class', 'is-' + slot.kind);
        if (subject) cell.style.setProperty('--hue', String(subject.hue));

        cell.append(el('span', 'tt-grid__code', subject?.short ?? slot.subject));
        if (slot.room) cell.append(el('span', 'tt-grid__room', slot.room));
        if (slot.kind !== 'lecture') {
          cell.append(el('span', 'tt-grid__kind', slot.kind === 'lab' ? 'LAB' : 'TUT'));
        }
        cell.title = [subject?.name ?? slot.subject, subject?.faculty, slot.room]
          .filter(Boolean)
          .join('\n');
      }

      table.append(cell);
    }
  }

  return table;
}

/**
 * The subject legend. Faculty and credits are optional in the data — the
 * published timetable does not carry them — so the sub-line is assembled from
 * whatever is actually known rather than printing holes.
 */
export function renderSubjectKey() {
  const list = el('div', 'tt-key');

  for (const subject of SUBJECTS) {
    const row = el('div', 'tt-key__row');
    row.style.setProperty('--hue', String(subject.hue));
    row.append(el('span', 'tt-key__swatch'));
    row.append(el('span', 'tt-key__short', subject.short));

    const meta = el('div', 'tt-key__meta');
    meta.append(el('span', 'tt-key__name', subject.name));

    // Where the class meets is the useful fact when faculty is unknown.
    const rooms = [
      ...new Set(
        DAYS.flatMap((day) =>
          PERIODS.map((period) => GRID[day.id][period.id]).filter(
            (slot) => slot?.subject === subject.code && slot.room,
          ),
        ).map((slot) => slot!.room!),
      ),
    ];

    const sub = [subject.faculty, subject.credits ? `${subject.credits} cr` : '', rooms.join(' · ')]
      .filter(Boolean)
      .join(' · ');
    if (sub) meta.append(el('span', 'tt-key__sub', sub));
    row.append(meta);

    list.append(row);
  }

  return list;
}

/** The internal-assessment windows, from the published academic calendar. */
export function renderExamWindows() {
  const list = el('div', 'tt-exams');
  for (const exam of EXAMS) {
    const card = el('div', 'tt-exams__card');
    card.append(el('span', 'tt-exams__tag', exam.label));
    card.append(el('span', 'tt-exams__range', exam.range));
    list.append(card);
  }
  return list;
}

/**
 * A donut for one subject's attendance.
 *
 * Drawn as two stacked SVG circles with `stroke-dasharray` doing the work; the
 * arc animates from zero on a spring so a list of these fills in rather than
 * appearing.
 */
function attendanceRing(percent: number, safe: boolean, hue: number) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  const wrap = el('div', 'tt-ring');
  wrap.style.setProperty('--hue', String(hue));
  wrap.classList.toggle('is-risk', !safe);

  wrap.innerHTML =
    `<svg viewBox="0 0 64 64" aria-hidden="true">` +
    `<circle class="tt-ring__track" cx="32" cy="32" r="${radius}"></circle>` +
    `<circle class="tt-ring__arc" cx="32" cy="32" r="${radius}" ` +
    `stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"></circle>` +
    `</svg>`;

  const label = el('span', 'tt-ring__label', '0%');
  wrap.append(label);

  const arc = wrap.querySelector('.tt-ring__arc') as SVGCircleElement;
  const spring = new Spring(0, {
    ...SPRING.stage,
    onUpdate: (value) => {
      arc.style.strokeDashoffset = String(circumference * (1 - value / 100));
      label.textContent = Math.round(value) + '%';
    },
  });
  // A frame's delay so the window's own open animation lands first.
  window.setTimeout(() => spring.to(percent), 120);

  return wrap;
}

/** The attendance ledger. `onChange` is omitted for the read-only web page. */
export function renderAttendance(
  records: AttendanceRecord[],
  onChange?: (code: string, attended: boolean) => void,
) {
  const root = el('div', 'tt-attendance');
  const overall = overallAttendance(records);
  const views = attendanceView(records);
  const atRisk = views.filter((view) => !view.safe);

  /* --- Summary --------------------------------------------------------- */
  const summary = el('div', 'tt-summary');
  summary.classList.toggle('is-risk', overall.percent < semester.minimumAttendance);

  const started = overall.held > 0;

  const headline = el('div', 'tt-summary__figure');
  headline.append(
    el('span', 'tt-summary__percent', started ? overall.percent.toFixed(1) + '%' : '—'),
  );
  headline.append(
    el(
      'span',
      'tt-summary__caption',
      started ? `${overall.attended} of ${overall.held} classes attended` : 'Nothing logged yet',
    ),
  );
  summary.append(headline);

  const note = el('div', 'tt-summary__note');
  if (!started) {
    note.append(el('strong', undefined, 'Start marking to see where you stand'));
    note.append(
      el(
        'span',
        undefined,
        `Use Present and Absent on each subject below. The institute's minimum is ${semester.minimumAttendance}%.`,
      ),
    );
  } else if (atRisk.length) {
    note.append(el('strong', undefined, `${atRisk.length} subject${atRisk.length > 1 ? 's' : ''} below ${semester.minimumAttendance}%`));
    note.append(
      el('span', undefined, atRisk.map((view) => view.subject.short).join(', ')),
    );
  } else {
    note.append(el('strong', undefined, `Clear of the ${semester.minimumAttendance}% minimum`));
    note.append(el('span', undefined, 'Every subject is above the detention line.'));
  }
  summary.append(note);
  root.append(summary);

  /* --- Per subject ------------------------------------------------------ */
  const list = el('div', 'tt-subjects');

  for (const view of views) {
    const card = el('article', 'tt-subject');
    card.style.setProperty('--hue', String(view.subject.hue));
    card.classList.toggle('is-risk', !view.safe);

    card.append(attendanceRing(view.percent, view.safe, view.subject.hue));

    const body = el('div', 'tt-subject__body');
    body.append(el('h3', 'tt-subject__name', view.subject.name));
    body.append(
      el(
        'p',
        'tt-subject__meta',
        view.recorded ? `${view.attended}/${view.held} attended` : 'No classes logged',
      ),
    );

    const verdict = el('p', 'tt-subject__verdict');
    if (!view.recorded) {
      verdict.textContent = 'Mark a class to start tracking this one.';
    } else if (view.safe) {
      verdict.textContent =
        view.canSkip > 0
          ? `You can miss ${view.canSkip} more and stay above ${semester.minimumAttendance}%.`
          : 'On the line — the next miss drops you below the minimum.';
    } else {
      verdict.textContent = `Attend the next ${view.mustAttend} in a row to climb back over ${semester.minimumAttendance}%.`;
    }
    body.append(verdict);

    if (onChange) {
      const actions = el('div', 'tt-subject__actions');

      const present = el('button', 'tt-btn tt-btn--yes', 'Mark present');
      present.type = 'button';
      present.addEventListener('click', () => onChange(view.code, true));

      const absent = el('button', 'tt-btn tt-btn--no', 'Mark absent');
      absent.type = 'button';
      absent.addEventListener('click', () => onChange(view.code, false));

      actions.append(present, absent);
      body.append(actions);
    }

    card.append(body);
    list.append(card);
  }

  root.append(list);
  stagger(Array.from(list.children) as HTMLElement[], 44);
  return root;
}

/* -------------------------------------------------------------------------- */
/* Today                                                                       */
/* -------------------------------------------------------------------------- */

function renderToday(date: Date) {
  const root = el('div', 'tt-today');
  const day = dayIdFor(date);

  const head = el('div', 'tt-today__head');
  head.append(
    el(
      'h2',
      'tt-today__date',
      date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }),
    ),
  );

  if (!day) {
    head.append(el('p', 'tt-today__sub', 'Sunday. Nothing scheduled.'));
    root.append(head);

    const upcoming = nextClass(date);
    if (upcoming) {
      root.append(
        el(
          'p',
          'tt-today__empty',
          `Next up: ${upcoming.subject.name} at ${formatTime(upcoming.period.start, hourFormat())} on ${
            DAYS.find((entry) => entry.id === upcoming.day)?.label
          }.`,
        ),
      );
    }
    return root;
  }

  const classes = classesOn(day);
  const live = currentClass(date);
  const upcoming = nextClass(date);
  const minutes = date.getHours() * 60 + date.getMinutes();

  head.append(
    el(
      'p',
      'tt-today__sub',
      `${classes.length} class${classes.length === 1 ? '' : 'es'} · ${semester.section}`,
    ),
  );
  root.append(head);

  /* --- The banner: what is happening right now -------------------------- */
  const banner = el('div', 'tt-now');
  if (live) {
    banner.classList.add('is-live');
    banner.style.setProperty('--hue', String(live.subject.hue));
    banner.append(el('span', 'tt-now__label', 'In class now'));
    banner.append(el('span', 'tt-now__title', live.subject.name));
    const remaining = toMinutes(live.period.end) - minutes;
    banner.append(
      el('span', 'tt-now__meta', `${live.slot.room ?? ''} · ${remaining} min remaining`),
    );
  } else if (upcoming) {
    banner.style.setProperty('--hue', String(upcoming.subject.hue));
    banner.append(el('span', 'tt-now__label', 'Next class'));
    banner.append(el('span', 'tt-now__title', upcoming.subject.name));

    const sameDay = upcoming.day === day;
    const away = toMinutes(upcoming.period.start) - minutes;
    banner.append(
      el(
        'span',
        'tt-now__meta',
        sameDay
          ? `${formatTime(upcoming.period.start, hourFormat())} · ${upcoming.slot.room ?? ''} · in ${
              away >= 60 ? `${Math.floor(away / 60)}h ${away % 60}m` : `${away} min`
            }`
          : `${DAYS.find((entry) => entry.id === upcoming.day)?.label} ${formatTime(
              upcoming.period.start,
              hourFormat(),
            )} · ${upcoming.slot.room ?? ''}`,
      ),
    );
  } else {
    banner.append(el('span', 'tt-now__label', 'Done for the day'));
    banner.append(el('span', 'tt-now__title', 'No classes left'));
  }
  root.append(banner);

  /* --- The timeline ----------------------------------------------------- */
  const timeline = el('div', 'tt-timeline');

  for (const entry of classes) {
    const row = el('article', 'tt-slot');
    row.style.setProperty('--hue', String(entry.subject.hue));

    const done = minutes >= toMinutes(entry.period.end);
    const isLive = live?.period.id === entry.period.id;
    row.classList.toggle('is-done', done);
    row.classList.toggle('is-live', isLive);

    const time = el('div', 'tt-slot__time');
    time.append(el('span', undefined, formatTime(entry.period.start, hourFormat())));
    time.append(el('span', 'tt-slot__dash', formatTime(entry.period.end, hourFormat())));
    row.append(time);

    row.append(el('span', 'tt-slot__rail'));

    const body = el('div', 'tt-slot__body');
    body.append(el('h3', 'tt-slot__name', entry.subject.name));
    body.append(
      el(
        'p',
        'tt-slot__meta',
        [entry.slot.room, entry.subject.faculty, entry.slot.kind === 'lecture' ? null : entry.slot.kind.toUpperCase()]
          .filter(Boolean)
          .join(' · '),
      ),
    );
    row.append(body);
    row.append(subjectChip(entry.subject.code));

    timeline.append(row);
  }

  if (!classes.length) root.append(el('p', 'tt-today__empty', 'Nothing timetabled today.'));
  else root.append(timeline);

  stagger(Array.from(timeline.children) as HTMLElement[], 38);
  return root;
}

/* -------------------------------------------------------------------------- */
/* The app                                                                     */
/* -------------------------------------------------------------------------- */

export function createTimetable(): HTMLElement {
  const root = el('div', 'tt');
  let records = loadRecords();
  let view: View = 'today';

  const head = el('header', 'tt__head');
  const title = el('div', 'tt__title');
  title.append(el('h1', undefined, 'Timetable & Attendance'));
  title.append(
    el('p', 'tt__sub', `${semester.label} · ${semester.programme} · ${semester.term}`),
  );
  head.append(title);

  const tabs = el('nav', 'tt__tabs');
  const tabButtons = new Map<View, HTMLButtonElement>();

  for (const [id, label] of [
    ['today', 'Today'],
    ['week', 'Week'],
    ['attendance', 'Attendance'],
  ] as Array<[View, string]>) {
    const button = el('button', 'tt__tab', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (view === id) return;
      view = id;
      render();
    });
    tabButtons.set(id, button);
    tabs.append(button);
  }

  // The sliding underline: one element moved with a spring rather than a
  // border on each tab, so switching tabs glides instead of blinking.
  const indicator = el('span', 'tt__tab-indicator');
  tabs.append(indicator);

  const indicatorX = new Spring(0, {
    ...SPRING.menu,
    onUpdate: (value) => {
      indicator.style.transform = `translateX(${value}px)`;
    },
  });
  const indicatorW = new Spring(0, {
    ...SPRING.menu,
    onUpdate: (value) => {
      indicator.style.width = `${value}px`;
    },
  });

  head.append(tabs);
  root.append(head);

  const body = el('div', 'tt__body');
  root.append(body);

  function moveIndicator(immediate = false) {
    const button = tabButtons.get(view);
    if (!button) return;
    const left = button.offsetLeft;
    const width = button.offsetWidth;
    if (immediate) {
      indicatorX.set(left);
      indicatorW.set(width);
    } else {
      indicatorX.to(left);
      indicatorW.to(width);
    }
  }

  function adjust(code: string, attended: boolean) {
    records = records.map((record) =>
      record.code === code
        ? { ...record, held: record.held + 1, attended: record.attended + (attended ? 1 : 0) }
        : record,
    );
    saveRecords(records);
    telemetry.diskActivity(0.6);
    render();
  }

  function render() {
    for (const [id, button] of tabButtons) button.classList.toggle('is-active', id === view);

    const page = el('div', 'tt__page');
    if (view === 'today') page.append(renderToday(new Date()));
    else if (view === 'week') {
      page.append(renderWeekGrid());
      page.append(renderSubjectKey());
      page.append(el('h3', 'tt__heading', 'Internal assessments'));
      page.append(renderExamWindows());
    } else page.append(renderAttendance(records, adjust));

    body.replaceChildren(page);
    // One frame so the fresh page has a layout to animate from.
    requestAnimationFrame(() => {
      page.classList.add('is-in');
      moveIndicator();
    });
  }

  render();
  requestAnimationFrame(() => moveIndicator(true));

  // The "Today" view quotes a live countdown, so re-render it on the minute.
  const timer = window.setInterval(() => {
    if (view === 'today') render();
  }, 30000);

  const unsubscribe = settings.on(() => render());

  root.addEventListener('app:destroy', () => {
    window.clearInterval(timer);
    unsubscribe();
    indicatorX.cancel();
    indicatorW.cancel();
  });

  return root;
}

/** Used by the terminal's `next` command and the desktop widget. */
export function describeNextClass(date = new Date()): string {
  const upcoming: ScheduledClass | null = currentClass(date) ?? nextClass(date);
  if (!upcoming) return 'Nothing timetabled.';

  const live = currentClass(date);
  const day: DayId = upcoming.day;
  const dayLabel = DAYS.find((entry) => entry.id === day)?.label ?? '';

  return live
    ? `Now: ${upcoming.subject.name} (${upcoming.slot.room ?? '—'}) until ${formatTime(upcoming.period.end, hourFormat())}`
    : `Next: ${upcoming.subject.name} — ${dayLabel} ${formatTime(upcoming.period.start, hourFormat())} in ${upcoming.slot.room ?? '—'}`;
}

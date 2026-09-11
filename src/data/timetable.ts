/**
 * The class timetable and attendance ledger.
 *
 * Transcribed from the timetable published on shreyjain.in (the `cv` repo):
 * VII semester CSE, School of Computer Engineering, MIT Manipal.
 *
 * Faculty names and credit counts are deliberately absent — the source does
 * not carry them, and inventing plausible ones is worse than leaving them off.
 *
 * Attendance counts below are a starting point of zero. The app writes edits
 * to localStorage, so marking yourself present survives a reload without
 * touching this file; everything downstream (the Timetable app, the browser's
 * timetable page, the `next`/`today`/`attendance` terminal commands) reads
 * from here.
 */

export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export type SlotKind = 'lecture' | 'lab' | 'tutorial' | 'break' | 'free';

export interface Period {
  id: string;
  /** 24-hour, "HH:MM". */
  start: string;
  end: string;
  /** Breaks are laid out differently and never count toward attendance. */
  break?: boolean;
  label?: string;
}

export interface Subject {
  code: string;
  name: string;
  short: string;
  /** Absent from the published timetable, so usually unset. */
  faculty?: string;
  credits?: number;
  /** Two-letter accent key, used to colour the subject consistently. */
  hue: number;
}

export interface Slot {
  /** Matches a `Subject.code`, or null for a free period. */
  subject: string | null;
  kind: SlotKind;
  room?: string;
}

export interface AttendanceRecord {
  code: string;
  held: number;
  attended: number;
}

export const DAYS: Array<{ id: DayId; label: string; short: string }> = [
  { id: 'mon', label: 'Monday', short: 'MON' },
  { id: 'tue', label: 'Tuesday', short: 'TUE' },
  { id: 'wed', label: 'Wednesday', short: 'WED' },
  { id: 'thu', label: 'Thursday', short: 'THU' },
  { id: 'fri', label: 'Friday', short: 'FRI' },
  { id: 'sat', label: 'Saturday', short: 'SAT' },
];

export const PERIODS: Period[] = [
  { id: 'p1', start: '08:00', end: '09:00' },
  { id: 'p2', start: '09:00', end: '10:00' },
  { id: 'b1', start: '10:00', end: '10:30', break: true, label: 'Break' },
  { id: 'p3', start: '10:30', end: '11:30' },
  { id: 'p4', start: '11:30', end: '12:30' },
  { id: 'b2', start: '12:30', end: '13:00', break: true, label: 'Lunch' },
  { id: 'p5', start: '13:00', end: '14:00' },
  { id: 'p6', start: '14:00', end: '15:00' },
  { id: 'b3', start: '15:00', end: '15:30', break: true, label: 'Break' },
  { id: 'p7', start: '15:30', end: '16:30' },
];export const SUBJECTS: Subject[] = [
  { code: 'CC', name: 'Cloud Computing', short: 'CC', hue: 199 },
  { code: 'HCI', name: 'Human-Computer Interaction', short: 'HCI', hue: 265 },
  { code: 'MM', name: 'Mathematical Modelling', short: 'Math. Modelling', hue: 38 },
  { code: 'SC', name: 'Soft Computing', short: 'Soft Comp.', hue: 152 },
  { code: 'DBS', name: 'Database & Application Security', short: 'DB & App Sec', hue: 340 },
  { code: 'ST', name: 'Software Testing', short: 'Software Testing', hue: 96 },
];const L = (subject: string, room: string): Slot => ({ subject, kind: 'lecture', room });
const FREE: Slot = { subject: null, kind: 'free' };
const BREAK: Slot = { subject: null, kind: 'break' };

/**
 * The week, as `day → period id → slot`. This semester is all lectures; the
 * lab and tutorial kinds stay in the type because a later timetable may use
 * them, and the app already draws them.
 */
export const GRID: Record<DayId, Record<string, Slot>> = {
  mon: {
    p1: FREE,
    p2: FREE,
    b1: BREAK,
    p3: FREE,
    p4: FREE,
    b2: BREAK,
    p5: FREE,
    p6: L('CC', 'AB5-212'),
    b3: BREAK,
    p7: L('HCI', 'AB5-210'),
  },
  tue: {
    p1: L('MM', 'AB5-313'),
    p2: L('SC', 'AB5-311'),
    b1: BREAK,
    p3: L('DBS', 'AB5-311'),
    p4: L('ST', 'AB5-307'),
    b2: BREAK,
    p5: FREE,
    p6: FREE,
    b3: BREAK,
    p7: FREE,
  },
  wed: {
    p1: FREE,
    p2: FREE,
    b1: BREAK,
    p3: FREE,
    p4: FREE,
    b2: BREAK,
    p5: L('MM', 'AB5-313'),
    p6: L('DBS', 'AB5-311'),
    b3: BREAK,
    p7: L('ST', 'AB5-307'),
  },
  thu: {
    p1: L('HCI', 'AB5-210'),
    p2: L('CC', 'AB5-212'),
    b1: BREAK,
    p3: L('SC', 'AB5-311'),
    p4: L('MM', 'AB5-313'),
    b2: BREAK,
    p5: FREE,
    p6: FREE,
    b3: BREAK,
    p7: FREE,
  },
  fri: {
    p1: FREE,
    p2: FREE,
    b1: BREAK,
    p3: FREE,
    p4: FREE,
    b2: BREAK,
    p5: FREE,
    p6: L('SC', 'AB5-311'),
    b3: BREAK,
    p7: L('DBS', 'AB5-311'),
  },
  sat: {
    p1: L('CC', 'AB5-212'),
    p2: L('ST', 'AB5-307'),
    b1: BREAK,
    p3: L('HCI', 'AB5-210'),
    p4: FREE,
    b2: BREAK,
    p5: FREE,
    p6: FREE,
    b3: BREAK,
    p7: FREE,
  },
};/** Seed ledger. Zero until you start marking — the app persists edits over it. */
export const ATTENDANCE: AttendanceRecord[] = SUBJECTS.map((subject) => ({
  code: subject.code,
  held: 0,
  attended: 0,
}));

/** Internal assessment windows, from the same published calendar. */
export const EXAMS: Array<{ label: string; range: string }> = [
  { label: 'IA1', range: '17 – 29 Aug 2026' },
  { label: 'IA2', range: '7 – 21 Sep 2026' },
  { label: 'IA3', range: '19 – 31 Oct 2026' },
];

export const semester = {
  label: 'Semester VII',
  programme: 'B.Tech Computer Science & Engineering',
  institute: 'School of Computer Engineering, MIT Manipal',
  section: 'VII B.Tech (CSE)',
  /** Institute minimum, as a percentage. Below this you are detained. */
  minimumAttendance: 75,
  term: 'AY 2025-26',
};/* -------------------------------------------------------------------------- */
/* Derived helpers — shared by the app, the browser page and the terminal      */
/* -------------------------------------------------------------------------- */

export const subjectsByCode = new Map(SUBJECTS.map((subject) => [subject.code, subject]));
export const periodsById = new Map(PERIODS.map((period) => [period.id, period]));

/** "HH:MM" as minutes since midnight. */
export function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTime(time: string, hour24 = false) {
  if (hour24) return time;
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** Maps a JS `Date.getDay()` onto a timetable day, or null on Sunday. */
export function dayIdFor(date: Date): DayId | null {
  const map: Record<number, DayId> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
  return map[date.getDay()] ?? null;
}

export interface ScheduledClass {
  period: Period;
  slot: Slot;
  subject: Subject;
  day: DayId;
}

/** Every teaching slot on a given day, in order, breaks and free periods out. */
export function classesOn(day: DayId): ScheduledClass[] {
  const row = GRID[day];
  const result: ScheduledClass[] = [];

  for (const period of PERIODS) {
    if (period.break) continue;
    const slot = row[period.id];
    if (!slot?.subject) continue;
    const subject = subjectsByCode.get(slot.subject);
    if (!subject) continue;
    result.push({ period, slot, subject, day });
  }

  return result;
}

/** The class happening right now, if one is. */
export function currentClass(date = new Date()): ScheduledClass | null {
  const day = dayIdFor(date);
  if (!day) return null;

  const minutes = date.getHours() * 60 + date.getMinutes();
  return (
    classesOn(day).find(
      (entry) => minutes >= toMinutes(entry.period.start) && minutes < toMinutes(entry.period.end),
    ) ?? null
  );
}

/** The next class today, or the first one on the next teaching day. */
export function nextClass(date = new Date()): ScheduledClass | null {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const today = dayIdFor(date);

  if (today) {
    const later = classesOn(today).find((entry) => toMinutes(entry.period.start) > minutes);
    if (later) return later;
  }

  // Walk forward up to a week looking for the next day that actually teaches.
  const order: DayId[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const startIndex = today ? order.indexOf(today) : -1;

  for (let step = 1; step <= 7; step += 1) {
    const day = order[(startIndex + step + 7) % order.length];
    const [first] = classesOn(day);
    if (first) return first;
  }

  return null;
}

export interface AttendanceView extends AttendanceRecord {
  subject: Subject;
  /** False when no class has been logged yet, so `percent` means nothing. */
  recorded: boolean;
  percent: number;
  /** How many more in a row you may miss and still clear the minimum. */
  canSkip: number;
  /** How many in a row you must now attend to climb back to the minimum. */
  mustAttend: number;
  safe: boolean;
}

/**
 * Attendance maths, done once so the app, the terminal and the browser page
 * all quote the same numbers.
 *
 * `canSkip` is the largest `n` where `attended / (held + n) >= minimum`;
 * `mustAttend` is the smallest `n` where `(attended + n) / (held + n)` clears
 * it. Both are integers because you cannot attend two-thirds of a lecture.
 */
export function attendanceView(records: AttendanceRecord[] = ATTENDANCE): AttendanceView[] {
  const minimum = semester.minimumAttendance / 100;

  return records.flatMap((record) => {
    const subject = subjectsByCode.get(record.code);
    if (!subject) return [];

    // With nothing logged there is no percentage to speak of. Reporting 100%
    // would read as "comfortably clear" when the truth is "unknown".
    const recorded = record.held > 0;
    const percent = recorded ? (record.attended / record.held) * 100 : 0;
    const safe = !recorded || percent >= semester.minimumAttendance;

    const canSkip =
      recorded && safe ? Math.max(Math.floor(record.attended / minimum) - record.held, 0) : 0;
    const mustAttend =
      recorded && !safe
        ? Math.max(Math.ceil((minimum * record.held - record.attended) / (1 - minimum)), 0)
        : 0;

    return [{ ...record, subject, recorded, percent, canSkip, mustAttend, safe }];
  });
}

/** Weighted across every subject, which is the figure the institute quotes. */
export function overallAttendance(records: AttendanceRecord[] = ATTENDANCE) {
  const held = records.reduce((sum, record) => sum + record.held, 0);
  const attended = records.reduce((sum, record) => sum + record.attended, 0);
  return { held, attended, percent: held === 0 ? 100 : (attended / held) * 100 };
}

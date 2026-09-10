/**
 * The class timetable and attendance ledger.
 *
 * ── Read this before you ship ────────────────────────────────────────────
 * The subject list below is taken verbatim from the coursework in `cv.ts`.
 * The slot grid, room numbers, faculty initials and the attended/held counts
 * are *structure*, not a transcript — replace them with the real ones and
 * everything downstream (the Timetable app, the browser's timetable page, the
 * `next`/`today` terminal commands, the desktop widget) updates together.
 *
 * Attendance counts are the seed only. The app writes any edits you make to
 * localStorage, so marking yourself present in the UI survives a reload
 * without touching this file.
 * ─────────────────────────────────────────────────────────────────────────
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
  faculty: string;
  credits: number;
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
  { id: 'p1', start: '08:00', end: '08:55' },
  { id: 'p2', start: '09:00', end: '09:55' },
  { id: 'p3', start: '10:00', end: '10:55' },
  { id: 'b1', start: '10:55', end: '11:15', break: true, label: 'Break' },
  { id: 'p4', start: '11:15', end: '12:10' },
  { id: 'p5', start: '12:15', end: '13:10' },
  { id: 'b2', start: '13:10', end: '14:00', break: true, label: 'Lunch' },
  { id: 'p6', start: '14:00', end: '14:55' },
  { id: 'p7', start: '15:00', end: '15:55' },
  { id: 'p8', start: '16:00', end: '16:55' },
];

export const SUBJECTS: Subject[] = [
  {
    code: 'CSE2001',
    name: 'Data Structures & Algorithms',
    short: 'DSA',
    faculty: 'Dr. A. Rao',
    credits: 4,
    hue: 199,
  },
  {
    code: 'CSE2101',
    name: 'Database Management Systems',
    short: 'DBMS',
    faculty: 'Dr. S. Menon',
    credits: 4,
    hue: 152,
  },
  {
    code: 'CSE2201',
    name: 'Operating Systems',
    short: 'OS',
    faculty: 'Prof. K. Iyer',
    credits: 4,
    hue: 38,
  },
  {
    code: 'CSE2301',
    name: 'Computer Networks',
    short: 'CN',
    faculty: 'Dr. R. Bhat',
    credits: 3,
    hue: 265,
  },
  {
    code: 'CSE2401',
    name: 'Object-Oriented Programming',
    short: 'OOP',
    faculty: 'Prof. N. Shetty',
    credits: 3,
    hue: 340,
  },
  {
    code: 'MAT2201',
    name: 'Discrete Mathematics',
    short: 'DM',
    faculty: 'Dr. V. Kamath',
    credits: 3,
    hue: 14,
  },
  {
    code: 'CSE2501',
    name: 'Software Engineering',
    short: 'SE',
    faculty: 'Dr. P. Nayak',
    credits: 3,
    hue: 96,
  },
  {
    code: 'CSE2601',
    name: 'Artificial Intelligence & Machine Learning',
    short: 'AIML',
    faculty: 'Dr. M. Pai',
    credits: 4,
    hue: 220,
  },
];

const L = (subject: string, room: string): Slot => ({ subject, kind: 'lecture', room });
const LAB = (subject: string, room: string): Slot => ({ subject, kind: 'lab', room });
const T = (subject: string, room: string): Slot => ({ subject, kind: 'tutorial', room });
const FREE: Slot = { subject: null, kind: 'free' };
const BREAK: Slot = { subject: null, kind: 'break' };

/**
 * The week, as `day → period id → slot`. A lab occupies consecutive periods
 * and is simply repeated across them; the app merges the runs when it draws.
 */
export const GRID: Record<DayId, Record<string, Slot>> = {
  mon: {
    p1: L('CSE2001', 'AB1-201'),
    p2: L('CSE2101', 'AB1-201'),
    p3: L('CSE2601', 'AB5-104'),
    b1: BREAK,
    p4: L('MAT2201', 'AB1-305'),
    p5: L('CSE2201', 'AB1-201'),
    b2: BREAK,
    p6: LAB('CSE2101', 'LAB-3'),
    p7: LAB('CSE2101', 'LAB-3'),
    p8: FREE,
  },
  tue: {
    p1: L('CSE2301', 'AB1-208'),
    p2: L('CSE2401', 'AB1-208'),
    p3: L('CSE2001', 'AB1-201'),
    b1: BREAK,
    p4: L('CSE2501', 'AB5-112'),
    p5: T('MAT2201', 'AB1-305'),
    b2: BREAK,
    p6: LAB('CSE2601', 'LAB-7'),
    p7: LAB('CSE2601', 'LAB-7'),
    p8: LAB('CSE2601', 'LAB-7'),
  },
  wed: {
    p1: L('CSE2201', 'AB1-201'),
    p2: L('CSE2601', 'AB5-104'),
    p3: L('CSE2101', 'AB1-201'),
    b1: BREAK,
    p4: L('CSE2001', 'AB1-201'),
    p5: L('CSE2301', 'AB1-208'),
    b2: BREAK,
    p6: LAB('CSE2001', 'LAB-1'),
    p7: LAB('CSE2001', 'LAB-1'),
    p8: FREE,
  },
  thu: {
    p1: L('CSE2401', 'AB1-208'),
    p2: L('MAT2201', 'AB1-305'),
    p3: L('CSE2501', 'AB5-112'),
    b1: BREAK,
    p4: L('CSE2201', 'AB1-201'),
    p5: L('CSE2601', 'AB5-104'),
    b2: BREAK,
    p6: LAB('CSE2201', 'LAB-4'),
    p7: LAB('CSE2201', 'LAB-4'),
    p8: FREE,
  },
  fri: {
    p1: L('CSE2101', 'AB1-201'),
    p2: L('CSE2001', 'AB1-201'),
    p3: L('CSE2301', 'AB1-208'),
    b1: BREAK,
    p4: L('CSE2401', 'AB1-208'),
    p5: L('CSE2501', 'AB5-112'),
    b2: BREAK,
    p6: LAB('CSE2301', 'LAB-6'),
    p7: LAB('CSE2301', 'LAB-6'),
    p8: FREE,
  },
  sat: {
    p1: T('CSE2001', 'AB1-201'),
    p2: T('CSE2601', 'AB5-104'),
    p3: L('CSE2501', 'AB5-112'),
    b1: BREAK,
    p4: FREE,
    p5: FREE,
    b2: BREAK,
    p6: FREE,
    p7: FREE,
    p8: FREE,
  },
};

/** Seed ledger. The app persists edits over the top of this. */
export const ATTENDANCE: AttendanceRecord[] = [
  { code: 'CSE2001', held: 46, attended: 41 },
  { code: 'CSE2101', held: 44, attended: 39 },
  { code: 'CSE2201', held: 38, attended: 27 },
  { code: 'CSE2301', held: 36, attended: 31 },
  { code: 'CSE2401', held: 28, attended: 25 },
  { code: 'MAT2201', held: 30, attended: 21 },
  { code: 'CSE2501', held: 32, attended: 30 },
  { code: 'CSE2601', held: 42, attended: 38 },
];

export const semester = {
  label: 'Semester VII',
  programme: 'B.Tech Computer Science & Engineering',
  institute: 'Manipal Institute of Technology',
  section: 'CSE — Section B',
  /** Institute minimum, as a percentage. Below this you are detained. */
  minimumAttendance: 75,
  term: 'July – November 2026',
};

/* -------------------------------------------------------------------------- */
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

    const percent = record.held === 0 ? 100 : (record.attended / record.held) * 100;
    const safe = percent >= semester.minimumAttendance;

    const canSkip = safe ? Math.max(Math.floor(record.attended / minimum) - record.held, 0) : 0;
    const mustAttend = safe
      ? 0
      : Math.max(Math.ceil((minimum * record.held - record.attended) / (1 - minimum)), 0);

    return [{ ...record, subject, percent, canSkip, mustAttend, safe }];
  });
}

/** Weighted across every subject, which is the figure the institute quotes. */
export function overallAttendance(records: AttendanceRecord[] = ATTENDANCE) {
  const held = records.reduce((sum, record) => sum + record.held, 0);
  const attended = records.reduce((sum, record) => sum + record.attended, 0);
  return { held, attended, percent: held === 0 ? 100 : (attended / held) * 100 };
}

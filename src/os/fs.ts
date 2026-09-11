import {
  achievements,
  education,
  experience,
  links,
  profile,
  projects,
  resumePath,
  skills,
  type Entry,
} from '../data/cv';
import {
  DAYS,
  PERIODS,
  attendanceView,
  classesOn,
  formatTime,
  overallAttendance,
  semester,
} from '../data/timetable';

/**
 * A small in-memory filesystem with localStorage persistence.
 *
 * Everything the OS shows — the desktop, the file manager, the shell — reads
 * from here, so a file created in the terminal shows up on the desktop and a
 * file renamed on the desktop is visible to `ls`.
 *
 * System files are re-seeded on every boot from the CV data, so editing
 * `src/data/cv.ts` still updates the machine. Anything the user creates lives
 * only in their browser.
 */

export type NodeKind = 'dir' | 'text' | 'app' | 'link' | 'paint';

export interface FsNode {
  name: string;
  kind: NodeKind;
  /** Directories only. */
  children?: Record<string, FsNode>;
  /** Text files and paint files (the latter store a data URL). */
  content?: string;
  /** App launchers point at an entry in the app registry. */
  appId?: string;
  /** Link files open a URL. */
  href?: string;
  /** System files cannot be deleted or renamed. */
  system?: boolean;
  modified: number;
}

const STORAGE_KEY = 'shrey-pc:fs:v1';
export const HOME = '/home/shrey';

type Listener = (path: string) => void;

/* -------------------------------------------------------------------------- */
/* Seed content                                                               */
/* -------------------------------------------------------------------------- */

const bullet = (entry: Entry) =>
  [
    entry.title,
    entry.subtitle ? '  ' + entry.subtitle : null,
    entry.period ? '  ' + entry.period : null,
    entry.meta ? '  ' + entry.meta : null,
    ...(entry.bullets ?? []).map((line) => '  - ' + line),
  ]
    .filter(Boolean)
    .join('\n');

const section = (title: string, entries: Entry[]) =>
  title + '\n' + '='.repeat(title.length) + '\n\n' + entries.map(bullet).join('\n\n') + '\n';

function now() {
  return Date.now();
}

function file(name: string, content: string, system = true): FsNode {
  return { name, kind: 'text', content, system, modified: now() };
}

function dir(name: string, children: FsNode[], system = true): FsNode {
  const map: Record<string, FsNode> = {};
  for (const child of children) map[child.name] = child;
  return { name, kind: 'dir', children: map, system, modified: now() };
}

function app(name: string, appId: string): FsNode {
  return { name, kind: 'app', appId, system: true, modified: now() };
}

function link(name: string, href: string): FsNode {
  return { name, kind: 'link', href, system: true, modified: now() };
}

/** The week, rendered as a plain-text grid for `cat ~/Documents/timetable.txt`. */
function timetableText() {
  const header = [
    semester.institute,
    `${semester.programme} — ${semester.label} (${semester.section})`,
    semester.term,
    '',
  ].join('\n');

  const body = DAYS.map((day) => {
    const rows = classesOn(day.id).map((entry) => {
      const time = `${formatTime(entry.period.start, true)}-${formatTime(entry.period.end, true)}`;
      const kind = entry.slot.kind === 'lecture' ? '' : ` [${entry.slot.kind.toUpperCase()}]`;
      return `  ${time}  ${entry.subject.short.padEnd(5)} ${entry.slot.room ?? ''}${kind}`;
    });
    return day.label + '\n' + (rows.length ? rows.join('\n') : '  (no classes)');
  }).join('\n\n');

  const periods =
    '\nPeriods\n' +
    PERIODS.map(
      (period) =>
        `  ${period.id.padEnd(3)} ${formatTime(period.start, true)}-${formatTime(period.end, true)}` +
        (period.break ? '  ' + (period.label ?? 'Break') : ''),
    ).join('\n');

  return header + body + '\n' + periods + '\n';
}

/** The attendance ledger as text, including the can-I-skip maths. */
function attendanceText() {
  const overall = overallAttendance();
  const lines = attendanceView().map((view) => {
    const verdict = view.safe
      ? `can miss ${view.canSkip}`
      : `must attend ${view.mustAttend} in a row`;
    return (
      '  ' +
      view.subject.short.padEnd(6) +
      `${view.attended}/${view.held}`.padEnd(9) +
      view.percent.toFixed(1).padStart(5) +
      '%   ' +
      verdict
    );
  });

  return (
    'Attendance\n==========\n\n' +
    `Overall: ${overall.percent.toFixed(1)}% (${overall.attended}/${overall.held})\n` +
    `Institute minimum: ${semester.minimumAttendance}%\n\n` +
    lines.join('\n') +
    '\n'
  );
}

/** The read-only part of the tree, rebuilt from the CV on every boot. */
function systemTree(): FsNode {
  const readme =
    profile.name +
    '\n' +
    '='.repeat(profile.name.length) +
    '\n\n' +
    profile.role +
    '\n' +
    profile.tagline +
    '\n' +
    profile.location +
    '\n\n' +
    profile.summary.join('\n\n') +
    '\n\nType `help` in the Terminal, or open Documents to read more.\n';

  const contact =
    'Contact\n=======\n\n' +
    links.map((entry) => (entry.label + ':').padEnd(10) + (entry.display ?? entry.href)).join('\n') +
    '\n';

  const skillsText =
    'Skills\n======\n\n' +
    skills.map((group) => group.label + ':\n  ' + group.items.join(', ')).join('\n\n') +
    '\n';

  return dir('/', [
    dir('home', [
      dir('shrey', [
        dir('Desktop', [
          app('Aperture', 'browser'),
          app('Timetable', 'timetable'),
          app('System Monitor', 'sysmon'),
          app('Garage', 'garage'),
          app('Terminal', 'terminal'),
          app('Files', 'explorer'),
          app('Wire', 'news'),
          app('Player', 'music'),
          app('Notepad', 'notepad'),
          app('Resume.pdf', 'resume'),
          app('Minesweeper', 'minesweeper'),
          app('Paint', 'paint'),
          app('Calculator', 'calculator'),
          app('Settings', 'settings'),
        ]),
        dir('Documents', [
          file('README.txt', readme),
          file('about.txt', profile.summary.join('\n\n') + '\n'),
          file('education.txt', section('Education', education)),
          file('experience.txt', section('Experience', experience)),
          file('projects.txt', section('Projects', projects)),
          file('achievements.txt', section('Achievements', achievements)),
          file('skills.txt', skillsText),
          file('contact.txt', contact),
          file('timetable.txt', timetableText()),
          file('attendance.txt', attendanceText()),
        ]),
        dir('Projects', projects.map((project) => file(slug(project.title) + '.txt', bullet(project)))),
        dir('Links', links.map((entry) => link(entry.label, entry.href))),
        dir('Pictures', [], false),
        file('resume.pdf.lnk', 'Opens ' + resumePath),
      ]),
    ]),
    dir('bin', [
      file('README', 'Shell built-ins live in the interpreter, not on disk.\n'),
    ]),
  ]);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

export function normalise(path: string, cwd = HOME): string {
  const raw = path.startsWith('/') ? path : cwd + '/' + path;
  const parts: string[] = [];

  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }

  return '/' + parts.join('/');
}

export function dirname(path: string) {
  const normalised = normalise(path);
  const index = normalised.lastIndexOf('/');
  return index <= 0 ? '/' : normalised.slice(0, index);
}

export function basename(path: string) {
  const normalised = normalise(path);
  return normalised.slice(normalised.lastIndexOf('/') + 1) || '/';
}

export function join(...parts: string[]) {
  return normalise(parts.join('/'));
}

/* -------------------------------------------------------------------------- */
/* Filesystem                                                                 */
/* -------------------------------------------------------------------------- */

class FileSystem {
  private root: FsNode = systemTree();
  private listeners = new Set<Listener>();

  constructor() {
    this.restore();
  }

  /* --- persistence ------------------------------------------------------- */

  private restore() {
    let saved: unknown;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      saved = JSON.parse(raw);
    } catch {
      return;
    }

    // Only user-created nodes are restored; system files always come from the
    // freshly built tree so a CV edit is never shadowed by stale storage.
    const merge = (target: FsNode, source: FsNode) => {
      if (source.kind !== 'dir' || !source.children) return;
      target.children = target.children ?? {};

      for (const [name, node] of Object.entries(source.children)) {
        if (node.system) {
          const existing = target.children[name];
          if (existing) merge(existing, node);
          continue;
        }
        target.children[name] = node;
      }
    };

    try {
      merge(this.root, saved as FsNode);
    } catch {
      // A corrupted tree is not worth crashing the desktop over.
    }
  }

  private persist() {
    // Strip system nodes that have no user content beneath them.
    const prune = (node: FsNode): FsNode | null => {
      if (node.kind !== 'dir') return node.system ? null : node;

      const children: Record<string, FsNode> = {};
      for (const [name, child] of Object.entries(node.children ?? {})) {
        const kept = prune(child);
        if (kept) children[name] = kept;
      }

      if (node.system && Object.keys(children).length === 0) return null;
      return { ...node, children };
    };

    try {
      const tree = prune(this.root);
      if (tree) localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
    } catch {
      // Quota or private mode: the session still works, it just won't persist.
    }
  }

  /* --- events ------------------------------------------------------------ */

  on(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(path: string) {
    this.persist();
    for (const listener of this.listeners) listener(path);
  }

  /* --- reads ------------------------------------------------------------- */

  get(path: string): FsNode | null {
    const normalised = normalise(path);
    if (normalised === '/') return this.root;

    let node: FsNode = this.root;
    for (const part of normalised.split('/').slice(1)) {
      const next = node.children?.[part];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  exists(path: string) {
    return this.get(path) !== null;
  }

  isDir(path: string) {
    return this.get(path)?.kind === 'dir';
  }

  /** Directory entries, directories first then alphabetical. */
  list(path: string): FsNode[] {
    const node = this.get(path);
    if (!node || node.kind !== 'dir') return [];

    return Object.values(node.children ?? {}).sort((a, b) => {
      if ((a.kind === 'dir') !== (b.kind === 'dir')) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  read(path: string): string | null {
    const node = this.get(path);
    return node && node.kind !== 'dir' ? node.content ?? '' : null;
  }

  /* --- writes ------------------------------------------------------------ */

  private parentOf(path: string): FsNode | null {
    const parent = this.get(dirname(path));
    return parent && parent.kind === 'dir' ? parent : null;
  }

  write(path: string, content: string, kind: NodeKind = 'text'): boolean {
    const parent = this.parentOf(path);
    if (!parent) return false;

    parent.children = parent.children ?? {};
    const name = basename(path);
    const existing = parent.children[name];

    if (existing?.system) return false;
    if (existing?.kind === 'dir') return false;

    parent.children[name] = {
      name,
      kind: existing?.kind ?? kind,
      content,
      modified: now(),
    };

    this.changed(path);
    return true;
  }

  mkdir(path: string): boolean {
    const parent = this.parentOf(path);
    if (!parent) return false;

    parent.children = parent.children ?? {};
    const name = basename(path);
    if (parent.children[name]) return false;

    parent.children[name] = { name, kind: 'dir', children: {}, modified: now() };
    this.changed(path);
    return true;
  }

  remove(path: string): boolean {
    const node = this.get(path);
    const parent = this.parentOf(path);
    if (!node || !parent || node.system) return false;

    delete parent.children![basename(path)];
    this.changed(path);
    return true;
  }

  rename(path: string, name: string): boolean {
    const node = this.get(path);
    const parent = this.parentOf(path);
    if (!node || !parent || node.system || !name || name.includes('/')) return false;
    if (parent.children![name]) return false;

    delete parent.children![basename(path)];
    node.name = name;
    node.modified = now();
    parent.children![name] = node;
    this.changed(dirname(path));
    return true;
  }

  move(from: string, toDir: string): boolean {
    const node = this.get(from);
    const target = this.get(toDir);
    const parent = this.parentOf(from);
    if (!node || !parent || node.system) return false;
    if (!target || target.kind !== 'dir') return false;

    target.children = target.children ?? {};
    if (target.children[node.name]) return false;
    // Refuse to move a directory into itself.
    if (normalise(toDir).startsWith(normalise(from) + '/')) return false;

    delete parent.children![basename(from)];
    target.children[node.name] = node;
    this.changed(toDir);
    return true;
  }

  /** Picks `name`, `name (2)`, ... so a create never collides. */
  uniqueName(parentPath: string, base: string, extension = '') {
    const parent = this.get(parentPath);
    const taken = new Set(Object.keys(parent?.children ?? {}));
    if (!taken.has(base + extension)) return base + extension;

    let index = 2;
    while (taken.has(`${base} (${index})${extension}`)) index += 1;
    return `${base} (${index})${extension}`;
  }

  /** Recursive search by name fragment, used by the shell and start menu. */
  find(query: string, from = HOME): string[] {
    const needle = query.toLowerCase();
    const results: string[] = [];

    const walk = (node: FsNode, path: string) => {
      if (node.name.toLowerCase().includes(needle) && path !== from) results.push(path);
      if (node.kind !== 'dir') return;
      for (const child of Object.values(node.children ?? {})) {
        walk(child, path === '/' ? '/' + child.name : path + '/' + child.name);
      }
    };

    const start = this.get(from);
    if (start) walk(start, normalise(from));
    return results;
  }

  /** Wipes user data and returns to the shipped tree. */
  reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    this.root = systemTree();
    this.changed('/');
  }
}

export const fs = new FileSystem();

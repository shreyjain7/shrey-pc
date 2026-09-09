import { profile, skills } from '../data/cv';
import { basename, dirname, fs, HOME, join, normalise, type FsNode } from './fs';
import { openApp, openPath } from './system';
import { el } from './ui';

let onKeystroke: () => void = () => {};

/** Fired per keypress so the audio engine can click a keycap. */
export function setTerminalKeySound(next: () => void) {
  onKeystroke = next;
}

type Print = (text: string, className?: string) => void;

interface Context {
  args: string[];
  print: Print;
  cwd: () => string;
  setCwd: (path: string) => void;
  clear: () => void;
  history: string[];
}

interface Command {
  usage: string;
  summary: string;
  run: (ctx: Context) => void;
}

const APPS = [
  'about', 'projects', 'experience', 'skills', 'education', 'achievements',
  'resume', 'contact', 'explorer', 'notepad', 'calculator', 'minesweeper',
  'paint', 'settings', 'terminal',
];

function resolve(ctx: Context, arg: string | undefined, fallback?: string) {
  return normalise(arg ?? fallback ?? ctx.cwd(), ctx.cwd());
}

function pad(value: string, width: number) {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

const commands: Record<string, Command> = {
  help: {
    usage: 'help [command]',
    summary: 'list commands, or explain one',
    run: ({ args, print }) => {
      const name = args[0];
      if (name && commands[name]) {
        print(commands[name].usage, 'out--accent');
        print('  ' + commands[name].summary);
        return;
      }

      print('shrey-sh built-ins:', 'out--dim');
      for (const [key, command] of Object.entries(commands)) {
        print('  ' + pad(key, 11) + command.summary);
      }
      print('');
      print('Files live under ' + HOME + '. Try: ls, cat README.txt, tree', 'out--dim');
    },
  },

  ls: {
    usage: 'ls [path]',
    summary: 'list directory contents',
    run: (ctx) => {
      const path = resolve(ctx, ctx.args[0]);
      const node = fs.get(path);

      if (!node) return ctx.print('ls: ' + path + ': no such file or directory', 'out--warn');
      if (node.kind !== 'dir') return ctx.print(node.name);

      for (const entry of fs.list(path)) {
        const marker = entry.kind === 'dir' ? '/' : entry.kind === 'app' ? '*' : '';
        const size = entry.kind === 'dir' ? '-' : String((entry.content ?? '').length);
        ctx.print(
          '  ' + pad(entry.kind === 'dir' ? 'dir' : entry.kind, 6) + pad(size, 8) + entry.name + marker,
          entry.kind === 'dir' ? 'out--accent' : undefined,
        );
      }
    },
  },

  cd: {
    usage: 'cd [path]',
    summary: 'change directory',
    run: (ctx) => {
      const path = resolve(ctx, ctx.args[0], HOME);
      if (!fs.exists(path)) return ctx.print('cd: ' + path + ': no such directory', 'out--warn');
      if (!fs.isDir(path)) return ctx.print('cd: ' + path + ': not a directory', 'out--warn');
      ctx.setCwd(path);
    },
  },

  pwd: {
    usage: 'pwd',
    summary: 'print the working directory',
    run: (ctx) => ctx.print(ctx.cwd()),
  },

  cat: {
    usage: 'cat <file>',
    summary: 'print a file',
    run: (ctx) => {
      if (!ctx.args.length) return ctx.print('cat: missing operand', 'out--warn');
      for (const arg of ctx.args) {
        const content = fs.read(resolve(ctx, arg));
        if (content === null) {
          ctx.print('cat: ' + arg + ': no such file', 'out--warn');
          continue;
        }
        for (const line of content.split('\n')) ctx.print(line);
      }
    },
  },

  mkdir: {
    usage: 'mkdir <name>',
    summary: 'create a directory',
    run: (ctx) => {
      if (!ctx.args.length) return ctx.print('mkdir: missing operand', 'out--warn');
      for (const arg of ctx.args) {
        if (!fs.mkdir(resolve(ctx, arg))) ctx.print('mkdir: cannot create ' + arg, 'out--warn');
      }
    },
  },

  touch: {
    usage: 'touch <name>',
    summary: 'create an empty file',
    run: (ctx) => {
      if (!ctx.args.length) return ctx.print('touch: missing operand', 'out--warn');
      for (const arg of ctx.args) {
        const path = resolve(ctx, arg);
        if (fs.exists(path)) continue;
        if (!fs.write(path, '')) ctx.print('touch: cannot create ' + arg, 'out--warn');
      }
    },
  },

  rm: {
    usage: 'rm <path>',
    summary: 'remove a file or directory',
    run: (ctx) => {
      if (!ctx.args.length) return ctx.print('rm: missing operand', 'out--warn');
      for (const arg of ctx.args) {
        const path = resolve(ctx, arg);
        const node = fs.get(path);
        if (!node) ctx.print('rm: ' + arg + ': no such file', 'out--warn');
        else if (node.system) ctx.print('rm: ' + arg + ': protected system file', 'out--warn');
        else if (!fs.remove(path)) ctx.print('rm: cannot remove ' + arg, 'out--warn');
      }
    },
  },

  mv: {
    usage: 'mv <path> <dir|name>',
    summary: 'move or rename',
    run: (ctx) => {
      const [from, to] = ctx.args;
      if (!from || !to) return ctx.print('mv: usage: mv <path> <dir|name>', 'out--warn');

      const source = resolve(ctx, from);
      const target = resolve(ctx, to);

      // An existing directory target means "move into"; anything else renames.
      if (fs.isDir(target)) {
        if (!fs.move(source, target)) ctx.print('mv: cannot move ' + from, 'out--warn');
        return;
      }
      if (!fs.rename(source, basename(target))) {
        ctx.print('mv: cannot rename ' + from, 'out--warn');
        return;
      }
      if (dirname(target) !== dirname(source)) {
        fs.move(join(dirname(source), basename(target)), dirname(target));
      }
    },
  },

  cp: {
    usage: 'cp <file> <newfile>',
    summary: 'copy a file',
    run: (ctx) => {
      const [from, to] = ctx.args;
      if (!from || !to) return ctx.print('cp: usage: cp <file> <newfile>', 'out--warn');

      const content = fs.read(resolve(ctx, from));
      if (content === null) return ctx.print('cp: ' + from + ': no such file', 'out--warn');
      if (!fs.write(resolve(ctx, to), content)) ctx.print('cp: cannot write ' + to, 'out--warn');
    },
  },

  echo: {
    usage: 'echo <text> [> file | >> file]',
    summary: 'print text, optionally into a file',
    run: (ctx) => {
      const raw = ctx.args.join(' ');
      const append = raw.includes('>>');
      const index = append ? raw.indexOf('>>') : raw.indexOf('>');

      if (index === -1) return ctx.print(raw);

      const text = raw.slice(0, index).trim();
      const target = resolve(ctx, raw.slice(index + (append ? 2 : 1)).trim());
      const existing = append ? fs.read(target) ?? '' : '';
      const body = append && existing ? existing + '\n' + text : text;

      if (!fs.write(target, body)) ctx.print('echo: cannot write ' + target, 'out--warn');
    },
  },

  tree: {
    usage: 'tree [path]',
    summary: 'show the directory tree',
    run: (ctx) => {
      const start = resolve(ctx, ctx.args[0]);
      if (!fs.isDir(start)) return ctx.print('tree: ' + start + ': not a directory', 'out--warn');

      ctx.print(start, 'out--accent');

      const walk = (path: string, prefix: string, depth: number) => {
        if (depth > 3) return;
        const entries = fs.list(path);

        entries.forEach((entry, index) => {
          const last = index === entries.length - 1;
          ctx.print(prefix + (last ? '└── ' : '├── ') + entry.name + (entry.kind === 'dir' ? '/' : ''));
          if (entry.kind === 'dir') {
            walk(join(path, entry.name), prefix + (last ? '    ' : '│   '), depth + 1);
          }
        });
      };

      walk(start, '', 0);
    },
  },

  find: {
    usage: 'find <name>',
    summary: 'search for files by name',
    run: (ctx) => {
      if (!ctx.args.length) return ctx.print('find: missing search term', 'out--warn');
      const results = fs.find(ctx.args.join(' '), '/');
      if (!results.length) return ctx.print('find: nothing matched', 'out--dim');
      for (const result of results) ctx.print(result);
    },
  },

  grep: {
    usage: 'grep <text> [path]',
    summary: 'search inside files',
    run: (ctx) => {
      const needle = ctx.args[0];
      if (!needle) return ctx.print('grep: missing pattern', 'out--warn');

      const start = resolve(ctx, ctx.args[1]);
      const lower = needle.toLowerCase();
      let hits = 0;

      const walk = (node: FsNode, path: string) => {
        if (node.kind === 'dir') {
          for (const child of Object.values(node.children ?? {})) {
            walk(child, join(path, child.name));
          }
          return;
        }
        for (const [index, line] of (node.content ?? '').split('\n').entries()) {
          if (!line.toLowerCase().includes(lower)) continue;
          hits += 1;
          ctx.print(path + ':' + (index + 1) + ': ' + line.trim());
        }
      };

      const node = fs.get(start);
      if (node) walk(node, start);
      if (!hits) ctx.print('grep: no matches', 'out--dim');
    },
  },

  open: {
    usage: 'open <app|path>',
    summary: 'open an app or a file',
    run: (ctx) => {
      const target = ctx.args[0];
      if (!target) {
        return ctx.print('open: usage: open <' + APPS.slice(0, 6).join('|') + '|path>', 'out--warn');
      }

      if (APPS.includes(target.toLowerCase())) {
        openApp(target.toLowerCase());
        return ctx.print('Opening ' + target + '...', 'out--dim');
      }

      const path = resolve(ctx, target);
      if (!fs.exists(path)) return ctx.print('open: ' + target + ': not found', 'out--warn');
      openPath(path);
      ctx.print('Opening ' + path + '...', 'out--dim');
    },
  },

  edit: {
    usage: 'edit <file>',
    summary: 'open a file in the editor',
    run: (ctx) => {
      const target = ctx.args[0];
      if (!target) return ctx.print('edit: missing file', 'out--warn');

      const path = resolve(ctx, target);
      if (!fs.exists(path) && !fs.write(path, '')) {
        return ctx.print('edit: cannot create ' + target, 'out--warn');
      }
      openPath(path);
    },
  },

  whoami: {
    usage: 'whoami',
    summary: 'print the current user',
    run: ({ print }) => {
      print(profile.name + ' — ' + profile.role);
      print(profile.tagline, 'out--dim');
      print(profile.location, 'out--dim');
    },
  },

  neofetch: {
    usage: 'neofetch',
    summary: 'system information',
    run: ({ print }) => {
      const art = [
        '   ______   ',
        '  /|_||_\\`.__ ',
        ' (   _    _ _\\',
        " =`-(_)--(_)-' ",
        '              ',
        '              ',
        '              ',
      ];
      const info: Array<[string, string]> = [
        ['user', profile.name],
        ['os', 'shrey-os 1.0'],
        ['host', 'shrey-pc (CRT 4:3)'],
        ['shell', 'shrey-sh'],
        ['school', 'Manipal Institute of Technology'],
        ['location', profile.location],
        ['langs', skills[0].items.join(', ')],
      ];

      info.forEach(([key, value], index) => {
        print(pad(art[index] ?? '', 16) + pad(key, 9) + ' ' + value);
      });
    },
  },

  uname: {
    usage: 'uname',
    summary: 'print the system name',
    run: ({ print }) => print('shrey-os 1.0 shrey-pc crt/4:3'),
  },

  df: {
    usage: 'df',
    summary: 'show disk usage',
    run: ({ print }) => {
      let bytes = 0;
      try {
        bytes = (localStorage.getItem('shrey-pc:fs:v1') ?? '').length;
      } catch {
        bytes = 0;
      }
      print('Filesystem      Used     Mounted on');
      print('browserstorage  ' + pad((bytes / 1024).toFixed(1) + 'K', 9) + HOME);
    },
  },

  date: {
    usage: 'date',
    summary: 'print the current date',
    run: ({ print }) => print(new Date().toString()),
  },

  history: {
    usage: 'history',
    summary: 'show recent commands',
    run: ({ print, history }) => {
      history.forEach((entry, index) => print(pad(String(index + 1), 5) + entry));
    },
  },

  sudo: {
    usage: 'sudo <command>',
    summary: 'nice try',
    run: ({ print }) =>
      print(
        profile.name.split(' ')[0].toLowerCase() +
          ' is not in the sudoers file. This incident has been reported.',
        'out--warn',
      ),
  },

  clear: {
    usage: 'clear',
    summary: 'clear the screen',
    run: ({ clear }) => clear(),
  },
};

/* -------------------------------------------------------------------------- */
/* Terminal                                                                   */
/* -------------------------------------------------------------------------- */

export function createTerminal(): HTMLElement {
  const root = el('div', 'term');

  const output = el('div', 'term__output');
  const line = el('label', 'term__line');
  const prompt = el('span', 'term__prompt');

  const input = el('input', 'term__input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Terminal input');

  line.append(prompt, input);
  root.append(output, line);

  let cwd = HOME;
  const history: string[] = [];
  let historyIndex = 0;

  const shortPath = () =>
    cwd === HOME ? '~' : cwd.startsWith(HOME) ? '~' + cwd.slice(HOME.length) : cwd;

  const syncPrompt = () => {
    prompt.textContent = 'shrey@pc:' + shortPath() + '$';
  };

  const print: Print = (text, className) => {
    const row = el('div', 'out' + (className ? ' ' + className : ''));
    row.textContent = text === '' ? ' ' : text;
    output.append(row);
  };

  const clear = () => output.replaceChildren();

  const scroll = () => {
    root.scrollTop = root.scrollHeight;
  };

  const ctx = (args: string[]): Context => ({
    args,
    print,
    cwd: () => cwd,
    setCwd: (path) => {
      cwd = path;
      syncPrompt();
    },
    clear,
    history,
  });

  function run(raw: string) {
    const trimmed = raw.trim();
    print(prompt.textContent + ' ' + trimmed, 'out--echo');
    if (!trimmed) return;

    history.push(trimmed);
    historyIndex = history.length;

    const [name, ...args] = trimmed.split(/\s+/);
    const command = commands[name.toLowerCase()];

    if (!command) {
      print('shrey-sh: command not found: ' + name, 'out--warn');
      print("Type 'help' for a list of commands.", 'out--dim');
      return;
    }

    command.run(ctx(args));
  }

  /** Tab completion over built-ins and the names in the current directory. */
  function complete() {
    const value = input.value;
    const parts = value.split(/\s+/);
    const last = parts[parts.length - 1] ?? '';

    const pool =
      parts.length <= 1
        ? Object.keys(commands)
        : fs.list(cwd).map((node) => node.name + (node.kind === 'dir' ? '/' : ''));

    const matches = pool.filter((entry) => entry.startsWith(last));
    if (!matches.length) return;

    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      input.value = parts.join(' ');
      return;
    }

    print(prompt.textContent + ' ' + value, 'out--echo');
    print(matches.join('   '), 'out--dim');
    scroll();
  }

  input.addEventListener('keydown', (event) => {
    // The desktop's shortcuts must not fire while typing.
    event.stopPropagation();

    if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace') {
      onKeystroke();
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      run(input.value);
      input.value = '';
      scroll();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      complete();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? '';
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!history.length) return;
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? '';
      return;
    }

    if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      clear();
    }
  });

  root.addEventListener('pointerup', () => input.focus());

  syncPrompt();
  print('shrey-sh 1.0 — ' + profile.name + "'s machine", 'out--accent');
  print("Type 'help' for commands, or 'ls' to look around.", 'out--dim');
  print('');

  // The window animates in; focus once it has settled.
  window.setTimeout(() => input.focus(), 260);

  return root;
}

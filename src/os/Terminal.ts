import {
  achievements,
  education,
  experience,
  links,
  profile,
  projects,
  skills,
} from '../data/cv';

type Launcher = (appId: string) => void;

let launcher: Launcher = () => {};

/** The OS wires this up so `open projects` can raise a real window. */
export function setTerminalLauncher(next: Launcher) {
  launcher = next;
}

interface Command {
  summary: string;
  run: (args: string[], print: Print) => void;
}

type Print = (text: string, className?: string) => void;

const OPENABLE = [
  'about',
  'projects',
  'experience',
  'skills',
  'education',
  'achievements',
  'resume',
  'contact',
];

function buildCommands(clear: () => void): Record<string, Command> {
  const commands: Record<string, Command> = {
    help: {
      summary: 'list available commands',
      run: (_args, print) => {
        print('Available commands:', 'out--dim');
        for (const [name, command] of Object.entries(commands)) {
          print('  ' + name.padEnd(12) + command.summary);
        }
        print('');
        print('Tip: ' + 'open <window>'.padEnd(12) + 'launches ' + OPENABLE.join(', '), 'out--dim');
      },
    },

    whoami: {
      summary: 'print the current user',
      run: (_args, print) => {
        print(profile.name + ' — ' + profile.role);
        print(profile.tagline, 'out--dim');
        print(profile.location, 'out--dim');
      },
    },

    about: {
      summary: 'a short introduction',
      run: (_args, print) => {
        for (const paragraph of profile.summary) {
          print(paragraph);
          print('');
        }
      },
    },

    skills: {
      summary: 'list technical skills',
      run: (_args, print) => {
        for (const group of skills) {
          print(group.label, 'out--accent');
          print('  ' + group.items.join(', '));
        }
      },
    },

    projects: {
      summary: 'list projects',
      run: (_args, print) => {
        for (const project of projects) {
          print(project.title, 'out--accent');
          if (project.subtitle) print('  ' + project.subtitle, 'out--dim');
          for (const bullet of project.bullets ?? []) print('  ' + bullet);
          print('');
        }
      },
    },

    experience: {
      summary: 'list experience and activities',
      run: (_args, print) => {
        for (const entry of experience) {
          print(entry.title + (entry.period ? '  (' + entry.period + ')' : ''), 'out--accent');
          if (entry.subtitle) print('  ' + entry.subtitle, 'out--dim');
          for (const bullet of entry.bullets ?? []) print('  ' + bullet);
          print('');
        }
      },
    },

    education: {
      summary: 'list education history',
      run: (_args, print) => {
        for (const entry of education) {
          print(entry.title, 'out--accent');
          if (entry.subtitle) print('  ' + entry.subtitle, 'out--dim');
          if (entry.meta) print('  ' + entry.meta, 'out--dim');
          if (entry.period) print('  ' + entry.period, 'out--dim');
          print('');
        }
      },
    },

    awards: {
      summary: 'list achievements and certifications',
      run: (_args, print) => {
        for (const entry of achievements) {
          print('* ' + entry.title, 'out--accent');
          if (entry.subtitle) print('    ' + entry.subtitle, 'out--dim');
        }
      },
    },

    contact: {
      summary: 'show contact details',
      run: (_args, print) => {
        for (const link of links) {
          print(link.label.padEnd(10) + (link.display ?? link.href));
        }
      },
    },

    open: {
      summary: 'open a window, e.g. open resume',
      run: (args, print) => {
        const target = (args[0] ?? '').toLowerCase();
        if (!target) {
          print('usage: open <' + OPENABLE.join('|') + '>', 'out--warn');
          return;
        }
        if (!OPENABLE.includes(target)) {
          print('open: no such window: ' + target, 'out--warn');
          return;
        }
        launcher(target);
        print('Opening ' + target + '...', 'out--dim');
      },
    },

    ls: {
      summary: 'list what is on this machine',
      run: (_args, print) => {
        print(OPENABLE.map((name) => name + '/').join('   '));
      },
    },

    date: {
      summary: 'print the current date',
      run: (_args, print) => print(new Date().toString()),
    },

    echo: {
      summary: 'print the given text',
      run: (args, print) => print(args.join(' ')),
    },

    neofetch: {
      summary: 'system information',
      run: (_args, print) => {
        const info = [
          ['user', profile.name],
          ['role', profile.role],
          ['school', 'Manipal Institute of Technology'],
          ['location', profile.location],
          ['shell', 'shrey-sh 1.0'],
          ['host', 'shrey-pc (CRT-4:3)'],
          ['langs', skills[0].items.join(', ')],
        ];
        const art = [
          '   ______   ',
          '  /|_||_\\`.__ ',
          ' (   _    _ _\\',
          " =`-(_)--(_)-' ",
          '               ',
          '               ',
          '               ',
        ];
        info.forEach(([key, value], index) => {
          print((art[index] ?? '').padEnd(16) + key.padEnd(9) + ' ' + value);
        });
      },
    },

    sudo: {
      summary: 'nice try',
      run: (_args, print) =>
        print(profile.name.split(' ')[0] + ' is not in the sudoers file. This incident has been reported.', 'out--warn'),
    },

    clear: {
      summary: 'clear the screen',
      run: () => clear(),
    },
  };

  return commands;
}

export function createTerminal(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'term';

  const output = document.createElement('div');
  output.className = 'term__output';

  const line = document.createElement('label');
  line.className = 'term__line';

  const prompt = document.createElement('span');
  prompt.className = 'term__prompt';
  prompt.textContent = 'shrey@pc:~$';

  const input = document.createElement('input');
  input.className = 'term__input';
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Terminal input');

  line.append(prompt, input);
  root.append(output, line);

  const print: Print = (text, className) => {
    const row = document.createElement('div');
    row.className = 'out' + (className ? ' ' + className : '');
    // A blank string still needs to occupy a line.
    row.textContent = text === '' ? ' ' : text;
    output.append(row);
  };

  const clear = () => {
    output.replaceChildren();
  };

  const commands = buildCommands(clear);
  const history: string[] = [];
  let historyIndex = -1;

  const run = (raw: string) => {
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

    command.run(args, print);
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run(input.value);
      input.value = '';
      root.scrollTop = root.scrollHeight;
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

  print('shrey-sh 1.0 — ' + profile.name + "'s machine", 'out--accent');
  print("Type 'help' to get started, or 'open resume' to read the CV.", 'out--dim');
  print('');

  // The window animates in; focus once it has settled.
  window.setTimeout(() => input.focus(), 260);

  return root;
}

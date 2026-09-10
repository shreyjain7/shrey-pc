import { links } from '../../data/cv';
import { el } from '../ui';

/** Credits — what this thing is made of, and who to thank for the idea. */

const STACK: Array<[string, string]> = [
  ['three.js', 'WebGL renderer for the room, the desk and the tower'],
  ['CSS3DRenderer', 'Projects the live DOM of the OS onto the monitor glass'],
  ['TypeScript', 'Every line of the OS, the apps and the scene'],
  ['Vite', 'Dev server and production bundler'],
  ['Web Audio API', 'The music app synthesises its catalogue — no audio files ship'],
  ['Canvas 2D', 'Paint, the system monitor graphs and the spectrum analyser'],
  ['localStorage', 'The virtual filesystem, timetable edits and game records'],
];

const BUILT: Array<[string, string]> = [
  ['The tower', 'Procedural geometry. Six fans, a cooler, a GPU and RGB memory, all instanced.'],
  ['The telemetry bus', 'Carries OS load into the scene, so typing spins the fans and warms the CPU.'],
  ['The motion engine', 'Springs integrated at a fixed 1/240s step, so animation is frame-rate independent.'],
  ['The filesystem', 'A real tree with files, folders and persistence behind Explorer, Notepad and the terminal.'],
];

export function createCredits(): HTMLElement {
  const root = el('div', 'credits');

  const head = el('header', 'credits__head');
  head.append(el('h1', 'credits__title', 'shrey-pc'));
  head.append(
    el(
      'p',
      'credits__sub',
      'An interactive 3D portfolio — a computer you boot up to read a CV.',
    ),
  );
  root.append(head);

  const section = (title: string, rows: Array<[string, string]>) => {
    const block = el('section', 'credits__section');
    block.append(el('h2', 'credits__heading', title));

    const list = el('div', 'credits__list');
    for (const [name, note] of rows) {
      const row = el('div', 'credits__row');
      row.append(el('span', 'credits__row-name', name));
      row.append(el('span', 'credits__row-note', note));
      list.append(row);
    }

    block.append(list);
    return block;
  };

  root.append(section('Built with', STACK));
  root.append(section('Built here', BUILT));

  const thanks = el('section', 'credits__section');
  thanks.append(el('h2', 'credits__heading', 'Thanks'));
  const note = el('p', 'credits__prose');
  note.append(
    document.createTextNode(
      'The idea of a portfolio you operate rather than scroll comes from Henry Heffernan’s ',
    ),
  );
  const link = el('a', 'credits__link', 'henryheffernan.com');
  link.href = 'https://henryheffernan.com/';
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  note.append(link);
  note.append(
    document.createTextNode(
      '. The room, the hardware, the window manager and every app here were written from scratch for this site — but the premise is his, and it deserves the credit.',
    ),
  );
  thanks.append(note);
  root.append(thanks);

  const foot = el('footer', 'credits__foot');
  for (const item of links) {
    const anchor = el('a', 'credits__link', item.display ?? item.label);
    anchor.href = item.href;
    if (!item.href.startsWith('mailto:')) {
      anchor.target = '_blank';
      anchor.rel = 'noreferrer noopener';
    }
    foot.append(anchor);
  }
  root.append(foot);

  return root;
}

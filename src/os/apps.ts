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
import { createTerminal } from './Terminal';
import { createBrowser } from './apps/Browser';
import { createExplorer } from './apps/Explorer';
import { createGarage } from './apps/Garage';
import { createMusic } from './apps/Music';
import { createNews } from './apps/News';
import { createSystemMonitor } from './apps/SystemMonitor';
import { createTimetable } from './apps/Timetable';
import { createNotepad } from './apps/Notepad';
import { createCalculator } from './apps/Calculator';
import { createMinesweeper } from './apps/Minesweeper';
import { createPaint } from './apps/Paint';
import { createSettings } from './apps/SettingsApp';
import type { AppDefinition } from './WindowManager';

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

const svg = (paths: string) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  paths +
  '</svg>';

export const icons = {
  about: svg('<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  experience: svg(
    '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/>' +
      '<path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7"/>' +
      '<path d="M3 12.5h18"/>',
  ),
  projects: svg(
    '<path d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.2l1.9 2.2h9.1A1.4 1.4 0 0 1 21 9.6v8A1.4 1.4 0 0 1 19.6 19H4.4A1.4 1.4 0 0 1 3 17.6z"/>',
  ),
  skills: svg(
    '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/>',
  ),
  education: svg(
    '<path d="m12 4 9 4.5-9 4.5-9-4.5z"/><path d="M6.5 10.6V15c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-4.4"/>',
  ),
  achievements: svg(
    '<circle cx="12" cy="9" r="5"/><path d="m8.6 13.2-1.1 6.3 4.5-2.3 4.5 2.3-1.1-6.3"/>',
  ),
  resume: svg(
    '<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V8z"/>' +
      '<path d="M14 3v5h4.8"/><path d="M8.6 13h6.8M8.6 16.5h4.4"/>',
  ),
  contact: svg(
    '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/>',
  ),
  terminal: svg('<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7.5 10 2.6 2.2-2.6 2.2"/><path d="M13 14.6h3.6"/>'),
  explorer: svg('<path d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.2l1.9 2.2h9.1A1.4 1.4 0 0 1 21 9.6v8A1.4 1.4 0 0 1 19.6 19H4.4A1.4 1.4 0 0 1 3 17.6z"/>'),
  notepad: svg('<path d="M4 20h16"/><path d="M14.5 4.5 19 9 9 19H4.5v-4.5z"/>'),
  calculator: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7"/><path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>'),
  minesweeper: svg('<circle cx="12" cy="13" r="5.6"/><path d="M12 4v2.4M4.8 7.2l1.9 1.9M19.2 7.2l-1.9 1.9"/>'),
  paint: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="9.4" cy="9.8" r="1.1" fill="currentColor"/><circle cx="14.6" cy="9.8" r="1.1" fill="currentColor"/><circle cx="15.6" cy="14.2" r="1.1" fill="currentColor"/>'),
  browser: svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/>' +
      '<path d="M12 3.5a13 13 0 0 1 0 17"/><path d="M12 3.5a13 13 0 0 0 0 17"/>',
  ),
  timetable: svg(
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/>' +
      '<path d="M8 3.5v3M16 3.5v3"/><path d="M8.5 13.5h3M8.5 16.5h7"/>',
  ),
  sysmon: svg(
    '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/>' +
      '<path d="m6.5 13.5 2.5-3 2.4 3.4L14 9l3.5 6"/>',
  ),
  music: svg('<path d="M9 17.5V6.2l10-2v11.1"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.3" r="2.4"/>'),
  news: svg(
    '<path d="M4 5.5h12.5v13H6A2 2 0 0 1 4 16.5z"/><path d="M16.5 9H20v7.5a2 2 0 0 1-4 0z"/>' +
      '<path d="M6.8 8.6h6.6M6.8 12h6.6M6.8 15.2h4"/>',
  ),
  garage: svg(
    '<path d="M3 16.5v-3.1l1.9-4.1A2 2 0 0 1 6.7 8h10.6a2 2 0 0 1 1.8 1.3l1.9 4.1v3.1"/>' +
      '<path d="M3 13.4h18"/><circle cx="7.2" cy="16.6" r="1.7"/><circle cx="16.8" cy="16.6" r="1.7"/>' +
      '<path d="M5.3 18.3v1.2M18.7 18.3v1.2"/>',
  ),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
};

/* -------------------------------------------------------------------------- */
/* Content builders                                                            */
/* -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function page(...children: (Node | null)[]) {
  const root = el('div', 'doc');
  for (const child of children) if (child) root.append(child);
  return root;
}

function heading(text: string, sub?: string) {
  const wrap = el('div', 'doc__head');
  wrap.append(el('h1', 'doc__title', text));
  if (sub) wrap.append(el('p', 'doc__sub', sub));
  return wrap;
}

function entryCard(entry: Entry) {
  const card = el('article', 'entry');

  const top = el('div', 'entry__top');
  const left = el('div', 'entry__left');
  left.append(el('h2', 'entry__title', entry.title));
  if (entry.subtitle) left.append(el('p', 'entry__subtitle', entry.subtitle));
  top.append(left);

  if (entry.period) top.append(el('span', 'entry__period', entry.period));
  card.append(top);

  if (entry.meta) card.append(el('p', 'entry__meta', entry.meta));

  if (entry.bullets?.length) {
    const list = el('ul', 'entry__bullets');
    for (const bullet of entry.bullets) list.append(el('li', undefined, bullet));
    card.append(list);
  }

  return card;
}

function entryList(entries: Entry[]) {
  const list = el('div', 'entries');
  for (const entry of entries) list.append(entryCard(entry));
  return list;
}

function linkRow(label: string, href: string, display: string) {
  const row = el('a', 'link-row');
  row.href = href;
  if (!href.startsWith('mailto:')) {
    row.target = '_blank';
    row.rel = 'noreferrer noopener';
  }
  row.append(el('span', 'link-row__label', label));
  row.append(el('span', 'link-row__value', display));
  row.append(el('span', 'link-row__arrow', '→'));
  return row;
}

/* -------------------------------------------------------------------------- */
/* Apps                                                                        */
/* -------------------------------------------------------------------------- */

function renderAbout() {
  const hero = el('div', 'hero');

  const avatar = el('div', 'hero__avatar');
  avatar.textContent = profile.name
    .split(' ')
    .map((part) => part[0])
    .join('');

  const meta = el('div', 'hero__meta');
  meta.append(el('h1', 'hero__name', profile.name));
  meta.append(el('p', 'hero__role', profile.role));
  meta.append(el('p', 'hero__tagline', profile.tagline));

  const place = el('p', 'hero__location');
  place.textContent = profile.location;
  meta.append(place);

  hero.append(avatar, meta);

  const body = el('div', 'prose');
  for (const paragraph of profile.summary) body.append(el('p', undefined, paragraph));

  return page(hero, body);
}

function renderExperience() {
  return page(
    heading('Experience & Activities', 'Internships, student teams and chapters.'),
    entryList(experience),
  );
}

function renderProjects() {
  return page(
    heading('Projects', 'Things I have designed, built and shipped.'),
    entryList(projects),
  );
}

function renderEducation() {
  return page(heading('Education'), entryList(education));
}

function renderAchievements() {
  return page(heading('Achievements & Certifications'), entryList(achievements));
}

function renderSkills() {
  const grid = el('div', 'skill-grid');

  for (const group of skills) {
    const card = el('div', 'skill-card');
    card.append(el('h2', 'skill-card__label', group.label));

    const tags = el('div', 'skill-card__tags');
    for (const item of group.items) tags.append(el('span', 'tag', item));
    card.append(tags);

    grid.append(card);
  }

  return page(heading('Skills'), grid);
}

function renderContact() {
  const list = el('div', 'links');
  for (const link of links) {
    list.append(linkRow(link.label, link.href, link.display ?? link.href));
  }

  const note = el('p', 'doc__note');
  note.textContent =
    'Open to internships and collaboration in software engineering and applied machine learning.';

  return page(heading('Contact', 'The quickest ways to reach me.'), list, note);
}

function renderResume() {
  const toolbar = el('div', 'resume__toolbar');
  const download = el('a', 'button');
  download.href = resumePath;
  download.target = '_blank';
  download.rel = 'noreferrer noopener';
  download.textContent = 'Open PDF';
  toolbar.append(el('span', 'resume__filename', 'Shrey_Jain_Resume.pdf'), download);

  const sheet = el('div', 'sheet');

  const head = el('header', 'sheet__head');
  head.append(el('h1', undefined, profile.name));
  const contactLine = el('p', 'sheet__contact');
  contactLine.textContent = links
    .map((link) => link.display ?? link.href)
    .concat(profile.location)
    .join('  ·  ');
  head.append(contactLine);
  sheet.append(head);

  const sections: Array<[string, Entry[]]> = [
    ['Education', education],
    ['Projects', projects],
    ['Experience and Extracurricular', experience],
    ['Achievements and Certifications', achievements],
  ];

  const skillSection = el('section', 'sheet__section');
  skillSection.append(el('h2', undefined, 'Skills Summary'));
  for (const group of skills) {
    const line = el('p', 'sheet__skill');
    line.append(el('strong', undefined, group.label + ': '));
    line.append(document.createTextNode(group.items.join(', ')));
    skillSection.append(line);
  }

  const [first, ...rest] = sections;
  const buildSection = ([title, entries]: [string, Entry[]]) => {
    const section = el('section', 'sheet__section');
    section.append(el('h2', undefined, title));
    for (const entry of entries) section.append(entryCard(entry));
    return section;
  };

  sheet.append(buildSection(first), skillSection, ...rest.map(buildSection));

  return page(toolbar, sheet);
}

export const apps: AppDefinition[] = [
  {
    id: 'about',
    title: 'About Me',
    icon: icons.about,
    width: 660,
    height: 540,
    render: renderAbout,
  },
  {
    id: 'projects',
    title: 'Projects',
    icon: icons.projects,
    width: 700,
    height: 560,
    render: renderProjects,
  },
  {
    id: 'experience',
    title: 'Experience',
    icon: icons.experience,
    width: 720,
    height: 600,
    render: renderExperience,
  },
  {
    id: 'skills',
    title: 'Skills',
    icon: icons.skills,
    width: 640,
    height: 500,
    render: renderSkills,
  },
  {
    id: 'education',
    title: 'Education',
    icon: icons.education,
    width: 680,
    height: 460,
    render: renderEducation,
  },
  {
    id: 'achievements',
    title: 'Achievements',
    icon: icons.achievements,
    width: 660,
    height: 460,
    render: renderAchievements,
  },
  {
    id: 'resume',
    title: 'Resume.pdf',
    icon: icons.resume,
    width: 760,
    height: 640,
    render: renderResume,
  },
  {
    id: 'contact',
    title: 'Contact',
    icon: icons.contact,
    width: 600,
    height: 420,
    render: renderContact,
  },
  {
    id: 'browser',
    title: 'Aperture',
    icon: icons.browser,
    width: 940,
    height: 680,
    render: createBrowser,
  },
  {
    id: 'timetable',
    title: 'Timetable',
    icon: icons.timetable,
    width: 900,
    height: 640,
    render: createTimetable,
  },
  {
    id: 'sysmon',
    title: 'System Monitor',
    icon: icons.sysmon,
    width: 900,
    height: 600,
    render: createSystemMonitor,
  },
  {
    id: 'garage',
    title: 'Garage',
    icon: icons.garage,
    width: 980,
    height: 660,
    render: createGarage,
  },
  {
    id: 'music',
    title: 'Player',
    icon: icons.music,
    width: 520,
    height: 620,
    render: createMusic,
  },
  {
    id: 'news',
    title: 'Wire',
    icon: icons.news,
    width: 760,
    height: 620,
    render: createNews,
  },
  {
    id: 'terminal',
    title: 'Terminal',
    icon: icons.terminal,
    width: 700,
    height: 480,
    render: createTerminal,
  },
  {
    id: 'explorer',
    title: 'Files',
    icon: icons.explorer,
    width: 720,
    height: 520,
    render: createExplorer,
  },
  {
    id: 'notepad',
    title: 'Notepad',
    icon: icons.notepad,
    width: 660,
    height: 500,
    render: createNotepad,
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: icons.calculator,
    width: 320,
    height: 460,
    render: createCalculator,
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    icon: icons.minesweeper,
    width: 520,
    height: 520,
    render: createMinesweeper,
  },
  {
    id: 'paint',
    title: 'Paint',
    icon: icons.paint,
    width: 600,
    height: 500,
    render: createPaint,
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: icons.settings,
    width: 660,
    height: 560,
    render: createSettings,
  },
];

export const appsById = new Map(apps.map((app) => [app.id, app]));

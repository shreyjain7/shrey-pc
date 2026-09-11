import { createCredits } from './apps/Credits';
import { createDos } from './apps/Dos';
import { createSearch } from './apps/Search';
import { createShowcase } from './apps/Showcase';
import { createWordle } from './apps/Wordle';
import { createTerminal } from './Terminal';
import { createBrowser } from './apps/Browser';
import { createExplorer } from './apps/Explorer';
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
  search: svg('<circle cx="11" cy="11" r="6.6"/><path d="m16 16 4.4 4.4"/>'),
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
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
  showcase: svg(
    '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M9 4.5v15"/>' +
      '<path d="M5.4 8.5h1.4M5.4 12h1.4M5.4 15.5h1.4"/>',
  ),
  wordle: svg(
    '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/>' +
      '<path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17"/>',
  ),
  dos: svg(
    '<rect x="3" y="4.5" width="18" height="15" rx="2"/>' +
      '<path d="m7 10 2.4 2-2.4 2"/><path d="M12.4 14.6h4.2"/>',
  ),
  credits: svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/>',
  ),
};

/* -------------------------------------------------------------------------- */
/* Apps                                                                        */
/* -------------------------------------------------------------------------- */

export const apps: AppDefinition[] = [
  {
    id: 'showcase',
    title: 'Showcase',
    icon: icons.showcase,
    width: 940,
    height: 680,
    render: createShowcase,
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
    id: 'search',
    title: 'Search',
    icon: icons.search,
    width: 860,
    height: 640,
    render: createSearch,
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
    id: 'music',
    title: 'Player',
    icon: icons.music,
    width: 900,
    height: 620,
    render: createMusic,
  },
  {
    id: 'wordle',
    title: 'Wordle',
    icon: icons.wordle,
    width: 520,
    height: 680,
    render: createWordle,
  },
  {
    id: 'dos',
    title: 'DOS',
    icon: icons.dos,
    width: 800,
    height: 600,
    render: createDos,
  },
  {
    id: 'credits',
    title: 'Credits',
    icon: icons.credits,
    width: 660,
    height: 560,
    render: createCredits,
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

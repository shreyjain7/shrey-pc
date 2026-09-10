import {
  achievements,
  education,
  experience,
  links,
  profile,
  projects,
  resumePath,
  skills,
} from '../../data/cv';
import { formatTime, nextClass, overallAttendance, semester } from '../../data/timetable';
import { telemetry } from '../../world/telemetry';
import { SPRING, Spring, ease, stagger, tween } from '../anim';
import { GITHUB_USER, languageColour, languageMix, loadGitHub, type GitHubData } from '../github';
import { el, svg } from '../ui';
import { renderSubjectKey, renderWeekGrid } from './Timetable';

/**
 * Aperture — the browser.
 *
 * It is a real browser shell (tabs, history per tab, an address bar that
 * resolves what you type, bookmarks, a progress bar) over a small local web.
 * The pages are rendered from the same data the rest of the machine uses, and
 * the GitHub page is genuinely live: it calls the public API for
 * github.com/shreyjain7 and falls back to a bundled snapshot when the network
 * says no.
 *
 * Cross-origin pages cannot be framed — nearly every site sends
 * `X-Frame-Options` or a frame-ancestors CSP — so an external address renders
 * an honest hand-off card with a button that opens it in the real browser,
 * rather than pretending to load and showing a blank rectangle.
 */

const HOME = 'shrey://home';

const ICON = {
  back: svg('<path d="M15 5 8 12l7 7"/>'),
  forward: svg('<path d="m9 5 7 7-7 7"/>'),
  reload: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.4V9h-4.6"/>'),
  home: svg('<path d="m4 11 8-6.6 8 6.6"/><path d="M6.5 9.7V19h11V9.7"/>'),
  plus: svg('<path d="M12 6v12M6 12h12"/>'),
  close: svg('<path d="m7 7 10 10M17 7 7 17"/>'),
  lock: svg('<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  external: svg('<path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M18.5 14v4.5A1.5 1.5 0 0 1 17 20H6a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 6 6h4.5"/>'),
  star: svg('<path d="m12 4.6 2.3 4.8 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z"/>'),
};

/** What the browser knows how to serve. */
interface Site {
  title: string;
  glyph: string;
  render: (api: PageApi) => HTMLElement | Promise<HTMLElement>;
}

interface PageApi {
  navigate: (url: string) => void;
  query: string;
}

/* -------------------------------------------------------------------------- */
/* Page furniture                                                              */
/* -------------------------------------------------------------------------- */

function page(className = '') {
  return el('div', ('web ' + className).trim());
}

function webHead(kicker: string, title: string, sub?: string) {
  const head = el('header', 'web__head');
  head.append(el('span', 'web__kicker', kicker));
  head.append(el('h1', 'web__title', title));
  if (sub) head.append(el('p', 'web__sub', sub));
  return head;
}

function card(title: string, body: string, meta?: string) {
  const node = el('article', 'web-card');
  node.append(el('h3', 'web-card__title', title));
  node.append(el('p', 'web-card__body', body));
  if (meta) node.append(el('p', 'web-card__meta', meta));
  return node;
}

function internalLink(label: string, url: string, api: PageApi, className = 'web-link') {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => api.navigate(url));
  return node;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                       */
/* -------------------------------------------------------------------------- */

function renderHome(api: PageApi) {
  const root = page('web--home');

  const hero = el('section', 'web-hero');
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  hero.append(el('p', 'web-hero__greeting', `${greeting}, ${profile.name.split(' ')[0]}.`));
  hero.append(el('h1', 'web-hero__clock', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));

  const search = el('form', 'web-search');
  const input = el('input', 'web-search__input');
  input.type = 'text';
  input.placeholder = 'Search this machine, or type an address';
  input.spellcheck = false;
  const go = el('button', 'web-search__go', 'Search');
  go.type = 'submit';
  search.append(input, go);
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (value) api.navigate(value);
  });
  hero.append(search);
  root.append(hero);

  /* --- Live strip: next class, attendance, repo count -------------------- */
  const strip = el('div', 'web-strip');
  const upcoming = nextClass();
  const overall = overallAttendance();

  const classChip = el('button', 'web-strip__chip');
  classChip.type = 'button';
  classChip.append(el('span', 'web-strip__label', 'Next class'));
  classChip.append(
    el(
      'span',
      'web-strip__value',
      upcoming ? `${upcoming.subject.short} · ${formatTime(upcoming.period.start)}` : 'Nothing scheduled',
    ),
  );
  classChip.addEventListener('click', () => api.navigate('shrey://timetable'));
  strip.append(classChip);

  const attendanceChip = el('button', 'web-strip__chip');
  attendanceChip.type = 'button';
  attendanceChip.classList.toggle('is-risk', overall.percent < semester.minimumAttendance);
  attendanceChip.append(el('span', 'web-strip__label', 'Attendance'));
  attendanceChip.append(el('span', 'web-strip__value', overall.percent.toFixed(1) + '%'));
  attendanceChip.addEventListener('click', () => api.navigate('shrey://timetable'));
  strip.append(attendanceChip);

  const githubChip = el('button', 'web-strip__chip');
  githubChip.type = 'button';
  githubChip.append(el('span', 'web-strip__label', 'GitHub'));
  githubChip.append(el('span', 'web-strip__value', '@' + GITHUB_USER));
  githubChip.addEventListener('click', () => api.navigate('shrey://github'));
  strip.append(githubChip);

  root.append(strip);

  /* --- Tiles ------------------------------------------------------------ */
  const tiles = el('div', 'web-tiles');
  const entries: Array<[string, string, string]> = [
    ['About', 'Who I am and what I work on', 'shrey://about'],
    ['Projects', `${projects.length} things I have shipped`, 'shrey://projects'],
    ['GitHub', 'Repositories, live from the API', 'shrey://github'],
    ['Timetable', 'The week, and the attendance maths', 'shrey://timetable'],
    ['Experience', 'Internships, teams and chapters', 'shrey://experience'],
    ['Skills', 'Languages, tools and databases', 'shrey://skills'],
    ['Education', 'MIT Manipal, 2023–2027', 'shrey://education'],
    ['Contact', 'The quickest ways to reach me', 'shrey://contact'],
  ];

  for (const [title, sub, url] of entries) {
    const tile = el('button', 'web-tile');
    tile.type = 'button';
    tile.append(el('span', 'web-tile__title', title));
    tile.append(el('span', 'web-tile__sub', sub));
    tile.addEventListener('click', () => api.navigate(url));
    tiles.append(tile);
  }

  root.append(tiles);
  stagger(Array.from(tiles.children) as HTMLElement[], 30);
  return root;
}

async function renderGitHub(api: PageApi) {
  const root = page('web--github');

  const skeleton = el('div', 'web-skeleton');
  for (let i = 0; i < 4; i += 1) skeleton.append(el('div', 'web-skeleton__row'));
  root.append(skeleton);

  // The fetch is kicked off by the caller awaiting this function, so the
  // skeleton only ever paints when the request is genuinely slow.
  const data: GitHubData = await loadGitHub();
  root.replaceChildren();

  const head = el('header', 'gh-head');

  const avatar = el('div', 'gh-avatar');
  if (data.profile.avatar) {
    const image = el('img', 'gh-avatar__img');
    image.src = data.profile.avatar;
    image.alt = '';
    image.loading = 'lazy';
    avatar.append(image);
  } else {
    avatar.textContent = data.profile.login.slice(0, 2).toUpperCase();
  }
  head.append(avatar);

  const identity = el('div', 'gh-identity');
  identity.append(el('h1', 'gh-name', data.profile.name ?? data.profile.login));
  identity.append(el('p', 'gh-login', '@' + data.profile.login));
  if (data.profile.bio) identity.append(el('p', 'gh-bio', data.profile.bio));

  const stats = el('div', 'gh-stats');
  for (const [value, label] of [
    [String(data.profile.publicRepos), 'repositories'],
    [String(data.profile.followers), 'followers'],
    [String(data.profile.following), 'following'],
  ]) {
    const stat = el('span', 'gh-stat');
    stat.append(el('strong', undefined, value));
    stat.append(document.createTextNode(' ' + label));
    stats.append(stat);
  }
  identity.append(stats);
  head.append(identity);
  root.append(head);

  // Say plainly whether these numbers came off the wire.
  const source = el('p', 'gh-source');
  source.classList.toggle('is-stale', !data.live);
  source.textContent = data.live
    ? `Live from api.github.com · fetched ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'GitHub could not be reached — showing the bundled snapshot.';
  root.append(source);

  /* --- Language mix ----------------------------------------------------- */
  const mix = languageMix(data.repos);
  if (mix.length) {
    const bar = el('div', 'gh-langbar');
    for (const entry of mix) {
      const segment = el('span', 'gh-langbar__seg');
      segment.style.width = entry.percent + '%';
      segment.style.background = languageColour(entry.language);
      segment.title = `${entry.language} — ${entry.percent.toFixed(0)}%`;
      bar.append(segment);
    }
    root.append(bar);

    const legend = el('div', 'gh-legend');
    for (const entry of mix.slice(0, 6)) {
      const item = el('span', 'gh-legend__item');
      const dot = el('span', 'gh-legend__dot');
      dot.style.background = languageColour(entry.language);
      item.append(dot, document.createTextNode(`${entry.language} ${entry.percent.toFixed(0)}%`));
      legend.append(item);
    }
    root.append(legend);
  }

  /* --- Repositories ----------------------------------------------------- */
  root.append(el('h2', 'web-section', `Repositories (${data.repos.length})`));

  const list = el('div', 'gh-repos');
  for (const repo of data.repos) {
    const item = el('article', 'gh-repo');

    const link = el('a', 'gh-repo__name', repo.name);
    link.href = repo.url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    item.append(link);

    if (repo.description) item.append(el('p', 'gh-repo__desc', repo.description));

    if (repo.topics.length) {
      const topics = el('div', 'gh-repo__topics');
      for (const topic of repo.topics.slice(0, 6)) topics.append(el('span', 'gh-topic', topic));
      item.append(topics);
    }

    const meta = el('div', 'gh-repo__meta');
    if (repo.language) {
      const dot = el('span', 'gh-legend__dot');
      dot.style.background = languageColour(repo.language);
      const language = el('span', 'gh-repo__lang');
      language.append(dot, document.createTextNode(repo.language));
      meta.append(language);
    }
    if (repo.stars) meta.append(el('span', undefined, `★ ${repo.stars}`));
    if (repo.forks) meta.append(el('span', undefined, `⑂ ${repo.forks}`));
    meta.append(el('span', undefined, 'Updated ' + repo.updated));
    item.append(meta);

    list.append(item);
  }
  root.append(list);
  stagger(Array.from(list.children) as HTMLElement[], 26);

  const footer = el('p', 'web__footer');
  footer.append(internalLink('← Back to start', HOME, api));
  root.append(footer);

  return root;
}

function renderTimetablePage() {
  const root = page('web--timetable');
  root.append(
    webHead(
      semester.institute,
      'Timetable',
      `${semester.label} · ${semester.programme} · ${semester.section} · ${semester.term}`,
    ),
  );

  const overall = overallAttendance();
  const banner = el('div', 'web-banner');
  banner.classList.toggle('is-risk', overall.percent < semester.minimumAttendance);
  banner.append(el('strong', undefined, overall.percent.toFixed(1) + '% overall attendance'));
  banner.append(
    el(
      'span',
      undefined,
      `${overall.attended} of ${overall.held} classes · institute minimum ${semester.minimumAttendance}%`,
    ),
  );
  root.append(banner);

  root.append(renderWeekGrid());
  root.append(el('h2', 'web-section', 'Subjects'));
  root.append(renderSubjectKey());
  return root;
}

function renderSearch(api: PageApi) {
  const query = api.query.toLowerCase();
  const root = page('web--search');
  root.append(webHead('Search', `Results for “${api.query}”`));

  interface Hit {
    title: string;
    body: string;
    url: string;
    kind: string;
  }

  const corpus: Hit[] = [
    { title: profile.name, body: profile.summary.join(' '), url: 'shrey://about', kind: 'About' },
    ...projects.map((project) => ({
      title: project.title,
      body: [project.subtitle, ...(project.bullets ?? [])].filter(Boolean).join(' '),
      url: 'shrey://projects',
      kind: 'Project',
    })),
    ...experience.map((entry) => ({
      title: entry.title,
      body: [entry.subtitle, entry.period, ...(entry.bullets ?? [])].filter(Boolean).join(' '),
      url: 'shrey://experience',
      kind: 'Experience',
    })),
    ...education.map((entry) => ({
      title: entry.title,
      body: [entry.subtitle, entry.meta, ...(entry.bullets ?? [])].filter(Boolean).join(' '),
      url: 'shrey://education',
      kind: 'Education',
    })),
    ...achievements.map((entry) => ({
      title: entry.title,
      body: [entry.subtitle, entry.period].filter(Boolean).join(' '),
      url: 'shrey://achievements',
      kind: 'Achievement',
    })),
    ...skills.map((group) => ({
      title: group.label,
      body: group.items.join(', '),
      url: 'shrey://skills',
      kind: 'Skills',
    })),
    {
      title: 'Timetable and attendance',
      body: 'class schedule week periods lectures labs attendance percentage minimum detention',
      url: 'shrey://timetable',
      kind: 'Timetable',
    },
    {
      title: 'GitHub — @' + GITHUB_USER,
      body: 'repositories code open source commits languages',
      url: 'shrey://github',
      kind: 'GitHub',
    },
  ];

  const hits = corpus.filter(
    (entry) =>
      entry.title.toLowerCase().includes(query) || entry.body.toLowerCase().includes(query),
  );

  if (!hits.length) {
    root.append(
      el('p', 'web-empty', `Nothing on this machine matches “${api.query}”. Try a site name, or an address.`),
    );
    return root;
  }

  const list = el('div', 'web-results');
  for (const hit of hits) {
    const item = el('button', 'web-result');
    item.type = 'button';
    item.append(el('span', 'web-result__kind', hit.kind));
    item.append(el('span', 'web-result__title', hit.title));
    item.append(el('span', 'web-result__body', hit.body.slice(0, 190) + (hit.body.length > 190 ? '…' : '')));
    item.addEventListener('click', () => api.navigate(hit.url));
    list.append(item);
  }
  root.append(list);
  stagger(Array.from(list.children) as HTMLElement[], 28);
  return root;
}

/** Entries render as a magazine column rather than the app's card stack. */
function renderEntries(kicker: string, title: string, entries: typeof projects, sub?: string) {
  const root = page();
  root.append(webHead(kicker, title, sub));

  const list = el('div', 'web-entries');
  for (const entry of entries) {
    const article = el('article', 'web-entry');

    const head = el('div', 'web-entry__head');
    head.append(el('h2', 'web-entry__title', entry.title));
    if (entry.period) head.append(el('span', 'web-entry__period', entry.period));
    article.append(head);

    if (entry.subtitle) article.append(el('p', 'web-entry__sub', entry.subtitle));
    if (entry.meta) article.append(el('p', 'web-entry__meta', entry.meta));

    if (entry.bullets?.length) {
      const bullets = el('ul', 'web-entry__bullets');
      for (const bullet of entry.bullets) bullets.append(el('li', undefined, bullet));
      article.append(bullets);
    }

    list.append(article);
  }

  root.append(list);
  stagger(Array.from(list.children) as HTMLElement[], 34);
  return root;
}

function renderAboutPage() {
  const root = page('web--about');
  root.append(webHead(profile.role, profile.name, `${profile.tagline} · ${profile.location}`));

  const prose = el('div', 'web-prose');
  for (const paragraph of profile.summary) prose.append(el('p', undefined, paragraph));
  root.append(prose);

  const grid = el('div', 'web-cards');
  grid.append(card('Education', education[0].title, education[0].period));
  grid.append(card('Focus', 'Full-stack development and applied machine learning', 'Python · C · FastAPI · Django'));
  grid.append(card('Currently', semester.label, semester.term));
  root.append(grid);
  return root;
}

function renderSkillsPage() {
  const root = page();
  root.append(webHead('Toolkit', 'Skills'));

  const grid = el('div', 'web-skills');
  for (const group of skills) {
    const block = el('section', 'web-skill');
    block.append(el('h2', 'web-skill__label', group.label));
    const tags = el('div', 'web-skill__tags');
    for (const item of group.items) tags.append(el('span', 'web-tag', item));
    block.append(tags);
    grid.append(block);
  }
  root.append(grid);
  stagger(Array.from(grid.children) as HTMLElement[], 40);
  return root;
}

function renderContactPage() {
  const root = page();
  root.append(webHead('Say hello', 'Contact', 'Open to internships and collaboration.'));

  const list = el('div', 'web-contact');
  for (const link of links) {
    const row = el('a', 'web-contact__row');
    row.href = link.href;
    if (!link.href.startsWith('mailto:')) {
      row.target = '_blank';
      row.rel = 'noreferrer noopener';
    }
    row.append(el('span', 'web-contact__label', link.label));
    row.append(el('span', 'web-contact__value', link.display ?? link.href));
    row.append(el('span', 'web-contact__arrow', '→'));
    list.append(row);
  }
  root.append(list);
  return root;
}

function renderResumePage(api: PageApi) {
  const root = page();
  root.append(webHead('Document', 'Resume', 'Shrey_Jain_Resume.pdf'));

  const open = el('a', 'web-button', 'Open the PDF');
  open.href = resumePath;
  open.target = '_blank';
  open.rel = 'noreferrer noopener';
  root.append(open);

  root.append(el('h2', 'web-section', 'On one page'));

  const summary = el('div', 'web-cards');
  summary.append(card('Education', education[0].title, education[0].period));
  summary.append(card('Projects', `${projects.length} shipped`, projects.map((entry) => entry.title).join(' · ')));
  summary.append(
    card('Experience', `${experience.length} roles`, experience.map((entry) => entry.title).join(' · ')),
  );
  summary.append(card('Skills', skills[0].items.join(', '), skills.map((group) => group.label).join(' · ')));
  root.append(summary);

  const footer = el('p', 'web__footer');
  footer.append(internalLink('Read the full experience →', 'shrey://experience', api));
  root.append(footer);
  return root;
}

/** The hand-off card for an address this browser cannot render itself. */
function renderExternal(url: string) {
  const root = page('web--external');

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const box = el('div', 'web-external');
  box.innerHTML = '<span class="web-external__glyph">' + ICON.external + '</span>';
  box.append(el('h1', 'web-external__host', host));
  box.append(
    el(
      'p',
      'web-external__body',
      'This page lives on the real internet. Sites almost always refuse to be embedded in a frame, so rather than showing you a blank rectangle, here is the door.',
    ),
  );

  const open = el('a', 'web-button', 'Open in your browser');
  open.href = url;
  open.target = '_blank';
  open.rel = 'noreferrer noopener';
  box.append(open);

  box.append(el('p', 'web-external__url', url));
  root.append(box);
  return root;
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

const SITES: Record<string, Site> = {
  home: { title: 'Start', glyph: '◈', render: renderHome },
  about: { title: 'About — Shrey Jain', glyph: '◉', render: renderAboutPage },
  projects: {
    title: 'Projects',
    glyph: '◧',
    render: () => renderEntries('Work', 'Projects', projects, 'Things I have designed, built and shipped.'),
  },
  experience: {
    title: 'Experience',
    glyph: '◨',
    render: () =>
      renderEntries('History', 'Experience & Activities', experience, 'Internships, student teams and chapters.'),
  },
  education: { title: 'Education', glyph: '◩', render: () => renderEntries('Study', 'Education', education) },
  achievements: {
    title: 'Achievements',
    glyph: '◆',
    render: () => renderEntries('Record', 'Achievements & Certifications', achievements),
  },
  skills: { title: 'Skills', glyph: '◇', render: renderSkillsPage },
  contact: { title: 'Contact', glyph: '✉', render: renderContactPage },
  resume: { title: 'Resume', glyph: '▤', render: renderResumePage },
  timetable: { title: 'Timetable & Attendance', glyph: '▦', render: renderTimetablePage },
  github: { title: `${GITHUB_USER} · GitHub`, glyph: '⌂', render: renderGitHub },
  search: { title: 'Search', glyph: '⌕', render: renderSearch },
};

/** What the user typed → an address this browser can act on. */
function resolve(input: string): string {
  const value = input.trim();
  if (!value) return HOME;

  if (value.startsWith('shrey://')) return value;
  if (/^(https?:)?\/\//i.test(value)) {
    const url = value.startsWith('//') ? 'https:' + value : value;
    // The one external address the browser serves itself.
    if (/^https?:\/\/(www\.)?github\.com\/shreyjain7\/?$/i.test(url)) return 'shrey://github';
    return url;
  }

  const bare = value.toLowerCase().replace(/^www\./, '');
  if (bare === `github.com/${GITHUB_USER}` || bare === 'github.com/' + GITHUB_USER + '/') {
    return 'shrey://github';
  }
  if (SITES[bare]) return 'shrey://' + bare;

  // A dotted, space-free token is an address; anything else is a search.
  if (/^[^\s]+\.[a-z]{2,}([/?#].*)?$/i.test(value)) return 'https://' + value;
  return 'shrey://search?q=' + encodeURIComponent(value);
}

function routeOf(url: string) {
  if (!url.startsWith('shrey://')) return null;
  const rest = url.slice('shrey://'.length);
  const [name, search = ''] = rest.split('?');
  const query = new URLSearchParams(search).get('q') ?? '';
  return { site: SITES[name] ?? null, name, query };
}

function displayUrl(url: string) {
  const route = routeOf(url);
  return route ? url : url.replace(/^https?:\/\//, '');
}

/* -------------------------------------------------------------------------- */
/* The shell                                                                   */
/* -------------------------------------------------------------------------- */

interface Tab {
  id: number;
  history: string[];
  index: number;
  title: string;
  glyph: string;
  button: HTMLElement;
  label: HTMLElement;
  icon: HTMLElement;
}

const BOOKMARKS: Array<[string, string]> = [
  ['Start', HOME],
  ['GitHub', 'shrey://github'],
  ['Timetable', 'shrey://timetable'],
  ['Projects', 'shrey://projects'],
  ['Resume', 'shrey://resume'],
  ['Contact', 'shrey://contact'],
];

export function createBrowser(): HTMLElement {
  const root = el('div', 'browser');

  let nextId = 1;
  let tabs: Tab[] = [];
  let active: Tab | null = null;
  /** Guards against a slow page landing after the user navigated away. */
  let generation = 0;
  let destroyed = false;

  /* --- Chrome ----------------------------------------------------------- */

  const tabStrip = el('div', 'browser__tabs');
  const tabList = el('div', 'browser__tablist');
  const newTab = el('button', 'browser__newtab');
  newTab.type = 'button';
  newTab.title = 'New tab';
  newTab.innerHTML = ICON.plus;
  tabStrip.append(tabList, newTab);

  const bar = el('div', 'browser__bar');

  const nav = el('div', 'browser__nav');
  const back = chromeButton(ICON.back, 'Back', () => step(-1));
  const forward = chromeButton(ICON.forward, 'Forward', () => step(1));
  const reload = chromeButton(ICON.reload, 'Reload', () => navigate(current(), { replace: true }));
  const home = chromeButton(ICON.home, 'Start page', () => navigate(HOME));
  nav.append(back, forward, reload, home);

  const address = el('form', 'browser__address');
  const scheme = el('span', 'browser__scheme');
  scheme.innerHTML = ICON.lock;
  const input = el('input', 'browser__input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Address');
  address.append(scheme, input);

  address.addEventListener('submit', (event) => {
    event.preventDefault();
    navigate(input.value);
    input.blur();
  });
  input.addEventListener('focus', () => {
    input.select();
    address.classList.add('is-focused');
  });
  input.addEventListener('blur', () => {
    address.classList.remove('is-focused');
    input.value = displayUrl(current());
  });
  // The OS owns most shortcuts; the address bar only needs Escape back out.
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      input.value = displayUrl(current());
      input.blur();
    }
  });

  bar.append(nav, address);

  const bookmarks = el('div', 'browser__bookmarks');
  bookmarks.innerHTML = '<span class="browser__bookmark-icon">' + ICON.star + '</span>';
  for (const [label, url] of BOOKMARKS) {
    const mark = el('button', 'browser__bookmark', label);
    mark.type = 'button';
    mark.addEventListener('click', () => navigate(url));
    bookmarks.append(mark);
  }

  const progress = el('div', 'browser__progress');
  const progressFill = el('div', 'browser__progress-fill');
  progress.append(progressFill);

  const viewport = el('div', 'browser__viewport');

  root.append(tabStrip, bar, bookmarks, progress, viewport);

  /* --- The sliding tab highlight ---------------------------------------- */

  const highlight = el('div', 'browser__tab-highlight');
  tabList.append(highlight);

  const highlightX = new Spring(0, {
    ...SPRING.menu,
    onUpdate: (value) => {
      highlight.style.transform = `translateX(${value}px)`;
    },
  });
  const highlightW = new Spring(0, {
    ...SPRING.menu,
    onUpdate: (value) => {
      highlight.style.width = `${value}px`;
    },
  });

  function moveHighlight(immediate = false) {
    if (!active) {
      highlight.style.opacity = '0';
      return;
    }
    highlight.style.opacity = '1';
    const left = active.button.offsetLeft;
    const width = active.button.offsetWidth;
    if (immediate) {
      highlightX.set(left);
      highlightW.set(width);
    } else {
      highlightX.to(left);
      highlightW.to(width);
    }
  }

  function chromeButton(glyph: string, label: string, onClick: () => void) {
    const node = el('button', 'browser__icon');
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.innerHTML = glyph;
    node.addEventListener('click', onClick);
    return node;
  }

  /* --- Tabs ------------------------------------------------------------- */

  function openTab(url = HOME, focus = true) {
    const button = el('div', 'browser__tab');
    const icon = el('span', 'browser__tab-icon', '◈');
    const label = el('span', 'browser__tab-label', 'New tab');

    const close = el('button', 'browser__tab-close');
    close.type = 'button';
    close.title = 'Close tab';
    close.innerHTML = ICON.close;

    button.append(icon, label, close);

    const tab: Tab = {
      id: nextId++,
      history: [],
      index: -1,
      title: 'New tab',
      glyph: '◈',
      button,
      label,
      icon,
    };

    button.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('.browser__tab-close')) return;
      selectTab(tab);
    });
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab);
    });

    // Seed the history before the tab is selected, so the first paint draws
    // the requested page rather than the start page and then replacing it.
    tab.history = [resolve(url)];
    tab.index = 0;

    tabs.push(tab);
    tabList.append(button);

    // Tabs grow in rather than appearing at full width.
    button.style.transformOrigin = 'left center';
    void tween(
      260,
      (t) => {
        button.style.opacity = String(t);
        button.style.transform = `scaleX(${0.72 + t * 0.28})`;
        if (t >= 1) button.style.transform = '';
      },
      ease.outQuint,
    );

    syncTabLabel(tab, tab.history[0]);
    if (focus) selectTab(tab);
    telemetry.process(0.25);
    return tab;
  }

  function closeTab(tab: Tab) {
    const index = tabs.indexOf(tab);
    if (index < 0) return;

    void tween(
      180,
      (t) => {
        tab.button.style.opacity = String(1 - t);
        tab.button.style.transform = `scaleX(${1 - t * 0.3})`;
      },
      ease.outCubic,
    ).then(() => tab.button.remove());

    tabs = tabs.filter((entry) => entry !== tab);

    if (!tabs.length) {
      // A browser with no tabs is not a browser; open a fresh start page.
      openTab(HOME);
      return;
    }

    if (active === tab) selectTab(tabs[Math.min(index, tabs.length - 1)]);
    else moveHighlight();
  }

  function selectTab(tab: Tab) {
    active = tab;
    for (const entry of tabs) entry.button.classList.toggle('is-active', entry === tab);
    moveHighlight();
    syncChrome();
    void paint();
  }

  function current() {
    return active && active.index >= 0 ? active.history[active.index] : HOME;
  }

  /* --- Navigation ------------------------------------------------------- */

  function navigate(input: string, options: { tab?: Tab; replace?: boolean } = {}) {
    const tab = options.tab ?? active;
    if (!tab) return;

    const url = resolve(input);

    if (options.replace && tab.index >= 0) {
      tab.history[tab.index] = url;
    } else {
      // Navigating from the middle of history discards everything ahead.
      tab.history = tab.history.slice(0, tab.index + 1);
      tab.history.push(url);
      tab.index = tab.history.length - 1;
    }

    telemetry.process(0.3);
    telemetry.diskActivity(0.4);
    if (tab === active) void paint();
    else syncTabLabel(tab, url);
  }

  function step(delta: number) {
    if (!active) return;
    const next = active.index + delta;
    if (next < 0 || next >= active.history.length) return;
    active.index = next;
    void paint();
  }

  function syncTabLabel(tab: Tab, url: string) {
    const route = routeOf(url);
    const site = route?.site;
    tab.title = site ? site.title : displayUrl(url);
    tab.glyph = site ? site.glyph : '⌾';
    tab.label.textContent = tab.title;
    tab.icon.textContent = tab.glyph;
    tab.button.title = tab.title;
  }

  function syncChrome() {
    const url = current();
    input.value = displayUrl(url);
    back.toggleAttribute('disabled', !active || active.index <= 0);
    forward.toggleAttribute('disabled', !active || active.index >= active.history.length - 1);
    scheme.classList.toggle('is-local', url.startsWith('shrey://'));
  }

  /**
   * Draw the current tab's page.
   *
   * The progress bar is not decoration: it runs to 70% immediately, then
   * completes only once the page element actually exists, so a slow GitHub
   * fetch genuinely holds it there.
   */
  async function paint() {
    if (!active || destroyed) return;
    const token = ++generation;
    const url = current();

    syncChrome();
    syncTabLabel(active, url);

    progress.classList.add('is-loading');
    progressFill.style.transform = 'scaleX(0)';
    void tween(
      220,
      (t) => {
        progressFill.style.transform = `scaleX(${t * 0.7})`;
      },
      ease.outCubic,
    );

    const route = routeOf(url);
    const api: PageApi = { navigate: (next) => navigate(next), query: route?.query ?? '' };

    let node: HTMLElement;
    try {
      node = route?.site ? await route.site.render(api) : renderExternal(url);
    } catch {
      node = page();
      node.append(el('p', 'web-empty', 'That page failed to render.'));
    }

    // A newer navigation started while this one was awaiting — drop it.
    if (token !== generation || destroyed) return;

    const previous = viewport.firstElementChild as HTMLElement | null;
    viewport.append(node);
    viewport.scrollTop = 0;

    void tween(
      160,
      (t) => {
        progressFill.style.transform = `scaleX(${0.7 + t * 0.3})`;
        if (t >= 1) {
          progress.classList.remove('is-loading');
          progressFill.style.transform = 'scaleX(0)';
        }
      },
      ease.outCubic,
    );

    // Cross-fade: the outgoing page lifts away while the new one settles in.
    if (previous) {
      void tween(
        150,
        (t) => {
          previous.style.opacity = String(1 - t);
          previous.style.transform = `translateY(${-6 * t}px)`;
          if (t >= 1) previous.remove();
        },
        ease.outCubic,
      );
    }

    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    void tween(
      340,
      (t) => {
        node.style.opacity = String(t);
        node.style.transform = `translateY(${10 * (1 - t)}px)`;
        if (t >= 1) {
          node.style.opacity = '';
          node.style.transform = '';
        }
      },
      ease.outQuint,
    );
  }

  newTab.addEventListener('click', () => openTab());

  root.addEventListener('app:destroy', () => {
    destroyed = true;
    highlightX.cancel();
    highlightW.cancel();
  });

  // Keep the highlight aligned when the window is resized under the tabs.
  const observer = new ResizeObserver(() => moveHighlight(true));
  observer.observe(tabList);
  root.addEventListener('app:destroy', () => observer.disconnect());

  openTab(HOME);
  requestAnimationFrame(() => moveHighlight(true));

  return root;
}

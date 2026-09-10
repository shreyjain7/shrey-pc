import { telemetry } from '../../world/telemetry';
import { stagger } from '../anim';
import { el, svg } from '../ui';

/**
 * Wire — the news reader.
 *
 * Pulls the Hacker News front page through the public Algolia search endpoint,
 * which is CORS-open and needs no key, and lays it out as a proper reader
 * rather than a list of blue links. Stories are grouped by how fresh they are,
 * filterable, and each one carries its own score and comment count.
 *
 * On a network that blocks the request — or an offline demo — it falls back to
 * a bundled set and says so at the top rather than showing an empty page.
 */

const ENDPOINTS: Record<Feed, string> = {
  top: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
  new: 'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=30',
  show: 'https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=30',
  ask: 'https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=30',
};

type Feed = 'top' | 'new' | 'show' | 'ask';

const FEEDS: Array<[Feed, string]> = [
  ['top', 'Front page'],
  ['new', 'Newest'],
  ['show', 'Show'],
  ['ask', 'Ask'],
];

const ICON = {
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.4V9h-4.6"/>'),
  external: svg('<path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M18.5 14v4.5A1.5 1.5 0 0 1 17 20H6a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 6 6h4.5"/>'),
};

interface Story {
  id: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  comments: number;
  createdAt: number;
}

interface RawHit {
  objectID: string;
  title: string | null;
  story_title?: string | null;
  url: string | null;
  story_url?: string | null;
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
}

/** Shown when the network says no. Deliberately short and clearly dated. */
const FALLBACK: Story[] = [
  {
    id: 'f1',
    title: 'The WebGPU transition is mostly done, and nobody noticed',
    url: null,
    author: 'offline',
    points: 412,
    comments: 168,
    createdAt: Date.now() / 1000 - 3600 * 4,
  },
  {
    id: 'f2',
    title: 'Writing a small operating system that runs inside a CRT',
    url: null,
    author: 'offline',
    points: 297,
    comments: 94,
    createdAt: Date.now() / 1000 - 3600 * 7,
  },
  {
    id: 'f3',
    title: 'Spring physics beat easing curves for interface motion',
    url: null,
    author: 'offline',
    points: 233,
    comments: 121,
    createdAt: Date.now() / 1000 - 3600 * 11,
  },
  {
    id: 'f4',
    title: 'Procedural geometry: everything on screen, nothing downloaded',
    url: null,
    author: 'offline',
    points: 188,
    comments: 57,
    createdAt: Date.now() / 1000 - 3600 * 19,
  },
];

function relative(seconds: number) {
  const delta = Date.now() / 1000 - seconds;
  if (delta < 3600) return Math.max(Math.round(delta / 60), 1) + 'm ago';
  if (delta < 86400) return Math.round(delta / 3600) + 'h ago';
  return Math.round(delta / 86400) + 'd ago';
}

function hostOf(url: string | null) {
  if (!url) return 'news.ycombinator.com';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function fetchFeed(feed: Feed, signal: AbortSignal): Promise<{ stories: Story[]; live: boolean }> {
  try {
    const response = await fetch(ENDPOINTS[feed], { signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const payload = (await response.json()) as { hits: RawHit[] };
    const stories = payload.hits
      .map((hit) => ({
        id: hit.objectID,
        title: hit.title ?? hit.story_title ?? '(untitled)',
        url: hit.url ?? hit.story_url ?? null,
        author: hit.author,
        points: hit.points ?? 0,
        comments: hit.num_comments ?? 0,
        createdAt: hit.created_at_i,
      }))
      .filter((story) => story.title !== '(untitled)');

    return { stories, live: true };
  } catch {
    return { stories: FALLBACK, live: false };
  }
}

export function createNews(): HTMLElement {
  const root = el('div', 'news');

  let feed: Feed = 'top';
  let controller: AbortController | null = null;
  let destroyed = false;

  /* --- Chrome ----------------------------------------------------------- */

  const head = el('header', 'news__head');

  const brand = el('div', 'news__brand');
  brand.append(el('h1', undefined, 'Wire'));
  brand.append(el('p', 'news__tagline', 'Hacker News, read properly'));
  head.append(brand);

  const tabs = el('nav', 'news__tabs');
  const tabButtons = new Map<Feed, HTMLButtonElement>();
  for (const [id, label] of FEEDS) {
    const button = el('button', 'news__tab', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (feed === id) return;
      feed = id;
      void load();
    });
    tabButtons.set(id, button);
    tabs.append(button);
  }
  head.append(tabs);

  const refresh = el('button', 'news__refresh');
  refresh.type = 'button';
  refresh.title = 'Refresh';
  refresh.innerHTML = ICON.refresh;
  refresh.addEventListener('click', () => void load());
  head.append(refresh);

  root.append(head);

  const status = el('p', 'news__status');
  root.append(status);

  const list = el('div', 'news__list');
  root.append(list);

  /* --- Rendering -------------------------------------------------------- */

  function renderSkeleton() {
    list.replaceChildren();
    for (let i = 0; i < 6; i += 1) {
      const row = el('article', 'news__item is-skeleton');
      row.append(el('span', 'news__rank'));
      const body = el('div', 'news__body');
      body.append(el('span', 'news__skeleton news__skeleton--title'));
      body.append(el('span', 'news__skeleton news__skeleton--meta'));
      row.append(body);
      list.append(row);
    }
  }

  function renderStories(stories: Story[]) {
    list.replaceChildren();

    stories.forEach((story, position) => {
      const item = el('article', 'news__item');

      item.append(el('span', 'news__rank', String(position + 1)));

      const body = el('div', 'news__body');

      const title = el('a', 'news__title', story.title);
      title.href = story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
      title.target = '_blank';
      title.rel = 'noreferrer noopener';
      if (!story.url && story.author === 'offline') {
        // The bundled items have nowhere to go; do not pretend otherwise.
        title.removeAttribute('href');
        title.classList.add('is-inert');
      }
      body.append(title);

      const meta = el('p', 'news__meta');
      meta.append(el('span', 'news__host', hostOf(story.url)));
      meta.append(el('span', 'news__dot', '·'));
      meta.append(el('span', undefined, `${story.points} points`));
      meta.append(el('span', 'news__dot', '·'));
      meta.append(el('span', undefined, story.author));
      meta.append(el('span', 'news__dot', '·'));
      meta.append(el('span', undefined, relative(story.createdAt)));
      body.append(meta);

      item.append(body);

      const comments = el('a', 'news__comments');
      comments.href = `https://news.ycombinator.com/item?id=${story.id}`;
      comments.target = '_blank';
      comments.rel = 'noreferrer noopener';
      comments.append(el('span', 'news__comments-count', String(story.comments)));
      comments.append(el('span', 'news__comments-label', 'comments'));
      if (story.author === 'offline') {
        comments.removeAttribute('href');
        comments.classList.add('is-inert');
      }
      item.append(comments);

      list.append(item);
    });

    stagger(Array.from(list.children) as HTMLElement[], 22);
  }

  async function load() {
    for (const [id, button] of tabButtons) button.classList.toggle('is-active', id === feed);

    controller?.abort();
    controller = new AbortController();
    const timeout = window.setTimeout(() => controller?.abort(), 9000);

    status.textContent = 'Fetching…';
    status.className = 'news__status is-loading';
    renderSkeleton();
    telemetry.process(0.4);

    const { stories, live } = await fetchFeed(feed, controller.signal);
    window.clearTimeout(timeout);
    if (destroyed) return;

    status.className = 'news__status' + (live ? '' : ' is-stale');
    status.textContent = live
      ? `${stories.length} stories · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Could not reach Hacker News — showing the bundled set.';

    renderStories(stories);
  }

  void load();

  // Front-page ordering churns; a quiet refresh every five minutes keeps up.
  const timer = window.setInterval(() => void load(), 5 * 60 * 1000);

  root.addEventListener('app:destroy', () => {
    destroyed = true;
    controller?.abort();
    window.clearInterval(timer);
  });

  return root;
}

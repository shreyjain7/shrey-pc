import { telemetry } from '../../world/telemetry';
import { el, svg } from '../ui';

/**
 * Spotify — a library of playlists, albums and artists, played through
 * Spotify's own embed.
 *
 * The embed is the only way to play their catalogue from a static site: no
 * key, no backend, no login. An anonymous listener gets 30-second previews,
 * and anyone signed into Spotify in that browser gets whole tracks. (The Web
 * Playback SDK plays full tracks outright, but every visitor would need
 * Premium and an OAuth round trip, which is not a thing to ask of someone
 * reading a CV.)
 *
 * Everything inside the frame belongs to Spotify — the artwork, the track
 * list, the transport. It is a sealed cross-origin document, so this app
 * cannot drive it or read what is playing; it only decides what to load.
 */

const ICONS = {
  note: svg('<path d="M9 17.6V6.4l10-2v11.1"/><circle cx="6.6" cy="17.7" r="2.4"/><circle cx="16.6" cy="15.4" r="2.4"/>'),
  list: svg('<path d="M4 6.5h10M4 11h10M4 15.5h6"/><circle cx="17.5" cy="15.4" r="2.1"/><path d="M19.6 15.4V8.2"/>'),
  disc: svg('<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="2.2"/>'),
  person: svg('<circle cx="12" cy="8.4" r="3.6"/><path d="M5.4 19.4a6.6 6.6 0 0 1 13.2 0"/>'),
  mic: svg('<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.6 12a6.4 6.4 0 0 0 12.8 0"/><path d="M12 18.4V21"/>'),
  cross: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
};

type Kind = 'playlist' | 'album' | 'artist' | 'track' | 'show' | 'episode';

const KIND_ICON: Record<Kind, string> = {
  playlist: ICONS.list,
  album: ICONS.disc,
  artist: ICONS.person,
  track: ICONS.note,
  show: ICONS.mic,
  episode: ICONS.mic,
};

interface Entry {
  kind: Kind;
  id: string;
  /** Spotify's own title once oEmbed answers; the kind until then. */
  label: string;
}

const LIBRARY_KEY = 'shrey-pc:spotify:library';
const CURRENT_KEY = 'shrey-pc:spotify:current';
/** The seed the stored library was built from, so a new one can replace it. */
const SEED_KEY = 'shrey-pc:spotify:seed';
/** What the app stored when it held a single link rather than a library. */
const LEGACY_KEY = 'shrey-pc:spotify:uri';

/**
 * Shrey's own playlist, so the window opens on his music rather than nothing.
 * The title is filled in by the listener's browser — Spotify is unreachable
 * from where this was written — and a row nobody wants is one ✕.
 */
const SEED: Entry[] = [{ kind: 'playlist', id: '53pviDxS74oGZEtfHuzvRw', label: 'Playlist' }];

const KINDS = 'track|album|artist|playlist|episode|show';

/** The placeholder a row wears until Spotify tells us what it is really called. */
const title = (kind: string) => kind[0].toUpperCase() + kind.slice(1);

/** Any Spotify link or URI, down to what it points at. */
export function parseSpotify(input: string): Entry | null {
  const value = input.trim();
  if (!value) return null;

  const uri = value.match(new RegExp(`^spotify:(${KINDS}):([A-Za-z0-9]+)$`));
  if (uri) return { kind: uri[1] as Kind, id: uri[2], label: title(uri[1]) };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;

  // Both /playlist/<id> and /embed/playlist/<id>, and any /intl-xx/ prefix
  // Spotify adds when it hands out a localised link.
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((part) => new RegExp(`^(${KINDS})$`).test(part));
  if (at === -1 || !parts[at + 1]) return null;

  const id = parts[at + 1].split('?')[0];
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;

  return { kind: parts[at] as Kind, id, label: title(parts[at]) };
}

export function toSpotifyEmbed(input: string): string | null {
  const entry = parseSpotify(input);
  return entry ? embedFor(entry) : null;
}

const embedFor = (entry: Entry) => `https://open.spotify.com/embed/${entry.kind}/${entry.id}`;
const pageFor = (entry: Entry) => `https://open.spotify.com/${entry.kind}/${entry.id}`;
const keyOf = (entry: Entry) => entry.kind + ':' + entry.id;

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Swaps in a new seed without touching what the listener added.
 *
 * A library that already exists is never rebuilt, so a changed seed would
 * otherwise only ever reach first-time visitors. Rows from the seed this
 * build replaces are dropped — they were put there, not chosen — and rows
 * from the current seed are added if they are missing. Everything else is
 * left exactly where it is.
 */
function reseed(saved: Entry[]): Entry[] {
  const now = SEED.map(keyOf).join(',');

  let before = '';
  try {
    before = localStorage.getItem(SEED_KEY) ?? '';
  } catch {
    // No record of an earlier seed; treat the library as all theirs.
  }

  if (before === now) return saved;

  const retired = new Set(before.split(',').filter(Boolean));
  for (const key of SEED.map(keyOf)) retired.delete(key);

  const kept = saved.filter((entry) => !retired.has(keyOf(entry)));
  const have = new Set(kept.map(keyOf));
  const added = SEED.filter((entry) => !have.has(keyOf(entry)));

  const next = [...added, ...kept];
  writeLibrary(next);
  try {
    localStorage.setItem(SEED_KEY, now);
  } catch {
    // It will simply be tried again next time.
  }

  return next;
}

function readLibrary(): Entry[] {
  let saved: Entry[] | null = null;

  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) saved = JSON.parse(raw) as Entry[];
  } catch {
    // Corrupt or unavailable; fall through to the seed.
  }

  if (Array.isArray(saved) && saved.length) return reseed(saved);

  // Carry over whatever the single-link version was last playing.
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    const entry = legacy ? parseSpotify(legacy) : null;
    if (entry) return [entry, ...SEED.filter((seed) => keyOf(seed) !== keyOf(entry))];
  } catch {
    // Nothing to carry over.
  }

  try {
    localStorage.setItem(SEED_KEY, SEED.map(keyOf).join(','));
  } catch {
    // Unavailable storage; the seed is applied fresh every visit anyway.
  }

  return [...SEED];
}

function writeLibrary(entries: Entry[]) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  } catch {
    // Private browsing: it plays now, it just will not be remembered.
  }
}

/**
 * Spotify's public oEmbed endpoint, for the real title of a saved row.
 *
 * This runs in the listener's browser, which can reach Spotify even where the
 * machine that wrote it could not. Nothing depends on it: a refusal, an
 * outage or a changed shape all just leave the row named after its kind.
 */
async function describe(entry: Entry): Promise<string | null> {
  try {
    const response = await fetch(
      'https://open.spotify.com/oembed?url=' + encodeURIComponent(pageFor(entry)),
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: unknown };
    return typeof data.title === 'string' && data.title ? data.title : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* App                                                                         */
/* -------------------------------------------------------------------------- */

export function createSpotify(): HTMLElement {
  const root = el('div', 'spotify');

  let library = readLibrary();
  let current = '';

  /* --- The library rail -------------------------------------------------- */

  const rail = el('aside', 'spotify__rail');
  rail.append(el('h2', 'spotify__rail-title', 'Library'));

  const list = el('div', 'spotify__list');
  rail.append(list);

  /* --- The stage --------------------------------------------------------- */

  const frame = el('iframe', 'spotify__frame');
  frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  frame.loading = 'lazy';
  frame.title = 'Spotify';
  // Held transparent until it paints, so the stage's black shows through
  // rather than the browser's white page while the embed is on its way.
  frame.addEventListener('load', () => frame.classList.add('is-ready'));

  const empty = el('div', 'spotify__empty');
  empty.append(el('h2', 'spotify__empty-title', 'Nothing in the library'));
  empty.append(
    el(
      'p',
      'spotify__empty-note',
      'Paste a Spotify link below to add a playlist, album, artist or track. ' +
        'Type anything else and it opens a Spotify search, so you can copy the link back.',
    ),
  );

  const stage = el('div', 'spotify__stage');
  stage.append(empty);

  /* --- The add bar ------------------------------------------------------- */

  const bar = el('form', 'spotify__bar');
  const input = el('input', 'spotify__input');
  input.type = 'text';
  input.spellcheck = false;
  input.placeholder = 'Paste a Spotify link, or type an artist to search';

  const add = el('button', 'spotify__go', 'Add');
  add.type = 'submit';

  const find = el('button', 'spotify__find');
  find.type = 'button';
  find.title = 'Search Spotify';
  find.innerHTML = ICONS.search;

  bar.append(input, add, find);

  const status = el('p', 'spotify__status', '');

  const main = el('div', 'spotify__main');
  main.append(stage, bar, status);
  root.append(rail, main);

  /* --- Behaviour --------------------------------------------------------- */

  function say(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  function play(entry: Entry, remember = true) {
    current = keyOf(entry);
    frame.classList.remove('is-ready');
    frame.src = embedFor(entry);
    stage.replaceChildren(frame);
    root.classList.add('is-loaded');
    say('');
    telemetry.process(0.3);
    mark();

    if (!remember) return;
    try {
      localStorage.setItem(CURRENT_KEY, current);
    } catch {
      // Not remembered; it still plays.
    }
  }

  function remove(entry: Entry) {
    library = library.filter((item) => keyOf(item) !== keyOf(entry));
    writeLibrary(library);
    render();

    if (current !== keyOf(entry)) return;
    current = '';
    if (library.length) play(library[0]);
    else {
      frame.src = '';
      stage.replaceChildren(empty);
      root.classList.remove('is-loaded');
    }
  }

  /** Fills in the real title, then repaints just that row's label. */
  function name(entry: Entry) {
    if (entry.label !== title(entry.kind)) return;
    void describe(entry).then((title) => {
      if (!title) return;
      entry.label = title;
      writeLibrary(library);
      const row = list.querySelector<HTMLElement>(`[data-key="${CSS.escape(keyOf(entry))}"] .spotify__row-label`);
      if (row) row.textContent = title;
    });
  }

  /**
   * The rail is rebuilt only when the library changes — adding or removing,
   * never per keystroke — so the cost of replacing a handful of rows inside
   * the CSS3D projection is paid a few times a session at most.
   */
  function render() {
    list.replaceChildren();

    for (const entry of library) {
      const row = el('div', 'spotify__row');
      row.dataset.key = keyOf(entry);

      const pick = el('button', 'spotify__row-pick');
      pick.type = 'button';
      pick.append(
        el('span', 'spotify__row-icon'),
        el('span', 'spotify__row-label', entry.label),
      );
      (pick.firstElementChild as HTMLElement).innerHTML = KIND_ICON[entry.kind] ?? ICONS.note;
      pick.addEventListener('click', () => play(entry));

      const drop = el('button', 'spotify__row-drop');
      drop.type = 'button';
      drop.title = 'Remove from library';
      drop.innerHTML = ICONS.cross;
      drop.addEventListener('click', () => remove(entry));

      row.append(pick, drop);
      list.append(row);
      name(entry);
    }

    mark();
  }

  function mark() {
    for (const row of list.children) {
      row.classList.toggle('is-current', (row as HTMLElement).dataset.key === current);
    }
  }

  /** A link joins the library; anything else is a search term. */
  function submit(value: string) {
    const entry = parseSpotify(value);

    if (!entry) {
      const query = value.trim();
      if (!query) return;
      window.open('https://open.spotify.com/search/' + encodeURIComponent(query), '_blank', 'noopener');
      say('Opened a Spotify search for “' + query + '”. Copy a link from there and paste it here.');
      return;
    }

    const existing = library.find((item) => keyOf(item) === keyOf(entry));
    if (existing) {
      play(existing);
      say('Already in the library.');
      return;
    }

    library = [entry, ...library];
    writeLibrary(library);
    render();
    play(entry);
    input.value = '';
  }

  bar.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(input.value);
  });

  find.addEventListener('click', () => {
    const query = input.value.trim();
    if (!query) {
      input.focus();
      say('Type an artist, album or song first.');
      return;
    }
    window.open('https://open.spotify.com/search/' + encodeURIComponent(query), '_blank', 'noopener');
    say('Opened a Spotify search for “' + query + '”. Copy a link from there and paste it here.');
  });

  input.addEventListener('keydown', (event) => event.stopPropagation());

  /* --- First paint ------------------------------------------------------- */

  render();

  let saved = '';
  try {
    saved = localStorage.getItem(CURRENT_KEY) ?? '';
  } catch {
    // Nothing remembered; the first row will do.
  }

  const start = library.find((entry) => keyOf(entry) === saved) ?? library[0];
  if (start) play(start, false);

  return root;
}

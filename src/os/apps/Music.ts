import { telemetry } from '../../world/telemetry';
import { ticker } from '../anim';
import { el, svg } from '../ui';

/**
 * Music — an Apple Music-shaped client playing from YouTube.
 *
 * ── On "audio only" ──────────────────────────────────────────────────────
 * YouTube's terms require their player to stay visible and unobscured; a
 * hidden player that exists only to strip the audio is not allowed, and the
 * ripper services that do it are worse. So the player is not hidden — it sits
 * exactly where an album cover would, at cover size. You get the art slot
 * filled by the thing that is actually playing, which for a music video is
 * what you wanted to look at anyway.
 *
 * ── On the library ───────────────────────────────────────────────────────
 * No track list ships. Paste a YouTube link and the title, channel and
 * thumbnail are resolved through YouTube's public oEmbed endpoint, then kept
 * in localStorage. Nothing is guessed and nothing is hosted here.
 */

const STORE_KEY = 'shrey-pc:music:library:v1';
const API_SRC = 'https://www.youtube.com/iframe_api';

const ICON = {
  play: svg('<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none"/>'),
  pause: svg(
    '<rect x="7" y="5.4" width="3.5" height="13.2" rx="1.2" fill="currentColor" stroke="none"/>' +
      '<rect x="13.5" y="5.4" width="3.5" height="13.2" rx="1.2" fill="currentColor" stroke="none"/>',
  ),
  next: svg(
    '<path d="M7 5.4v13.2L16 12z" fill="currentColor" stroke="none"/>' +
      '<rect x="16.6" y="5.4" width="2.4" height="13.2" rx="1.2" fill="currentColor" stroke="none"/>',
  ),
  prev: svg(
    '<path d="M17 5.4v13.2L8 12z" fill="currentColor" stroke="none"/>' +
      '<rect x="5" y="5.4" width="2.4" height="13.2" rx="1.2" fill="currentColor" stroke="none"/>',
  ),
  shuffle: svg('<path d="M4 6h3.2l9.6 12H20"/><path d="M4 18h3.2l3-3.8"/><path d="M13.6 9.4 16.8 6H20"/><path d="m17.6 3.4 2.6 2.6-2.6 2.6"/><path d="m17.6 15.4 2.6 2.6-2.6 2.6"/>'),
  note: svg('<path d="M9 17.6V6.4l10-2v11.1"/><circle cx="6.6" cy="17.7" r="2.4"/><circle cx="16.6" cy="15.4" r="2.4"/>'),
  plus: svg('<path d="M12 5.5v13M5.5 12h13"/>'),
};

interface Track {
  /** The YouTube video id — the only thing actually stored per track. */
  id: string;
  title: string;
  artist: string;
  thumb: string;
  /** Seconds, filled in by the player once it knows. */
  duration: number;
}

/* -------------------------------------------------------------------------- */
/* YouTube plumbing                                                            */
/* -------------------------------------------------------------------------- */

/** Accepts watch links, youtu.be links, /embed/ links, or a bare id. */
export function youtubeId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host !== 'youtube.com' && host !== 'music.youtube.com' && host !== 'm.youtube.com') {
    return null;
  }

  const param = url.searchParams.get('v');
  if (param && /^[\w-]{11}$/.test(param)) return param;

  const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/);
  return match ? match[1] : null;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(value: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, options: Record<string, unknown>) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

/** Loads the IFrame API once per page and resolves when `YT` is usable. */
function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // The API calls one fixed global when it is ready, so chain onto whatever
    // may already be there rather than clobbering it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.addEventListener('error', () =>
      reject(new Error('Could not reach YouTube. Check the network and try again.')),
    );
    document.head.append(script);
  });

  apiPromise.catch(() => {
    apiPromise = null;
  });

  return apiPromise;
}

/** Title, channel and cover for a video id, via YouTube's public oEmbed. */
async function describe(id: string): Promise<Omit<Track, 'duration'>> {
  const endpoint =
    'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + id);

  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('YouTube did not recognise that link.');

  const data = (await response.json()) as { title?: string; author_name?: string };
  return {
    id,
    title: data.title ?? 'Unknown track',
    artist: data.author_name ?? 'YouTube',
    thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

function loadLibrary(): Track[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Track[];
    return Array.isArray(parsed) ? parsed.filter((track) => youtubeId(track.id)) : [];
  } catch {
    return [];
  }
}

function saveLibrary(tracks: Track[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(tracks));
  } catch {
    // Private browsing. The session still plays, it just will not be remembered.
  }
}

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
};

/* -------------------------------------------------------------------------- */
/* The app                                                                     */
/* -------------------------------------------------------------------------- */

export function createMusic(): HTMLElement {
  const root = el('div', 'music');

  let library = loadLibrary();
  let index = -1;
  let playing = false;
  let shuffle = false;
  let volume = 70;
  let player: YTPlayer | null = null;
  let playerReady = false;
  let pendingPlay: string | null = null;

  /* --- Sidebar ---------------------------------------------------------- */

  const body = el('div', 'music__body');
  const sidebar = el('aside', 'music__sidebar');

  const brand = el('div', 'music__brand');
  const brandMark = el('span', 'music__brand-mark');
  brandMark.innerHTML = ICON.note;
  brand.append(brandMark, el('span', undefined, 'Music'));
  sidebar.append(brand);

  sidebar.append(el('div', 'music__section', 'Library'));
  const nav = el('nav', 'music__nav');
  for (const [label, note] of [
    ['Recently Added', 'all'],
    ['Songs', 'all'],
  ] as Array<[string, string]>) {
    const item = el('button', 'music__nav-item', label);
    item.type = 'button';
    item.dataset.view = note;
    if (label === 'Songs') item.classList.add('is-active');
    nav.append(item);
  }
  sidebar.append(nav);
  body.append(sidebar);

  /* --- Main ------------------------------------------------------------- */

  const main = el('main', 'music__main');

  const hero = el('header', 'music__hero');

  // The cover slot doubles as the YouTube player: the art you would look at,
  // and the frame their terms require to stay visible.
  const stage = el('div', 'music__stage');
  const stageArt = el('div', 'music__stage-art');
  const stageMount = el('div', 'music__stage-player');
  stage.append(stageArt, stageMount);
  hero.append(stage);

  const heroMeta = el('div', 'music__hero-meta');
  heroMeta.append(el('span', 'music__hero-kind', 'Playing from YouTube'));
  const heroTitle = el('h2', 'music__hero-title', 'Your library is empty');
  const heroArtist = el('p', 'music__hero-artist', 'Paste a YouTube link below to add a song.');
  heroMeta.append(heroTitle, heroArtist);

  const heroButtons = el('div', 'music__hero-actions');
  const playAll = el('button', 'music__pill', 'Play');
  playAll.type = 'button';
  const shuffleAll = el('button', 'music__pill music__pill--ghost', 'Shuffle');
  shuffleAll.type = 'button';
  heroButtons.append(playAll, shuffleAll);
  heroMeta.append(heroButtons);
  hero.append(heroMeta);
  main.append(hero);

  /* --- Add a track ------------------------------------------------------ */

  const adder = el('form', 'music__add');
  const addInput = el('input', 'music__add-input');
  addInput.type = 'text';
  addInput.placeholder = 'Paste a YouTube link';
  addInput.spellcheck = false;
  const addButton = el('button', 'music__add-go');
  addButton.type = 'submit';
  addButton.innerHTML = ICON.plus;
  addButton.title = 'Add to library';
  adder.append(addInput, addButton);
  main.append(adder);

  const addStatus = el('p', 'music__add-status', '');
  main.append(addStatus);

  const table = el('div', 'music__tracks');
  main.append(table);
  body.append(main);
  root.append(body);

  /* --- Now playing ------------------------------------------------------ */

  const bar = el('footer', 'music__bar');

  const barNow = el('div', 'music__bar-now');
  const barArt = el('div', 'music__bar-art');
  barNow.append(barArt);
  const barMeta = el('div', 'music__bar-meta');
  const barTitle = el('span', 'music__bar-title', 'Not playing');
  const barArtist = el('span', 'music__bar-artist', '—');
  barMeta.append(barTitle, barArtist);
  barNow.append(barMeta);
  bar.append(barNow);

  const barMid = el('div', 'music__bar-mid');
  const transport = el('div', 'music__transport');

  const control = (glyph: string, label: string, onClick: () => void, cls = '') => {
    const node = el('button', ('music__btn ' + cls).trim());
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.innerHTML = glyph;
    node.addEventListener('click', onClick);
    return node;
  };

  const playButton = control(ICON.play, 'Play', () => toggle(), 'music__btn--play');
  transport.append(
    control(ICON.prev, 'Previous', () => step(-1)),
    playButton,
    control(ICON.next, 'Next', () => step(1)),
  );
  barMid.append(transport);

  const scrub = el('div', 'music__scrub');
  const elapsedLabel = el('span', 'music__scrub-time', '0:00');
  const scrubTrack = el('div', 'music__scrub-track');
  const scrubFill = el('div', 'music__scrub-fill');
  scrubTrack.append(scrubFill);
  const remainingLabel = el('span', 'music__scrub-time', '0:00');
  scrub.append(elapsedLabel, scrubTrack, remainingLabel);
  barMid.append(scrub);
  bar.append(barMid);

  scrubTrack.addEventListener('click', (event) => {
    if (!player || index < 0) return;
    const box = scrubTrack.getBoundingClientRect();
    if (!box.width) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    player.seekTo(ratio * (library[index].duration || player.getDuration() || 0), true);
  });

  const barEnd = el('div', 'music__bar-end');
  const shuffleButton = control(ICON.shuffle, 'Shuffle', () => setShuffle(!shuffle));
  barEnd.append(shuffleButton);

  const volumeInput = el('input', 'music__volume');
  volumeInput.type = 'range';
  volumeInput.min = '0';
  volumeInput.max = '100';
  volumeInput.value = String(volume);
  volumeInput.setAttribute('aria-label', 'Volume');
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value);
    player?.setVolume(volume);
  });
  barEnd.append(volumeInput);
  bar.append(barEnd);
  root.append(bar);

  /* --- Player ----------------------------------------------------------- */

  async function ensurePlayer() {
    if (player) return;

    await loadYouTubeApi();
    if (!root.isConnected || player) return;

    const host = el('div', 'music__player-host');
    stageMount.replaceChildren(host);

    player = new window.YT!.Player(host, {
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: () => {
          playerReady = true;
          player?.setVolume(volume);
          if (pendingPlay) {
            player?.loadVideoById(pendingPlay);
            pendingPlay = null;
          }
        },
        onStateChange: (event: { data: number }) => {
          const states = window.YT!.PlayerState;
          if (event.data === states.ENDED) step(1);
          else if (event.data === states.PLAYING) setPlaying(true);
          else if (event.data === states.PAUSED) setPlaying(false);
        },
      },
    });
  }

  function setPlaying(value: boolean) {
    playing = value;
    playButton.innerHTML = value ? ICON.pause : ICON.play;
    playButton.title = value ? 'Pause' : 'Play';
    root.classList.toggle('is-playing', value);
    stage.classList.toggle('is-playing', value);
    if (value) telemetry.process(0.35);
    // The audio is inside a cross-origin frame, so its real level is not
    // readable. The speakers in the room get a steady nudge instead of a lie
    // dressed up as a spectrum.
    telemetry.setAudioLevel(value ? 0.45 : 0);
    syncRows();
  }

  async function select(next: number) {
    if (!library.length) return;
    index = (next + library.length) % library.length;
    const track = library[index];

    heroTitle.textContent = track.title;
    heroArtist.textContent = track.artist;
    barTitle.textContent = track.title;
    barArtist.textContent = track.artist;
    stageArt.style.backgroundImage = `url("${track.thumb}")`;
    barArt.style.backgroundImage = `url("${track.thumb}")`;
    syncRows();

    await ensurePlayer();
    if (!player) return;

    if (playerReady) player.loadVideoById(track.id);
    else pendingPlay = track.id;
  }

  function toggle() {
    if (!library.length) return;
    if (index < 0) {
      void select(0);
      return;
    }
    if (!player) {
      void select(index);
      return;
    }
    if (playing) player.pauseVideo();
    else player.playVideo();
  }

  function step(delta: number) {
    if (!library.length) return;
    if (shuffle && library.length > 1) {
      let next = index;
      while (next === index) next = Math.floor(Math.random() * library.length);
      void select(next);
      return;
    }
    void select(index + delta);
  }

  function setShuffle(value: boolean) {
    shuffle = value;
    shuffleButton.classList.toggle('is-on', value);
  }

  /* --- Library rendering ------------------------------------------------ */

  const rows = new Map<number, HTMLElement>();

  function syncRows() {
    rows.forEach((row, position) => {
      row.classList.toggle('is-active', position === index);
      row.classList.toggle('is-playing', position === index && playing);
    });
  }

  function renderLibrary() {
    table.replaceChildren();
    rows.clear();

    if (!library.length) {
      const empty = el('div', 'music__empty');
      empty.append(el('h3', 'music__empty-title', 'Nothing here yet'));
      empty.append(
        el(
          'p',
          'music__empty-note',
          'Paste a YouTube link above and it joins the library — title, artist and ' +
            'artwork come from YouTube, and the list is kept on this device.',
        ),
      );
      table.append(empty);
      heroTitle.textContent = 'Your library is empty';
      heroArtist.textContent = 'Paste a YouTube link below to add a song.';
      return;
    }

    const head = el('div', 'music__track music__track--head');
    head.append(el('span', 'music__track-index', '#'));
    head.append(el('span', 'music__track-title', 'Title'));
    head.append(el('span', 'music__track-artist', 'Artist'));
    head.append(el('span', 'music__track-time', ''));
    table.append(head);

    library.forEach((track, position) => {
      const row = el('div', 'music__track');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');

      row.append(el('span', 'music__track-index', String(position + 1)));

      const title = el('span', 'music__track-title');
      const art = el('span', 'music__track-art');
      art.style.backgroundImage = `url("${track.thumb}")`;
      title.append(art, el('span', 'music__track-name', track.title));
      row.append(title);

      row.append(el('span', 'music__track-artist', track.artist));

      const remove = el('button', 'music__track-remove', '✕');
      remove.type = 'button';
      remove.title = 'Remove from library';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        library = library.filter((_, i) => i !== position);
        saveLibrary(library);
        if (position === index) {
          index = -1;
          barTitle.textContent = 'Not playing';
          barArtist.textContent = '—';
        } else if (position < index) {
          index -= 1;
        }
        renderLibrary();
      });
      row.append(remove);

      const open = () => {
        if (position === index) toggle();
        else void select(position);
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });

      rows.set(position, row);
      table.append(row);
    });

    syncRows();
  }

  /* --- Adding ----------------------------------------------------------- */

  adder.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = youtubeId(addInput.value);

    if (!id) {
      addStatus.textContent = 'That is not a YouTube link.';
      addStatus.classList.add('is-error');
      return;
    }

    if (library.some((track) => track.id === id)) {
      addStatus.textContent = 'Already in the library.';
      addStatus.classList.remove('is-error');
      return;
    }

    addStatus.textContent = 'Looking it up…';
    addStatus.classList.remove('is-error');

    try {
      const described = await describe(id);
      library = [...library, { ...described, duration: 0 }];
      saveLibrary(library);
      addInput.value = '';
      addStatus.textContent = '';
      renderLibrary();
    } catch (error) {
      // A blocked or offline network surfaces as a bare "Failed to fetch",
      // which tells nobody anything. Say what actually went wrong.
      const reason =
        error instanceof TypeError
          ? 'Could not reach YouTube — check the network.'
          : error instanceof Error
            ? error.message
            : 'Could not add that link.';
      addStatus.textContent = reason;
      addStatus.classList.add('is-error');
    }
  });

  addInput.addEventListener('keydown', (event) => event.stopPropagation());

  playAll.addEventListener('click', () => {
    setShuffle(false);
    void select(0);
  });

  shuffleAll.addEventListener('click', () => {
    setShuffle(true);
    step(1);
  });

  /* --- Progress --------------------------------------------------------- */

  /*
   * Polled at 4Hz, not per frame. This window is projected onto the monitor
   * through a CSS3D transform, where every changed pixel re-rasters the whole
   * surface — a per-frame scrubber would cost more than the video does.
   */
  let poll = 0;
  const stop = ticker((delta) => {
    poll += delta;
    if (poll < 0.25) return true;
    poll = 0;

    if (!player || !playerReady || index < 0) return true;

    const at = player.getCurrentTime() || 0;
    const total = player.getDuration() || 0;
    if (total && library[index].duration !== total) library[index].duration = total;

    elapsedLabel.textContent = clock(at);
    remainingLabel.textContent = total ? clock(total) : '0:00';
    scrubFill.style.transform = 'scaleX(' + (total ? (at / total).toFixed(4) : '0') + ')';
    return true;
  });

  root.addEventListener('app:destroy', () => {
    stop();
    telemetry.setAudioLevel(0);
    player?.destroy();
    player = null;
  });

  renderLibrary();
  setShuffle(false);

  return root;
}

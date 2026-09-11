import { telemetry } from '../../world/telemetry';
import { ticker } from '../anim';
import { el, svg } from '../ui';

/**
 * Player — a music app with nothing to download.
 *
 * Every track is generated on the fly from a chord progression and a step
 * sequencer running on Web Audio: an oscillator bank for the pads, a detuned
 * saw for the lead, and filtered noise for the drums. That means five minutes
 * of music in a couple of kilobytes of source, and it never loops audibly
 * because the arpeggios are re-rolled each bar.
 *
 * The output is tapped by an AnalyserNode, which drives both the visualiser in
 * this window and — through the telemetry bus — the speaker cones out on the
 * desk in the 3D room.
 */

const ICON = {
  play: svg('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/>'),
  next: svg('<path d="M7 5.5v13l9-6.5z" fill="currentColor" stroke="none"/><rect x="16.5" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none"/>'),
  prev: svg('<path d="M17 5.5v13L8 12z" fill="currentColor" stroke="none"/><rect x="5.1" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none"/>'),
};

/** Semitone offsets from the root, per chord, as a repeating progression. */
interface Track {
  title: string;
  album: string;
  mood: string;
  /** Nominal run time in seconds. The synth is endless; this is what the
   *  scrubber measures against, and where the track rolls over to the next. */
  length: number;
  /** Base hue for the procedural cover art. */
  hue: number;
  bpm: number;
  root: number;
  /** Chord roots in semitones, one per bar. */
  progression: number[];
  /** Scale degrees the lead is allowed to pick from. */
  scale: number[];
  /** 16-step kick and hat patterns. */
  kick: number[];
  hat: number[];
}

const TRACKS: Track[] = [
  {
    title: 'Compile Loop',
    album: 'Build Artifacts',
    mood: 'Focus',
    length: 214,
    hue: 198,
    bpm: 92,
    root: 55,
    progression: [0, -3, 5, 2],
    scale: [0, 2, 3, 5, 7, 10, 12],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
  },
  {
    title: 'Night Build',
    album: 'Build Artifacts',
    mood: 'Ambient',
    length: 268,
    hue: 262,
    bpm: 76,
    root: 50,
    progression: [0, 7, 3, 5],
    scale: [0, 3, 5, 7, 10, 12, 15],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
  {
    title: 'Cache Warm',
    album: 'Build Artifacts',
    mood: 'Drive',
    length: 186,
    hue: 22,
    bpm: 108,
    root: 57,
    progression: [0, 0, -2, 3],
    scale: [0, 2, 4, 7, 9, 12, 14],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    title: 'Fan Curve',
    album: 'Thermal Throttle',
    mood: 'Late',
    length: 232,
    hue: 8,
    bpm: 84,
    root: 53,
    progression: [0, 5, -4, -2],
    scale: [0, 2, 3, 7, 8, 10, 12],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
  {
    title: 'Thermal Throttle',
    album: 'Thermal Throttle',
    mood: 'Tense',
    length: 198,
    hue: 340,
    bpm: 128,
    root: 45,
    progression: [0, 0, 3, -2],
    scale: [0, 1, 5, 6, 8, 12, 13],
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    hat: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1],
  },
  {
    title: 'Idle Clock',
    album: 'Thermal Throttle',
    mood: 'Sparse',
    length: 305,
    hue: 168,
    bpm: 64,
    root: 48,
    progression: [0, 4, 7, 4],
    scale: [0, 2, 4, 7, 9, 11, 12],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  {
    title: 'Packet Loss',
    album: 'Uplink',
    mood: 'Glitch',
    length: 176,
    hue: 288,
    bpm: 140,
    root: 52,
    progression: [0, -5, 2, -3],
    scale: [0, 3, 5, 6, 10, 12, 15],
    kick: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
    hat: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1],
  },
  {
    title: 'Uplink',
    album: 'Uplink',
    mood: 'Wide',
    length: 249,
    hue: 212,
    bpm: 96,
    root: 50,
    progression: [0, 5, 9, 7],
    scale: [0, 2, 4, 5, 7, 9, 11],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  {
    title: 'Cold Boot',
    album: 'Uplink',
    mood: 'Slow',
    length: 288,
    hue: 236,
    bpm: 70,
    root: 43,
    progression: [0, 3, -2, 5],
    scale: [0, 3, 7, 10, 12, 14, 17],
    kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  },
];

/** The library's shelves. "All tracks" is synthesised, the rest are albums. */
const PLAYLISTS: Array<{ name: string; note: string; tracks: number[] }> = [
  { name: 'All tracks', note: 'Everything the synth knows', tracks: TRACKS.map((_, i) => i) },
  ...[...new Set(TRACKS.map((track) => track.album))].map((album) => ({
    name: album,
    note: 'Album',
    tracks: TRACKS.map((track, i) => (track.album === album ? i : -1)).filter((i) => i >= 0),
  })),
];

/*
 * Streaming.
 *
 * Karan Aujla's catalogue is his and his label's — none of it can ship in this
 * bundle. Spotify's embed player is the licensed way to play it: it streams
 * from Spotify, pays out normally, and gives full tracks to a listener who is
 * signed in (a 30-second preview otherwise).
 *
 * The default below points at his artist page. If Spotify ever moves it, the
 * field under the player takes any Spotify link — track, album, artist or
 * playlist — and remembers it.
 */
const SPOTIFY_DEFAULT = 'https://open.spotify.com/artist/4xJ7gBDSGgJFraRZ0eQeDU';
const SPOTIFY_KEY = 'shrey-pc:music:spotify';

/** Turns any Spotify link or URI into its embed form. */
export function toSpotifyEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // spotify:track:ID
  const uri = value.match(/^spotify:(track|album|artist|playlist|episode|show):([A-Za-z0-9]+)$/);
  if (uri) return `https://open.spotify.com/embed/${uri[1]}/${uri[2]}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;

  // /embed/... is already what we want; anything else gets /embed prefixed.
  const path = url.pathname.replace(/^\/embed/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`;
}

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
};

/** MIDI note → Hz. */
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/* -------------------------------------------------------------------------- */
/* The engine                                                                  */
/* -------------------------------------------------------------------------- */

class Engine {
  readonly analyser: AnalyserNode;

  private readonly master: GainNode;
  private readonly bus: GainNode;
  private noise: AudioBuffer;
  private step = 0;
  private nextNoteTime = 0;
  private scheduler = 0;

  constructor(
    private context: AudioContext,
    private track: Track,
  ) {
    this.master = context.createGain();
    this.master.gain.value = 0.0001;

    // A gentle low-pass keeps the saw lead from being harsh through laptop
    // speakers, and a shelf lifts the pads back out of the mud.
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200;
    filter.Q.value = 0.6;

    this.bus = context.createGain();
    this.bus.gain.value = 1;

    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.72;

    this.bus.connect(filter).connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(context.destination);

    const length = Math.floor(context.sampleRate * 0.5);
    this.noise = context.createBuffer(1, length, context.sampleRate);
    const channel = this.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;
  }

  setTrack(track: Track) {
    this.track = track;
    this.step = 0;
  }

  setVolume(value: number) {
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(Math.max(value, 0.0001), now, 0.08);
  }

  start() {
    this.nextNoteTime = this.context.currentTime + 0.06;
    // Look ahead 100ms on a 25ms timer: the standard Web Audio scheduling
    // trick, so timing comes from the audio clock rather than setInterval.
    this.scheduler = window.setInterval(() => this.pump(), 25);
  }

  stop() {
    window.clearInterval(this.scheduler);
    this.scheduler = 0;
  }

  private pump() {
    const lookahead = this.context.currentTime + 0.1;
    // Sixteenth notes.
    const stepDuration = 60 / this.track.bpm / 4;

    while (this.nextNoteTime < lookahead) {
      this.schedule(this.step, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.step = (this.step + 1) % 64;
    }
  }

  private schedule(step: number, time: number, duration: number) {
    const track = this.track;
    const bar = Math.floor(step / 16) % track.progression.length;
    const chordRoot = track.root + track.progression[bar];
    const beat = step % 16;

    // Pad: a held triad, retriggered at the top of each bar.
    if (beat === 0) {
      for (const interval of [0, 7, 12, 16]) {
        this.voice(hz(chordRoot + interval - 12), time, duration * 16, 0.045, 'triangle', 0.9);
      }
    }

    // Bass on the kick pattern.
    if (track.kick[beat]) {
      this.voice(hz(chordRoot - 24), time, duration * 2.2, 0.16, 'sine', 0.02);
      this.drum(time, 0.34, 120, 'lowpass', 0.16);
    }

    if (track.hat[beat]) this.drum(time, 0.045, 8200, 'highpass', 0.035);

    // Lead: a sparse arpeggio, re-rolled so two bars never match.
    if (beat % 2 === 0 && Math.random() > 0.42) {
      const degree = track.scale[Math.floor(Math.random() * track.scale.length)];
      this.voice(hz(chordRoot + degree + 12), time, duration * 1.6, 0.05, 'sawtooth', 0.01);
    }
  }

  private voice(
    frequency: number,
    time: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    attack: number,
  ) {
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;

    // A second, slightly detuned oscillator is what makes this sound like an
    // instrument rather than a test tone.
    const detuned = this.context.createOscillator();
    detuned.type = type;
    detuned.frequency.value = frequency;
    detuned.detune.value = 7;

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(gain, time + attack + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(envelope);
    detuned.connect(envelope);
    envelope.connect(this.bus);

    osc.start(time);
    detuned.start(time);
    osc.stop(time + duration + 0.02);
    detuned.stop(time + duration + 0.02);
  }

  private drum(time: number, duration: number, frequency: number, type: BiquadFilterType, gain: number) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;

    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    source.connect(filter).connect(envelope).connect(this.bus);
    source.start(time, Math.random() * 0.2, duration);
    source.stop(time + duration);
  }

  destroy() {
    this.stop();
    void this.context.close();
  }
}

/* -------------------------------------------------------------------------- */
/* The app                                                                     */
/* -------------------------------------------------------------------------- */

export function createMusic(): HTMLElement {
  const root = el('div', 'player');

  let engine: Engine | null = null;
  let index = 0;
  let playing = false;
  let volume = 0.6;

  let shelf = 0;

  /*
   * Play position is read off the wall clock rather than accumulated from the
   * ticker's delta, because that delta is deliberately clamped to 1/20s so a
   * backgrounded tab cannot fling the springs. On a slow frame budget that
   * clamp makes an accumulated clock run behind real time.
   *
   * `offset` is the position at the last transport change; `startedAt` is when
   * playback resumed from it.
   */
  let offset = 0;
  let startedAt = 0;

  const position = () => (playing ? offset + (performance.now() - startedAt) / 1000 : offset);

  function seek(seconds: number) {
    offset = Math.max(0, seconds);
    startedAt = performance.now();
    syncBar();
  }

  /** Procedural cover art — two hues and a soft highlight, no image files. */
  const paintCover = (node: HTMLElement, hue: number) => {
    node.style.background =
      `radial-gradient(circle at 30% 24%, hsl(${hue} 92% 68% / 0.95), transparent 58%),` +
      `linear-gradient(145deg, hsl(${hue} 68% 42%), hsl(${(hue + 48) % 360} 62% 22%))`;
  };

  const makeButton = (glyph: string, label: string, onClick: () => void, className = '') => {
    const node = el('button', ('player__btn ' + className).trim());
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.innerHTML = glyph;
    node.addEventListener('click', onClick);
    return node;
  };

  /* --- Sidebar ---------------------------------------------------------- */

  const body = el('div', 'player__body');

  const sidebar = el('aside', 'player__sidebar');
  sidebar.append(el('div', 'player__brand', 'Library'));

  const nav = el('nav', 'player__nav');
  const navButtons: HTMLElement[] = [];

  PLAYLISTS.forEach((playlist, position) => {
    const item = el('button', 'player__nav-item');
    item.type = 'button';

    const swatch = el('span', 'player__nav-art');
    paintCover(swatch, TRACKS[playlist.tracks[0]].hue);
    item.append(swatch);

    const meta = el('span', 'player__nav-meta');
    meta.append(el('span', 'player__nav-name', playlist.name));
    meta.append(el('span', 'player__nav-note', playlist.tracks.length + ' tracks'));
    item.append(meta);

    item.addEventListener('click', () => {
      shelf = position;
      renderShelf();
    });

    navButtons.push(item);
    nav.append(item);
  });

  sidebar.append(nav);
  sidebar.append(el('div', 'player__brand', 'Streaming'));

  const streamItem = el('button', 'player__nav-item');
  streamItem.type = 'button';
  const streamArt = el('span', 'player__nav-art');
  streamArt.style.background = 'linear-gradient(145deg, #1db954, #0b6b31)';
  streamItem.append(streamArt);
  const streamMeta = el('span', 'player__nav-meta');
  streamMeta.append(el('span', 'player__nav-name', 'Karan Aujla'));
  streamMeta.append(el('span', 'player__nav-note', 'Spotify'));
  streamItem.append(streamMeta);
  streamItem.addEventListener('click', () => renderSpotify());
  nav.append(streamItem);

  body.append(sidebar);

  /* --- Main pane -------------------------------------------------------- */

  const main = el('main', 'player__main');

  const hero = el('header', 'player__hero');
  const heroArt = el('div', 'player__hero-art');
  hero.append(heroArt);

  const heroMeta = el('div', 'player__hero-meta');
  heroMeta.append(el('span', 'player__hero-kind', 'Playlist'));
  const heroName = el('h2', 'player__hero-name', '');
  const heroNote = el('p', 'player__hero-note', '');
  heroMeta.append(heroName, heroNote);
  hero.append(heroMeta);
  main.append(hero);

  const table = el('div', 'player__tracks');
  main.append(table);
  body.append(main);
  root.append(body);

  /* --- Now-playing bar -------------------------------------------------- */

  const bar = el('footer', 'player__bar');

  const barNow = el('div', 'player__bar-now');
  const barArt = el('div', 'player__bar-art');
  barNow.append(barArt);
  const barMeta = el('div', 'player__bar-meta');
  const trackTitle = el('span', 'player__bar-title', TRACKS[0].title);
  const trackMood = el('span', 'player__bar-album', TRACKS[0].album);
  barMeta.append(trackTitle, trackMood);
  barNow.append(barMeta);
  bar.append(barNow);

  const barMid = el('div', 'player__bar-mid');
  const transport = el('div', 'player__transport');
  const playButton = makeButton(ICON.play, 'Play', () => toggle(), 'player__btn--play');
  transport.append(
    makeButton(ICON.prev, 'Previous', () => step(-1)),
    playButton,
    makeButton(ICON.next, 'Next', () => step(1)),
  );
  barMid.append(transport);

  const scrub = el('div', 'player__scrub');
  const scrubStart = el('span', 'player__scrub-time', '0:00');
  const scrubTrack = el('div', 'player__scrub-track');
  const scrubFill = el('div', 'player__scrub-fill');
  scrubTrack.append(scrubFill);
  const scrubEnd = el('span', 'player__scrub-time', '0:00');
  scrub.append(scrubStart, scrubTrack, scrubEnd);
  barMid.append(scrub);
  bar.append(barMid);

  // Seeking only moves the scrubber: the synth generates rather than plays
  // back, so there is no buffer to jump around inside.
  scrubTrack.addEventListener('click', (event) => {
    const box = scrubTrack.getBoundingClientRect();
    if (!box.width) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    seek(ratio * TRACKS[index].length);
  });

  const barEnd = el('div', 'player__bar-end');
  const canvas = el('canvas', 'player__viz');
  barEnd.append(canvas);

  const volumeInput = el('input', 'player__slider');
  volumeInput.type = 'range';
  volumeInput.min = '0';
  volumeInput.max = '100';
  volumeInput.value = String(volume * 100);
  volumeInput.setAttribute('aria-label', 'Volume');
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value) / 100;
    engine?.setVolume(playing ? volume * 0.5 : 0);
  });
  barEnd.append(volumeInput);
  bar.append(barEnd);
  root.append(bar);

  /* --- Shelf rendering -------------------------------------------------- */

  const rows = new Map<number, HTMLElement>();

  /** The Spotify pane. Pauses the synth first — two things playing at once is
   *  nobody's idea of a music app. */
  function renderSpotify() {
    if (playing) toggle();

    navButtons.forEach((item) => item.classList.remove('is-active'));
    streamItem.classList.add('is-active');

    let stored = SPOTIFY_DEFAULT;
    try {
      stored = localStorage.getItem(SPOTIFY_KEY) || SPOTIFY_DEFAULT;
    } catch {
      // Private browsing: the default still plays, it just will not persist.
    }

    const pane = el('div', 'player__stream');

    const head = el('div', 'player__stream-head');
    head.append(el('h2', 'player__stream-title', 'Karan Aujla'));
    head.append(
      el(
        'p',
        'player__stream-note',
        'Streamed from Spotify — full tracks when you are signed in, 30-second previews otherwise. ' +
          'Nothing is hosted here.',
      ),
    );
    pane.append(head);

    const frame = el('iframe', 'player__stream-frame');
    frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    frame.loading = 'lazy';
    frame.title = 'Spotify player';
    pane.append(frame);

    const row = el('form', 'player__stream-form');
    const input = el('input', 'player__stream-input');
    input.type = 'text';
    input.spellcheck = false;
    input.value = stored;
    input.placeholder = 'Any Spotify link — track, album, artist or playlist';

    const save = el('button', 'player__stream-save', 'Load');
    save.type = 'submit';
    row.append(input, save);

    const status = el('p', 'player__stream-status', '');
    pane.append(row, status);

    const load = (value: string) => {
      const embed = toSpotifyEmbed(value);
      if (!embed) {
        status.textContent = 'That is not a Spotify link.';
        status.classList.add('is-error');
        return;
      }
      frame.src = embed;
      status.textContent = '';
      status.classList.remove('is-error');
      try {
        localStorage.setItem(SPOTIFY_KEY, value);
      } catch {
        // Not worth surfacing; the player is already loading.
      }
    };

    row.addEventListener('submit', (event) => {
      event.preventDefault();
      load(input.value);
    });

    input.addEventListener('keydown', (event) => event.stopPropagation());

    load(stored);
    main.replaceChildren(pane);
  }

  function renderShelf() {
    const playlist = PLAYLISTS[shelf];

    main.replaceChildren(hero, table);
    streamItem.classList.remove('is-active');
    navButtons.forEach((item, position) => item.classList.toggle('is-active', position === shelf));

    paintCover(heroArt, TRACKS[playlist.tracks[0]].hue);
    heroName.textContent = playlist.name;
    heroNote.textContent =
      playlist.note +
      ' · ' +
      playlist.tracks.length +
      ' tracks · ' +
      clock(playlist.tracks.reduce((total, i) => total + TRACKS[i].length, 0));

    table.replaceChildren();
    rows.clear();

    const head = el('div', 'player__track player__track--head');
    head.append(el('span', 'player__track-index', '#'));
    head.append(el('span', 'player__track-title', 'Title'));
    head.append(el('span', 'player__track-album', 'Album'));
    head.append(el('span', 'player__track-bpm', 'BPM'));
    head.append(el('span', 'player__track-time', 'Time'));
    table.append(head);

    playlist.tracks.forEach((trackIndex, position) => {
      const track = TRACKS[trackIndex];
      const row = el('div', 'player__track');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');

      const number = el('span', 'player__track-index', String(position + 1));
      row.append(number);

      const title = el('span', 'player__track-title');
      const art = el('span', 'player__track-art');
      paintCover(art, track.hue);
      title.append(art);
      const names = el('span', 'player__track-names');
      names.append(el('span', 'player__track-name', track.title));
      names.append(el('span', 'player__track-mood', track.mood));
      title.append(names);
      row.append(title);

      row.append(el('span', 'player__track-album', track.album));
      row.append(el('span', 'player__track-bpm', String(track.bpm)));
      row.append(el('span', 'player__track-time', clock(track.length)));

      const open = () => {
        if (trackIndex === index) toggle();
        else {
          select(trackIndex);
          if (!playing) toggle();
        }
      };

      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });

      rows.set(trackIndex, row);
      table.append(row);
    });

    syncRows();
  }

  /* --- Behaviour -------------------------------------------------------- */

  function syncRows() {
    rows.forEach((row, trackIndex) => {
      row.classList.toggle('is-active', trackIndex === index);
      row.classList.toggle('is-playing', trackIndex === index && playing);
    });
    trackTitle.textContent = TRACKS[index].title;
    trackMood.textContent = TRACKS[index].album;
    paintCover(barArt, TRACKS[index].hue);
    playButton.innerHTML = playing ? ICON.pause : ICON.play;
    playButton.title = playing ? 'Pause' : 'Play';
    root.classList.toggle('is-playing', playing);
    syncBar();
  }

  function syncBar() {
    const length = TRACKS[index].length;
    const at = Math.min(position(), length);
    scrubStart.textContent = clock(at);
    scrubEnd.textContent = clock(length);
    scrubFill.style.transform = 'scaleX(' + (at / length).toFixed(4) + ')';
  }

  function select(next: number) {
    index = (next + TRACKS.length) % TRACKS.length;
    offset = 0;
    startedAt = performance.now();
    engine?.setTrack(TRACKS[index]);
    syncRows();
  }

  /** Moves within the shelf on screen, falling back to the whole library. */
  function step(delta: number) {
    const list = PLAYLISTS[shelf].tracks;
    const at = list.indexOf(index);
    if (at < 0) {
      select(index + delta);
      return;
    }
    select(list[(at + delta + list.length) % list.length]);
  }

  function toggle() {
    if (!engine) {
      // Created on the first click, which is the gesture the browser needs
      // before an AudioContext is allowed to make any sound at all.
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      engine = new Engine(new Ctor(), TRACKS[index]);
      engine.start();
    }

    // Freeze the position before the flip, then restart the clock from it.
    offset = position();
    startedAt = performance.now();

    playing = !playing;
    engine.setVolume(playing ? volume * 0.5 : 0);
    if (playing) telemetry.process(0.35);
    syncRows();
  }

  /* --- The visualiser loop ---------------------------------------------- */

  /*
   * This canvas lives inside the CSS3D layer, which means every pixel it
   * changes forces the whole 1280x960 projected surface to re-raster and
   * re-composite through a 3D transform. That makes it by far the most
   * expensive thing in the OS to draw, so three rules apply:
   *
   *   - draw at a capped 30Hz rather than per frame,
   *   - put every bar into ONE path and fill it ONCE behind a gradient,
   *     instead of issuing a fill per bar,
   *   - smooth with a plain damped lerp over a Float32Array rather than one
   *     Spring object per bar.
   *
   * The result is a couple of canvas operations per draw instead of a hundred.
   */
  const BARS = 40;
  const DRAW_INTERVAL = 1 / 30;

  const levels = new Float32Array(BARS);
  let frequency: Uint8Array<ArrayBuffer> | null = null;
  let drawClock = 0;
  let gradient: CanvasGradient | null = null;
  let gradientWidth = 0;

  /** Older engines lack roundRect; a plain rect is a fine fallback. */
  const addBar = (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) => {
    if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, radius);
    else context.rect(x, y, width, height);
  };

  const stop = ticker((delta, now) => {
    if (playing && position() >= TRACKS[index].length) step(1);

    drawClock += delta;
    if (drawClock < DRAW_INTERVAL) return true;
    const frameStep = drawClock;
    drawClock = 0;

    if (playing) syncBar();

    const context = canvas.getContext('2d');
    if (!context) return true;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round((canvas.clientWidth || 420) * ratio);
    const height = Math.round((canvas.clientHeight || 160) * ratio);
    if (width < 4 || height < 4) return true;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gradient = null;
    }

    if (engine && playing) {
      if (!frequency || frequency.length !== engine.analyser.frequencyBinCount) {
        frequency = new Uint8Array(new ArrayBuffer(engine.analyser.frequencyBinCount));
      }
      engine.analyser.getByteFrequencyData(frequency);
    }

    // Rebuilt only when the canvas is resized, not per draw.
    if (!gradient || gradientWidth !== width) {
      gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#5fd0ff');
      gradient.addColorStop(0.5, '#8db4ff');
      gradient.addColorStop(1, '#b18cff');
      gradientWidth = width;
    }

    context.clearRect(0, 0, width, height);

    const smoothing = 1 - Math.exp(-14 * frameStep);
    const barWidth = width / BARS;
    const inset = barWidth * 0.24;
    const drawWidth = barWidth - inset;
    const radius = Math.min(drawWidth / 2, ratio * 3);
    let sum = 0;

    context.beginPath();

    for (let i = 0; i < BARS; i += 1) {
      let target: number;

      if (frequency && playing) {
        /*
         * A linear bin-per-bar mapping puts almost all the music's energy in
         * the first few bars and leaves the right half of the window dead,
         * because a spectrum's content is logarithmic and its bins are not.
         * So the bars are spaced geometrically across the useful range and
         * each averages the bins it covers — which is what makes the whole
         * width move rather than just the bass.
         */
        const top = Math.max(Math.floor(frequency.length * 0.72), 8);
        const from = Math.min(Math.round(2 * (top / 2) ** (i / (BARS - 1))), top);
        const to = Math.min(Math.round(2 * (top / 2) ** ((i + 1) / (BARS - 1))), top);

        let peak = 0;
        for (let bin = from; bin <= Math.max(to, from); bin += 1) {
          peak = Math.max(peak, frequency[bin] ?? 0);
        }
        // Lift the top end, which is always quieter than the bass.
        const tilt = 1 + (i / BARS) * 0.85;
        target = Math.min(((peak / 255) ** 1.25) * tilt, 1);
      } else {
        // Idle: a slow breathing wave, so the window is never dead.
        target = 0.07 + Math.sin(now * 1.6 + i * 0.3) * 0.035;
      }

      levels[i] += (target - levels[i]) * smoothing;
      const level = levels[i];
      sum += level;

      const barHeight = Math.max(level * height * 0.86, ratio * 2);
      addBar(context, i * barWidth + inset / 2, height - barHeight, drawWidth, barHeight, radius);
    }

    context.fillStyle = gradient;
    context.fill();


    // Hand the average level to the room, where it moves the speaker cones.
    telemetry.setAudioLevel(playing ? Math.min((sum / BARS) * 2.4, 1) : 0);
    return true;
  });

  renderShelf();

  root.addEventListener('app:destroy', () => {
    stop();
    telemetry.setAudioLevel(0);
    engine?.destroy();
    engine = null;
  });

  return root;
}

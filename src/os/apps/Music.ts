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
  mood: string;
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
    mood: 'Focus · 92 BPM',
    bpm: 92,
    root: 55,
    progression: [0, -3, 5, 2],
    scale: [0, 2, 3, 5, 7, 10, 12],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
  },
  {
    title: 'Night Build',
    mood: 'Ambient · 76 BPM',
    bpm: 76,
    root: 50,
    progression: [0, 7, 3, 5],
    scale: [0, 3, 5, 7, 10, 12, 15],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
  {
    title: 'Cache Warm',
    mood: 'Drive · 108 BPM',
    bpm: 108,
    root: 57,
    progression: [0, 0, -2, 3],
    scale: [0, 2, 4, 7, 9, 12, 14],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    title: 'Fan Curve',
    mood: 'Late · 84 BPM',
    bpm: 84,
    root: 53,
    progression: [0, 5, -4, -2],
    scale: [0, 2, 3, 7, 8, 10, 12],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
];

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

  /* --- Visualiser ------------------------------------------------------- */

  const stage = el('div', 'player__stage');
  const canvas = el('canvas', 'player__viz');
  stage.append(canvas);

  const nowPlaying = el('div', 'player__now');
  const trackTitle = el('h2', 'player__title', TRACKS[0].title);
  const trackMood = el('p', 'player__mood', TRACKS[0].mood);
  nowPlaying.append(trackTitle, trackMood);
  stage.append(nowPlaying);
  root.append(stage);

  /* --- Transport -------------------------------------------------------- */

  const transport = el('div', 'player__transport');

  const makeButton = (glyph: string, label: string, onClick: () => void, className = '') => {
    const node = el('button', ('player__btn ' + className).trim());
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.innerHTML = glyph;
    node.addEventListener('click', onClick);
    return node;
  };

  const playButton = makeButton(ICON.play, 'Play', () => toggle(), 'player__btn--play');
  transport.append(
    makeButton(ICON.prev, 'Previous', () => select(index - 1)),
    playButton,
    makeButton(ICON.next, 'Next', () => select(index + 1)),
  );

  const volumeWrap = el('label', 'player__volume');
  volumeWrap.append(el('span', 'player__volume-label', 'Vol'));
  const volumeInput = el('input', 'player__slider');
  volumeInput.type = 'range';
  volumeInput.min = '0';
  volumeInput.max = '100';
  volumeInput.value = String(volume * 100);
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value) / 100;
    engine?.setVolume(playing ? volume * 0.5 : 0);
  });
  volumeWrap.append(volumeInput);
  transport.append(volumeWrap);
  root.append(transport);

  /* --- Playlist --------------------------------------------------------- */

  const list = el('div', 'player__list');
  const rows: HTMLElement[] = [];

  TRACKS.forEach((track, position) => {
    const row = el('button', 'player__row');
    row.type = 'button';
    row.append(el('span', 'player__row-index', String(position + 1).padStart(2, '0')));

    const meta = el('span', 'player__row-meta');
    meta.append(el('span', 'player__row-title', track.title));
    meta.append(el('span', 'player__row-mood', track.mood));
    row.append(meta);

    row.append(el('span', 'player__row-bpm', track.bpm + ' BPM'));
    row.addEventListener('click', () => {
      select(position);
      if (!playing) toggle();
    });

    rows.push(row);
    list.append(row);
  });
  root.append(list);

  /* --- Behaviour -------------------------------------------------------- */

  function syncRows() {
    rows.forEach((row, position) => {
      row.classList.toggle('is-active', position === index);
      row.classList.toggle('is-playing', position === index && playing);
    });
    trackTitle.textContent = TRACKS[index].title;
    trackMood.textContent = TRACKS[index].mood;
    playButton.innerHTML = playing ? ICON.pause : ICON.play;
    root.classList.toggle('is-playing', playing);
  }

  function select(next: number) {
    index = (next + TRACKS.length) % TRACKS.length;
    engine?.setTrack(TRACKS[index]);
    syncRows();
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
    drawClock += delta;
    if (drawClock < DRAW_INTERVAL) return true;
    const step = drawClock;
    drawClock = 0;

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

    const smoothing = 1 - Math.exp(-14 * step);
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

  syncRows();

  root.addEventListener('app:destroy', () => {
    stop();
    telemetry.setAudioLevel(0);
    engine?.destroy();
    engine = null;
  });

  return root;
}

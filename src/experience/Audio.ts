const STORAGE_KEY = 'shrey-pc:muted';

/**
 * Every sound in the scene is synthesised at runtime — there are no audio files
 * to download. A CRT hum bed runs continuously once the machine is on, and the
 * one-shots (key clicks, the boot chime, the degauss thunk) are built from
 * short oscillator and noise bursts.
 *
 * Browsers refuse to start an AudioContext without a gesture, so the context is
 * created lazily on the first unlock() call, which the start button triggers.
 */
export class Audio {
  muted = false;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;
  /** How hard it is raining, 0..1; kept until the context can play it. */
  private rainLevel = 0;
  private rainGain: GainNode | null = null;

  private onChange: (muted: boolean) => void = () => {};

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Private browsing can throw on access; silence is a safe default state.
      this.muted = false;
    }
  }

  setOnChange(listener: (muted: boolean) => void) {
    this.onChange = listener;
    listener(this.muted);
  }

  /** Called from a real user gesture, so the context is allowed to start. */
  unlock() {
    if (this.context) {
      void this.context.resume();
      return;
    }

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.context = new Ctor();
    } catch {
      return;
    }

    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.context.destination);

    // One reusable buffer of white noise backs every percussive sound.
    const length = Math.floor(this.context.sampleRate * 1.2);
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;

    void this.context.resume();
    this.watchInterruptions();
  }

  /**
   * iOS parks the context whenever the page loses the audio session — a phone
   * call, the lock button, a swipe to another app — and leaves it in
   * `interrupted` (or `suspended`) afterwards. Nothing brings it back on its
   * own, so the hum simply never returns. Suspend deliberately on the way out,
   * which also stops a hidden tab burning battery on two oscillators, and
   * resume on the way back and on the next touch, which is the gesture iOS
   * insists on when a plain resume() is refused.
   */
  private watchInterruptions() {
    const ctx = this.context;
    if (!ctx) return;

    const revive = () => {
      if (document.visibilityState !== 'visible') return;
      if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void ctx.suspend().catch(() => {});
      else revive();
    });
    window.addEventListener('pageshow', revive);
    window.addEventListener('pointerdown', revive, { passive: true });
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Not being able to remember the preference is not worth failing over.
    }

    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.05);
    }

    this.onChange(muted);
  }

  private get ready() {
    return Boolean(this.context && this.master && this.context.state === 'running');
  }

  private noise(duration: number, gain: number, filterHz: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ready || !this.noiseBuffer) return;
    const ctx = this.context!;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 1;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterHz;
    filter.Q.value = 0.9;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter).connect(envelope).connect(this.master!);
    source.start(now, Math.random() * 0.5, duration);
    source.stop(now + duration);
  }

  private tone(
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType = 'sine',
    delay = 0,
  ) {
    if (!this.ready) return;
    const ctx = this.context!;
    const start = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(envelope).connect(this.master!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** The continuous bed: mains hum plus the faint whine of a live picture tube. */
  startHum() {
    if (!this.ready || this.started) return;
    this.started = true;

    const ctx = this.context!;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master!);

    // 50Hz mains and the 15.7kHz flyback whine, both well under the mix.
    const mains = ctx.createOscillator();
    mains.type = 'sawtooth';
    mains.frequency.value = 50;
    const mainsFilter = ctx.createBiquadFilter();
    mainsFilter.type = 'lowpass';
    mainsFilter.frequency.value = 140;
    const mainsGain = ctx.createGain();
    mainsGain.gain.value = 0.05;
    mains.connect(mainsFilter).connect(mainsGain).connect(this.humGain);
    mains.start();

    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 15720;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.006;
    whine.connect(whineGain).connect(this.humGain);
    whine.start();

    this.humGain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    // Weather may have arrived before the visitor's first touch let sound in.
    this.setRain(this.rainLevel);
  }

  /**
   * Rain on a roof: the shared noise buffer looped through a band that keeps
   * the hiss and the patter and drops the rest. Built once, then only ever
   * faded, so a passing shower never clicks in or out.
   */
  setRain(level: number) {
    this.rainLevel = level;
    if (!this.ready || !this.noiseBuffer) return;
    const ctx = this.context!;

    if (!this.rainGain) {
      if (level <= 0) return;
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;

      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 2600;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 380;

      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      source.connect(low).connect(high).connect(this.rainGain).connect(this.master!);
      source.start();
    }

    this.rainGain.gain.setTargetAtTime(level * 0.07, ctx.currentTime, 1.5);
  }

  /** Thunder: a slow-building low rumble, a beat after the flash. */
  thunder() {
    if (!this.ready || !this.noiseBuffer) return;
    const ctx = this.context!;
    const delay = 0.5 + Math.random() * 1.2;
    const start = ctx.currentTime + delay;
    const length = 2.4;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 0.5;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.55, start + 0.18);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);

    source.connect(filter).connect(envelope).connect(this.master!);
    source.start(start);
    source.stop(start + length + 0.05);
  }

  setHumLevel(level: number) {
    if (!this.humGain || !this.context) return;
    this.humGain.gain.setTargetAtTime(level, this.context.currentTime, 0.4);
  }

  /** A single keycap bottoming out. Pitch varies so runs do not sound looped. */
  key() {
    this.noise(0.035, 0.28, 1500 + Math.random() * 900);
    this.tone(140 + Math.random() * 50, 0.03, 0.06, 'square');
  }

  /** Mouse button, window control, desktop icon. */
  click() {
    this.noise(0.02, 0.2, 2600);
  }

  /** The heavy thunk of a CRT degaussing as it powers up. */
  degauss() {
    this.noise(0.55, 0.34, 90, 'lowpass');
    this.tone(58, 0.5, 0.16, 'sine');
  }

  /** Startup chime once the desktop appears. */
  chime() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      this.tone(frequency, 0.55, 0.09, 'triangle', index * 0.09);
    });
  }

  /**
   * The picture tube letting go: the flyback whine sliding down as the beam
   * collapses, over a soft electrical pop.
   */
  powerDown() {
    if (!this.ready) return;
    const ctx = this.context!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.42);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);

    osc.connect(envelope).connect(this.master!);
    osc.start(now);
    osc.stop(now + 0.5);
    this.noise(0.08, 0.22, 700);
  }

  /** A little square-wave fanfare, for secrets. */
  jingle() {
    const notes = [659.25, 783.99, 1318.5, 1046.5, 1174.66, 1567.98];
    notes.forEach((frequency, index) => {
      this.tone(frequency, 0.16, 0.05, 'square', index * 0.085);
    });
  }

  /** Soft air movement as the camera flies toward the glass. */
  whoosh() {
    this.noise(0.7, 0.1, 420, 'lowpass');
  }

  destroy() {
    void this.context?.close();
    this.context = null;
  }
}

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

  /** Soft air movement as the camera flies toward the glass. */
  whoosh() {
    this.noise(0.7, 0.1, 420, 'lowpass');
  }

  destroy() {
    void this.context?.close();
    this.context = null;
  }
}

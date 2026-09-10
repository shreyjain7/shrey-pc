/**
 * The wire between the operating system and the hardware.
 *
 * The OS never imports the 3D scene and the scene never imports the OS — they
 * only ever meet here. Anything the machine does on screen (a keystroke, a
 * disk write, a heavy app opening, audio playing) is pushed in as a signal,
 * and the tower, the keyboard, the mouse and the speakers read those signals
 * back out every frame.
 *
 * Every value is smoothed here rather than in the renderers, so a burst of
 * fifty keystrokes in a second still reads as one continuous load curve.
 */

export interface Telemetry {
  /** 0..1 — drives fan speed, the CPU cooler's glow, and the graphs. */
  cpu: number;
  /** 0..1 — drives the GPU fans and the card's own lighting. */
  gpu: number;
  /** 0..1 — fraction of the 64 GB the OS thinks it is using. */
  ram: number;
  /** 0..1, decays fast — the amber HDD activity LED. */
  disk: number;
  /** 0..1, decays fast — a keystroke ripple travelling over the keycaps. */
  keys: number;
  /** 0..1 — current output level of the music player, for the speaker cones. */
  audio: number;
  /** Fan speed in RPM, eased toward whatever cpu/gpu demand. */
  rpm: number;
  /** Degrees C, a lagging function of load. Fans chase this. */
  tempCpu: number;
  tempGpu: number;
  /** Frames per second, measured. */
  fps: number;
  /** Where the OS cursor is, normalised 0..1 across the screen. */
  cursor: { x: number; y: number };
  /** True once the desktop is up; the case only lights when it is. */
  powered: boolean;
}

const IDLE_CPU = 0.06;
const IDLE_GPU = 0.03;
const BASE_RAM = 0.19;

/** RPM at zero load and at full tilt. */
const RPM_IDLE = 620;
const RPM_MAX = 2150;

type Listener = (state: Telemetry) => void;

/** Exponential smoothing that behaves identically at any frame rate. */
const damp = (current: number, target: number, lambda: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * delta));

class TelemetryBus {
  readonly state: Telemetry = {
    cpu: IDLE_CPU,
    gpu: IDLE_GPU,
    ram: BASE_RAM,
    disk: 0,
    keys: 0,
    audio: 0,
    rpm: RPM_IDLE,
    tempCpu: 34,
    tempGpu: 31,
    fps: 60,
    cursor: { x: 0.5, y: 0.5 },
    powered: false,
  };

  /** Impulses waiting to be folded into the smoothed values. */
  private cpuLoad = IDLE_CPU;
  private gpuLoad = IDLE_GPU;
  private ramTarget = BASE_RAM;

  private listeners = new Set<Listener>();
  private fpsFrames = 0;
  private fpsClock = 0;

  /* --- Signals in ------------------------------------------------------- */

  /** A key was pressed somewhere in the OS. */
  key() {
    this.state.keys = 1;
    this.cpuLoad = Math.min(this.cpuLoad + 0.05, 1);
  }

  /** Something touched the virtual filesystem. */
  diskActivity(weight = 1) {
    this.state.disk = Math.min(this.state.disk + weight, 1);
    this.cpuLoad = Math.min(this.cpuLoad + 0.08 * weight, 1);
  }

  /**
   * An app opened or closed. `weight` is roughly how heavy it is — the
   * browser and the case cam cost far more than the calculator.
   */
  process(weight: number) {
    this.cpuLoad = Math.min(this.cpuLoad + weight * 0.5, 1);
    this.ramTarget = Math.min(Math.max(this.ramTarget + weight * 0.12, BASE_RAM), 0.94);
  }

  /** Set the standing GPU load — the case cam and the visualiser hold this up. */
  setGpuLoad(load: number) {
    this.gpuLoad = Math.min(Math.max(load, IDLE_GPU), 1);
  }

  /** Set the standing RAM figure directly, from the task manager's tally. */
  setRam(fraction: number) {
    this.ramTarget = Math.min(Math.max(fraction, BASE_RAM), 0.96);
  }

  setAudioLevel(level: number) {
    this.state.audio = Math.min(Math.max(level, 0), 1);
  }

  setCursor(x: number, y: number) {
    this.state.cursor.x = x;
    this.state.cursor.y = y;
  }

  setPowered(on: boolean) {
    this.state.powered = on;
    if (!on) {
      this.cpuLoad = IDLE_CPU;
      this.gpuLoad = IDLE_GPU;
      this.ramTarget = BASE_RAM;
    }
  }

  /* --- Signals out ------------------------------------------------------ */

  on(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called once per frame from the experience loop. */
  update(delta: number) {
    const state = this.state;

    // Impulses bleed away, so load falls back to idle when nothing happens.
    this.cpuLoad = damp(this.cpuLoad, state.powered ? IDLE_CPU : 0.02, 0.55, delta);
    state.cpu = damp(state.cpu, this.cpuLoad, 6, delta);
    state.gpu = damp(state.gpu, this.gpuLoad, 4, delta);
    state.ram = damp(state.ram, this.ramTarget, 2.2, delta);

    // The two flicker signals decay far faster than they rise, which is what
    // makes an LED read as a blink rather than a fade.
    state.disk = damp(state.disk, 0, 9, delta);
    state.keys = damp(state.keys, 0, 7, delta);
    state.audio = damp(state.audio, 0, 5, delta);

    // Silicon heats slowly and cools slower still.
    const demand = Math.max(state.cpu, state.gpu * 0.8);
    state.tempCpu = damp(state.tempCpu, 34 + demand * 46, 0.35, delta);
    state.tempGpu = damp(state.tempGpu, 31 + state.gpu * 48, 0.3, delta);

    // Fans chase temperature, not load — that half-second lag is the tell
    // that makes a fan curve sound and look real.
    const curve = Math.min(Math.max((state.tempCpu - 34) / 46, 0), 1);
    const targetRpm = state.powered ? RPM_IDLE + curve * (RPM_MAX - RPM_IDLE) : 0;
    state.rpm = damp(state.rpm, targetRpm, 1.4, delta);

    this.fpsFrames += 1;
    this.fpsClock += delta;
    if (this.fpsClock >= 0.5) {
      state.fps = Math.round(this.fpsFrames / this.fpsClock);
      this.fpsFrames = 0;
      this.fpsClock = 0;
    }

    for (const listener of this.listeners) listener(state);
  }
}

export const telemetry = new TelemetryBus();

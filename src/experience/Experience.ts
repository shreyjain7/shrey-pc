import { MathUtils, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { initAnalytics, track } from '../analytics';
import { links, profile } from '../data/cv';
import { OS } from '../os/OS';
import { registerScene, type RoomView } from '../os/system';
import { CASE } from '../world/Tower';
import { TOWER } from '../world/layout';
import { telemetry } from '../world/telemetry';
import { World } from '../world/World';
import { Audio } from './Audio';
import { Camera } from './Camera';
import { Renderer } from './Renderer';
import { Sizes } from './Sizes';
import { Time } from './Time';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Boots the whole thing and owns the frame loop. */
export class Experience {
  private readonly scene = new Scene();
  private readonly sizes = new Sizes();
  private readonly time = new Time();
  private readonly audio = new Audio();
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly world: World;
  private readonly os: OS;

  private readonly ui: HTMLElement;
  private loader!: HTMLElement;
  private loaderFill!: HTMLElement;
  private soundButton!: HTMLButtonElement;

  private overlay!: HTMLElement;
  private telemetryRows: Array<[string, HTMLElement]> = [];
  /** Permanent host for the OS on the glass; the OS moves in and out of it. */
  private readonly mount = document.createElement('div');
  private glow = 0;
  private ready = false;
  private panelClock = 0;

  /** Where the OS currently lives, so a mode change knows what to undo. */
  private view: RoomView = 'room';
  private viewButton!: HTMLButtonElement;

  /* --- Case cam: a second, tiny renderer over the same scene ------------- */
  private camRenderer: WebGLRenderer | null = null;
  private camCamera: PerspectiveCamera | null = null;
  private camCanvas: HTMLCanvasElement | null = null;
  private camClock = 0;
  private camAngle = 0.6;
  private readonly camTarget = new Vector3();

  constructor() {
    initAnalytics();

    const canvas = document.querySelector('#webgl') as HTMLCanvasElement;
    const cssTarget = document.querySelector('#css') as HTMLElement;
    this.ui = document.querySelector('#ui') as HTMLElement;

    this.camera = new Camera(this.sizes);
    this.os = new OS(this.audio, this.sizes);

    this.mount.className = 'screen-mount';
    this.mount.append(this.os.root);

    this.world = new World(
      this.scene,
      this.camera,
      this.sizes,
      this.mount,
      () => this.enterScreen(),
      () => this.inspectMachine(),
    );
    this.renderer = new Renderer(canvas, cssTarget, this.scene, this.camera, this.sizes);

    this.buildUI();

    // The tower stands on the desk, so its centre is half a case up from it.
    this.camTarget.set(TOWER.position.x, TOWER.position.y + CASE.height / 2, TOWER.position.z);

    registerScene({
      caseCam: (canvas) => this.mountCaseCam(canvas),
      setView: (view) => this.setView(view),
      resetView: () => this.camera.resetView(),
      toggleFullscreen: () => this.toggleFullscreen(),
    });

    document.body.classList.add('is-loading', 'is-idle');
    this.time.on((delta, elapsed) => this.update(delta, elapsed));

    void this.load();
  }

  /* ---------------------------------------------------------------------- */
  /* Loading                                                                 */
  /* ---------------------------------------------------------------------- */

  private async load() {
    const steps = this.world.steps();
    // The scene steps plus the shader compile at the end.
    const total = steps.length + 1;
    let done = 0;

    const advance = () => {
      done += 1;
      this.loaderFill.style.transform = `scaleX(${done / total})`;
    };

    for (const step of steps) {
      // Yield so the loader actually paints between chunks of work.
      await nextFrame();
      step.run();
      advance();
    }

    await nextFrame();
    // The only genuinely slow part: uploading programs to the GPU.
    await this.renderer.webgl.compileAsync(this.scene, this.camera.instance);
    advance();

    // Straight into the room — there is nothing left to wait for, so making
    // someone click past a finished progress bar is pure friction.
    this.start();
  }

  /**
   * Hands the room over as soon as the last resource lands.
   *
   * Audio is *not* unlocked here: browsers only allow an AudioContext to make
   * sound after a real user gesture, and there is no longer a button to supply
   * one. `armAudio` below waits for the visitor's first interaction instead.
   */
  private start = () => {
    if (this.ready) return;

    this.armAudio();
    this.loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    document.body.classList.add('is-ready');
    this.world.monitor.setPowered(true);
    // The CRT is showing its standby screen, so the machine is already
    // running — the case should be lit and idling, not a black box.
    telemetry.setPowered(true);
    this.ready = true;

    track('experience_started', { quality: this.sizes.quality });
  };

  /**
   * Starts the audio on the visitor's first gesture, whatever it happens to be.
   *
   * Every listener removes itself, so this costs nothing after it fires once —
   * and if the visitor never interacts, the page is simply silent rather than
   * throwing on a blocked AudioContext.
   */
  private armAudio() {
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;

    const unlock = () => {
      for (const type of events) window.removeEventListener(type, unlock);
      this.audio.unlock();
      this.audio.startHum();
      this.audio.setHumLevel(this.view === 'room' ? 0.35 : 1);
    };

    for (const type of events) window.addEventListener(type, unlock, { once: false });
  }

  /* ---------------------------------------------------------------------- */
  /* Navigation                                                              */
  /* ---------------------------------------------------------------------- */

  /** One implementation, called from the corner pill and from the menu bar. */
  toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void document.documentElement.requestFullscreen?.().catch(() => {
      // iOS Safari has no Fullscreen API on iPhone; nothing to fall back to.
    });
  }

  private enterScreen() {
    this.setView('screen');
  }

  private exitScreen() {
    this.setView(this.view === 'screen' ? 'workstation' : 'room');
  }

  /** Clicking the case takes you to the pose it looks best from. */
  private inspectMachine() {
    if (!this.ready) return;
    this.setView('workstation');
    track('machine_inspected');
  }

  /**
   * The one place the three views are switched between.
   *
   *  - **room** — the resting shot. The OS sits on the glass, untouchable.
   *  - **workstation** — pulled back so the tower, the desk and the CRT are
   *    all in frame. The OS lifts off the glass into a panel docked to the
   *    right, so you can keep using it *while watching the machine run it*.
   *  - **screen** — square on the glass, the OS filling the view. On a phone
   *    it leaves the 3D layer entirely and runs at true 1:1 pixels.
   */
  private setView(view: RoomView) {
    if (!this.ready || view === this.view) return;

    const previous = this.view;
    this.view = view;

    document.body.classList.toggle('is-idle', view === 'room');
    document.body.classList.toggle('is-focused', view === 'screen');
    document.body.classList.toggle('is-workstation', view === 'workstation');

    this.os.setView(view);
    this.syncViewButton();

    // The OS only takes input once the camera has actually landed.
    if (previous !== 'room') this.os.setInteractive(false);

    if (view === 'room') {
      this.detachOverlay();
      this.audio.setHumLevel(0.35);
      this.audio.click();
      this.camera.setMode('idle');
      return;
    }

    if (view === 'workstation') {
      this.audio.whoosh();
      this.camera.setMode('workstation', () => {
        this.attachOverlay('workstation');
        this.os.setInteractive(true);
        this.os.powerOn();
        this.audio.setHumLevel(0.8);
      });
      track('workstation_entered');
      return;
    }

    this.audio.whoosh();
    this.camera.setMode('focused', () => {
      // Back on the glass — unless this is a phone, where the glass is too
      // small to read and the OS stays in its fullscreen overlay.
      if (this.sizes.compact) this.attachOverlay('phone');
      else this.detachOverlay();

      this.os.setInteractive(true);
      this.os.powerOn();
      this.audio.setHumLevel(1);
    });

    track('monitor_focused');
  }

  /** Lift the OS off the glass and into a screen-space panel. */
  private attachOverlay(kind: 'workstation' | 'phone') {
    if (this.os.root.parentElement !== this.overlay) this.overlay.append(this.os.root);
    this.os.setOverlay(true);
    document.body.classList.add('is-overlay');
    this.overlay.dataset.kind = kind;
  }

  /** Put it back on the glass. */
  private detachOverlay() {
    if (!document.body.classList.contains('is-overlay')) return;
    document.body.classList.remove('is-overlay');
    this.os.setOverlay(false);
    this.mount.append(this.os.root);
    delete this.overlay.dataset.kind;
  }

  private syncViewButton() {
    if (!this.viewButton) return;
    const label =
      this.view === 'screen'
        ? 'Step back to the workstation'
        : this.view === 'workstation'
          ? 'Step back to the room'
          : 'Sit down at the machine';
    this.viewButton.title = label;
    this.viewButton.setAttribute('aria-label', label);
    this.viewButton.classList.toggle('is-active', this.view === 'workstation');
  }

  /* ---------------------------------------------------------------------- */
  /* Case cam                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Render the tower into an OS window.
   *
   * A second WebGLRenderer over the *same* scene: the geometry, the materials
   * and the lights are all shared, so what this draws is not a copy of the
   * machine but the machine — the same fans, at the same angle, spun by the
   * same telemetry. It costs a second draw of the scene, so it runs at a
   * capped frame rate into a small buffer, and only exists while the window
   * that asked for it is open.
   */
  private mountCaseCam(canvas: HTMLCanvasElement) {
    // One at a time: a second System Monitor reuses the same renderer.
    this.disposeCaseCam();

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: this.sizes.quality === 'high',
        powerPreference: 'low-power',
      });
    } catch {
      // Some devices refuse a second WebGL context; the window still works,
      // it just shows an empty stage rather than failing to open.
      return () => {};
    }

    renderer.setClearColor(0x05070a, 1);
    renderer.outputColorSpace = this.renderer.webgl.outputColorSpace;
    renderer.toneMapping = this.renderer.webgl.toneMapping;
    renderer.toneMappingExposure = 0.98;
    // No shadows in the inset: they are the expensive part and at this size
    // nothing in frame is large enough to read one.
    renderer.shadowMap.enabled = false;

    const camera = new PerspectiveCamera(34, 1.6, 0.02, 8);

    this.camRenderer = renderer;
    this.camCamera = camera;
    this.camCanvas = canvas;
    this.camClock = 0;

    telemetry.setGpuLoad(0.4);

    return () => {
      if (this.camRenderer === renderer) this.disposeCaseCam();
    };
  }

  private disposeCaseCam() {
    this.camRenderer?.dispose();
    this.camRenderer = null;
    this.camCamera = null;
    this.camCanvas = null;
    telemetry.setGpuLoad(0);
  }

  /** Orbit the case slowly, and draw at a capped rate. */
  private updateCaseCam(delta: number) {
    const renderer = this.camRenderer;
    const camera = this.camCamera;
    const canvas = this.camCanvas;
    if (!renderer || !camera || !canvas) return;

    // A window that has been closed leaves its canvas detached; stop drawing.
    if (!canvas.isConnected) {
      this.disposeCaseCam();
      return;
    }

    const cap = this.sizes.quality === 'high' ? 1 / 45 : 1 / 26;
    this.camClock += delta;
    if (this.camClock < cap) return;
    this.camClock = 0;

    // Speed up with load, so a busy machine is also a busier shot.
    this.camAngle += delta * (0.12 + telemetry.state.cpu * 0.35);

    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 200;
    if (width < 8 || height < 8) return;

    const ratio = Math.min(window.devicePixelRatio || 1, this.sizes.quality === 'high' ? 1.75 : 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);

    if (camera.aspect !== width / height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    // Keep the orbit on the glass-panel side, and bob just above centre.
    const radius = 0.64;
    const swing = Math.sin(this.camAngle) * 0.55 + TOWER.rotationY + Math.PI / 2;
    camera.position.set(
      this.camTarget.x + Math.sin(swing) * radius,
      this.camTarget.y + 0.06 + Math.sin(this.camAngle * 0.7) * 0.05,
      this.camTarget.z + Math.cos(swing) * radius,
    );
    camera.lookAt(this.camTarget);

    renderer.render(this.scene, camera);
  }

  /* ---------------------------------------------------------------------- */
  /* UI                                                                      */
  /* ---------------------------------------------------------------------- */

  private iconButton(label: string, svg: string, onClick: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctrl';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = svg;
    button.addEventListener('click', onClick);
    return button;
  }

  private buildUI() {
    /* --- Loading screen ---------------------------------------------------- */
    this.loader = document.createElement('div');
    this.loader.className = 'loader';

    const head = document.createElement('div');
    head.className = 'loader__head';
    const loaderName = document.createElement('p');
    loaderName.className = 'loader__name';
    loaderName.textContent = profile.name;
    const loaderRole = document.createElement('p');
    loaderRole.className = 'loader__role';
    loaderRole.textContent = profile.role;
    head.append(loaderName, loaderRole);

    // Just a name and a progress bar. The room takes over the moment the last
    // resource lands, so there is nothing here to read or click.
    const bar = document.createElement('div');
    bar.className = 'loader__bar';
    this.loaderFill = document.createElement('div');
    this.loaderFill.className = 'loader__fill';
    bar.append(this.loaderFill);

    this.loader.append(head, bar);

    /* --- Idle chrome ------------------------------------------------------- */
    const brand = document.createElement('div');
    brand.className = 'ui-panel ui-panel--idle brand';
    const brandName = document.createElement('p');
    brandName.className = 'brand__name';
    brandName.textContent = profile.name;
    const brandRole = document.createElement('p');
    brandRole.className = 'brand__role';
    brandRole.textContent = profile.role;
    const brandLocation = document.createElement('p');
    brandLocation.className = 'brand__location';
    brandLocation.textContent = profile.location;
    brand.append(brandName, brandRole, brandLocation);

    const hint = document.createElement('div');
    hint.className = 'ui-panel ui-panel--idle hint';
    const dot = document.createElement('span');
    dot.className = 'hint__dot';
    hint.append(
      dot,
      document.createTextNode('Tap the monitor to sit down · tap the tower for a closer look'),
    );

    const social = document.createElement('div');
    social.className = 'ui-panel ui-panel--idle social';
    for (const link of links) {
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (!link.href.startsWith('mailto:')) {
        anchor.target = '_blank';
        anchor.rel = 'noreferrer noopener';
      }
      anchor.addEventListener('click', () => track('social_click', { label: link.label }));
      social.append(anchor);
    }

    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'ui-panel ui-panel--focused exit';
    exit.textContent = '← Step back';
    exit.addEventListener('click', () => this.exitScreen());

    // A standing readout of what the machine is doing, visible whenever the
    // room is. It is the same data the tower's fans are reacting to.
    const telemetryPanel = document.createElement('div');
    telemetryPanel.className = 'ui-panel ui-panel--room telemetry';
    const rows: Array<[string, HTMLElement]> = [];
    for (const label of ['CPU', 'GPU', 'FAN', 'TEMP']) {
      const row = document.createElement('div');
      row.className = 'telemetry__row';
      const name = document.createElement('span');
      name.className = 'telemetry__label';
      name.textContent = label;
      const bar = document.createElement('span');
      bar.className = 'telemetry__bar';
      const fill = document.createElement('span');
      fill.className = 'telemetry__fill';
      bar.append(fill);
      const value = document.createElement('span');
      value.className = 'telemetry__value';
      value.textContent = '—';
      row.append(name, bar, value);
      telemetryPanel.append(row);
      rows.push([label, row]);
    }
    this.telemetryRows = rows;

    /* --- Corner controls --------------------------------------------------- */
    const controls = document.createElement('div');
    controls.className = 'ui-panel ui-panel--always controls';

    this.soundButton = this.iconButton('Toggle sound', '', () => {
      this.audio.unlock();
      this.audio.toggleMute();
    });
    this.audio.setOnChange((muted) => {
      this.soundButton.classList.toggle('is-off', muted);
      this.soundButton.innerHTML = muted ? ICON_MUTED : ICON_SOUND;
      this.soundButton.title = muted ? 'Sound off' : 'Sound on';
    });

    // Cycles screen → workstation → room, the same order as the taskbar's.
    this.viewButton = this.iconButton('Change view', ICON_VIEW, () => {
      this.audio.click();
      const next: RoomView =
        this.view === 'screen' ? 'workstation' : this.view === 'workstation' ? 'room' : 'screen';
      this.setView(next);
    });
    this.syncViewButton();

    const resetButton = this.iconButton('Reset view', ICON_RESET, () => {
      this.camera.resetView();
      this.audio.click();
    });

    const fullscreenButton = this.iconButton('Fullscreen', ICON_EXPAND, () => {
      this.audio.click();
      this.toggleFullscreen();
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreenButton.innerHTML = document.fullscreenElement ? ICON_COLLAPSE : ICON_EXPAND;
    });

    controls.append(this.viewButton, this.soundButton, resetButton, fullscreenButton);

    this.overlay = document.createElement('div');
    this.overlay.id = 'os-overlay';

    this.ui.append(brand, hint, social, telemetryPanel, exit, controls);
    document.body.append(this.overlay, this.loader);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.exitScreen();

      // The standby screen says "press any key to boot", so honour it. The
      // return matters: entering the screen sets the view synchronously and
      // boots on arrival, so falling through would power the OS on before the
      // camera had left the room.
      if (this.ready && this.view === 'room' && event.key === 'Enter') {
        this.enterScreen();
        return;
      }

      // After a shutdown the camera is already at the monitor, so the room's
      // enter path never runs and nothing would boot the machine back up.
      if (this.ready && this.view !== 'room' && this.os.state === 'standby') this.os.powerOn();

      // `V` cycles the camera without reaching for the corner controls, but
      // never while a field somewhere in the OS has the caret.
      if (event.key.toLowerCase() === 'v' && !event.metaKey && !event.ctrlKey) {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        this.setView(this.view === 'screen' ? 'workstation' : this.view === 'workstation' ? 'room' : 'screen');
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Frame                                                                   */
  /* ---------------------------------------------------------------------- */

  private update(delta: number, elapsed: number) {
    // Telemetry first: everything downstream this frame reads from it.
    telemetry.update(delta);

    this.camera.update(delta, elapsed);
    this.world.update(delta, elapsed);

    // Ease the screen's spill light toward whatever the OS is currently showing.
    const target = this.os.brightness * 5;
    this.glow = MathUtils.damp(this.glow, target, 3.5, delta);
    this.world.monitor?.setGlow(this.glow);

    this.renderer.update();
    this.updateCaseCam(delta);
    this.updateTelemetryPanel(delta);
  }

  /** The corner readout. Throttled — four DOM writes a frame is wasteful. */
  private updateTelemetryPanel(delta: number) {
    if (!this.telemetryRows.length) return;

    this.panelClock += delta;
    if (this.panelClock < 0.12) return;
    this.panelClock = 0;

    const state = telemetry.state;
    const readings: Record<string, [number, string]> = {
      CPU: [state.cpu, Math.round(state.cpu * 100) + '%'],
      GPU: [state.gpu, Math.round(state.gpu * 100) + '%'],
      FAN: [Math.min(state.rpm / 2150, 1), Math.round(state.rpm) + ' rpm'],
      TEMP: [Math.min((state.tempCpu - 30) / 55, 1), Math.round(state.tempCpu) + '°C'],
    };

    for (const [label, row] of this.telemetryRows) {
      const [fraction, text] = readings[label];
      const fill = row.querySelector('.telemetry__fill') as HTMLElement | null;
      const value = row.querySelector('.telemetry__value') as HTMLElement | null;
      if (fill) fill.style.transform = `scaleX(${Math.min(Math.max(fraction, 0), 1).toFixed(3)})`;
      if (value) value.textContent = text;
    }
  }

  destroy() {
    this.disposeCaseCam();
    this.time.destroy();
    this.sizes.destroy();
    this.camera.destroy();
    this.world.destroy();
    this.os.destroy();
    this.audio.destroy();
    this.renderer.destroy();
  }
}

/* -------------------------------------------------------------------------- */
/* Control icons                                                              */
/* -------------------------------------------------------------------------- */

const svg = (paths: string) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

const ICON_SOUND = svg(
  '<path d="M11 5 6.5 8.8H3.4v6.4h3.1L11 19z"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6"/>' +
    '<path d="M18 6.6a7.6 7.6 0 0 1 0 10.8"/>',
);

const ICON_MUTED = svg(
  '<path d="M11 5 6.5 8.8H3.4v6.4h3.1L11 19z"/><path d="m16 9.5 5 5"/><path d="m21 9.5-5 5"/>',
);

const ICON_VIEW = svg(
  '<rect x="3" y="5.5" width="13" height="9.5" rx="1.6"/>' +
    '<path d="M16 9.2 21 6.6v10.8L16 14.8z"/><path d="M6.5 19h7"/>',
);

const ICON_RESET = svg(
  '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.4V9h-4.6"/>',
);

const ICON_EXPAND = svg(
  '<path d="M9 4H4v5"/><path d="M15 4h5v5"/><path d="M15 20h5v-5"/><path d="M9 20H4v-5"/>',
);

const ICON_COLLAPSE = svg(
  '<path d="M4 9h5V4"/><path d="M20 9h-5V4"/><path d="M20 15h-5v5"/><path d="M4 15h5v5"/>',
);

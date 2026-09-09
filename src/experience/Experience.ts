import { MathUtils, Scene } from 'three';
import { initAnalytics, track } from '../analytics';
import { links, profile } from '../data/cv';
import { OS } from '../os/OS';
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
  private loaderLog!: HTMLElement;
  private loaderCount!: HTMLElement;
  private startButton!: HTMLButtonElement;
  private soundButton!: HTMLButtonElement;

  private overlay!: HTMLElement;
  /** Permanent host for the OS on the glass; the OS moves in and out of it. */
  private readonly mount = document.createElement('div');
  private glow = 0;
  private ready = false;

  constructor() {
    initAnalytics();

    const canvas = document.querySelector('#webgl') as HTMLCanvasElement;
    const cssTarget = document.querySelector('#css') as HTMLElement;
    this.ui = document.querySelector('#ui') as HTMLElement;

    this.camera = new Camera(this.sizes);
    this.os = new OS(this.audio, this.sizes);

    this.mount.className = 'screen-mount';
    this.mount.append(this.os.root);

    this.world = new World(this.scene, this.camera, this.sizes, this.mount, () =>
      this.enterScreen(),
    );
    this.renderer = new Renderer(canvas, cssTarget, this.scene, this.camera, this.sizes);

    this.buildUI();

    document.body.classList.add('is-loading', 'is-idle');
    this.time.on((delta, elapsed) => this.update(delta, elapsed));

    void this.load();
  }

  /* ---------------------------------------------------------------------- */
  /* Loading                                                                 */
  /* ---------------------------------------------------------------------- */

  private log(text: string, className?: string) {
    const line = document.createElement('div');
    line.className = 'loader__line' + (className ? ' ' + className : '');
    line.textContent = text;
    this.loaderLog.append(line);
    this.loaderLog.scrollTop = this.loaderLog.scrollHeight;
  }

  private async load() {
    const steps = this.world.steps();
    // The scene steps plus the shader compile at the end.
    const total = steps.length + 1;
    let done = 0;

    const advance = (name: string) => {
      done += 1;
      this.loaderCount.textContent = `LOADING RESOURCES (${done}/${total})`;
      this.loaderFill.style.transform = `scaleX(${done / total})`;
      this.log('Loaded  ' + name);
    };

    for (const step of steps) {
      // Yield so the loader actually paints between chunks of work.
      await nextFrame();
      step.run();
      advance(step.name);
    }

    await nextFrame();
    // The only genuinely slow part: uploading programs to the GPU.
    await this.renderer.webgl.compileAsync(this.scene, this.camera.instance);
    advance('shaders.compiled');

    this.log('');
    this.log('FINISHED LOADING RESOURCES', 'loader__line--accent');

    this.loader.classList.add('is-armed');
    this.startButton.disabled = false;
    this.startButton.focus();
  }

  /** The start gate. Doubles as the gesture that lets audio play. */
  private start = () => {
    if (!this.startButton || this.startButton.disabled) return;
    this.startButton.disabled = true;

    this.log('All Content Loaded, launching', 'loader__line--accent');

    this.audio.unlock();
    this.audio.startHum();
    this.audio.setHumLevel(0.35);
    this.audio.click();

    this.loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    document.body.classList.add('is-ready');
    this.world.monitor.setPowered(true);
    this.ready = true;

    track('experience_started', { quality: this.sizes.quality });
  };

  /* ---------------------------------------------------------------------- */
  /* Navigation                                                              */
  /* ---------------------------------------------------------------------- */

  private enterScreen() {
    if (!this.ready || this.camera.mode === 'focused') return;

    document.body.classList.remove('is-idle');
    document.body.classList.add('is-focused');
    this.audio.whoosh();

    this.camera.focus(() => {
      // On a phone, lift the OS off the glass and run it fullscreen.
      if (this.sizes.compact) {
        this.overlay.append(this.os.root);
        this.os.setOverlay(true);
        document.body.classList.add('is-overlay');
      }

      this.os.setInteractive(true);
      this.os.powerOn();
      this.audio.setHumLevel(1);
    });

    track('monitor_focused');
  }

  private exitScreen() {
    if (this.camera.mode !== 'focused') return;

    this.os.setInteractive(false);

    if (document.body.classList.contains('is-overlay')) {
      document.body.classList.remove('is-overlay');
      this.os.setOverlay(false);
      this.mount.append(this.os.root);
    }

    document.body.classList.remove('is-focused');
    document.body.classList.add('is-idle');
    this.audio.setHumLevel(0.35);
    this.audio.click();
    this.camera.unfocus();
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

    this.loaderLog = document.createElement('div');
    this.loaderLog.className = 'loader__log';

    this.loaderCount = document.createElement('p');
    this.loaderCount.className = 'loader__count';
    this.loaderCount.textContent = 'LOADING RESOURCES (0/7)';

    const bar = document.createElement('div');
    bar.className = 'loader__bar';
    this.loaderFill = document.createElement('div');
    this.loaderFill.className = 'loader__fill';
    bar.append(this.loaderFill);

    this.startButton = document.createElement('button');
    this.startButton.type = 'button';
    this.startButton.className = 'loader__start';
    this.startButton.textContent = 'START';
    this.startButton.disabled = true;
    this.startButton.addEventListener('click', this.start);

    const startHint = document.createElement('p');
    startHint.className = 'loader__hint';
    startHint.textContent = 'Click start to begin';

    this.loader.append(head, this.loaderLog, this.loaderCount, bar, this.startButton, startHint);

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
    hint.append(dot, document.createTextNode('Tap the monitor · drag to look around'));

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
    exit.textContent = '← Back to the room';
    exit.addEventListener('click', () => this.exitScreen());

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

    const resetButton = this.iconButton('Reset view', ICON_RESET, () => {
      this.camera.resetView();
      this.audio.click();
    });

    const fullscreenButton = this.iconButton('Fullscreen', ICON_EXPAND, () => {
      this.audio.click();
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen?.().catch(() => {
          // iOS Safari has no Fullscreen API on iPhone; nothing to fall back to.
        });
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreenButton.innerHTML = document.fullscreenElement ? ICON_COLLAPSE : ICON_EXPAND;
    });

    controls.append(this.soundButton, resetButton, fullscreenButton);

    this.overlay = document.createElement('div');
    this.overlay.id = 'os-overlay';

    this.ui.append(brand, hint, social, exit, controls);
    document.body.append(this.overlay, this.loader);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.exitScreen();
      // The standby screen says "press any key to boot", so honour it.
      if (this.ready && this.camera.mode === 'idle' && event.key === 'Enter') {
        this.enterScreen();
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Frame                                                                   */
  /* ---------------------------------------------------------------------- */

  private update(delta: number, elapsed: number) {
    this.camera.update(delta, elapsed);
    this.world.update(delta, elapsed);

    // Ease the screen's spill light toward whatever the OS is currently showing.
    const target = this.os.brightness * 5;
    this.glow = MathUtils.damp(this.glow, target, 3.5, delta);
    this.world.monitor?.setGlow(this.glow);

    this.renderer.update();
  }

  destroy() {
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

const ICON_RESET = svg(
  '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.4V9h-4.6"/>',
);

const ICON_EXPAND = svg(
  '<path d="M9 4H4v5"/><path d="M15 4h5v5"/><path d="M15 20h5v-5"/><path d="M9 20H4v-5"/>',
);

const ICON_COLLAPSE = svg(
  '<path d="M4 9h5V4"/><path d="M20 9h-5V4"/><path d="M20 15h-5v5"/><path d="M4 15h5v5"/>',
);

import { MathUtils, Scene } from 'three';
import { links, profile } from '../data/cv';
import { OS } from '../os/OS';
import { World } from '../world/World';
import { Camera } from './Camera';
import { Renderer } from './Renderer';
import { Sizes } from './Sizes';
import { Time } from './Time';

const LOADER_STEPS = ['Building room', 'Wiring monitor', 'Compiling shaders'];

/** Boots the whole thing and owns the frame loop. */
export class Experience {
  private readonly scene = new Scene();
  private readonly sizes = new Sizes();
  private readonly time = new Time();
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly world: World;
  private readonly os = new OS();

  private readonly ui: HTMLElement;
  private loader!: HTMLElement;
  private loaderFill!: HTMLElement;
  private loaderStatus!: HTMLElement;

  private glow = 0;
  private ready = false;

  constructor() {
    const canvas = document.querySelector('#webgl') as HTMLCanvasElement;
    const cssTarget = document.querySelector('#css') as HTMLElement;
    this.ui = document.querySelector('#ui') as HTMLElement;

    this.camera = new Camera(this.sizes);
    this.world = new World(this.scene, this.camera, this.sizes, this.os.root, () =>
      this.enterScreen(),
    );
    this.renderer = new Renderer(canvas, cssTarget, this.scene, this.camera, this.sizes);

    this.buildUI();

    document.body.classList.add('is-loading', 'is-idle');
    this.time.on((delta, elapsed) => this.update(delta, elapsed));

    void this.warmUp();
  }

  /* ---------------------------------------------------------------------- */
  /* Loading                                                                 */
  /* ---------------------------------------------------------------------- */

  private async warmUp() {
    for (let step = 0; step < LOADER_STEPS.length; step += 1) {
      this.loaderStatus.textContent = LOADER_STEPS[step];
      this.loaderFill.style.transform = `scaleX(${(step + 1) / (LOADER_STEPS.length + 1)})`;

      if (step === LOADER_STEPS.length - 1) {
        // The only genuinely slow part: uploading programs to the GPU.
        await this.renderer.webgl.compileAsync(this.scene, this.camera.instance);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 260));
      }
    }

    this.loaderFill.style.transform = 'scaleX(1)';
    this.loaderStatus.textContent = 'Ready';

    await new Promise((resolve) => window.setTimeout(resolve, 320));

    this.loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    document.body.classList.add('is-ready');
    this.world.monitor.setPowered(true);
    this.ready = true;
  }

  /* ---------------------------------------------------------------------- */
  /* Navigation                                                              */
  /* ---------------------------------------------------------------------- */

  private enterScreen() {
    if (!this.ready || this.camera.mode === 'focused') return;

    document.body.classList.remove('is-idle');
    document.body.classList.add('is-focused');

    this.camera.focus(() => {
      this.os.setInteractive(true);
      this.os.powerOn();
    });
  }

  private exitScreen() {
    if (this.camera.mode !== 'focused') return;

    this.os.setInteractive(false);
    document.body.classList.remove('is-focused');
    document.body.classList.add('is-idle');
    this.camera.unfocus();
  }

  /* ---------------------------------------------------------------------- */
  /* UI                                                                      */
  /* ---------------------------------------------------------------------- */

  private buildUI() {
    this.loader = document.createElement('div');
    this.loader.className = 'loader';

    const loaderName = document.createElement('p');
    loaderName.className = 'loader__name';
    loaderName.textContent = profile.name;

    const bar = document.createElement('div');
    bar.className = 'loader__bar';
    this.loaderFill = document.createElement('div');
    this.loaderFill.className = 'loader__fill';
    bar.append(this.loaderFill);

    this.loaderStatus = document.createElement('p');
    this.loaderStatus.className = 'loader__status';
    this.loaderStatus.textContent = LOADER_STEPS[0];

    this.loader.append(loaderName, bar, this.loaderStatus);

    const brand = document.createElement('div');
    brand.className = 'ui-panel ui-panel--idle brand';
    brand.innerHTML =
      '<p class="brand__name"></p><p class="brand__role"></p><p class="brand__location"></p>';
    (brand.querySelector('.brand__name') as HTMLElement).textContent = profile.name;
    (brand.querySelector('.brand__role') as HTMLElement).textContent = profile.role;
    (brand.querySelector('.brand__location') as HTMLElement).textContent = profile.location;

    const hint = document.createElement('div');
    hint.className = 'ui-panel ui-panel--idle hint';
    const dot = document.createElement('span');
    dot.className = 'hint__dot';
    hint.append(dot, document.createTextNode('Click the monitor'));

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
      social.append(anchor);
    }

    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'ui-panel ui-panel--focused exit';
    exit.textContent = '← Back to the room';
    exit.addEventListener('click', () => this.exitScreen());

    this.ui.append(brand, hint, social, exit);
    document.body.append(this.loader);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.exitScreen();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Frame                                                                   */
  /* ---------------------------------------------------------------------- */

  private update(delta: number, elapsed: number) {
    this.camera.update(delta, elapsed);

    // Ease the screen's spill light toward whatever the OS is currently showing.
    const target = this.os.brightness * 5;
    this.glow = MathUtils.damp(this.glow, target, 3.5, delta);
    this.world.monitor.setGlow(this.glow);

    this.renderer.update();
  }

  destroy() {
    this.time.destroy();
    this.sizes.destroy();
    this.camera.destroy();
    this.world.destroy();
    this.os.destroy();
    this.renderer.destroy();
  }
}

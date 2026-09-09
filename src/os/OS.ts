import type { Audio } from '../experience/Audio';
import type { Sizes } from '../experience/Sizes';
import { profile } from '../data/cv';
import { apps, appsById, icons } from './apps';
import { setTerminalKeySound, setTerminalLauncher } from './Terminal';
import { WindowManager } from './WindowManager';

export type OSState = 'standby' | 'booting' | 'desktop';

interface BootLine {
  text: string;
  delay: number;
  className?: string;
  /** Marks the line the RAM counter animates in place. */
  ram?: boolean;
}

const RAM_TOTAL = 65536;

const BOOT_LINES: BootLine[] = [
  { text: 'SJBIOS (C)2000 Jain Systems Inc.,', delay: 0, className: 'boot__line--bright' },
  { text: 'HSP S13 2000-2026 Special UC131S', delay: 70 },
  { text: 'Released: 09/09/2026', delay: 70 },
  { text: '', delay: 40 },
  { text: 'Main Processor : Shrey Jain, B.Tech CSE', delay: 150 },
  { text: 'Manipal Institute of Technology  2023-2027', delay: 130 },
  { text: '', delay: 40 },
  { text: 'Memory Test : 0K OK', delay: 90, ram: true },
  { text: '', delay: 900 },
  { text: 'Detecting IDE Primary Master   ... PYTHON', delay: 130 },
  { text: 'Detecting IDE Primary Slave    ... C', delay: 100 },
  { text: 'Detecting IDE Secondary Master ... MYSQL', delay: 100 },
  { text: 'Detecting IDE Secondary Slave  ... GIT', delay: 100 },
  { text: '', delay: 60 },
  { text: 'Mounting /projects   ... 3 found', delay: 170 },
  { text: 'Mounting /experience ... 5 found', delay: 140 },
  { text: 'Mounting /education  ... 2 found', delay: 130 },
  { text: '', delay: 60 },
  { text: 'Loading user profile: ' + profile.name, delay: 230, className: 'boot__line--bright' },
  { text: '', delay: 50 },
  { text: 'Starting shrey-os ...', delay: 220, className: 'boot__line--accent' },
];

/**
 * The whole operating system that lives on the CRT: a standby screen, a fake
 * POST sequence, and a desktop with draggable windows built from the CV data.
 */
export class OS {
  readonly root: HTMLElement;

  state: OSState = 'standby';
  /** How much light the screen should be throwing into the room, 0..1. */
  brightness = 0.18;

  private readonly standby: HTMLElement;
  private readonly boot: HTMLElement;
  private readonly desktop: HTMLElement;
  private readonly windowLayer: HTMLElement;
  private readonly taskbarApps: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly startMenu: HTMLElement;
  private readonly manager: WindowManager;

  private timers: number[] = [];
  private clockTimer = 0;
  private ramTimer = 0;

  constructor(
    private audio: Audio,
    sizes: Sizes,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen';

    this.standby = this.buildStandby();
    this.boot = this.buildBoot();
    this.desktop = this.buildDesktop();

    this.windowLayer = this.desktop.querySelector('.windows') as HTMLElement;
    this.taskbarApps = this.desktop.querySelector('.taskbar__apps') as HTMLElement;
    this.clock = this.desktop.querySelector('.taskbar__clock') as HTMLElement;
    this.startMenu = this.desktop.querySelector('.start-menu') as HTMLElement;

    const crt = document.createElement('div');
    crt.className = 'crt';
    crt.append(this.standby, this.boot, this.desktop);

    const scanlines = document.createElement('div');
    scanlines.className = 'crt__scanlines';
    const vignette = document.createElement('div');
    vignette.className = 'crt__vignette';
    const flicker = document.createElement('div');
    flicker.className = 'crt__flicker';

    this.root.append(crt, scanlines, vignette, flicker);

    this.manager = new WindowManager(this.windowLayer, this.root, () => this.audio.click());
    this.manager.setOnChange(() => this.syncTaskbar());

    this.applyLayout(sizes);
    sizes.on(() => this.applyLayout(sizes));

    setTerminalLauncher((appId) => {
      const app = appsById.get(appId);
      if (app) this.manager.open(app);
    });
    setTerminalKeySound(() => this.audio.key());
  }

  /** Phones get bigger type and full-bleed windows. */
  private applyLayout(sizes: Sizes) {
    this.root.classList.toggle('is-compact', sizes.compact);
    this.manager.setCompact(sizes.compact);
  }

  /* ---------------------------------------------------------------------- */
  /* Standby                                                                 */
  /* ---------------------------------------------------------------------- */

  private buildStandby() {
    const layer = document.createElement('div');
    layer.className = 'layer layer--standby is-visible';

    const name = document.createElement('h1');
    name.className = 'standby__name';
    name.textContent = profile.name;

    const role = document.createElement('p');
    role.className = 'standby__role';
    role.textContent = profile.role;

    const hint = document.createElement('p');
    hint.className = 'standby__hint';
    hint.innerHTML = 'PRESS ANY KEY TO BOOT<span class="caret"></span>';

    layer.append(name, role, hint);
    return layer;
  }

  private buildBoot() {
    const layer = document.createElement('div');
    layer.className = 'layer layer--boot';
    return layer;
  }

  /* ---------------------------------------------------------------------- */
  /* Desktop                                                                 */
  /* ---------------------------------------------------------------------- */

  private buildDesktop() {
    const layer = document.createElement('div');
    layer.className = 'layer layer--desktop';

    const iconGrid = document.createElement('div');
    iconGrid.className = 'icons';

    for (const app of apps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon';
      button.dataset.app = app.id;

      const glyph = document.createElement('span');
      glyph.className = 'icon__glyph';
      glyph.innerHTML = app.icon;

      const label = document.createElement('span');
      label.className = 'icon__label';
      label.textContent = app.title;

      button.append(glyph, label);
      button.addEventListener('click', () => {
        this.audio.click();
        this.closeStartMenu();
        this.manager.open(app);
      });
      iconGrid.append(button);
    }

    const windows = document.createElement('div');
    windows.className = 'windows';

    const startMenu = document.createElement('nav');
    startMenu.className = 'start-menu';

    const menuHead = document.createElement('div');
    menuHead.className = 'start-menu__head';
    const menuName = document.createElement('span');
    menuName.className = 'start-menu__name';
    menuName.textContent = profile.name;
    const menuRole = document.createElement('span');
    menuRole.className = 'start-menu__role';
    menuRole.textContent = profile.role;
    menuHead.append(menuName, menuRole);
    startMenu.append(menuHead);

    const menuList = document.createElement('div');
    menuList.className = 'start-menu__list';
    for (const app of apps) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'start-menu__item';
      item.innerHTML = '<span class="start-menu__icon">' + app.icon + '</span>';
      item.append(document.createTextNode(app.title));
      item.addEventListener('click', () => {
        this.audio.click();
        this.closeStartMenu();
        this.manager.open(app);
      });
      menuList.append(item);
    }
    startMenu.append(menuList);

    const shutdown = document.createElement('button');
    shutdown.type = 'button';
    shutdown.className = 'start-menu__item start-menu__item--power';
    shutdown.innerHTML = '<span class="start-menu__icon">' + icons.terminal + '</span>';
    shutdown.append(document.createTextNode('Close all windows'));
    shutdown.addEventListener('click', () => {
      this.audio.click();
      this.closeStartMenu();
      this.manager.closeAll();
    });
    startMenu.append(shutdown);

    const taskbar = document.createElement('footer');
    taskbar.className = 'taskbar';

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'taskbar__start';
    startButton.innerHTML = '<span class="taskbar__logo"></span>';
    startButton.append(document.createTextNode('Start'));
    startButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.audio.click();
      this.startMenu.classList.toggle('is-open');
    });

    const taskbarApps = document.createElement('div');
    taskbarApps.className = 'taskbar__apps';

    const clock = document.createElement('div');
    clock.className = 'taskbar__clock';

    taskbar.append(startButton, taskbarApps, clock);

    layer.append(iconGrid, windows, startMenu, taskbar);

    layer.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.start-menu') && !target.closest('.taskbar__start')) {
        this.closeStartMenu();
      }
    });

    return layer;
  }

  private closeStartMenu() {
    this.startMenu.classList.remove('is-open');
  }

  private syncTaskbar() {
    this.taskbarApps.replaceChildren();
    const focused = this.manager.focusedId;

    for (const app of apps) {
      if (!this.manager.isOpen(app.id)) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'taskbar__app';
      button.classList.toggle('is-active', focused === app.id);
      button.classList.toggle('is-minimised', this.manager.isMinimised(app.id));
      button.innerHTML = '<span class="taskbar__icon">' + app.icon + '</span>';
      button.append(document.createTextNode(app.title));
      button.addEventListener('click', () => {
        this.audio.click();
        this.manager.toggle(app);
      });
      this.taskbarApps.append(button);
    }
  }

  private tickClock = () => {
    this.clock.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                               */
  /* ---------------------------------------------------------------------- */

  /** Runs the POST sequence, then hands over to the desktop. */
  powerOn() {
    if (this.state !== 'standby') return;
    this.state = 'booting';

    this.standby.classList.remove('is-visible');
    this.boot.classList.add('is-visible');
    this.boot.replaceChildren();
    this.brightness = 0.55;
    this.audio.degauss();

    let elapsed = 0;
    for (const entry of BOOT_LINES) {
      elapsed += entry.delay;
      this.timers.push(
        window.setTimeout(() => {
          const line = document.createElement('div');
          line.className = 'boot__line' + (entry.className ? ' ' + entry.className : '');
          line.textContent = entry.text === '' ? ' ' : entry.text;
          this.boot.append(line);
          if (entry.ram) this.countRam(line);
          this.boot.scrollTop = this.boot.scrollHeight;
        }, elapsed),
      );
    }

    // A beat on the last line, then the CRT "snaps" into the desktop.
    this.timers.push(
      window.setTimeout(() => this.root.classList.add('is-switching'), elapsed + 420),
    );

    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.remove('is-switching');
        this.boot.classList.remove('is-visible');
        this.desktop.classList.add('is-visible');
        this.state = 'desktop';
        this.brightness = 1;
        this.audio.chime();

        this.tickClock();
        this.clockTimer = window.setInterval(this.tickClock, 15000);

        // Open with something to read rather than a bare desktop.
        this.manager.open(appsById.get('about')!);
      }, elapsed + 620),
    );
  }

  /** The classic POST memory count, ticking up in place. */
  private countRam(line: HTMLElement) {
    let value = 0;
    const step = 4096;
    this.ramTimer = window.setInterval(() => {
      value = Math.min(value + step, RAM_TOTAL);
      line.textContent = 'Memory Test : ' + value + 'K OK';
      if (value >= RAM_TOTAL) window.clearInterval(this.ramTimer);
    }, 45);
  }

  /**
   * Fullscreen mode for phones: the screen stops being a fixed 1280x960
   * surface projected onto glass and becomes a normal viewport-sized element,
   * so text renders at true 1:1 pixels instead of being scaled into a stamp.
   */
  setOverlay(on: boolean) {
    this.root.classList.toggle('is-overlay', on);
  }

  /** Pointer events only reach the screen once the camera has settled on it. */
  setInteractive(interactive: boolean) {
    this.root.classList.toggle('is-interactive', interactive);
  }

  destroy() {
    for (const timer of this.timers) window.clearTimeout(timer);
    window.clearInterval(this.clockTimer);
    window.clearInterval(this.ramTimer);
  }
}

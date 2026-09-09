import { profile } from '../data/cv';
import { SCREEN_PX } from '../world/layout';
import { apps, appsById, icons } from './apps';
import { setTerminalLauncher } from './Terminal';
import { WindowManager } from './WindowManager';

export type OSState = 'standby' | 'booting' | 'desktop';

const BOOT_LINES: Array<{ text: string; delay: number; className?: string }> = [
  { text: 'SHREY BIOS v1.0.4 — 4:3 CRT SUBSYSTEM', delay: 0, className: 'boot__line--bright' },
  { text: 'Copyright (C) Shrey Jain. All rights reserved.', delay: 90 },
  { text: '', delay: 40 },
  { text: 'CPU        : Manipal Institute of Technology, B.Tech CSE', delay: 150 },
  { text: 'Memory Test: 2023-2027 ... OK', delay: 210 },
  { text: 'Detecting IDE drives ...', delay: 200 },
  { text: '  Primary Master   : PYTHON', delay: 110 },
  { text: '  Primary Slave    : C', delay: 90 },
  { text: '  Secondary Master : MYSQL', delay: 90 },
  { text: '  Secondary Slave  : GIT', delay: 90 },
  { text: '', delay: 60 },
  { text: 'Mounting /projects ... 3 found', delay: 190 },
  { text: 'Mounting /experience ... 5 found', delay: 150 },
  { text: 'Loading user profile: ' + profile.name, delay: 240, className: 'boot__line--bright' },
  { text: '', delay: 60 },
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

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.style.width = SCREEN_PX.width + 'px';
    this.root.style.height = SCREEN_PX.height + 'px';

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

    this.manager = new WindowManager(this.windowLayer, this.root);
    this.manager.setOnChange(() => this.syncTaskbar());

    setTerminalLauncher((appId) => {
      const app = appsById.get(appId);
      if (app) this.manager.open(app);
    });
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
    hint.innerHTML = 'CLICK THE MONITOR TO BOOT<span class="caret"></span>';

    layer.append(name, role, hint);
    return layer;
  }

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                    */
  /* ---------------------------------------------------------------------- */

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
    menuHead.innerHTML =
      '<span class="start-menu__name">' +
      profile.name +
      '</span><span class="start-menu__role">' +
      profile.role +
      '</span>';
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
      button.addEventListener('click', () => this.manager.toggle(app));
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

    let elapsed = 0;
    for (const entry of BOOT_LINES) {
      elapsed += entry.delay;
      this.timers.push(
        window.setTimeout(() => {
          const line = document.createElement('div');
          line.className = 'boot__line' + (entry.className ? ' ' + entry.className : '');
          line.textContent = entry.text === '' ? ' ' : entry.text;
          this.boot.append(line);
          this.boot.scrollTop = this.boot.scrollHeight;
        }, elapsed),
      );
    }

    // A beat on the last line, then the CRT "snaps" into the desktop.
    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.add('is-switching');
      }, elapsed + 420),
    );

    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.remove('is-switching');
        this.boot.classList.remove('is-visible');
        this.desktop.classList.add('is-visible');
        this.state = 'desktop';
        this.brightness = 1;

        this.tickClock();
        this.clockTimer = window.setInterval(this.tickClock, 15000);

        // Open with something to read rather than a bare desktop.
        this.manager.open(appsById.get('about')!);
      }, elapsed + 620),
    );
  }

  /** Pointer events only reach the screen once the camera has settled on it. */
  setInteractive(interactive: boolean) {
    this.root.classList.toggle('is-interactive', interactive);
  }

  destroy() {
    for (const timer of this.timers) window.clearTimeout(timer);
    window.clearInterval(this.clockTimer);
  }
}

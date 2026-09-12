import type { Audio } from '../experience/Audio';
import type { Sizes } from '../experience/Sizes';
import { profile } from '../data/cv';
import { telemetry } from '../world/telemetry';
import { SPRING, Spring } from './anim';
import { apps, appsById, icons } from './apps';
import { fileIcon } from './apps/Explorer';
import { closeContextMenu, openContextMenu } from './ContextMenu';
import { basename, fs, HOME, join } from './fs';
import { MenuBar } from './MenuBar';
import type { BarItem, BarMenu } from './MenuBar';
import { mountNotifications, notify } from './Notifications';
import { settings } from './settings';
import { Spotlight } from './Spotlight';
import {
  openPath,
  registerSystem,
  resetCameraView,
  setRoomView,
  toggleFullscreen,
} from './system';
import { setTerminalKeySound } from './Terminal';
import { askForName, confirmAction, el, svg } from './ui';
import { WindowManager } from './WindowManager';

export type OSState = 'standby' | 'booting' | 'desktop' | 'halting';

/** One line of the shutdown log, and the pause before printing it. */
interface BootLine {
  text: string;
  delay: number;
  className?: string;
}

const SHUTDOWN_LINES: BootLine[] = [
  { text: 'shrey-os: received SIGTERM', delay: 0, className: 'boot__line--bright' },
  { text: '', delay: 60 },
  { text: 'Stopping session manager      ... done', delay: 200 },
  { text: 'Closing open windows          ... done', delay: 170 },
  { text: 'Flushing /home/shrey to disk  ... done', delay: 220 },
  { text: 'Unmounting /home/shrey        ... done', delay: 180 },
  { text: 'Stopping telemetry bus        ... done', delay: 150 },
  { text: 'Spinning down fans            ... done', delay: 260 },
  { text: '', delay: 80 },
  { text: 'System halted.', delay: 320, className: 'boot__line--accent' },
];

const MENU_ICONS = {
  newFolder: svg('<path d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.2l1.9 2.2h9.1A1.4 1.4 0 0 1 21 9.6v8A1.4 1.4 0 0 1 19.6 19H4.4A1.4 1.4 0 0 1 3 17.6z"/><path d="M12 11.5v5M9.5 14h5"/>'),
  newFile: svg('<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V8z"/><path d="M14 3v5h4.8"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.4V9h-4.6"/>'),
  trash: svg('<path d="M4.5 7h15"/><path d="M6.5 7v12.1A1.9 1.9 0 0 0 8.4 21h7.2a1.9 1.9 0 0 0 1.9-1.9V7"/>'),
  rename: svg('<path d="M4 20h16"/><path d="M14.5 4.5 19 9 9 19H4.5v-4.5z"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  power: svg('<path d="M12 4v8"/><path d="M17.7 7.3a8 8 0 1 1-11.4 0"/>'),
  close: svg('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m9.5 10.5 5 5M14.5 10.5l-5 5"/>'),
  apple: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
    '<path d="M16.3 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6 0 0-2.5-1-2.5-3.9z"/>' +
    '<path d="M14.3 5.4c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3z"/></svg>',
  view: svg(
    '<rect x="3" y="5.5" width="13" height="9.5" rx="1.6"/>' +
      '<path d="M16 9.2 21 6.6v10.8L16 14.8z"/><path d="M6.5 19h7"/>',
  ),
  sound: svg('<path d="M11 5 6.5 8.8H3.4v6.4h3.1L11 19z"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6"/>'),
  overview: svg(
    '<rect x="3.2" y="4.5" width="8" height="6.4" rx="1.3"/>' +
      '<rect x="12.8" y="4.5" width="8" height="6.4" rx="1.3"/>' +
      '<rect x="3.2" y="13.1" width="8" height="6.4" rx="1.3"/>' +
      '<rect x="12.8" y="13.1" width="8" height="6.4" rx="1.3"/>',
  ),
  expand: svg('<path d="M9 4.5H4.5V9"/><path d="M15 4.5h4.5V9"/><path d="M9 19.5H4.5V15"/><path d="M15 19.5h4.5V15"/>'),
};

const DESKTOP_DIR = join(HOME, 'Desktop');

/** Pinned to the dock whether or not they are running. Membership only — the
 *  dock lays them out in registry order, so `apps` decides the sequence. */
const DOCK_APPS = [
  'showcase',
  'search',
  'browser',
  'music',
  'spotify',
  'timetable',
  'terminal',
  'explorer',
  'notepad',
  'wordle',
  'sysmon',
  'settings',
];

/**
 * shrey-os: a desktop environment running on the CRT. Icons, windows, a file
 * manager, a shell and a handful of apps, all over the virtual filesystem.
 */
export class OS {
  readonly root: HTMLElement;

  state: OSState = 'standby';
  /** How much light the screen should be throwing into the room, 0..1. */
  brightness = 0.18;

  private readonly standby: HTMLElement;
  private readonly boot: HTMLElement;
  private readonly desktop: HTMLElement;
  private readonly iconGrid: HTMLElement;
  private readonly windowLayer: HTMLElement;
  private readonly taskbarApps: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly calendar: HTMLElement;
  private readonly startMenu: HTMLElement;
  private readonly startList: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly manager: WindowManager;
  private readonly spotlight: Spotlight;

  private selected: string | null = null;
  private timers: number[] = [];
  private clockTimer = 0;
  private stopMotion: Array<() => void> = [];
  /** Which room camera the shell believes it is being viewed from. */
  private view: 'room' | 'workstation' | 'screen' = 'screen';
  private viewButton!: HTMLButtonElement;
  private menuBar!: MenuBar;
  /** Dock buttons by app id, reused across syncs. */
  private dockButtons = new Map<string, HTMLElement>();

  constructor(
    private audio: Audio,
    sizes: Sizes,
  ) {
    this.root = el('div', 'screen');

    this.standby = this.buildStandby();
    this.boot = el('div', 'layer layer--boot');
    this.desktop = el('div', 'layer layer--desktop');

    this.iconGrid = el('div', 'icons');
    this.windowLayer = el('div', 'windows');

    // Before any chrome: the menu bar names itself after the frontmost window,
    // so it has to have something to ask. Constructing the manager only stores
    // these two elements — nothing is mounted until a window opens.
    this.manager = new WindowManager(this.windowLayer, this.root, () => this.audio.click());

    this.spotlight = new Spotlight(
      (app) => this.manager.open(app),
      (path) => this.launch(path),
    );

    const startBits = this.buildStartMenu();
    this.startMenu = startBits.menu;
    this.startList = startBits.list;
    this.search = startBits.search;

    const taskbarBits = this.buildTaskbar();
    this.taskbarApps = taskbarBits.appsHost;
    this.clock = taskbarBits.clock;
    this.calendar = taskbarBits.calendar;

    this.desktop.append(
      taskbarBits.menubar,
      this.iconGrid,
      this.windowLayer,
      this.startMenu,
      this.calendar,
      taskbarBits.taskbar,
      this.spotlight.element,
    );

    const crt = el('div', 'crt');
    crt.append(this.standby, this.boot, this.desktop);

    this.root.append(
      crt,
      el('div', 'crt__scanlines'),
      el('div', 'crt__vignette'),
      el('div', 'crt__flicker'),
    );

    mountNotifications(this.root);
    settings.attach(this.root);

    this.manager.setOnChange(() => this.syncTaskbar());
    // Minimising genies toward the app's own taskbar button, so the manager
    // needs to be able to ask where that button currently is.
    this.manager.setTaskbarAnchor((id) => this.taskbarAnchor(id));

    this.applyLayout(sizes);
    sizes.on(() => this.applyLayout(sizes));

    registerSystem({
      openApp: (id) => {
        const app = appsById.get(id);
        if (app) this.manager.open(app);
      },
      closeApp: (id) => this.manager.close(id),
      screen: () => this.root,
    });

    setTerminalKeySound(() => {
      if (settings.state.keySounds) this.audio.key();
      telemetry.key();
    });

    // Any keystroke anywhere in the OS lights a keycap out on the desk and
    // nudges the CPU load, whether it landed in the shell or in Notepad.
    this.root.addEventListener('keydown', (event) => {
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter') {
        telemetry.key();
      }
    });

    fs.on(() => {
      this.renderIcons();
      // Every write to the virtual disk blinks the drive LED on the tower.
      telemetry.diskActivity();
    });
    settings.on(() => this.tickClock());

    this.bindDesktop();
    this.bindShortcuts();
    this.bindPointer();
    this.renderIcons();

    this.stopMotion.push(this.manager.bindParallax(this.desktop));
  }

  private applyLayout(sizes: Sizes) {
    this.root.classList.toggle('is-compact', sizes.compact);
    this.manager.setCompact(sizes.compact);
    this.manager.relayout();
  }

  /**
   * The cursor halo and the click ripples.
   *
   * The real pointer is the browser's, drawn by the compositor on top of
   * everything — but a soft light that lags a few frames behind it, and a
   * ripple where you click, are what make a desktop projected onto curved
   * glass feel like it is being touched rather than watched.
   *
   * The same pointer stream is normalised and pushed onto the telemetry bus,
   * where it drives the physical mouse sliding around the mousepad out in the
   * 3D room.
   */
  private bindPointer() {
    const halo = el('div', 'cursor-halo');
    this.root.append(halo);

    let targetX = 0;
    let targetY = 0;

    // The halo sits inside the CSS3D layer, so every transform written to it
    // re-rasters the whole projected surface. Driving it from the springs'
    // own updates rather than a standing ticker means it writes only while it
    // is actually moving, and goes completely silent when the pointer stops.
    const write = () => {
      halo.style.transform = `translate3d(${haloX.value.toFixed(1)}px, ${haloY.value.toFixed(1)}px, 0)`;
      // It trails the pointer; brighten it the further behind it has fallen.
      const lag = Math.hypot(targetX - haloX.value, targetY - haloY.value);
      halo.style.opacity = String(Math.min(0.16 + lag * 0.02, 0.5));
    };

    const haloX = new Spring(0, { ...SPRING.pointer, onUpdate: write });
    const haloY = new Spring(0, { ...SPRING.pointer, onUpdate: write });

    this.root.addEventListener('pointermove', (event) => {
      const point = this.localPoint(event);
      targetX = point.x;
      targetY = point.y;
      haloX.to(point.x);
      haloY.to(point.y);

      const width = this.root.offsetWidth || 1280;
      const height = this.root.offsetHeight || 960;
      telemetry.setCursor(
        Math.min(Math.max(point.x / width, 0), 1),
        Math.min(Math.max(point.y / height, 0), 1),
      );
    });

    this.root.addEventListener('pointerdown', (event) => {
      const point = this.localPoint(event);
      this.ripple(point.x, point.y);
      // Snap the halo to the press: a lagging light under a click reads wrong.
      targetX = point.x;
      targetY = point.y;
      haloX.set(point.x);
      haloY.set(point.y);
      halo.classList.add('is-pressed');
      window.setTimeout(() => halo.classList.remove('is-pressed'), 180);
    });

    this.stopMotion.push(() => {
      haloX.cancel();
      haloY.cancel();
      halo.remove();
    });
  }

  /** A single expanding ring, removed as soon as it has finished. */
  private ripple(x: number, y: number) {
    const ring = el('div', 'ripple');
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    this.root.append(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  /** Where the taskbar button for `id` sits, in the screen's own coordinates. */
  private taskbarAnchor(id: string) {
    const button = this.taskbarApps.querySelector(`[data-app="${id}"]`) as HTMLElement | null;
    if (!button) return null;

    const screen = this.root.getBoundingClientRect();
    const scale = screen.width / (this.root.offsetWidth || 1) || 1;
    const box = button.getBoundingClientRect();

    return {
      x: (box.left + box.width / 2 - screen.left) / scale,
      y: (box.top + box.height / 2 - screen.top) / scale,
    };
  }

  /** Screen-space coordinates for a pointer event, undoing the CSS3D scale. */
  private localPoint(event: MouseEvent) {
    const box = this.root.getBoundingClientRect();
    const scale = box.width / (this.root.offsetWidth || 1) || 1;
    return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
  }

  /* ---------------------------------------------------------------------- */
  /* Standby                                                                 */
  /* ---------------------------------------------------------------------- */

  private buildStandby() {
    const layer = el('div', 'layer layer--standby is-visible');

    // The face before the name, the way a login screen does it. Faded in on
    // load so a slow decode shows nothing rather than an empty disc.
    const photo = el('img', 'standby__photo');
    photo.src = profile.photo;
    photo.alt = profile.name;
    photo.decoding = 'async';
    photo.addEventListener('load', () => photo.classList.add('is-ready'));
    if (photo.complete) photo.classList.add('is-ready');
    layer.append(photo);

    layer.append(el('h1', 'standby__name', profile.name));
    layer.append(el('p', 'standby__role', profile.role));

    const hint = el('p', 'standby__hint');
    hint.innerHTML = 'PRESS ANY KEY TO BOOT<span class="caret"></span>';
    layer.append(hint);

    // The room boots the machine when the camera arrives, but after a shutdown
    // the camera is already here — so standby has to answer for itself.
    layer.addEventListener('pointerdown', () => this.powerOn());

    return layer;
  }

  /* ---------------------------------------------------------------------- */
  /* Desktop icons                                                           */
  /* ---------------------------------------------------------------------- */

  private renderIcons() {
    this.iconGrid.replaceChildren();

    for (const node of fs.list(DESKTOP_DIR)) {
      const path = join(DESKTOP_DIR, node.name);

      const button = el('button', 'icon');
      button.type = 'button';
      button.dataset.app = node.appId ?? '';
      button.dataset.path = path;
      button.classList.toggle('is-selected', this.selected === path);

      const glyph = el('span', 'icon__glyph');
      glyph.innerHTML = node.appId
        ? appsById.get(node.appId)?.icon ?? fileIcon(node)
        : fileIcon(node);

      button.append(glyph, el('span', 'icon__label', node.name));

      button.addEventListener('click', () => {
        this.selected = path;
        this.renderIcons();
      });

      // Double-click on a desktop, single tap on touch.
      button.addEventListener('dblclick', () => this.launch(path));
      button.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'touch') this.launch(path);
      });

      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.selected = path;
        this.renderIcons();
        const point = this.localPoint(event);
        this.iconMenu(path, point.x, point.y);
      });

      this.iconGrid.append(button);
    }
  }

  private launch(path: string) {
    this.audio.click();
    this.closeMenus();
    openPath(path);
  }

  private iconMenu(path: string, x: number, y: number) {
    const node = fs.get(path);
    if (!node) return;

    openContextMenu(this.root, x, y, [
      { label: 'Open', action: () => this.launch(path) },
      { separator: true },
      {
        label: 'Rename',
        icon: MENU_ICONS.rename,
        disabled: node.system,
        action: () =>
          askForName(this.root, 'Rename', node.name, (value) => {
            if (!fs.rename(path, value)) notify('Could not rename', 'That name is taken.');
          }),
      },
      {
        label: 'Delete',
        icon: MENU_ICONS.trash,
        disabled: node.system,
        action: () =>
          confirmAction(this.root, 'Delete', 'Delete "' + node.name + '"?', () => {
            if (fs.remove(path)) notify('Deleted', node.name);
          }),
      },
    ]);
  }

  private bindDesktop() {
    this.bindOverview();

    this.desktop.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.start-menu') && !target.closest('.menubar__apple')) {
        this.startMenu.classList.remove('is-open');
      }
      if (!target.closest('.calendar') && !target.closest('.menubar__clock')) {
        this.calendar.classList.remove('is-open');
      }
      if (!target.closest('.mbmenu') && !target.closest('.menubar__menu')) {
        this.menuBar?.close();
      }
      if (target === this.desktop || target === this.iconGrid) {
        this.selected = null;
        this.renderIcons();
      }
    });

    this.desktop.addEventListener('contextmenu', (event) => {
      const target = event.target as HTMLElement;
      // Windows and icons carry their own menus.
      if (target.closest('.win') || target.closest('.icon')) return;
      event.preventDefault();

      const point = this.localPoint(event);
      openContextMenu(this.root, point.x, point.y, [
        {
          label: 'New folder',
          icon: MENU_ICONS.newFolder,
          action: () =>
            askForName(this.root, 'New folder', fs.uniqueName(DESKTOP_DIR, 'New folder'), (value) => {
              if (!fs.mkdir(join(DESKTOP_DIR, value))) notify('Could not create folder');
            }),
        },
        {
          label: 'New text file',
          icon: MENU_ICONS.newFile,
          action: () =>
            askForName(
              this.root,
              'New file',
              fs.uniqueName(DESKTOP_DIR, 'Untitled', '.txt'),
              (value) => {
                if (!fs.write(join(DESKTOP_DIR, value), '')) notify('Could not create file');
              },
            ),
        },
        { separator: true },
        { label: 'Refresh', icon: MENU_ICONS.refresh, action: () => this.renderIcons() },
        {
          label: 'Display settings',
          icon: icons.settings,
          action: () => this.manager.open(appsById.get('settings')!),
        },
      ]);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Start menu                                                              */
  /* ---------------------------------------------------------------------- */

  private buildStartMenu() {
    const menu = el('nav', 'start-menu');

    const head = el('div', 'start-menu__head');

    const face = el('img', 'start-menu__photo');
    face.src = profile.photo;
    face.alt = '';
    face.decoding = 'async';

    const who = el('div', 'start-menu__who');
    who.append(el('span', 'start-menu__name', profile.name));
    who.append(el('span', 'start-menu__role', profile.role));

    head.append(face, who);
    menu.append(head);

    const searchRow = el('div', 'start-menu__search');
    const glyph = el('span', 'start-menu__search-icon');
    glyph.innerHTML = MENU_ICONS.search;

    const search = el('input', 'start-menu__input');
    search.type = 'text';
    search.placeholder = 'Search apps and files';
    search.spellcheck = false;

    searchRow.append(glyph, search);
    menu.append(searchRow);

    const list = el('div', 'start-menu__list');
    menu.append(list);

    const closeAll = el('button', 'start-menu__item start-menu__item--power');
    closeAll.type = 'button';
    closeAll.innerHTML = '<span class="start-menu__icon">' + MENU_ICONS.close + '</span>';
    closeAll.append(document.createTextNode('Close all windows'));
    closeAll.addEventListener('click', () => {
      this.audio.click();
      this.startMenu.classList.remove('is-open');
      this.manager.closeAll();
    });
    menu.append(closeAll);

    const power = el('button', 'start-menu__item start-menu__item--power');
    power.type = 'button';
    power.innerHTML = '<span class="start-menu__icon">' + MENU_ICONS.power + '</span>';
    power.append(document.createTextNode('Shut down'));
    power.addEventListener('click', () => {
      this.audio.click();
      this.startMenu.classList.remove('is-open');
      this.shutDown();
    });
    menu.append(power);

    search.addEventListener('input', () => this.renderStartList());
    search.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        menu.classList.remove('is-open');
        return;
      }
      if (event.key === 'Enter') {
        (list.querySelector('.start-menu__item') as HTMLButtonElement | null)?.click();
      }
    });

    return { menu, list, search };
  }

  private renderStartList() {
    const query = this.search.value.trim().toLowerCase();
    this.startList.replaceChildren();

    const matched = query ? apps.filter((app) => app.title.toLowerCase().includes(query)) : apps;

    for (const app of matched) {
      const item = el('button', 'start-menu__item');
      item.type = 'button';
      item.innerHTML = '<span class="start-menu__icon">' + app.icon + '</span>';
      item.append(document.createTextNode(app.title));
      item.addEventListener('click', () => {
        this.audio.click();
        this.startMenu.classList.remove('is-open');
        this.manager.open(app);
      });
      this.startList.append(item);
    }

    if (!query) return;

    // Files matching the query, listed below the apps.
    const files = fs.find(query, HOME).slice(0, 8);
    if (files.length) this.startList.append(el('div', 'start-menu__label', 'Files'));

    for (const path of files) {
      const node = fs.get(path);
      if (!node) continue;

      const item = el('button', 'start-menu__item');
      item.type = 'button';
      item.innerHTML = '<span class="start-menu__icon">' + fileIcon(node) + '</span>';
      item.append(document.createTextNode(basename(path)));
      item.title = path;
      item.addEventListener('click', () => {
        this.startMenu.classList.remove('is-open');
        this.launch(path);
      });
      this.startList.append(item);
    }

    if (!matched.length && !files.length) {
      this.startList.append(el('p', 'start-menu__empty', 'Nothing matches "' + query + '".'));
    }
  }

  private toggleStart() {
    const open = this.startMenu.classList.toggle('is-open');
    this.calendar.classList.remove('is-open');
    if (open) {
      this.search.value = '';
      this.renderStartList();
      window.setTimeout(() => this.search.focus(), 60);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Taskbar                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * The menu bar and the dock.
   *
   * The menu bar carries the focused app's name, because on this desktop —
   * like the one it is imitating — the window that has focus owns the strip at
   * the top of the screen. The dock is a fixed shelf of favourites plus
   * whatever else happens to be running.
   */
  private buildTaskbar() {
    const menubar = el('header', 'menubar');

    const apple = el('button', 'menubar__apple');
    apple.type = 'button';
    apple.title = 'Menu';
    apple.innerHTML = MENU_ICONS.apple;
    apple.addEventListener('click', (event) => {
      event.stopPropagation();
      this.audio.click();
      this.toggleStart();
    });

    this.menuBar = new MenuBar(
      this.desktop,
      this.barMenus(),
      () => {
        this.startMenu.classList.remove('is-open');
        this.calendar.classList.remove('is-open');
        closeContextMenu();
      },
      () => this.audio.click(),
    );

    const tray = el('div', 'menubar__tray');

    const sound = el('button', 'menubar__item menubar__item--sound');
    sound.type = 'button';
    sound.title = 'Sound';
    sound.innerHTML = MENU_ICONS.sound;
    sound.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.toggleMute();
    });
    this.audio.setOnChange((muted) => sound.classList.toggle('is-off', muted));

    const spot = el('button', 'menubar__item menubar__item--spot');
    spot.type = 'button';
    spot.title = 'Spotlight (⌘K)';
    spot.innerHTML = MENU_ICONS.search;
    spot.addEventListener('click', (event) => {
      event.stopPropagation();
      this.audio.click();
      this.closeMenus();
      this.spotlight.open();
    });

    const overview = el('button', 'menubar__item menubar__item--overview');
    overview.type = 'button';
    overview.title = 'Mission Control (F3)';
    overview.innerHTML = MENU_ICONS.overview;
    overview.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMissionControl();
    });

    // The view switcher: step out to the room without leaving the desktop.
    this.viewButton = el('button', 'menubar__item taskbar__view');
    this.viewButton.type = 'button';
    this.viewButton.title = 'Camera view';
    this.viewButton.innerHTML = MENU_ICONS.view;
    this.viewButton.addEventListener('click', () => {
      this.audio.click();
      // Screen → workstation → room → screen.
      const next = this.view === 'screen' ? 'workstation' : this.view === 'workstation' ? 'room' : 'screen';
      setRoomView(next);
    });

    const clock = el('button', 'menubar__clock');
    clock.type = 'button';
    clock.addEventListener('click', (event) => {
      event.stopPropagation();
      this.audio.click();
      this.startMenu.classList.remove('is-open');
      this.renderCalendar();
      this.calendar.classList.toggle('is-open');
    });

    const recentre = el('button', 'menubar__item menubar__item--reset');
    recentre.type = 'button';
    recentre.title = 'Reset view';
    recentre.innerHTML = MENU_ICONS.refresh;
    recentre.addEventListener('click', () => {
      this.audio.click();
      resetCameraView();
    });

    const expand = el('button', 'menubar__item menubar__item--full');
    expand.type = 'button';
    expand.title = 'Fullscreen';
    expand.innerHTML = MENU_ICONS.expand;
    expand.addEventListener('click', () => {
      this.audio.click();
      toggleFullscreen();
    });

    tray.append(spot, overview, this.viewButton, recentre, expand, sound, clock);
    menubar.append(apple, this.menuBar.element, tray);

    /* --- Dock ----------------------------------------------------------- */

    const dock = el('footer', 'dock');
    const appsHost = el('div', 'dock__apps');
    dock.append(appsHost);

    this.bindDockMagnification(dock, appsHost);

    const calendar = el('div', 'calendar');

    return { taskbar: dock, menubar, appsHost, clock, calendar };
  }

  /**
   * Dock magnification.
   *
   * Icons swell with their distance from the cursor. The listener only writes
   * while the pointer is actually over the dock — inside the CSS3D projection
   * every changed pixel re-rasters the whole screen, so a permanent ticker
   * here would cost more than the effect is worth.
   */
  private bindDockMagnification(dock: HTMLElement, host: HTMLElement) {
    const LIFT = 0.55;

    const apply = (clientX: number | null) => {
      const icons = Array.from(host.children) as HTMLElement[];
      if (!icons.length) return;

      if (clientX === null) {
        for (const icon of icons) {
          icon.style.removeProperty('--mag');
          icon.style.removeProperty('--push');
        }
        return;
      }

      // Reach is measured in icons, not pixels. The desktop is projected onto
      // the monitor through a 3D transform, so its on-screen scale changes
      // with the camera — a fixed pixel radius would cover the whole dock from
      // the room and barely one icon up close.
      const width = icons[0].getBoundingClientRect().width || 46;
      const reach = width * 2.4;

      const scales = icons.map((icon) => {
        const box = icon.getBoundingClientRect();
        // The layout centre, not the rendered one: reading back a position
        // this pass has already displaced would chase its own tail.
        const centre = box.left + box.width / 2 - (parseFloat(icon.style.getPropertyValue('--push')) || 0);
        const distance = Math.abs(clientX - centre);
        const falloff = Math.max(0, 1 - distance / reach);
        // Cosine easing, so the bulge has shoulders rather than a spike.
        return 1 + LIFT * (0.5 - Math.cos(falloff * Math.PI) / 2);
      });

      // Icons shove their neighbours aside rather than growing over them,
      // which is the part that reads as a dock. Each one moves by however much
      // everything between it and the left edge has swollen, and the whole run
      // is then pulled back by half the total so the dock stays centred.
      const extra = scales.map((scale) => (scale - 1) * width);
      const total = extra.reduce((sum, value) => sum + value, 0);

      let before = 0;
      icons.forEach((icon, index) => {
        const push = before + extra[index] / 2 - total / 2;
        before += extra[index];
        icon.style.setProperty('--mag', scales[index].toFixed(3));
        icon.style.setProperty('--push', push.toFixed(2) + 'px');
      });
    };

    dock.addEventListener('pointermove', (event) => apply(event.clientX));
    dock.addEventListener('pointerleave', () => apply(null));
  }

  /* ---------------------------------------------------------------------- */
  /* Menu bar menus                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * The field Edit ▸ Copy should act on.
   *
   * The menu bar deliberately refuses focus, so whatever was being typed into
   * is still the active element by the time an item is clicked. Anything that
   * is not a text field means the whole Edit menu greys out, the way it does
   * when nothing is editable.
   */
  private editTarget(): HTMLInputElement | HTMLTextAreaElement | null {
    const node = document.activeElement;
    if (node instanceof HTMLTextAreaElement) return node;
    if (node instanceof HTMLInputElement && /^(text|search|url|email|password|tel)$/.test(node.type)) {
      return node;
    }
    return null;
  }

  private openApp(id: string) {
    const app = appsById.get(id);
    if (app) this.manager.open(app);
  }

  private barMenus(): BarMenu[] {
    const frontmost = () => this.manager.focusedApp();
    const openById = (id: string) => this.openApp(id);

    /** execCommand is the only route to a field's own undo stack. */
    const edit = (command: string) => () => {
      const field = this.editTarget();
      if (!field) return;
      field.focus();
      document.execCommand(command);
    };

    return [
      {
        title: () => frontmost()?.title ?? 'Finder',
        bold: true,
        items: () => {
          const app = frontmost();
          return [
            { label: 'About ' + (app?.title ?? 'This Computer'), action: () => openById('credits') },
            { label: 'Settings…', shortcut: '⌘,', action: () => openById('settings') },
            { separator: true },
            {
              label: 'Hide ' + (app?.title ?? 'Finder'),
              shortcut: '⌘H',
              disabled: !app,
              action: () => app && this.manager.minimise(app.id),
            },
            {
              label: 'Hide Others',
              shortcut: '⌥⌘H',
              disabled: this.manager.running.length < 2,
              action: () => this.hideOthers(),
            },
            { separator: true },
            {
              label: 'Quit ' + (app?.title ?? 'Finder'),
              shortcut: '⌘Q',
              disabled: !app,
              action: () => app && this.manager.close(app.id),
            },
          ];
        },
      },
      {
        title: () => 'File',
        items: () => [
          { label: 'New Finder Window', shortcut: '⌘N', action: () => openById('explorer') },
          {
            label: 'New Folder',
            shortcut: '⇧⌘N',
            action: () =>
              askForName(this.root, 'New folder', 'untitled folder', (value) => {
                if (!fs.mkdir(join(DESKTOP_DIR, value))) {
                  notify('Could not create', 'Something already has that name.');
                }
              }),
          },
          { separator: true },
          {
            label: 'Close Window',
            shortcut: '⌘W',
            disabled: !frontmost(),
            action: () => {
              const id = this.manager.focusedId;
              if (id) this.manager.close(id);
            },
          },
          {
            label: 'Close All Windows',
            shortcut: '⌥⌘W',
            disabled: !this.manager.running.length,
            action: () => this.manager.closeAll(),
          },
        ],
      },
      {
        title: () => 'Edit',
        items: () => {
          const field = this.editTarget();
          const selected = Boolean(
            field && field.selectionStart !== field.selectionEnd,
          );
          return [
            { label: 'Undo', shortcut: '⌘Z', disabled: !field, action: edit('undo') },
            { label: 'Redo', shortcut: '⇧⌘Z', disabled: !field, action: edit('redo') },
            { separator: true },
            { label: 'Cut', shortcut: '⌘X', disabled: !selected, action: edit('cut') },
            { label: 'Copy', shortcut: '⌘C', disabled: !selected, action: edit('copy') },
            { label: 'Paste', shortcut: '⌘V', disabled: !field, action: () => this.paste() },
            { separator: true },
            {
              label: 'Select All',
              shortcut: '⌘A',
              disabled: !field,
              action: () => {
                field?.focus();
                field?.select();
              },
            },
          ];
        },
      },
      {
        title: () => 'View',
        items: () => [
          {
            label: 'Screen',
            checked: this.view === 'screen',
            action: () => setRoomView('screen'),
          },
          {
            label: 'Workstation',
            checked: this.view === 'workstation',
            action: () => setRoomView('workstation'),
          },
          { label: 'Room', checked: this.view === 'room', action: () => setRoomView('room') },
          { separator: true },
          { label: 'Reset Camera', shortcut: '⌘0', action: () => resetCameraView() },
          { label: 'Toggle Full Screen', shortcut: '⌃⌘F', action: () => toggleFullscreen() },
        ],
      },
      {
        title: () => 'Window',
        items: () => {
          const id = this.manager.focusedId;
          const items: BarItem[] = [
            {
              label: 'Minimise',
              shortcut: '⌘M',
              disabled: !id,
              action: () => id && this.manager.minimise(id),
            },
            {
              label: 'Zoom',
              disabled: !id,
              action: () => id && this.manager.toggleMaximise(id),
            },
            {
              label: 'Mission Control',
              shortcut: 'F3',
              disabled: !this.manager.running.length,
              action: () => this.toggleMissionControl(),
            },
            { separator: true },
            {
              label: 'Move Left',
              shortcut: '⌥←',
              disabled: !id,
              action: () => id && this.manager.snap(id, 'left'),
            },
            {
              label: 'Move Right',
              shortcut: '⌥→',
              disabled: !id,
              action: () => id && this.manager.snap(id, 'right'),
            },
          ];

          // Everything running, so a buried window can be brought forward.
          const running = this.manager.running;
          if (running.length) {
            items.push({ separator: true });
            for (const entry of running) {
              const app = appsById.get(entry);
              if (!app) continue;
              items.push({
                label: app.title,
                checked: entry === id,
                action: () => this.manager.toggle(app),
              });
            }
          }

          return items;
        },
      },
    ];
  }

  /**
   * Mission Control: every window tiled out at once.
   *
   * Clicking a tile picks that window and drops back; clicking past them just
   * drops back. Both go through the capture handler below, so the click never
   * reaches the app inside the tile.
   */
  private toggleMissionControl(on?: boolean) {
    this.closeMenus();
    this.audio.click();
    return this.manager.toggleMissionControl(on ?? !this.manager.inOverview);
  }

  private bindOverview() {
    this.desktop.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.manager.inOverview) return;
        event.preventDefault();
        event.stopPropagation();

        const tile = (event.target as HTMLElement).closest('.win') as HTMLElement | null;
        this.manager.toggleMissionControl(false);
        if (tile?.dataset.app) this.manager.focus(tile.dataset.app);
      },
      true,
    );
  }

  /** Everything except the frontmost window, out of the way. */
  private hideOthers() {
    const keep = this.manager.focusedId;
    for (const id of this.manager.running) {
      if (id !== keep) this.manager.minimise(id);
    }
  }

  /**
   * Paste has no execCommand route left — browsers block it — so it goes
   * through the clipboard API, which can be refused. Say so rather than
   * failing silently.
   */
  private paste() {
    const field = this.editTarget();
    if (!field) return;

    navigator.clipboard
      ?.readText()
      .then((text) => {
        if (!text) return;
        field.focus();
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        field.value = field.value.slice(0, start) + text + field.value.slice(end);
        const caret = start + text.length;
        field.setSelectionRange(caret, caret);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      })
      .catch(() => notify('Paste blocked', 'The browser would not hand over the clipboard.'));
  }

  /**
   * Reconciles the dock rather than rebuilding it.
   *
   * This runs on every focus change, and the dock lives inside the CSS3D
   * projection — replacing eleven buttons each time re-rasters the whole
   * screen for what is usually a single class flip. Reusing the nodes also
   * lets a launch animation survive the sync that follows the click.
   */
  private syncTaskbar() {
    const focused = this.manager.focusedId;
    // The system monitor's process table reads this off the screen root.
    this.root.dataset.running = this.manager.running.join(',');

    if (this.menuBar) {
      this.menuBar.refresh();
    }

    // Favourites always sit in the dock; anything else joins while it runs.
    const shown = apps.filter(
      (app) => DOCK_APPS.includes(app.id) || this.manager.isOpen(app.id),
    );
    const wanted = new Set(shown.map((app) => app.id));

    for (const [id, node] of this.dockButtons) {
      if (wanted.has(id)) continue;
      node.remove();
      this.dockButtons.delete(id);
    }

    shown.forEach((app, index) => {
      let button = this.dockButtons.get(app.id);

      if (!button) {
        const created = el('button', 'dock__app');
        created.type = 'button';
        created.dataset.app = app.id;
        created.title = app.title;
        created.innerHTML =
          '<span class="dock__icon">' + app.icon + '</span>' +
          '<span class="dock__label">' + app.title + '</span>' +
          '<span class="dock__dot"></span>';

        created.addEventListener('click', () => {
          this.audio.click();
          if (this.manager.isOpen(app.id)) {
            this.manager.toggle(app);
            return;
          }
          // Bounce while it launches, the way the dock being imitated does.
          // Removing the class and reading offsetWidth restarts the animation
          // when the same icon is clicked again.
          created.classList.remove('is-launching');
          void created.offsetWidth;
          created.classList.add('is-launching');
          this.manager.open(app);
        });

        created.addEventListener('animationend', () =>
          created.classList.remove('is-launching'),
        );

        this.dockButtons.set(app.id, created);
        button = created;
      }

      button.classList.toggle('is-active', focused === app.id);
      button.classList.toggle('is-open', this.manager.isOpen(app.id));
      button.classList.toggle('is-minimised', this.manager.isMinimised(app.id));

      // Keep DOM order matching the favourites order as running apps come and go.
      if (this.taskbarApps.children[index] !== button) {
        this.taskbarApps.insertBefore(button, this.taskbarApps.children[index] ?? null);
      }
    });
  }

  private tickClock = () => {
    this.clock.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !settings.state.clock24,
    });
  };

  private renderCalendar() {
    const now = new Date();
    this.calendar.replaceChildren();

    this.calendar.append(
      el('div', 'calendar__month', now.toLocaleDateString([], { month: 'long', year: 'numeric' })),
    );

    const grid = el('div', 'calendar__grid');
    for (const day of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      grid.append(el('span', 'calendar__dow', day));
    }

    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    // Monday-first offset.
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    for (let i = 0; i < offset; i += 1) grid.append(el('span', 'calendar__day is-blank'));
    for (let day = 1; day <= days; day += 1) {
      const cell = el('span', 'calendar__day', String(day));
      if (day === now.getDate()) cell.classList.add('is-today');
      grid.append(cell);
    }

    this.calendar.append(grid);
    this.calendar.append(
      el(
        'div',
        'calendar__full',
        now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }),
      ),
    );
  }

  private closeMenus() {
    closeContextMenu();
    this.menuBar?.close();
    this.spotlight?.close();
    this.startMenu.classList.remove('is-open');
    this.calendar.classList.remove('is-open');
  }

  /* ---------------------------------------------------------------------- */
  /* Shortcuts                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The shell's own keyboard shortcuts.
   *
   * Bound to the window in the capture phase, for two reasons. A handler on
   * the screen element only fires while something inside it holds focus,
   * which is not true when you are simply looking at the desktop. And several
   * apps stop propagation on every keydown to keep typing to themselves —
   * Wordle takes letters, the terminal takes everything — so a bubbling
   * handler goes silent the moment one of them is in front. Capture runs
   * before either of them.
   *
   * Some of these the browser keeps: ⌘W and ⌘Q never reach a page, and macOS
   * takes ⌘Space for its own Spotlight. Where that happens the browser wins
   * and this never runs, so binding them costs nothing and they work wherever
   * they are free. ⌘K is the one that is always available, and every shortcut
   * here also has a menu item behind it.
   */
  private bindShortcuts() {
    window.addEventListener(
      'keydown',
      (event) => {
        if (this.state !== 'desktop') return;

        const cmd = event.metaKey || event.ctrlKey;
        const id = this.manager.focusedId;
        const key = event.key.toLowerCase();

        if (event.key === 'Escape') {
          this.closeMenus();
          return;
        }

        // Mission Control, on both the Mac chord and the function key.
        if (event.key === 'F3' || (event.ctrlKey && event.key === 'ArrowUp')) {
          event.preventDefault();
          this.toggleMissionControl();
          return;
        }

        // Spotlight. Space is read off `code` so it fires on any layout.
        if (cmd && (event.code === 'Space' || key === 'k')) {
          event.preventDefault();
          this.closeMenus();
          this.spotlight.open();
          return;
        }

        // Alt+Tab predates the macOS dressing; ⌘` is the Mac spelling of it.
        if ((event.key === 'Tab' && event.altKey) || (cmd && event.key === '`')) {
          event.preventDefault();
          this.manager.cycle();
          return;
        }

        if (cmd && event.altKey) {
          if (key === 'w') {
            event.preventDefault();
            this.manager.closeAll();
            return;
          }
          if (key === 'h') {
            event.preventDefault();
            this.hideOthers();
            return;
          }
        }

        if (event.ctrlKey && event.metaKey && key === 'f') {
          event.preventDefault();
          toggleFullscreen();
          return;
        }

        if (cmd && !event.altKey) {
          if (key === ',') {
            event.preventDefault();
            this.openApp('settings');
            return;
          }
          if (key === 'n') {
            event.preventDefault();
            this.openApp('explorer');
            return;
          }
          if (key === '0') {
            event.preventDefault();
            resetCameraView();
            return;
          }

          // The rest need something in front to act on.
          if (!id) return;
          if (key === 'w' || key === 'q') {
            event.preventDefault();
            this.manager.close(id);
            return;
          }
          if (key === 'm' || key === 'h') {
            event.preventDefault();
            this.manager.minimise(id);
            return;
          }
        }

        // Snapping is unmodified enough to collide with a caret: ⌥← moves by
        // word in a text field, and that has to win.
        if (id && event.altKey && !cmd && !this.editTarget()) {
          if (event.key === 'ArrowLeft') return this.manager.snap(id, 'left');
          if (event.key === 'ArrowRight') return this.manager.snap(id, 'right');
          if (event.key === 'ArrowUp') return this.manager.snap(id, 'top');
        }
      },
      true,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Wake straight to the desktop.
   *
   * There used to be a POST here — a BIOS banner, a ticking memory count, IDE
   * detection — which reads well once and then costs three seconds on every
   * visit after that. The CRT's switch-on flash stays, because that is the
   * machine coming to life rather than something to sit through.
   */
  powerOn() {
    if (this.state !== 'standby') return;
    this.state = 'booting';

    this.standby.classList.remove('is-visible');
    this.brightness = 0.55;
    this.audio.degauss();
    this.root.classList.add('is-switching');

    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.remove('is-switching');
        this.desktop.classList.add('is-visible');
        this.state = 'desktop';
        this.brightness = 1;
        this.audio.chime();

        this.tickClock();
        this.clockTimer = window.setInterval(this.tickClock, 15000);
        telemetry.setPowered(true);

        // Open with something to read rather than a bare desktop.
        this.manager.open(appsById.get('showcase')!);
        notify('Welcome', 'Right-click the desktop, or open the Terminal.');
      }, 280),
    );
  }

  /**
   * Shut the machine down: play the halt log, then drop back to standby, where
   * any key boots it again. The boot layer is reused for the log — it is the
   * same teletype surface, and a halt reads like a boot in reverse.
   */
  shutDown() {
    if (this.state !== 'desktop') return;
    this.state = 'halting';

    this.closeMenus();
    this.manager.closeAll();
    this.audio.degauss();

    this.root.classList.add('is-switching');

    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.remove('is-switching');
        this.desktop.classList.remove('is-visible');
        this.boot.classList.add('is-visible');
        this.boot.replaceChildren();
        this.brightness = 0.55;
      }, 260),
    );

    let elapsed = 320;
    for (const entry of SHUTDOWN_LINES) {
      elapsed += entry.delay;
      this.timers.push(
        window.setTimeout(() => {
          const line = el('div', 'boot__line' + (entry.className ? ' ' + entry.className : ''));
          line.textContent = entry.text === '' ? ' ' : entry.text;
          this.boot.append(line);
          this.boot.scrollTop = this.boot.scrollHeight;
        }, elapsed),
      );
    }

    this.timers.push(
      window.setTimeout(() => this.root.classList.add('is-switching'), elapsed + 520),
    );

    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.remove('is-switching');
        this.boot.classList.remove('is-visible');
        this.standby.classList.add('is-visible');
        this.state = 'standby';
        this.brightness = 0.18;

        window.clearInterval(this.clockTimer);
        telemetry.setPowered(false);
      }, elapsed + 720),
    );
  }


  setInteractive(interactive: boolean) {
    this.root.classList.toggle('is-interactive', interactive);
    if (!interactive) this.closeMenus();
  }

  /** Told by the experience whenever the room camera lands somewhere new. */
  setView(view: 'room' | 'workstation' | 'screen') {
    this.view = view;
    this.root.dataset.view = view;
    if (this.viewButton) {
      this.viewButton.classList.toggle('is-wide', view !== 'screen');
      this.viewButton.title =
        view === 'screen'
          ? 'Step back to the workstation'
          : view === 'workstation'
            ? 'Step back to the room'
            : 'Back to the screen';
    }
  }

  /**
   * Fullscreen mode for phones: the screen stops being a fixed 1280x960 surface
   * projected onto glass and becomes a normal viewport-sized element, so text
   * renders at true 1:1 pixels instead of being scaled into a stamp.
   */
  setOverlay(on: boolean) {
    this.root.classList.toggle('is-overlay', on);
    // The screen's coordinate box just changed size; the windows in it have
    // to be re-fitted or they are clipped by the new surface.
    requestAnimationFrame(() => this.manager.relayout());
  }

  destroy() {
    for (const timer of this.timers) window.clearTimeout(timer);
    window.clearInterval(this.clockTimer);
    for (const stop of this.stopMotion) stop();
    this.stopMotion = [];
    telemetry.setPowered(false);
  }
}

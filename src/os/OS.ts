import type { Audio } from '../experience/Audio';
import type { Sizes } from '../experience/Sizes';
import { profile } from '../data/cv';
import { telemetry } from '../world/telemetry';
import { SPRING, Spring } from './anim';
import { apps, appsById, icons } from './apps';
import { fileIcon } from './apps/Explorer';
import { closeContextMenu, openContextMenu } from './ContextMenu';
import { basename, fs, HOME, join } from './fs';
import { mountNotifications, notify } from './Notifications';
import { settings } from './settings';
import { openPath, registerSystem, setRoomView } from './system';
import { setTerminalKeySound } from './Terminal';
import { askForName, confirmAction, el, svg } from './ui';
import { WindowManager } from './WindowManager';

export type OSState = 'standby' | 'booting' | 'desktop' | 'halting';

interface BootLine {
  text: string;
  delay: number;
  className?: string;
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
  { text: 'Mounting /home/shrey ... OK', delay: 170 },
  { text: 'Starting shrey-os 1.0 ...', delay: 220, className: 'boot__line--accent' },
];

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
};

const DESKTOP_DIR = join(HOME, 'Desktop');

/** Pinned to the dock whether or not they are running, in this order. */
const DOCK_APPS = [
  'showcase',
  'search',
  'browser',
  'music',
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

  private selected: string | null = null;
  private timers: number[] = [];
  private clockTimer = 0;
  private ramTimer = 0;
  private stopMotion: Array<() => void> = [];
  /** Which room camera the shell believes it is being viewed from. */
  private view: 'room' | 'workstation' | 'screen' = 'screen';
  private viewButton!: HTMLButtonElement;
  private appName!: HTMLElement;

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

    this.manager = new WindowManager(this.windowLayer, this.root, () => this.audio.click());
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
    this.desktop.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.start-menu') && !target.closest('.menubar__apple')) {
        this.startMenu.classList.remove('is-open');
      }
      if (!target.closest('.calendar') && !target.closest('.menubar__clock')) {
        this.calendar.classList.remove('is-open');
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
    head.append(el('span', 'start-menu__name', profile.name));
    head.append(el('span', 'start-menu__role', profile.role));
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

    this.appName = el('span', 'menubar__app', 'Finder');

    const menus = el('div', 'menubar__menus');
    for (const label of ['File', 'Edit', 'View', 'Window']) {
      menus.append(el('span', 'menubar__menu', label));
    }

    const tray = el('div', 'menubar__tray');

    const sound = el('button', 'menubar__item');
    sound.type = 'button';
    sound.title = 'Sound';
    sound.innerHTML = MENU_ICONS.sound;
    sound.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.toggleMute();
    });
    this.audio.setOnChange((muted) => sound.classList.toggle('is-off', muted));

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

    tray.append(this.viewButton, sound, clock);
    menubar.append(apple, this.appName, menus, tray);

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

      // Reach is measured in icons, not pixels. The desktop is projected onto
      // the monitor through a 3D transform, so its on-screen scale changes
      // with the camera — a fixed pixel radius would cover the whole dock from
      // the room and barely one icon up close.
      const reach = (icons[0]?.getBoundingClientRect().width || 46) * 2.4;

      for (const icon of icons) {
        if (clientX === null) {
          icon.style.removeProperty('--mag');
          continue;
        }
        const box = icon.getBoundingClientRect();
        const centre = box.left + box.width / 2;
        const distance = Math.abs(clientX - centre);
        const falloff = Math.max(0, 1 - distance / reach);
        // Cosine easing, so the bulge has shoulders rather than a spike.
        const scale = 1 + LIFT * (0.5 - Math.cos(falloff * Math.PI) / 2);
        icon.style.setProperty('--mag', scale.toFixed(3));
      }
    };

    dock.addEventListener('pointermove', (event) => apply(event.clientX));
    dock.addEventListener('pointerleave', () => apply(null));
  }

  private syncTaskbar() {
    this.taskbarApps.replaceChildren();
    const focused = this.manager.focusedId;
    // The system monitor's process table reads this off the screen root.
    this.root.dataset.running = this.manager.running.join(',');

    if (this.appName) {
      this.appName.textContent = focused ? appsById.get(focused)?.title ?? 'Finder' : 'Finder';
    }

    // Favourites always sit in the dock; anything else joins while it runs.
    const shown = apps.filter(
      (app) => DOCK_APPS.includes(app.id) || this.manager.isOpen(app.id),
    );

    for (const app of shown) {
      const open = this.manager.isOpen(app.id);

      const button = el('button', 'dock__app');
      button.type = 'button';
      button.dataset.app = app.id;
      button.title = app.title;
      button.classList.toggle('is-active', focused === app.id);
      button.classList.toggle('is-open', open);
      button.classList.toggle('is-minimised', this.manager.isMinimised(app.id));
      button.innerHTML =
        '<span class="dock__icon">' + app.icon + '</span>' +
        '<span class="dock__label">' + app.title + '</span>' +
        '<span class="dock__dot"></span>';

      button.addEventListener('click', () => {
        this.audio.click();
        if (open) this.manager.toggle(app);
        else this.manager.open(app);
      });

      this.taskbarApps.append(button);
    }
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
    this.startMenu.classList.remove('is-open');
    this.calendar.classList.remove('is-open');
  }

  /* ---------------------------------------------------------------------- */
  /* Shortcuts                                                               */
  /* ---------------------------------------------------------------------- */

  private bindShortcuts() {
    this.root.addEventListener('keydown', (event) => {
      if (this.state === 'standby') {
        this.powerOn();
        return;
      }

      if (this.state !== 'desktop') return;
      const focused = this.manager.focusedId;

      if (event.key === 'Tab' && event.altKey) {
        event.preventDefault();
        this.manager.cycle();
        return;
      }

      if (event.key.toLowerCase() === 'w' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (focused) this.manager.close(focused);
        return;
      }

      if (event.key === 'Escape') {
        this.closeMenus();
        return;
      }

      if (focused && event.altKey) {
        if (event.key === 'ArrowLeft') return this.manager.snap(focused, 'left');
        if (event.key === 'ArrowRight') return this.manager.snap(focused, 'right');
        if (event.key === 'ArrowUp') return this.manager.snap(focused, 'top');
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                               */
  /* ---------------------------------------------------------------------- */

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
          const line = el('div', 'boot__line' + (entry.className ? ' ' + entry.className : ''));
          line.textContent = entry.text === '' ? ' ' : entry.text;
          this.boot.append(line);
          if (entry.ram) this.countRam(line);
          this.boot.scrollTop = this.boot.scrollHeight;
        }, elapsed),
      );
    }

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
        telemetry.setPowered(true);

        // Open with something to read rather than a bare desktop.
        this.manager.open(appsById.get('showcase')!);
        notify('Welcome', 'Right-click the desktop, or open the Terminal.');
      }, elapsed + 620),
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

  /** The classic POST memory count, ticking up in place. */
  private countRam(line: HTMLElement) {
    let value = 0;
    this.ramTimer = window.setInterval(() => {
      value = Math.min(value + 4096, RAM_TOTAL);
      line.textContent = 'Memory Test : ' + value + 'K OK';
      if (value >= RAM_TOTAL) window.clearInterval(this.ramTimer);
    }, 45);
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
    window.clearInterval(this.ramTimer);
    for (const stop of this.stopMotion) stop();
    this.stopMotion = [];
    telemetry.setPowered(false);
  }
}

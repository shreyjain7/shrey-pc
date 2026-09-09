import { SCREEN_PX } from '../world/layout';

export interface AppDefinition {
  id: string;
  title: string;
  /** Inline SVG string used for the desktop icon, title bar and taskbar. */
  icon: string;
  width: number;
  height: number;
  render: () => HTMLElement;
}

interface ManagedWindow {
  app: AppDefinition;
  root: HTMLElement;
  minimised: boolean;
  maximised: boolean;
  /** Geometry remembered while maximised, so restore puts it back. */
  restore: { x: number; y: number; width: number; height: number } | null;
}

const TASKBAR_HEIGHT = 56;
const CASCADE_STEP = 34;

/**
 * A small floating-window manager living inside the CRT.
 *
 * Everything is positioned in the screen's own 1280x960 coordinate space. The
 * CSS3D layer scales that whole space down onto the glass, so drags have to be
 * divided by the live scale factor to track the pointer exactly.
 */
export class WindowManager {
  private windows = new Map<string, ManagedWindow>();
  private order: string[] = [];
  private cascade = 0;

  private onChange: () => void = () => {};

  constructor(
    private layer: HTMLElement,
    private screenRoot: HTMLElement,
  ) {}

  setOnChange(listener: () => void) {
    this.onChange = listener;
  }

  isOpen(id: string) {
    return this.windows.has(id);
  }

  isMinimised(id: string) {
    return this.windows.get(id)?.minimised ?? false;
  }

  get focusedId(): string | null {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const entry = this.windows.get(this.order[i]);
      if (entry && !entry.minimised) return entry.app.id;
    }
    return null;
  }

  /** Opens the app, or focuses/minimises it when it is already running. */
  toggle(app: AppDefinition) {
    const existing = this.windows.get(app.id);
    if (!existing) {
      this.open(app);
      return;
    }
    if (existing.minimised || this.focusedId !== app.id) {
      existing.minimised = false;
      existing.root.classList.remove('is-minimised');
      this.focus(app.id);
    } else {
      this.minimise(app.id);
    }
  }

  open(app: AppDefinition) {
    if (this.windows.has(app.id)) {
      const existing = this.windows.get(app.id)!;
      existing.minimised = false;
      existing.root.classList.remove('is-minimised');
      this.focus(app.id);
      return;
    }

    const width = Math.min(app.width, SCREEN_PX.width - 80);
    const height = Math.min(app.height, SCREEN_PX.height - TASKBAR_HEIGHT - 80);

    // Cascade down and right, wrapping before windows walk off the screen.
    const offset = (this.cascade % 5) * CASCADE_STEP;
    this.cascade += 1;
    const x = Math.round((SCREEN_PX.width - width) / 2 - 60 + offset);
    const y = Math.round((SCREEN_PX.height - TASKBAR_HEIGHT - height) / 2 - 40 + offset);

    const root = document.createElement('section');
    root.className = 'win';
    root.style.width = width + 'px';
    root.style.height = height + 'px';
    root.style.left = Math.max(16, x) + 'px';
    root.style.top = Math.max(16, y) + 'px';

    const bar = document.createElement('header');
    bar.className = 'win__bar';

    const icon = document.createElement('span');
    icon.className = 'win__icon';
    icon.innerHTML = app.icon;

    const title = document.createElement('span');
    title.className = 'win__title';
    title.textContent = app.title;

    const controls = document.createElement('div');
    controls.className = 'win__controls';
    controls.append(
      this.controlButton('minimise', 'Minimise', () => this.minimise(app.id)),
      this.controlButton('maximise', 'Maximise', () => this.toggleMaximise(app.id)),
      this.controlButton('close', 'Close', () => this.close(app.id)),
    );

    bar.append(icon, title, controls);

    const body = document.createElement('div');
    body.className = 'win__body';
    body.append(app.render());

    root.append(bar, body);
    this.layer.append(root);

    const entry: ManagedWindow = {
      app,
      root,
      minimised: false,
      maximised: false,
      restore: null,
    };
    this.windows.set(app.id, entry);
    this.order.push(app.id);

    root.addEventListener('pointerdown', () => this.focus(app.id));
    bar.addEventListener('dblclick', () => this.toggleMaximise(app.id));
    this.makeDraggable(entry, bar);

    // Let the opening animation start from a clean frame.
    requestAnimationFrame(() => root.classList.add('is-open'));

    this.focus(app.id);
  }

  private controlButton(kind: string, label: string, action: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'win__control win__control--' + kind;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      action();
    });
    return button;
  }

  /** CSS px on the glass per CSS px in the screen's own coordinate space. */
  private currentScale() {
    const rect = this.screenRoot.getBoundingClientRect();
    return rect.width > 0 ? rect.width / SCREEN_PX.width : 1;
  }

  private makeDraggable(entry: ManagedWindow, handle: HTMLElement) {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let scale = 1;

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || entry.maximised) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      originX = entry.root.offsetLeft;
      originY = entry.root.offsetTop;
      scale = this.currentScale();
      handle.setPointerCapture(event.pointerId);
      entry.root.classList.add('is-dragging');
    });

    handle.addEventListener('pointermove', (event) => {
      if (pointerId !== event.pointerId) return;
      const dx = (event.clientX - startX) / scale;
      const dy = (event.clientY - startY) / scale;

      const maxX = SCREEN_PX.width - 90;
      const maxY = SCREEN_PX.height - TASKBAR_HEIGHT - 44;
      // Always leave a grabbable sliver of title bar on screen.
      const x = Math.min(Math.max(originX + dx, 90 - entry.root.offsetWidth), maxX);
      const y = Math.min(Math.max(originY + dy, 0), maxY);

      entry.root.style.left = Math.round(x) + 'px';
      entry.root.style.top = Math.round(y) + 'px';
    });

    const end = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      handle.releasePointerCapture(event.pointerId);
      entry.root.classList.remove('is-dragging');
    };

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  focus(id: string) {
    if (!this.windows.has(id)) return;
    this.order = this.order.filter((entry) => entry !== id);
    this.order.push(id);

    this.order.forEach((entryId, index) => {
      const entry = this.windows.get(entryId);
      if (entry) entry.root.style.zIndex = String(10 + index);
    });

    const focused = this.focusedId;
    for (const entry of this.windows.values()) {
      entry.root.classList.toggle('is-focused', entry.app.id === focused);
    }

    this.onChange();
  }

  minimise(id: string) {
    const entry = this.windows.get(id);
    if (!entry) return;
    entry.minimised = true;
    entry.root.classList.add('is-minimised');
    entry.root.classList.remove('is-focused');

    const next = this.focusedId;
    if (next) this.focus(next);
    this.onChange();
  }

  toggleMaximise(id: string) {
    const entry = this.windows.get(id);
    if (!entry) return;

    if (entry.maximised && entry.restore) {
      const { x, y, width, height } = entry.restore;
      entry.root.style.left = x + 'px';
      entry.root.style.top = y + 'px';
      entry.root.style.width = width + 'px';
      entry.root.style.height = height + 'px';
      entry.maximised = false;
      entry.restore = null;
      entry.root.classList.remove('is-maximised');
    } else {
      entry.restore = {
        x: entry.root.offsetLeft,
        y: entry.root.offsetTop,
        width: entry.root.offsetWidth,
        height: entry.root.offsetHeight,
      };
      entry.root.style.left = '0px';
      entry.root.style.top = '0px';
      entry.root.style.width = SCREEN_PX.width + 'px';
      entry.root.style.height = SCREEN_PX.height - TASKBAR_HEIGHT + 'px';
      entry.maximised = true;
      entry.root.classList.add('is-maximised');
    }

    this.focus(id);
  }

  close(id: string) {
    const entry = this.windows.get(id);
    if (!entry) return;

    entry.root.classList.remove('is-open');
    entry.root.classList.add('is-closing');
    this.windows.delete(id);
    this.order = this.order.filter((entryId) => entryId !== id);

    window.setTimeout(() => entry.root.remove(), 180);

    const next = this.focusedId;
    if (next) this.focus(next);
    this.onChange();
  }

  closeAll() {
    for (const id of [...this.windows.keys()]) this.close(id);
    this.cascade = 0;
  }
}

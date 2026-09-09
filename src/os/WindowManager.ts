
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
  /** The app's own element, so it can be told when its window goes away. */
  content: HTMLElement;
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
  /** Narrow screens run one full-bleed window at a time. */
  private compact = false;

  constructor(
    private layer: HTMLElement,
    private screenRoot: HTMLElement,
    private onSound: () => void = () => {},
  ) {}

  setCompact(compact: boolean) {
    this.compact = compact;
  }

  /**
   * The screen's own coordinate box. Inside the CRT that is the fixed
   * 1280x960 surface; in the phone overlay it is the live viewport, so
   * windows lay out at true 1:1 pixels with no scaling to undo.
   */
  private get box() {
    return {
      width: this.screenRoot.offsetWidth || 1280,
      height: this.screenRoot.offsetHeight || 960,
    };
  }

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

    // On a phone a floating window is unusable: fill the screen instead.
    const box = this.box;
    const width = this.compact
      ? box.width - 24
      : Math.min(app.width, box.width - 80);
    const height = this.compact
      ? box.height - TASKBAR_HEIGHT - 24
      : Math.min(app.height, box.height - TASKBAR_HEIGHT - 80);

    // Cascade down and right, wrapping before windows walk off the screen.
    const offset = this.compact ? 0 : (this.cascade % 5) * CASCADE_STEP;
    this.cascade += 1;
    const x = this.compact
      ? 12
      : Math.round((box.width - width) / 2 - 60 + offset);
    const y = this.compact
      ? 12
      : Math.round((box.height - TASKBAR_HEIGHT - height) / 2 - 40 + offset);

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
    const content = app.render();
    body.append(content);

    // Eight grips: four edges and four corners.
    const grips = document.createElement('div');
    grips.className = 'win__grips';
    for (const side of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const grip = document.createElement('div');
      grip.className = 'win__grip win__grip--' + side;
      grip.dataset.side = side;
      grips.append(grip);
    }

    root.append(bar, body, grips);
    this.layer.append(root);

    const entry: ManagedWindow = {
      app,
      root,
      content,
      minimised: false,
      maximised: false,
      restore: null,
    };
    this.windows.set(app.id, entry);
    this.order.push(app.id);

    root.addEventListener('pointerdown', () => this.focus(app.id));
    bar.addEventListener('dblclick', () => this.toggleMaximise(app.id));
    this.makeDraggable(entry, bar);
    if (!this.compact) this.makeResizable(entry, grips);

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
      this.onSound();
      action();
    });
    return button;
  }

  /** CSS px on the glass per CSS px in the screen's own coordinate space. */
  private currentScale() {
    const rect = this.screenRoot.getBoundingClientRect();
    const width = this.screenRoot.offsetWidth || 1280;
    return rect.width > 0 ? rect.width / width : 1;
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

      const box = this.box;
      const maxX = box.width - 90;
      const maxY = box.height - TASKBAR_HEIGHT - 44;
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

  /** Drag a grip to resize, clamped to a usable minimum and the screen box. */
  private makeResizable(entry: ManagedWindow, grips: HTMLElement) {
    const MIN_W = 280;
    const MIN_H = 180;

    for (const grip of Array.from(grips.children) as HTMLElement[]) {
      let pointerId: number | null = null;
      let side = '';
      let startX = 0;
      let startY = 0;
      let start = { x: 0, y: 0, w: 0, h: 0 };
      let scale = 1;

      grip.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || entry.maximised) return;
        event.stopPropagation();
        pointerId = event.pointerId;
        side = grip.dataset.side ?? '';
        startX = event.clientX;
        startY = event.clientY;
        start = {
          x: entry.root.offsetLeft,
          y: entry.root.offsetTop,
          w: entry.root.offsetWidth,
          h: entry.root.offsetHeight,
        };
        scale = this.currentScale();
        grip.setPointerCapture(event.pointerId);
        entry.root.classList.add('is-dragging');
        this.focus(entry.app.id);
      });

      grip.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        const dx = (event.clientX - startX) / scale;
        const dy = (event.clientY - startY) / scale;
        const box = this.box;

        let { x, y, w, h } = start;

        if (side.includes('e')) w = Math.min(Math.max(start.w + dx, MIN_W), box.width - x);
        if (side.includes('s')) h = Math.min(Math.max(start.h + dy, MIN_H), box.height - TASKBAR_HEIGHT - y);
        if (side.includes('w')) {
          // Dragging the left edge moves the origin as well as the width.
          const width = Math.min(Math.max(start.w - dx, MIN_W), start.x + start.w);
          x = start.x + start.w - width;
          w = width;
        }
        if (side.includes('n')) {
          const height = Math.min(Math.max(start.h - dy, MIN_H), start.y + start.h);
          y = start.y + start.h - height;
          h = height;
        }

        entry.root.style.left = Math.round(x) + 'px';
        entry.root.style.top = Math.round(y) + 'px';
        entry.root.style.width = Math.round(w) + 'px';
        entry.root.style.height = Math.round(h) + 'px';
      });

      const end = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        grip.releasePointerCapture(event.pointerId);
        entry.root.classList.remove('is-dragging');
      };

      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    }
  }

  /** Half-screen and full-screen snapping, by edge or by keyboard. */
  snap(id: string, edge: 'left' | 'right' | 'top') {
    const entry = this.windows.get(id);
    if (!entry || this.compact) return;

    const box = this.box;
    const height = box.height - TASKBAR_HEIGHT;

    if (edge === 'top') {
      if (!entry.maximised) this.toggleMaximise(id);
      return;
    }

    if (entry.maximised) this.toggleMaximise(id);
    entry.root.style.top = '0px';
    entry.root.style.left = (edge === 'left' ? 0 : Math.round(box.width / 2)) + 'px';
    entry.root.style.width = Math.round(box.width / 2) + 'px';
    entry.root.style.height = height + 'px';
    this.focus(id);
  }

  /** Alt+Tab: bring the least recently focused visible window forward. */
  cycle() {
    const visible = this.order.filter((id) => !this.windows.get(id)?.minimised);
    if (visible.length < 2) return;
    this.focus(visible[0]);
  }

  focusedApp() {
    const id = this.focusedId;
    return id ? this.windows.get(id)?.app ?? null : null;
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
      const box = this.box;
      entry.root.style.left = '0px';
      entry.root.style.top = '0px';
      entry.root.style.width = box.width + 'px';
      entry.root.style.height = box.height - TASKBAR_HEIGHT + 'px';
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

    // Let the app tear down timers and listeners before the DOM goes.
    entry.content.dispatchEvent(new CustomEvent('app:destroy'));
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

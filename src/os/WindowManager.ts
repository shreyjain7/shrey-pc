import { SPRING, Spring, ease, reducedMotion, ticker, tween } from './anim';
import { telemetry } from '../world/telemetry';

export interface AppDefinition {
  id: string;
  title: string;
  /** Inline SVG string used for the desktop icon, title bar and taskbar. */
  icon: string;
  width: number;
  height: number;
  render: () => HTMLElement;
  /**
   * Roughly how heavy this app is, 0..1. Reported to the telemetry bus when it
   * opens, so the fans in the tower react to launching the browser differently
   * from launching the calculator.
   */
  weight?: number;
}

/** The transform channels a window animates on, kept apart from its layout. */
interface Motion {
  scale: Spring;
  x: Spring;
  y: Spring;
  tilt: Spring;
  opacity: number;
  /** Pointer parallax, folded into the same transform as everything else. */
  px: number;
  py: number;
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
  motion: Motion;
}

const TASKBAR_HEIGHT = 56;
const CASCADE_STEP = 34;
/**
 * The menu bar owns the top strip of the desktop. Windows have to start below
 * it: a title bar underneath the menu bar cannot be grabbed, which leaves the
 * window stuck where it opened.
 */
const MENUBAR_HEIGHT = 30;
const TOP_MARGIN = MENUBAR_HEIGHT + 10;

/** Lower bound wins when the box is smaller than the window plus its margins. */
const clamp = (value: number, min: number, max: number) => Math.max(Math.min(value, max), min);

/**
 * A small floating-window manager living inside the CRT.
 *
 * Everything is positioned in the screen's own 1280x960 coordinate space. The
 * CSS3D layer scales that whole space down onto the glass, so drags have to be
 * divided by the live scale factor to track the pointer exactly.
 *
 * Motion is spring-driven rather than transitioned. Layout (left/top/width/
 * height) and animation (transform/opacity) are kept on separate channels, so
 * a window can be dragged while it is still settling from being opened, and
 * minimising can genie toward a taskbar button that is itself still moving.
 */
export class WindowManager {
  private windows = new Map<string, ManagedWindow>();
  private order: string[] = [];
  private cascade = 0;

  private onChange: () => void = () => {};
  /** Where a window should fly to when it minimises, in screen coordinates. */
  private taskbarAnchor: (id: string) => { x: number; y: number } | null = () => null;
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
   * Re-fit every open window into the current screen box.
   *
   * The box changes underneath the windows whenever the OS moves between the
   * glass (a fixed 1280x960) and an overlay sized to the viewport or the
   * workstation dock. Without this, a window opened at one size is simply
   * clipped by the other.
   */
  relayout() {
    const box = this.box;
    const maxHeight = box.height - TASKBAR_HEIGHT;

    for (const entry of this.windows.values()) {
      if (entry.maximised) {
        entry.root.style.left = '0px';
        entry.root.style.top = '0px';
        entry.root.style.width = box.width + 'px';
        entry.root.style.height = maxHeight + 'px';
        continue;
      }

      if (this.compact) {
        entry.root.style.left = '12px';
        entry.root.style.top = '12px';
        entry.root.style.width = box.width - 24 + 'px';
        entry.root.style.height = maxHeight - 24 + 'px';
        continue;
      }

      // Prefer the app's natural size again when the box has grown, so
      // stepping back to the glass does not leave everything phone-sized.
      const width = Math.min(Math.max(entry.app.width, 280), box.width - 32);
      const height = Math.min(Math.max(entry.app.height, 180), maxHeight - 32);
      const left = clamp(entry.root.offsetLeft, 16, Math.max(16, box.width - width - 16));
      const top = clamp(
        entry.root.offsetTop,
        TOP_MARGIN,
        Math.max(TOP_MARGIN, maxHeight - height - 16),
      );

      entry.root.style.width = width + 'px';
      entry.root.style.height = height + 'px';
      entry.root.style.left = left + 'px';
      entry.root.style.top = top + 'px';
    }
  }

  setTaskbarAnchor(resolve: (id: string) => { x: number; y: number } | null) {
    this.taskbarAnchor = resolve;
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

  /** App ids currently running, oldest first — the process list reads this. */
  get running() {
    return [...this.windows.keys()];
  }

  get focusedId(): string | null {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const entry = this.windows.get(this.order[i]);
      if (entry && !entry.minimised) return entry.app.id;
    }
    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* Motion                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * One writer for the transform.
   *
   * Four independent springs feed a single `transform` string. Composing them
   * here rather than letting each spring write its own property is what stops
   * the last one to settle from clobbering the others.
   */
  private applyTransform(entry: ManagedWindow) {
    const { scale, x, y, tilt, px, py } = entry.motion;
    entry.root.style.transform =
      `translate3d(${(x.value + px).toFixed(2)}px, ${(y.value + py).toFixed(2)}px, 0) ` +
      `scale(${scale.value.toFixed(4)}) rotate(${tilt.value.toFixed(3)}deg)`;
    entry.root.style.opacity = entry.motion.opacity.toFixed(3);
  }

  private createMotion(entry: () => ManagedWindow): Motion {
    const write = () => {
      const target = entry();
      if (target) this.applyTransform(target);
    };

    return {
      scale: new Spring(1, { ...SPRING.window, onUpdate: write }),
      x: new Spring(0, { ...SPRING.window, onUpdate: write }),
      y: new Spring(0, { ...SPRING.window, onUpdate: write }),
      tilt: new Spring(0, { ...SPRING.bounce, onUpdate: write }),
      opacity: 1,
      px: 0,
      py: 0,
    };
  }

  private fade(entry: ManagedWindow, to: number, duration: number) {
    const from = entry.motion.opacity;
    return tween(
      duration,
      (t) => {
        entry.motion.opacity = from + (to - from) * t;
        this.applyTransform(entry);
      },
      ease.outCubic,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                               */
  /* ---------------------------------------------------------------------- */

  /** Opens the app, or focuses/minimises it when it is already running. */
  toggle(app: AppDefinition) {
    const existing = this.windows.get(app.id);
    if (!existing) {
      this.open(app);
      return;
    }
    if (existing.minimised || this.focusedId !== app.id) {
      this.restoreFrom(existing);
      this.focus(app.id);
    } else {
      this.minimise(app.id);
    }
  }

  open(app: AppDefinition) {
    if (this.windows.has(app.id)) {
      const existing = this.windows.get(app.id)!;
      this.restoreFrom(existing);
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
    // Clamped on both sides: the cascade must never walk a window off the
    // right or bottom edge, which it will on a narrow box such as the
    // workstation dock.
    const x = this.compact
      ? 12
      : clamp(Math.round((box.width - width) / 2 - 60 + offset), 16, box.width - width - 16);
    const y = this.compact
      ? 12
      : clamp(
          Math.round((box.height - TASKBAR_HEIGHT - height) / 2 - 40 + offset),
          TOP_MARGIN,
          Math.max(TOP_MARGIN, box.height - TASKBAR_HEIGHT - height - 16),
        );

    const root = document.createElement('section');
    root.className = 'win';
    root.style.width = width + 'px';
    root.style.height = height + 'px';
    root.style.left = x + 'px';
    root.style.top = y + 'px';

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
      motion: null as unknown as Motion,
    };
    entry.motion = this.createMotion(() => entry);

    this.windows.set(app.id, entry);
    this.order.push(app.id);

    root.addEventListener('pointerdown', () => this.focus(app.id));
    bar.addEventListener('dblclick', () => this.toggleMaximise(app.id));
    this.makeDraggable(entry, bar);
    if (!this.compact) this.makeResizable(entry, grips);

    // Grow in from just under full size, with the faintest overshoot.
    entry.motion.opacity = 0;
    entry.motion.scale.set(0.9);
    entry.motion.y.set(18);
    this.applyTransform(entry);

    requestAnimationFrame(() => {
      root.classList.add('is-open');
      entry.motion.scale.to(1);
      entry.motion.y.to(0);
      void this.fade(entry, 1, reducedMotion ? 0 : 220);
    });

    // Tell the hardware something just started.
    telemetry.process(app.weight ?? 0.2);
    telemetry.diskActivity(0.5);

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
    /** Pointer velocity in screen px/s, for the release flick. */
    let velocity = 0;
    let lastX = 0;
    let lastTime = 0;

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || entry.maximised) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      lastX = event.clientX;
      lastTime = event.timeStamp;
      velocity = 0;
      originX = entry.root.offsetLeft;
      originY = entry.root.offsetTop;
      scale = this.currentScale();
      handle.setPointerCapture(event.pointerId);
      entry.root.classList.add('is-dragging');
      // Springs have to let go of the transform while the pointer owns it.
      entry.motion.x.set(0);
      entry.motion.y.set(0);
      entry.motion.scale.to(1.012);
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

      const elapsed = Math.max(event.timeStamp - lastTime, 1);
      velocity = ((event.clientX - lastX) / scale / elapsed) * 1000;
      lastX = event.clientX;
      lastTime = event.timeStamp;

      // Lean into the drag, like a window being carried.
      entry.motion.tilt.to(Math.max(Math.min(velocity * 0.006, 2.4), -2.4));
    });

    const end = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      handle.releasePointerCapture(event.pointerId);
      entry.root.classList.remove('is-dragging');

      entry.motion.scale.to(1);
      entry.motion.tilt.to(0);
      // Let go and the window rocks back — velocity carried into the spring.
      entry.motion.tilt.impulse(Math.max(Math.min(velocity * 0.02, 24), -24));
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

  /**
   * Half-screen and full-screen snapping, by edge or by keyboard.
   *
   * The geometry is set immediately and the *difference* is played back as a
   * transform, so the window appears to slide into the new shape while its
   * content has already reflowed to the final size.
   */
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

    const fromX = entry.root.offsetLeft;
    const fromY = entry.root.offsetTop;

    entry.root.style.top = '0px';
    entry.root.style.left = (edge === 'left' ? 0 : Math.round(box.width / 2)) + 'px';
    entry.root.style.width = Math.round(box.width / 2) + 'px';
    entry.root.style.height = height + 'px';

    entry.motion.x.set(fromX - entry.root.offsetLeft);
    entry.motion.y.set(fromY - entry.root.offsetTop);
    entry.motion.x.to(0);
    entry.motion.y.to(0);

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

  /**
   * The genie: shrink toward the app's own taskbar button rather than just
   * fading. The anchor is asked for at the moment of minimising, so a button
   * that has shifted because another window closed is still landed on.
   */
  minimise(id: string) {
    const entry = this.windows.get(id);
    if (!entry) return;
    entry.minimised = true;
    entry.root.classList.add('is-minimised');
    entry.root.classList.remove('is-focused');

    const anchor = this.taskbarAnchor(id);
    if (anchor) {
      const centreX = entry.root.offsetLeft + entry.root.offsetWidth / 2;
      const centreY = entry.root.offsetTop + entry.root.offsetHeight / 2;
      entry.motion.x.to(anchor.x - centreX);
      entry.motion.y.to(anchor.y - centreY);
    } else {
      entry.motion.y.to(entry.root.offsetHeight * 0.4);
    }
    entry.motion.scale.to(0.16);
    void this.fade(entry, 0, reducedMotion ? 0 : 200);

    const next = this.focusedId;
    if (next) this.focus(next);
    this.onChange();
  }

  private restoreFrom(entry: ManagedWindow) {
    if (!entry.minimised) return;
    entry.minimised = false;
    entry.root.classList.remove('is-minimised');
    entry.motion.x.to(0);
    entry.motion.y.to(0);
    entry.motion.scale.to(1);
    void this.fade(entry, 1, reducedMotion ? 0 : 200);
  }

  toggleMaximise(id: string) {
    const entry = this.windows.get(id);
    if (!entry) return;

    const fromX = entry.root.offsetLeft;
    const fromY = entry.root.offsetTop;
    const fromW = entry.root.offsetWidth;
    const fromH = entry.root.offsetHeight;

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
      entry.restore = { x: fromX, y: fromY, width: fromW, height: fromH };
      const box = this.box;
      entry.root.style.left = '0px';
      entry.root.style.top = '0px';
      entry.root.style.width = box.width + 'px';
      entry.root.style.height = box.height - TASKBAR_HEIGHT + 'px';
      entry.maximised = true;
      entry.root.classList.add('is-maximised');
    }

    // Same trick as snapping: reflow first, then play back the difference.
    entry.motion.x.set(fromX - entry.root.offsetLeft);
    entry.motion.y.set(fromY - entry.root.offsetTop);
    entry.motion.x.to(0);
    entry.motion.y.to(0);

    this.focus(id);
  }

  close(id: string) {
    const entry = this.windows.get(id);
    if (!entry) return;

    entry.root.classList.remove('is-open');
    entry.root.classList.add('is-closing');
    this.windows.delete(id);
    this.order = this.order.filter((entryId) => entryId !== id);

    entry.motion.scale.to(0.92);
    entry.motion.y.to(10);
    void this.fade(entry, 0, reducedMotion ? 0 : 170).then(() => {
      // Let the app tear down timers and listeners before the DOM goes.
      entry.content.dispatchEvent(new CustomEvent('app:destroy'));
      for (const spring of [entry.motion.scale, entry.motion.x, entry.motion.y, entry.motion.tilt]) {
        spring.cancel();
      }
      entry.root.remove();
    });

    telemetry.diskActivity(0.3);

    const next = this.focusedId;
    if (next) this.focus(next);
    this.onChange();
  }

  closeAll() {
    // Stagger the closes so a full desktop cascades away instead of blinking.
    const ids = [...this.windows.keys()].reverse();
    ids.forEach((id, index) => {
      if (reducedMotion || index === 0) {
        this.close(id);
        return;
      }
      window.setTimeout(() => this.close(id), index * 55);
    });
    this.cascade = 0;
  }

  /**
   * Nudge every window slightly away from the pointer's side of the screen.
   * A tiny parallax, but it is what makes the desktop feel like it has depth
   * when it is projected onto curved glass.
   */
  bindParallax(host: HTMLElement) {
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let stop: (() => void) | null = null;

    /*
     * These transforms land on elements inside the CSS3D layer, where every
     * write re-rasters the projected surface. So the loop is not permanent:
     * it starts when the pointer moves and retires itself once the offsets
     * have caught up, which is most of the time.
     */
    const run = () => {
      if (stop) return;
      stop = ticker((delta) => {
        const lambda = 1 - Math.exp(-3 * delta);
        currentX += (targetX - currentX) * lambda;
        currentY += (targetY - currentY) * lambda;

        for (const entry of this.windows.values()) {
          const rest = entry.maximised || entry.minimised;
          const depth = (Number(entry.root.style.zIndex) || 10) - 10;
          // Windows further forward in the stack shift further.
          const weight = 0.5 + Math.min(depth, 6) * 0.28;
          entry.motion.px = rest ? 0 : -currentX * weight;
          entry.motion.py = rest ? 0 : -currentY * weight;
          this.applyTransform(entry);
        }

        const settled =
          Math.abs(targetX - currentX) < 0.004 && Math.abs(targetY - currentY) < 0.004;
        if (!settled) return true;

        currentX = targetX;
        currentY = targetY;
        stop = null;
        return false;
      });
    };

    host.addEventListener('pointermove', (event) => {
      const box = host.getBoundingClientRect();
      if (!box.width || !box.height) return;
      targetX = ((event.clientX - box.left) / box.width - 0.5) * 2;
      targetY = ((event.clientY - box.top) / box.height - 0.5) * 2;
      run();
    });

    return () => stop?.();
  }
}

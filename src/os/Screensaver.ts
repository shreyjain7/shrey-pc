import { reducedMotion, ticker } from './anim';
import { el } from './ui';

export type SaverMode = 'warp' | 'matrix' | 'bounce';

export const SAVER_MODES: SaverMode[] = ['warp', 'matrix', 'bounce'];

/** How long the desktop sits untouched before the saver comes on. Long enough
 *  that someone reading the CV without scrolling is not blacked out mid-line. */
const IDLE_MS = 120_000;
/** Input inside this window after starting is the gesture that started it. */
const GRACE_MS = 700;

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
}

/**
 * The screen saver: a canvas over the desktop that only exists while it runs.
 *
 * This surface is projected onto the glass through CSS3D, where every pixel
 * that changes re-rasters the whole thing, so it follows the visualiser's
 * rules: drawn at a capped rate into a reduced backing store (the CRT's own
 * scanlines hide the difference), driven from the shared ticker, and gone
 * completely — ticker, listeners and all — the moment it is dismissed.
 */
export class Screensaver {
  readonly element: HTMLCanvasElement;

  active = false;
  mode: SaverMode = 'warp';

  private readonly ctx: CanvasRenderingContext2D | null;
  private stop: (() => void) | null = null;
  private startedAt = 0;
  private lastInput = performance.now();
  private idleTimer = 0;
  private movedFrom: { x: number; y: number } | null = null;

  private width = 0;
  private height = 0;
  private stars: Star[] = [];
  private drops: number[] = [];
  private logo = { x: 40, y: 40, vx: 1, vy: 1, hue: 190, flash: 0 };

  constructor(
    private readonly root: HTMLElement,
    /** May the saver start by itself right now? */
    private readonly canAutoStart: () => boolean,
    /** Told when it starts and stops, so the room's spill light can follow. */
    private readonly onChange: (active: boolean) => void,
    private readonly fps = 30,
  ) {
    this.element = el('canvas', 'saver');
    this.element.setAttribute('aria-hidden', 'true');
    this.ctx = this.element.getContext('2d', { alpha: false });

    const note = () => this.noteInput();
    for (const type of ['pointerdown', 'wheel', 'touchstart'] as const) {
      root.addEventListener(type, note, { passive: true });
    }
    // Registered before the room's own key handling, so a key that wakes the
    // saver can be kept from also stepping the camera back or typing.
    window.addEventListener('keydown', (event) => {
      if (this.active && performance.now() - this.startedAt > GRACE_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      note();
    });
    root.addEventListener('pointermove', (event) => this.onMove(event));

    // A slow poll, not a ticker: it only reads a timestamp.
    if (!reducedMotion) this.idleTimer = window.setInterval(() => this.checkIdle(), 5000);
  }

  /** Any real input: dismiss if running, and restart the idle clock. */
  noteInput() {
    this.lastInput = performance.now();
    if (this.active && performance.now() - this.startedAt > GRACE_MS) this.dismiss();
  }

  /** A mouse resting on a desk still jitters; only a real move wakes it. */
  private onMove(event: PointerEvent) {
    if (!this.active) {
      this.lastInput = performance.now();
      return;
    }
    if (!this.movedFrom) {
      this.movedFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    if (Math.hypot(event.clientX - this.movedFrom.x, event.clientY - this.movedFrom.y) > 14) {
      this.noteInput();
    }
  }

  private checkIdle() {
    if (this.active || !this.canAutoStart()) return;
    if (document.visibilityState !== 'visible') return;
    if (performance.now() - this.lastInput < IDLE_MS) return;
    this.start(SAVER_MODES[Math.floor(Math.random() * SAVER_MODES.length)]);
  }

  start(mode: SaverMode = this.mode) {
    if (!this.ctx) return;
    this.mode = mode;
    this.startedAt = performance.now();
    this.movedFrom = null;

    this.resize();
    this.seed();

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.element.dataset.mode = mode;
    this.element.classList.add('is-visible');

    if (!this.active) {
      this.active = true;
      this.onChange(true);
    }

    this.stop?.();
    let clock = 1;
    const frame = 1 / this.fps;
    this.stop = ticker((delta) => {
      if (!this.active) return false;
      clock += delta;
      if (clock < frame) return true;
      this.draw(Math.min(clock, 0.1));
      clock = 0;
      return true;
    });
  }

  dismiss() {
    if (!this.active) return;
    this.active = false;
    this.stop?.();
    this.stop = null;
    this.lastInput = performance.now();
    this.element.classList.remove('is-visible');
    this.onChange(false);
  }

  /**
   * The backing store is deliberately coarse on the glass — a 1280x960 canvas
   * redrawn 30 times a second is exactly the cost the CSS3D layer cannot
   * absorb — and sharper in the phone overlay, where it is shown 1:1.
   */
  private resize() {
    const cssWidth = this.root.offsetWidth || 1280;
    const cssHeight = this.root.offsetHeight || 960;
    const overlay = this.root.classList.contains('is-overlay');
    const scale = overlay ? Math.min(window.devicePixelRatio || 1, 2) : 0.6;

    this.width = Math.max(Math.round(cssWidth * scale), 160);
    this.height = Math.max(Math.round(cssHeight * scale), 120);
    this.element.width = this.width;
    this.element.height = this.height;
  }

  private seed() {
    this.stars = Array.from({ length: 260 }, () => this.newStar(true));

    const column = this.columnWidth();
    // Staggered, but close enough above the top that the rain has arrived
    // within a second rather than trickling in over the first few.
    this.drops = Array.from({ length: Math.ceil(this.width / column) }, () => -Math.random() * 14);

    const size = this.logoSize();
    this.logo = {
      x: Math.random() * (this.width - size.w),
      y: Math.random() * (this.height - size.h),
      vx: Math.random() < 0.5 ? -1 : 1,
      vy: Math.random() < 0.5 ? -1 : 1,
      hue: Math.floor(Math.random() * 360),
      flash: 0,
    };
  }

  private newStar(anywhere: boolean): Star {
    const z = anywhere ? Math.random() * 0.95 + 0.05 : 1;
    return { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z, pz: z };
  }

  private columnWidth() {
    return Math.max(Math.round(this.width / 64), 9);
  }

  private logoSize() {
    const font = Math.round(this.width / 13);
    return { font, w: font * 5.9, h: font * 1.9 };
  }

  private draw(delta: number) {
    if (this.mode === 'warp') this.drawWarp(delta);
    else if (this.mode === 'matrix') this.drawMatrix(delta);
    else this.drawBounce(delta);
  }

  /* --- Warp: flying through a starfield -------------------------------- */

  private drawWarp(delta: number) {
    const ctx = this.ctx!;
    const { width, height } = this;
    const cx = width / 2;
    const cy = height / 2;
    const reach = Math.max(width, height) * 0.6;

    // A translucent wipe, not a clear, so every star leaves a streak.
    ctx.fillStyle = 'rgba(2, 4, 10, 0.42)';
    ctx.fillRect(0, 0, width, height);

    // Slowly surge and ease, so it breathes instead of droning.
    const elapsed = (performance.now() - this.startedAt) / 1000;
    const speed = 0.34 + Math.sin(elapsed * 0.4) * 0.16 + Math.min(elapsed * 0.05, 0.25);

    ctx.lineCap = 'round';
    for (let i = 0; i < this.stars.length; i += 1) {
      const star = this.stars[i];
      star.pz = star.z;
      star.z -= speed * delta;

      if (star.z <= 0.02) {
        this.stars[i] = this.newStar(false);
        continue;
      }

      const x = cx + (star.x / star.z) * reach;
      const y = cy + (star.y / star.z) * reach;
      const px = cx + (star.x / star.pz) * reach;
      const py = cy + (star.y / star.pz) * reach;

      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
        this.stars[i] = this.newStar(false);
        continue;
      }

      const near = 1 - star.z;
      // Distant stars are cold and blue; close ones burn white.
      const shade = Math.round(150 + near * 105);
      ctx.strokeStyle = `rgba(${shade}, ${Math.round(190 + near * 65)}, 255, ${0.35 + near * 0.65})`;
      ctx.lineWidth = Math.max(near * 3.2 * (width / 800), 0.6);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  /* --- Matrix: digital rain --------------------------------------------- */

  private drawMatrix(delta: number) {
    const ctx = this.ctx!;
    const { width, height } = this;
    const column = this.columnWidth();

    ctx.fillStyle = 'rgba(0, 6, 2, 0.16)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = `600 ${column}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';

    const rate = 18 * delta;
    for (let i = 0; i < this.drops.length; i += 1) {
      const row = Math.floor(this.drops[i]);
      const x = i * column;
      const y = row * column;

      // The head is bright and near-white; the column behind it is left to the
      // wipe to fade into green.
      ctx.fillStyle = '#d9ffe4';
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y);
      ctx.fillStyle = 'rgba(40, 255, 110, 0.85)';
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y - column);

      this.drops[i] += rate * (0.6 + ((i * 7919) % 13) / 18);
      if (y > height && Math.random() > 0.97) this.drops[i] = -Math.random() * 8;
    }
  }

  /* --- Bounce: the logo that never quite hits the corner --------------- */

  private drawBounce(delta: number) {
    const ctx = this.ctx!;
    const { width, height } = this;
    const { font, w, h } = this.logoSize();
    const logo = this.logo;
    const speed = width * 0.11 * delta;

    logo.x += logo.vx * speed;
    logo.y += logo.vy * speed;

    let hits = 0;
    if (logo.x <= 0 || logo.x + w >= width) {
      logo.vx *= -1;
      logo.x = Math.min(Math.max(logo.x, 0), width - w);
      hits += 1;
    }
    if (logo.y <= 0 || logo.y + h >= height) {
      logo.vy *= -1;
      logo.y = Math.min(Math.max(logo.y, 0), height - h);
      hits += 1;
    }
    if (hits) logo.hue = (logo.hue + 67 + Math.random() * 60) % 360;
    // It finally happened. Everyone in the room would cheer.
    if (hits === 2) logo.flash = 1;

    ctx.fillStyle = logo.flash > 0 ? `hsla(${logo.hue}, 90%, 60%, ${logo.flash * 0.5})` : '#000';
    ctx.fillRect(0, 0, width, height);
    if (logo.flash > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - logo.flash * 0.5})`;
      ctx.fillRect(0, 0, width, height);
      logo.flash = Math.max(logo.flash - delta * 0.8, 0);
    }

    const colour = `hsl(${logo.hue}, 88%, 62%)`;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(font * 0.08, 2);
    ctx.beginPath();
    // roundRect arrived in Safari 16; iOS 15 still gets a square badge.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(logo.x, logo.y, w, h, h * 0.22);
    else ctx.rect(logo.x, logo.y, w, h);
    ctx.stroke();

    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${font}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText('SHREY', logo.x + w / 2, logo.y + h * 0.4);
    ctx.font = `600 ${Math.round(font * 0.32)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText('— O S —', logo.x + w / 2, logo.y + h * 0.78);
    ctx.textAlign = 'start';
  }

  destroy() {
    this.dismiss();
    window.clearInterval(this.idleTimer);
  }
}

const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '0123456789SHREYJAIN<>=+*';

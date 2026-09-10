/**
 * The motion system the whole desktop runs on.
 *
 * Every moving thing in the OS — windows, the dock, menus, the cursor, page
 * transitions — is driven from the single ticker in here rather than from its
 * own `requestAnimationFrame` or a CSS transition. That buys three things:
 *
 *  - one layout/paint pass per frame instead of one per animation,
 *  - springs that can be interrupted and re-targeted mid-flight without the
 *    jump you get from restarting a CSS transition, and
 *  - a global brake, so `prefers-reduced-motion` and weak devices can cut the
 *    whole thing down in one place.
 *
 * Springs are integrated with a fixed 1/240s substep so the motion is identical
 * on a 60Hz panel and a 144Hz one, and the leftover time is carried into the
 * next frame rather than dropped.
 */

const SUBSTEP = 1 / 240;
/** Below this, a spring has visually arrived and is retired. */
const REST_OFFSET = 0.0008;
const REST_VELOCITY = 0.0025;

export const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------------------------------------------------- */
/* The ticker                                                                  */
/* -------------------------------------------------------------------------- */

type Tick = (delta: number, now: number) => boolean | void;

const tasks = new Set<Tick>();
let frame = 0;
let last = 0;

function pump(now: number) {
  frame = 0;
  // Clamp: a backgrounded tab can hand back a delta of several seconds, and
  // integrating that in one go throws every spring across the screen.
  const delta = Math.min((now - last) / 1000, 1 / 20);
  last = now;

  for (const task of [...tasks]) {
    if (task(delta, now / 1000) === false) tasks.delete(task);
  }

  if (tasks.size) frame = requestAnimationFrame(pump);
}

/** Run `task` every frame until it returns false. Returns a stop handle. */
export function ticker(task: Tick) {
  tasks.add(task);
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(pump);
  }
  return () => tasks.delete(task);
}

/* -------------------------------------------------------------------------- */
/* Springs                                                                     */
/* -------------------------------------------------------------------------- */

export interface SpringOptions {
  /** How hard it pulls toward the target. Higher is snappier. */
  stiffness?: number;
  /** How much it resists. At `2*sqrt(stiffness)` it is critically damped. */
  damping?: number;
  mass?: number;
  /** Called on every frame the spring moves, and once more when it settles. */
  onUpdate?: (value: number, velocity: number) => void;
  onRest?: () => void;
}

/**
 * A damped harmonic oscillator you can re-target at any time.
 *
 * Presets below cover the cases the desktop actually needs; reach for a custom
 * stiffness only when none of them feels right.
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  private stiffness: number;
  private damping: number;
  private mass: number;
  private carry = 0;
  private stop: (() => void) | null = null;
  private onUpdate?: (value: number, velocity: number) => void;
  private onRest?: () => void;

  constructor(initial: number, options: SpringOptions = {}) {
    this.value = initial;
    this.target = initial;
    this.stiffness = options.stiffness ?? 170;
    this.damping = options.damping ?? 24;
    this.mass = options.mass ?? 1;
    this.onUpdate = options.onUpdate;
    this.onRest = options.onRest;
  }

  /** Ease toward `target`, keeping whatever velocity is already in flight. */
  to(target: number) {
    this.target = target;
    if (reducedMotion) {
      this.value = target;
      this.velocity = 0;
      this.onUpdate?.(this.value, 0);
      this.onRest?.();
      return this;
    }
    this.wake();
    return this;
  }

  /** Jump there with no motion at all. */
  set(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate?.(value, 0);
    return this;
  }

  /** Shove it — for a flick, a bounce, or a drag release. */
  impulse(velocity: number) {
    this.velocity += velocity;
    this.wake();
    return this;
  }

  private wake() {
    if (this.stop) return;
    this.carry = 0;
    this.stop = ticker((delta) => this.step(delta));
  }

  private step(delta: number) {
    this.carry += delta;

    while (this.carry >= SUBSTEP) {
      const offset = this.value - this.target;
      const acceleration = (-this.stiffness * offset - this.damping * this.velocity) / this.mass;
      this.velocity += acceleration * SUBSTEP;
      this.value += this.velocity * SUBSTEP;
      this.carry -= SUBSTEP;
    }

    const settled =
      Math.abs(this.value - this.target) < REST_OFFSET && Math.abs(this.velocity) < REST_VELOCITY;

    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.stop = null;
      this.onUpdate?.(this.value, 0);
      this.onRest?.();
      return false;
    }

    this.onUpdate?.(this.value, this.velocity);
    return true;
  }

  cancel() {
    this.stop?.();
    this.stop = null;
  }
}

/** The four spring feels the desktop uses. Named for what they are for. */
export const SPRING = {
  /** Windows opening and closing. Quick, with the faintest overshoot. */
  window: { stiffness: 260, damping: 26 },
  /** Menus, popovers, the calendar. Crisper, no overshoot to speak of. */
  menu: { stiffness: 420, damping: 38 },
  /** The cursor and anything that has to feel physically attached to it. */
  pointer: { stiffness: 900, damping: 52 },
  /** Big, slow, heavy — the workstation dock and full-screen transitions. */
  stage: { stiffness: 120, damping: 22 },
  /** Deliberately bouncy: dock icons, notification pops, the start menu. */
  bounce: { stiffness: 340, damping: 17 },
} satisfies Record<string, SpringOptions>;

/* -------------------------------------------------------------------------- */
/* Tweens                                                                      */
/* -------------------------------------------------------------------------- */

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  /** Overshoots and comes back — good for a stamp or a pop. */
  outBack: (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  /** Rings down to rest. Use sparingly; it reads as playful. */
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
};

/** A one-shot tween on the shared ticker. Resolves when it finishes. */
export function tween(
  duration: number,
  onUpdate: (t: number) => void,
  easing: (t: number) => number = ease.outCubic,
) {
  return new Promise<void>((resolve) => {
    if (reducedMotion || duration <= 0) {
      onUpdate(1);
      resolve();
      return;
    }

    let elapsed = 0;
    ticker((delta) => {
      elapsed += delta * 1000;
      const t = Math.min(elapsed / duration, 1);
      onUpdate(easing(t));
      if (t < 1) return true;
      resolve();
      return false;
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Map a value from one range to another, clamped to the output range. */
export const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  outMin + clamp((value - inMin) / (inMax - inMin || 1), 0, 1) * (outMax - outMin);

/**
 * FLIP: animate an element between two layouts it can only be measured in.
 *
 * Measure, let the caller mutate the DOM, measure again, then play the
 * difference back as a transform. The element is never actually animated
 * through layout, so this stays on the compositor.
 */
export function flip(element: HTMLElement, mutate: () => void, duration = 320) {
  const first = element.getBoundingClientRect();
  mutate();
  const last = element.getBoundingClientRect();

  if (reducedMotion) return Promise.resolve();

  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / (last.width || 1);
  const sy = first.height / (last.height || 1);

  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
    return Promise.resolve();
  }

  return tween(
    duration,
    (t) => {
      const x = lerp(dx, 0, t);
      const y = lerp(dy, 0, t);
      const scaleX = lerp(sx, 1, t);
      const scaleY = lerp(sy, 1, t);
      element.style.transform =
        t >= 1 ? '' : `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
      if (t >= 1) element.style.transformOrigin = '';
      else element.style.transformOrigin = 'top left';
    },
    ease.outQuint,
  );
}

/**
 * Reveal a list one item at a time. Cheap, and it does more for perceived
 * speed than making the list actually load faster.
 */
export function stagger(items: HTMLElement[], step = 34, distance = 12) {
  if (reducedMotion) return;

  items.forEach((item, index) => {
    item.style.opacity = '0';
    item.style.transform = `translateY(${distance}px)`;

    window.setTimeout(() => {
      item.style.transition = 'opacity 340ms ease, transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
      item.style.opacity = '';
      item.style.transform = '';
      // Leave no inline transition behind to fight later animations.
      window.setTimeout(() => {
        item.style.transition = '';
      }, 460);
    }, index * step);
  });
}

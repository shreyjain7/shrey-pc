type Listener = (delta: number, elapsed: number) => void;

/** rAF loop with a clamped delta so tab-switching never launches the tweens into orbit. */
export class Time {
  elapsed = 0;
  delta = 1 / 60;

  private start = performance.now();
  private current = this.start;
  private frame = 0;
  private listeners = new Set<Listener>();

  constructor() {
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    const now = performance.now();
    this.delta = Math.min((now - this.current) / 1000, 1 / 20);
    this.current = now;
    this.elapsed = (now - this.start) / 1000;

    for (const listener of this.listeners) listener(this.delta, this.elapsed);

    this.frame = requestAnimationFrame(this.tick);
  };

  on(listener: Listener) {
    this.listeners.add(listener);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.listeners.clear();
  }
}

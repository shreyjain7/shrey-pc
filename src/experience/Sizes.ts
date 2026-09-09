type Listener = () => void;

/** Viewport bookkeeping. Everything that needs to react to a resize listens here. */
export class Sizes {
  width = 0;
  height = 0;
  aspect = 1;
  pixelRatio = 1;
  /** Phones and narrow tablets get a simplified camera + a smaller screen surface. */
  touch = false;

  private listeners = new Set<Listener>();

  constructor() {
    this.measure();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  private measure() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;
    // Capping at 2 keeps fill-rate sane on high-DPI phones without visible aliasing.
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.touch = this.width < 900 || window.matchMedia('(pointer: coarse)').matches;
  }

  private onResize = () => {
    this.measure();
    for (const listener of this.listeners) listener();
  };

  on(listener: Listener) {
    this.listeners.add(listener);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.listeners.clear();
  }
}

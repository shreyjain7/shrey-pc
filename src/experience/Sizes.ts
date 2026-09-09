type Listener = () => void;

export type Quality = 'low' | 'medium' | 'high';

/**
 * Viewport bookkeeping plus the device tier the rest of the scene budgets
 * against. Everything that reacts to a resize listens here.
 */
export class Sizes {
  width = 0;
  height = 0;
  aspect = 1;
  pixelRatio = 1;

  /** Coarse pointer, or a viewport too narrow for the desktop layout. */
  touch = false;
  /** Narrow enough that the OS needs its compact, one-window-at-a-time layout. */
  compact = false;
  /** Taller than wide — the 4:3 glass has to be fitted to width instead. */
  portrait = false;
  quality: Quality = 'high';

  private listeners = new Set<Listener>();
  private resizeFrame = 0;

  constructor() {
    this.measure();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    // iOS Safari changes the visual viewport as the address bar collapses;
    // listening here avoids a stale, too-tall canvas.
    window.visualViewport?.addEventListener('resize', this.onResize);
  }

  private measure() {
    // visualViewport is the honest size on mobile once browser chrome moves.
    this.width = Math.round(window.visualViewport?.width ?? window.innerWidth);
    this.height = Math.round(window.visualViewport?.height ?? window.innerHeight);
    this.aspect = this.width / Math.max(this.height, 1);
    this.portrait = this.aspect < 1;

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.touch = coarse || this.width < 900;
    this.compact = this.width < 820 || (coarse && this.width < 1100);

    this.quality = this.detectQuality(coarse);

    // Phones pay for every extra pixel; cap harder the weaker the tier.
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.75 : 1.35;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, cap);

    // Real pixel height for CSS that cannot trust 100vh on mobile.
    document.documentElement.style.setProperty('--vh', this.height + 'px');
  }

  private detectQuality(coarse: boolean): Quality {
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low';
    if (coarse) return cores >= 8 && memory >= 6 ? 'medium' : 'low';
    if (cores <= 4 || memory <= 4) return 'medium';
    return 'high';
  }

  private onResize = () => {
    // Mobile fires resize in a burst while the address bar animates.
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.measure();
      for (const listener of this.listeners) listener();
    });
  };

  on(listener: Listener) {
    this.listeners.add(listener);
  }

  destroy() {
    cancelAnimationFrame(this.resizeFrame);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.listeners.clear();
  }
}

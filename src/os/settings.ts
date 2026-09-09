const STORAGE_KEY = 'shrey-pc:settings:v1';

export interface Wallpaper {
  id: string;
  label: string;
  /** A CSS background value, applied to the desktop layer. */
  css: string;
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    css:
      'radial-gradient(115% 90% at 78% 8%, rgba(95,208,255,0.09), transparent 58%),' +
      'radial-gradient(95% 80% at 12% 96%, rgba(255,180,84,0.07), transparent 60%),' +
      'linear-gradient(160deg, #121a26, #0b1017 62%)',
  },
  {
    id: 'ember',
    label: 'Ember',
    css:
      'radial-gradient(100% 85% at 20% 10%, rgba(255,140,70,0.16), transparent 60%),' +
      'linear-gradient(155deg, #241a1c, #100b0e 65%)',
  },
  {
    id: 'moss',
    label: 'Moss',
    css:
      'radial-gradient(110% 90% at 82% 15%, rgba(110,220,160,0.12), transparent 58%),' +
      'linear-gradient(165deg, #14211c, #0a1210 64%)',
  },
  {
    id: 'grid',
    label: 'Grid',
    css:
      'repeating-linear-gradient(0deg, rgba(95,208,255,0.07) 0 1px, transparent 1px 40px),' +
      'repeating-linear-gradient(90deg, rgba(95,208,255,0.07) 0 1px, transparent 1px 40px),' +
      'linear-gradient(160deg, #101724, #080c12 70%)',
  },
  {
    id: 'plain',
    label: 'Plain',
    css: 'linear-gradient(180deg, #0f141c, #0a0e14)',
  },
];

export const ACCENTS = [
  { id: 'cyan', label: 'Cyan', value: '#5fd0ff' },
  { id: 'amber', label: 'Amber', value: '#ffb454' },
  { id: 'mint', label: 'Mint', value: '#6ee7a8' },
  { id: 'violet', label: 'Violet', value: '#b18cff' },
  { id: 'rose', label: 'Rose', value: '#ff8fa3' },
];

export interface SettingsState {
  wallpaper: string;
  accent: string;
  scanlines: boolean;
  flicker: boolean;
  clock24: boolean;
  keySounds: boolean;
}

const DEFAULTS: SettingsState = {
  wallpaper: 'midnight',
  accent: 'cyan',
  scanlines: true,
  flicker: true,
  clock24: false,
  keySounds: true,
};

type Listener = (state: SettingsState) => void;

/** Persisted desktop preferences, applied as CSS custom properties. */
class Settings {
  state: SettingsState = { ...DEFAULTS };

  private listeners = new Set<Listener>();
  private root: HTMLElement | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.state = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsState>) };
    } catch {
      // Fall back to defaults; a broken preference should not block boot.
    }
  }

  /** The screen element every property is written to. */
  attach(root: HTMLElement) {
    this.root = root;
    this.apply();
  }

  on(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    this.state[key] = value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Not persisting is survivable.
    }
    this.apply();
    for (const listener of this.listeners) listener(this.state);
  }

  reset() {
    for (const key of Object.keys(DEFAULTS) as (keyof SettingsState)[]) {
      this.state[key] = DEFAULTS[key] as never;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    this.apply();
    for (const listener of this.listeners) listener(this.state);
  }

  private apply() {
    const root = this.root;
    if (!root) return;

    const wallpaper = WALLPAPERS.find((entry) => entry.id === this.state.wallpaper) ?? WALLPAPERS[0];
    const accent = ACCENTS.find((entry) => entry.id === this.state.accent) ?? ACCENTS[0];

    root.style.setProperty('--wallpaper', wallpaper.css);
    root.style.setProperty('--accent', accent.value);
    // A translucent version of the accent, for hovers and selection fills.
    root.style.setProperty('--accent-soft', accent.value + '22');
    root.style.setProperty('--accent-line', accent.value + '66');

    root.classList.toggle('no-scanlines', !this.state.scanlines);
    root.classList.toggle('no-flicker', !this.state.flicker);
  }
}

export const settings = new Settings();

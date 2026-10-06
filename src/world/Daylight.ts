import {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MathUtils,
  MeshBasicMaterial,
} from 'three';
import { tween } from '../os/anim';

/** Everything the time of day touches, in one place. */
interface Look {
  /** The grey the dome's horizon, the fog and the page backdrop all share. */
  far: string;
  /** The page backdrop's brighter centre, behind the desk. */
  near: string;
  ambient: number;
  hemi: number;
  hemiSky: string;
  key: number;
  keyColor: string;
  fill: number;
  rim: number;
  /** Multiplies the screen's spill light: at night the monitor is the lamp. */
  screen: number;
  /**
   * Multiplies the fog. After dark the floor would otherwise run out to a lit
   * edge against a black dome; thicker fog leaves the desk in a pool of light.
   */
  fog: number;
}

/**
 * The studio across a day. Day is the look the room was designed in, so its
 * values are exactly the old fixed rig; the rest are departures from it.
 */
const LOOKS = {
  night: {
    far: '#1a1c24',
    near: '#2a2d38',
    ambient: 0.32,
    hemi: 0.3,
    hemiSky: '#8a9cd0',
    key: 0.55,
    keyColor: '#a9bcff',
    fill: 0.12,
    rim: 0.35,
    screen: 2.6,
    fog: 1.9,
  },
  dawn: {
    far: '#d6c8c6',
    near: '#efe2dc',
    ambient: 1.1,
    hemi: 0.9,
    hemiSky: '#ffe2d6',
    key: 1.5,
    keyColor: '#ffc8a2',
    fill: 0.6,
    rim: 0.45,
    screen: 1.2,
    fog: 1.1,
  },
  day: {
    far: '#cfcfd4',
    near: '#eaeaed',
    ambient: 1.55,
    hemi: 1.2,
    hemiSky: '#ffffff',
    key: 2.1,
    keyColor: '#fff6ea',
    fill: 0.75,
    rim: 0.4,
    screen: 1,
    fog: 1,
  },
  golden: {
    far: '#d8c6ae',
    near: '#f2dfc4',
    ambient: 1.2,
    hemi: 0.95,
    hemiSky: '#ffe4bf',
    key: 2.0,
    keyColor: '#ffb874',
    fill: 0.5,
    rim: 0.6,
    screen: 1.2,
    fog: 1.05,
  },
  dusk: {
    far: '#5c5870',
    near: '#7c7590',
    ambient: 0.75,
    hemi: 0.6,
    hemiSky: '#b7a2d8',
    key: 0.9,
    keyColor: '#ff9a7c',
    fill: 0.3,
    rim: 0.5,
    screen: 1.8,
    fog: 1.45,
  },
} satisfies Record<string, Look>;

export type Phase = keyof typeof LOOKS;
export const PHASES = Object.keys(LOOKS) as Phase[];

/** Where each look is at full strength, in hours. Between two, they blend. */
const TIMELINE: Array<[number, Phase]> = [
  [0, 'night'],
  [5, 'night'],
  [6.5, 'dawn'],
  [8, 'day'],
  [16.5, 'day'],
  [18, 'golden'],
  [19.5, 'dusk'],
  [21, 'night'],
  [24, 'night'],
];

/** The hour each phase is previewed at, from the terminal. */
export const PHASE_HOURS: Record<Phase, number> = {
  night: 23,
  dawn: 6.5,
  day: 12,
  golden: 18,
  dusk: 19.5,
};

/** The dome texture's horizon stop, which `far` replaces by tinting. */
const DOME_HORIZON = new Color('#cfcfd4');

export interface Rig {
  ambient: AmbientLight;
  hemi: HemisphereLight;
  key: DirectionalLight;
  fill: DirectionalLight;
  rim: DirectionalLight;
  fog: FogExp2;
  dome: MeshBasicMaterial;
}

const localHour = () => {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
};

/**
 * Lights the studio for the visitor's own time of day.
 *
 * Someone opening this at midnight finds the room dark, the monitor the
 * brightest thing in it and throwing its light across the desk; at seven in
 * the evening the key goes amber and low. The page around the canvas and its
 * type follow, so the chrome never sits as a bright frame around a dark room.
 *
 * It reads the clock once a minute, which is all a sky needs. Previewing
 * another hour sweeps forward to it as a time-lapse rather than cutting.
 */
export class Daylight {
  /** The hour currently shown, which an override or a sweep may set. */
  hour = localHour();
  /** Multiplier for the screen's spill light at this hour. */
  screenBoost = 1;

  private override: number | null = null;
  /** The density the world set for this quality tier; looks scale it. */
  private readonly baseFog: number;
  private timer = 0;
  private sweep = 0;
  private readonly scratch = { far: new Color(), near: new Color(), sky: new Color(), key: new Color() };

  constructor(private readonly rig: Rig) {
    this.baseFog = rig.fog.density;
    const asked = Number(new URLSearchParams(location.search).get('hour'));
    if (location.search.includes('hour=') && Number.isFinite(asked)) this.override = asked % 24;
    this.apply(this.override ?? localHour());
    this.timer = window.setInterval(() => {
      if (this.override === null && !this.sweep) this.apply(localHour());
    }, 60_000);
  }

  /**
   * Show a given hour, or the visitor's own with `null`. Always runs forward
   * through the hours in between, so night to day passes through dawn.
   */
  preview(hour: number | null) {
    this.override = hour;
    const target = hour ?? localHour();
    const from = this.hour;
    const span = (((target - from) % 24) + 24) % 24;
    const id = ++this.sweep;

    void tween(
      Math.max(span, 1) * 260,
      (t) => {
        if (id === this.sweep) this.apply((from + span * t) % 24);
      },
      (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    ).then(() => {
      if (id === this.sweep) this.sweep = 0;
    });
  }

  /** The phase this hour is closest to, for describing it. */
  get phase(): Phase {
    let best: Phase = 'day';
    let distance = Infinity;
    for (const [at, phase] of TIMELINE) {
      const d = Math.abs(at - this.hour);
      if (d < distance) {
        distance = d;
        best = phase;
      }
    }
    return best;
  }

  private apply(hour: number) {
    this.hour = hour;

    let i = 0;
    while (i < TIMELINE.length - 2 && TIMELINE[i + 1][0] <= hour) i += 1;
    const [fromAt, fromPhase] = TIMELINE[i];
    const [toAt, toPhase] = TIMELINE[i + 1];
    const raw = toAt === fromAt ? 0 : (hour - fromAt) / (toAt - fromAt);
    const t = MathUtils.smoothstep(raw, 0, 1);
    const a = LOOKS[fromPhase];
    const b = LOOKS[toPhase];
    const mix = (x: number, y: number) => MathUtils.lerp(x, y, t);
    const { far, near, sky, key } = this.scratch;

    far.set(a.far).lerp(new Color(b.far), t);
    near.set(a.near).lerp(new Color(b.near), t);
    sky.set(a.hemiSky).lerp(new Color(b.hemiSky), t);
    key.set(a.keyColor).lerp(new Color(b.keyColor), t);

    const rig = this.rig;
    rig.ambient.intensity = mix(a.ambient, b.ambient);
    rig.hemi.intensity = mix(a.hemi, b.hemi);
    rig.hemi.color.copy(sky);
    rig.key.intensity = mix(a.key, b.key);
    rig.key.color.copy(key);
    rig.fill.intensity = mix(a.fill, b.fill);
    rig.rim.intensity = mix(a.rim, b.rim);
    this.screenBoost = mix(a.screen, b.screen);

    // The fog and the dome's horizon must stay one colour or the join shows.
    // The dome is a texture, so it is tinted by the ratio that turns its own
    // horizon stop into `far`.
    rig.fog.color.copy(far);
    rig.fog.density = this.baseFog * mix(a.fog, b.fog);
    rig.dome.color.setRGB(far.r / DOME_HORIZON.r, far.g / DOME_HORIZON.g, far.b / DOME_HORIZON.b);

    this.paintPage(far, near);
  }

  /** The CSS behind the canvas, its type, and the browser's own chrome. */
  private paintPage(far: Color, near: Color) {
    const root = document.documentElement;
    const farCss = '#' + far.getHexString();
    const nearCss = '#' + near.getHexString();
    const mid = '#' + far.clone().lerp(near, 0.35).getHexString();
    root.style.setProperty('--studio-far', farCss);
    root.style.setProperty('--studio-mid', mid);
    root.style.setProperty('--studio-near', nearCss);

    // Dark ink on a light studio; light ink once the room has gone dark.
    const hsl = { h: 0, s: 0, l: 0 };
    far.getHSL(hsl);
    document.body.classList.toggle('is-dark-room', hsl.l < 0.32);

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', farCss);
  }

  destroy() {
    window.clearInterval(this.timer);
  }
}

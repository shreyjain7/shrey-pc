import {
  type Blending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineSegments,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import { profile } from '../data/cv';
import type { Quality } from '../experience/Sizes';
import type { Daylight } from './Daylight';

export type Sky = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
export const SKIES: Sky[] = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

export interface Conditions {
  sky: Sky;
  /** 0..1: how hard it is raining or snowing. */
  amount: number;
  /** What it would say on a weather report. */
  label: string;
  /** Celsius, when it came from a real reading. */
  temperature: number | null;
  /** Where the reading is for, or null for a preview. */
  place: string | null;
}

/**
 * Hyderabad, the city on the CV, and the default — the room shows the weather
 * where Shrey is. A visitor who has already let this site know where they are
 * gets their own instead; nobody is ever prompted just for opening the page.
 */
const HOME = { latitude: 17.385, longitude: 78.4867, place: profile.location.split(',')[0] };

/** A reading is good for this long; weather does not change faster than that. */
const REFRESH_MS = 20 * 60_000;

/**
 * What a WMO weather code means for the room. Open-Meteo reports in these; the
 * table is https://open-meteo.com/en/docs (section "WMO Weather interpretation codes").
 */
function classify(code: number): Omit<Conditions, 'temperature' | 'place'> {
  if (code <= 1) return { sky: 'clear', amount: 0, label: code === 0 ? 'Clear' : 'Mostly clear' };
  if (code === 2) return { sky: 'cloudy', amount: 0.35, label: 'Partly cloudy' };
  if (code === 3) return { sky: 'cloudy', amount: 0.7, label: 'Overcast' };
  if (code === 45 || code === 48) return { sky: 'fog', amount: 1, label: 'Fog' };
  if (code >= 51 && code <= 57) return { sky: 'rain', amount: 0.3, label: 'Drizzle' };
  if (code === 61 || code === 66 || code === 80) return { sky: 'rain', amount: 0.5, label: 'Light rain' };
  if (code === 63 || code === 81) return { sky: 'rain', amount: 0.75, label: 'Rain' };
  if (code === 65 || code === 67 || code === 82) return { sky: 'rain', amount: 1, label: 'Heavy rain' };
  if (code === 71 || code === 77 || code === 85) return { sky: 'snow', amount: 0.45, label: 'Light snow' };
  if (code === 73) return { sky: 'snow', amount: 0.7, label: 'Snow' };
  if (code === 75 || code === 86) return { sky: 'snow', amount: 1, label: 'Heavy snow' };
  if (code >= 95) return { sky: 'storm', amount: 1, label: 'Thunderstorm' };
  return { sky: 'clear', amount: 0, label: 'Clear' };
}

/** How each sky shades the light: cloud cover and haze, for Daylight. */
const SHADE: Record<Sky, [number, number]> = {
  clear: [0, 0],
  cloudy: [0.55, 0.1],
  fog: [0.5, 1],
  rain: [0.75, 0.25],
  snow: [0.6, 0.35],
  storm: [0.92, 0.3],
};

/** For previews from the terminal. */
const PREVIEW: Record<Sky, Omit<Conditions, 'temperature' | 'place'>> = {
  clear: { sky: 'clear', amount: 0, label: 'Clear' },
  cloudy: { sky: 'cloudy', amount: 0.7, label: 'Overcast' },
  fog: { sky: 'fog', amount: 1, label: 'Fog' },
  rain: { sky: 'rain', amount: 0.8, label: 'Rain' },
  snow: { sky: 'snow', amount: 0.8, label: 'Snow' },
  storm: { sky: 'storm', amount: 1, label: 'Thunderstorm' },
};

/* -------------------------------------------------------------------------- */
/* Shaders                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Every drop and flake is placed by the GPU from a fixed random seed and the
 * time. Nothing is written per frame from the CPU but one uniform, so a
 * downpour costs about what an empty room does.
 *
 * They fall in a ring around the desk — never inside it, so nothing ever
 * crosses between the camera and the glass while someone is reading — and
 * fade out with distance into the fog and just in front of the lens.
 */
const PLACE = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uAmount;
  uniform float uSpeed;
  uniform float uSway;
  varying float vFade;

  const float HEIGHT = 6.0;

  vec3 place(float lift) {
    float angle = aSeed.x * 6.2831853;
    float radius = mix(2.7, 10.0, sqrt(aSeed.y));
    float speed = uSpeed * (0.8 + aSeed.z * 0.4);
    float y = mod(aSeed.z * 97.0 * HEIGHT - uTime * speed, HEIGHT) + lift;
    vec3 p = vec3(cos(angle) * radius, y, sin(angle) * radius - 0.16);
    p.x += sin(uTime * 0.7 + aSeed.y * 40.0) * uSway + lift * 0.18;
    p.z += cos(uTime * 0.5 + aSeed.x * 31.0) * uSway;
    return p;
  }

  void fade(vec3 world, float y) {
    float distance = length(world - cameraPosition);
    // Fewer drops for a lighter shower: the unneeded ones simply fade out.
    float present = step(fract(aSeed.x * 13.37 + aSeed.y * 7.1), uAmount);
    vFade = present
      * smoothstep(17.0, 6.0, distance)
      * smoothstep(0.7, 1.6, distance)
      * smoothstep(0.0, 0.3, y);
  }
`;

const RAIN_VERTEX = /* glsl */ `
  attribute float aEnd;
  ${PLACE}

  void main() {
    // A streak: the top end is where the drop was a moment ago.
    vec3 world = place(aEnd * 0.26);
    fade(world, world.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    if (vFade < 0.01) discard;
    gl_FragColor = vec4(uColor, uOpacity * vFade);
  }
`;

const SNOW_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  ${PLACE}

  void main() {
    vec3 world = place(0.0);
    fade(world, world.y);
    vec4 view = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (34.0 + aSeed.z * 26.0) * uPixelRatio / -view.z;
  }
`;

const SNOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    // A soft round flake rather than a square point.
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.15, d) * uOpacity * vFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* -------------------------------------------------------------------------- */
/* Weather                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Real weather in the studio.
 *
 * Reads the current conditions from Open-Meteo (free, keyless, and fetched
 * straight from the browser, so no server sees the visitor) and turns them
 * into the room: rain or snow falling around the desk, cloud that takes the
 * sun out of the light, fog that closes in, and lightning in a storm.
 */
export class Weather {
  readonly group = new Group();
  conditions: Conditions = { sky: 'clear', amount: 0, label: 'Clear', temperature: null, place: null };

  private readonly rain: LineSegments<BufferGeometry, ShaderMaterial>;
  private readonly snow: Points<BufferGeometry, ShaderMaterial>;
  private readonly listeners = new Set<(conditions: Conditions) => void>();
  private live: Conditions | null = null;
  private previewing = false;
  private refreshTimer = 0;
  private lightningTimer = 0;
  private location: { latitude: number; longitude: number; place: string } = HOME;

  /** Called on a lightning strike, for the thunder that follows it. */
  onStrike: () => void = () => {};

  constructor(
    quality: Quality,
    private readonly daylight: Daylight,
  ) {
    const drops = quality === 'low' ? 900 : quality === 'medium' ? 1600 : 2400;
    const flakes = quality === 'low' ? 600 : quality === 'medium' ? 1000 : 1500;

    this.rain = new LineSegments(this.streaks(drops), this.material(RAIN_VERTEX, RAIN_FRAGMENT, NormalBlending));
    // Normal blending for snow too: added light vanishes against a bright studio.
    this.snow = new Points(this.seeds(flakes), this.material(SNOW_VERTEX, SNOW_FRAGMENT, NormalBlending));
    this.snow.material.uniforms.uPixelRatio = { value: Math.min(window.devicePixelRatio || 1, 2) };

    for (const mesh of [this.rain, this.snow]) {
      mesh.visible = false;
      // Positions come from the shader, so the CPU bounds are meaningless.
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
    }

    // The colour of the precipitation follows the light it falls through.
    daylight.onChange(() => this.tint());

    void this.refresh();
    this.refreshTimer = window.setInterval(() => {
      if (!this.previewing) void this.refresh();
    }, REFRESH_MS);
  }

  /** Listen for every change of conditions, including previews. */
  onChange(listener: (conditions: Conditions) => void) {
    this.listeners.add(listener);
    listener(this.conditions);
  }

  /** Show a sky without asking the forecast, until `auto` is asked for. */
  preview(sky: Sky) {
    this.previewing = true;
    this.show({ ...PREVIEW[sky], temperature: null, place: null });
  }

  /** Back to the real conditions. */
  auto() {
    this.previewing = false;
    if (this.live) this.show(this.live);
    void this.refresh();
  }

  /**
   * Ask the visitor where they are — only ever from something they typed,
   * never on load — and show their own weather from then on.
   */
  async here(): Promise<boolean> {
    try {
      const position = await currentPosition(8000);
      this.location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        place: 'where you are',
      };
      this.previewing = false;
      await this.refresh();
      return true;
    } catch {
      return false;
    }
  }

  private async refresh() {
    // Someone who has granted this site their location before gets their own
    // weather. Checking the permission never prompts; asking for it would.
    if (this.location === HOME) {
      try {
        const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (status?.state === 'granted') {
          const position = await currentPosition(5000);
          this.location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            place: 'where you are',
          };
        }
      } catch {
        // Fine: Hyderabad it is.
      }
    }

    const { latitude, longitude, place } = this.location;
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
      '&current=temperature_2m,weather_code&timezone=auto';

    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const data = (await response.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
      };
      const code = data.current?.weather_code;
      if (typeof code !== 'number') return;
      this.live = {
        ...classify(code),
        temperature: data.current?.temperature_2m ?? null,
        place,
      };
      if (!this.previewing) this.show(this.live);
    } catch {
      // Offline, blocked, or rate-limited: the room simply stays clear, and
      // says nothing about weather it does not know.
    }
  }

  private show(conditions: Conditions) {
    this.conditions = conditions;
    const { sky, amount } = conditions;

    const [cloud, haze] = SHADE[sky];
    this.daylight.setSky(cloud * (sky === 'cloudy' ? amount : 1), haze);

    const raining = sky === 'rain' || sky === 'storm';
    this.rain.visible = raining;
    this.snow.visible = sky === 'snow';
    this.rain.material.uniforms.uAmount.value = raining ? amount : 0;
    this.snow.material.uniforms.uAmount.value = sky === 'snow' ? amount : 0;
    this.rain.material.uniforms.uSpeed.value = sky === 'storm' ? 8.5 : 6.5;
    this.rain.material.uniforms.uSway.value = sky === 'storm' ? 0.12 : 0.02;
    this.snow.material.uniforms.uSpeed.value = 0.55;
    this.snow.material.uniforms.uSway.value = 0.22;
    this.tint();

    window.clearTimeout(this.lightningTimer);
    if (sky === 'storm') this.scheduleLightning();

    for (const listener of this.listeners) listener(conditions);
  }

  /** Rain reads dark against a bright studio and pale against a dark one. */
  private tint() {
    const dark = this.daylight.darkness;
    const rain = new Color('#7f8ea6').lerp(new Color('#aebdd8'), dark);
    this.rain.material.uniforms.uColor.value.copy(rain);
    this.rain.material.uniforms.uOpacity.value = 0.42 + dark * 0.2;
    this.snow.material.uniforms.uColor.value.set('#ffffff');
    this.snow.material.uniforms.uOpacity.value = 0.95;
  }

  private scheduleLightning() {
    this.lightningTimer = window.setTimeout(() => {
      if (this.conditions.sky !== 'storm') return;
      this.daylight.flash();
      this.onStrike();
      this.scheduleLightning();
    }, 5000 + Math.random() * 12000);
  }

  update(elapsed: number) {
    if (this.rain.visible) this.rain.material.uniforms.uTime.value = elapsed;
    if (this.snow.visible) this.snow.material.uniforms.uTime.value = elapsed;
  }

  private material(vertexShader: string, fragmentShader: string, blending: Blending) {
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uSpeed: { value: 1 },
        uSway: { value: 0 },
        uColor: { value: new Color() },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending,
    });
  }

  /** One random seed per flake. */
  private seeds(count: number) {
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
    const geometry = new BufferGeometry();
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));
    // Positions are computed in the shader; three still wants the attribute.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    return geometry;
  }

  /** Two vertices per drop sharing a seed: the streak's bottom and top. */
  private streaks(count: number) {
    const seeds = new Float32Array(count * 6);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      const seed = [Math.random(), Math.random(), Math.random()];
      seeds.set(seed, i * 6);
      seeds.set(seed, i * 6 + 3);
      ends[i * 2] = 0;
      ends[i * 2 + 1] = 1;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));
    geometry.setAttribute('aEnd', new BufferAttribute(ends, 1));
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 6), 3));
    return geometry;
  }

  destroy() {
    window.clearInterval(this.refreshTimer);
    window.clearTimeout(this.lightningTimer);
  }
}

function currentPosition(timeout: number) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout,
      maximumAge: 30 * 60_000,
      enableHighAccuracy: false,
    });
  });
}

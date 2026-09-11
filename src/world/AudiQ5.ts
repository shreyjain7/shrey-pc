import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loftBand, loftSections } from './geometry';
import { badgeTexture, numberPlateTexture, treadTexture } from './textures';

/**
 * A 2019 Audi Q5 40 TDI quattro, registered CH01BX8725.
 *
 * Built the way everything else in this repository is: procedurally, at 1:1
 * scale in metres, from nothing but three.js primitives and canvases. No model
 * file is fetched and no image is loaded, so the whole car is a few kilobytes
 * of code rather than a few megabytes of glTF.
 *
 * The body is a **loft**. A cross-section is defined as a function of Z — sill
 * height, shoulder crease, roofline, half width at three heights, corner radii
 * — and ~120 of those sections are skinned into one shell. That is what makes
 * the shape read as a car and not as a stack of boxes: the tumblehome, the
 * rising shoulder line, the way the fenders blister over the arches and the
 * roof tapers into the D-pillar all fall out of the section function.
 *
 * Two consequences worth knowing about:
 *
 * - The wheel arches are not cut out of anything. The section's *bottom* rises
 *   into a dome over each axle, so the openings are part of the surface.
 * - The glass is not modelled separately. Windscreen, side windows, backlight
 *   and the panoramic roof are bands of the *same* rings pushed 4mm proud, so
 *   they sit exactly on the surface they belong to, and the shell underneath
 *   them is switched to a black material by the loft's per-quad group callback.
 *
 * Dimensions are the published ones for the FY-generation Q5.
 */

/* -------------------------------------------------------------------------- */
/* The car, by the numbers                                                     */
/* -------------------------------------------------------------------------- */

export const Q5 = {
  registration: 'CH01BX8725',
  model: 'Audi Q5 40 TDI quattro',
  year: 2019,

  length: 4.663,
  width: 1.893,
  height: 1.659,
  wheelbase: 2.819,
  trackFront: 1.617,
  trackRear: 1.604,

  /** Axle positions along Z. +Z is the nose. */
  frontAxle: 1.4345,
  rearAxle: -1.3845,

  /** 235/55 R19: a 482.6mm rim inside a 741mm tyre. */
  wheelRadius: 0.3705,
  rimRadius: 0.2413,
  tyreWidth: 0.235,

  groundClearance: 0.2,
} as const;

/** The spec sheet, as the Garage app lists it. */
export const Q5_SPEC: Array<[string, string]> = [
  ['Registration', 'CH 01 BX 8725'],
  ['Model', 'Q5 40 TDI quattro (FY)'],
  ['Model year', '2019'],
  ['Engine', '1968 cc 2.0 TDI, inline-4, turbo-diesel'],
  ['Power', '190 PS (140 kW) @ 3800–4200 rpm'],
  ['Torque', '400 Nm @ 1750–3000 rpm'],
  ['Transmission', '7-speed S tronic, quattro ultra'],
  ['0–100 km/h', '7.9 s'],
  ['Top speed', '218 km/h'],
  ['Length × width × height', '4663 × 1893 × 1659 mm'],
  ['Wheelbase', '2819 mm'],
  ['Kerb weight', '1770 kg'],
  ['Wheels', '19" 5-twin-spoke, 235/55 R19'],
  ['Fuel tank', '70 litres'],
];

/** Factory paints, as swatches for the viewer. */
export const PAINTS: Array<{ id: string; name: string; colour: number; metallic: number }> = [
  { id: 'mythos', name: 'Mythos Black', colour: 0x121418, metallic: 0.55 },
  { id: 'navarra', name: 'Navarra Blue', colour: 0x123a6e, metallic: 0.62 },
  { id: 'glacier', name: 'Glacier White', colour: 0xe8eaec, metallic: 0.25 },
  { id: 'daytona', name: 'Daytona Grey', colour: 0x585d63, metallic: 0.7 },
  { id: 'manhattan', name: 'Manhattan Grey', colour: 0x3a3d42, metallic: 0.62 },
  { id: 'matador', name: 'Matador Red', colour: 0x8c1420, metallic: 0.55 },
  { id: 'tundra', name: 'Tundra Brown', colour: 0x4a3a30, metallic: 0.6 },
];

/* -------------------------------------------------------------------------- */
/* The cross-section                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Samples per feature of the half-section. Every station uses the same counts,
 * so point `j` means the same thing on every ring and a band sliced out of the
 * stack is always a continuous surface.
 */
const SEG = {
  bottomEdge: 3,
  bottomCorner: 5,
  lowerSide: 6,
  upperSide: 10,
  topCorner: 8,
  topEdge: 5,
};

const HALF_RING =
  SEG.bottomEdge + SEG.bottomCorner + SEG.lowerSide + SEG.upperSide + SEG.topCorner + SEG.topEdge;
/** A full ring is the half mirrored, sharing the two centre points. */
const RING = HALF_RING * 2 - 2;

/** Where each feature starts in the half-section. */
const AT = {
  bottomEdge: 0,
  bottomCorner: SEG.bottomEdge,
  lowerSide: SEG.bottomEdge + SEG.bottomCorner,
  upperSide: SEG.bottomEdge + SEG.bottomCorner + SEG.lowerSide,
  topCorner: SEG.bottomEdge + SEG.bottomCorner + SEG.lowerSide + SEG.upperSide,
  topEdge: SEG.bottomEdge + SEG.bottomCorner + SEG.lowerSide + SEG.upperSide + SEG.topCorner,
  topCentre: HALF_RING - 1,
};

/** Mirror a half-section index onto the left-hand side of the ring. */
const mirror = (index: number) => RING - index;

/** Ring slices the panels are cut from. */
const BAND = {
  /** Side glass: from just above the chrome up to the roof shoulder. */
  sideGlass: [AT.upperSide + 1, AT.upperSide + 7] as const,
  sideGlassLeft: [mirror(AT.upperSide + 7), mirror(AT.upperSide + 1)] as const,
  /**
   * Across the top: the windscreen and the backlight both use this. It stops
   * short of the roof corner, and what is left over is the A- and D-pillar.
   */
  upper: [AT.topCentre - 7, AT.topCentre + 7] as const,
  /** Narrower again, for the panoramic roof panel. */
  roof: [AT.topCentre - 5, AT.topCentre + 5] as const,
  /** The chrome window surround sitting on the shoulder crease. */
  belt: [AT.upperSide, AT.upperSide + 1] as const,
  beltLeft: [mirror(AT.upperSide + 1), mirror(AT.upperSide)] as const,
};

interface Key {
  z: number;
  /** Highest point of the body at this station. */
  top: number;
  /** Height of the shoulder crease — the beltline through the doors. */
  shoulder: number;
  /** Half width at the shoulder: the widest the body gets. */
  wShoulder: number;
  /** Half width of the flat top — bonnet, roof, tailgate. */
  wTop: number;
  /** Radius rolling the flat top into the sides. */
  rTop: number;
}

/**
 * The profile of the car, back to front. Everything between these is
 * smoothstepped, so the surface is continuous without a spline overshooting
 * into a bulge the car does not have.
 */
const KEYS: Key[] = [
  { z: -2.3315, top: 1.296, shoulder: 0.798, wShoulder: 0.780, wTop: 0.664, rTop: 0.12 },
  { z: -2.3095, top: 1.348, shoulder: 0.836, wShoulder: 0.826, wTop: 0.708, rTop: 0.11 },
  { z: -2.2400, top: 1.452, shoulder: 0.920, wShoulder: 0.868, wTop: 0.722, rTop: 0.13 },
  { z: -2.1400, top: 1.548, shoulder: 0.992, wShoulder: 0.897, wTop: 0.690, rTop: 0.14 },
  { z: -2.0000, top: 1.606, shoulder: 1.028, wShoulder: 0.914, wTop: 0.650, rTop: 0.14 },
  { z: -1.8600, top: 1.629, shoulder: 1.041, wShoulder: 0.925, wTop: 0.622, rTop: 0.13 },
  { z: -1.6500, top: 1.637, shoulder: 1.046, wShoulder: 0.931, wTop: 0.608, rTop: 0.12 },
  { z: -1.3845, top: 1.638, shoulder: 1.044, wShoulder: 0.934, wTop: 0.608, rTop: 0.12 },
  { z: -0.9000, top: 1.639, shoulder: 1.035, wShoulder: 0.936, wTop: 0.612, rTop: 0.12 },
  { z: -0.3000, top: 1.636, shoulder: 1.026, wShoulder: 0.936, wTop: 0.616, rTop: 0.12 },
  { z: 0.2000, top: 1.628, shoulder: 1.019, wShoulder: 0.934, wTop: 0.614, rTop: 0.12 },
  { z: 0.4300, top: 1.608, shoulder: 1.016, wShoulder: 0.932, wTop: 0.604, rTop: 0.12 },
  { z: 0.7000, top: 1.462, shoulder: 1.014, wShoulder: 0.930, wTop: 0.636, rTop: 0.14 },
  { z: 0.9500, top: 1.290, shoulder: 1.010, wShoulder: 0.929, wTop: 0.696, rTop: 0.16 },
  { z: 1.1800, top: 1.132, shoulder: 0.982, wShoulder: 0.928, wTop: 0.792, rTop: 0.13 },
  { z: 1.3200, top: 1.100, shoulder: 0.950, wShoulder: 0.928, wTop: 0.838, rTop: 0.1 },
  { z: 1.6000, top: 1.084, shoulder: 0.934, wShoulder: 0.930, wTop: 0.852, rTop: 0.09 },
  { z: 1.9000, top: 1.072, shoulder: 0.926, wShoulder: 0.928, wTop: 0.846, rTop: 0.09 },
  { z: 2.1000, top: 1.046, shoulder: 0.914, wShoulder: 0.912, wTop: 0.824, rTop: 0.1 },
  { z: 2.2400, top: 1.010, shoulder: 0.888, wShoulder: 0.880, wTop: 0.786, rTop: 0.11 },
  { z: 2.3095, top: 0.974, shoulder: 0.850, wShoulder: 0.828, wTop: 0.716, rTop: 0.12 },
  { z: 2.3315, top: 0.930, shoulder: 0.818, wShoulder: 0.778, wTop: 0.662, rTop: 0.12 },
];

const HALF_LENGTH = Q5.length / 2;
const AXLE_Y = Q5.wheelRadius;
/** Radius of the arch opening: a 35mm gap over a 370mm tyre. */
const ARCH_RADIUS = 0.42;

/** Where the doors and the tailgate are cut. */
const SHUT_LINES = [1.0, -0.05, -1.12];

/** Z ranges the glazing occupies. */
/**
 * The side apertures, as Z ranges: quarter light, rear door, front door. The
 * hull's glass cavity and the panes themselves are both cut from this, so the
 * C-pillar between the first two is body colour and cannot drift out of step.
 */
const SIDE_PANES: Array<readonly [number, number]> = [
  [-1.56, -1.22],
  [-1.14, -0.1],
  [-0.06, 1.15],
];

/** The hull cavity behind them. The B-pillar stays black, as it does on the car. */
const SIDE_CAVITY: Array<readonly [number, number]> = [
  [-1.56, -1.22],
  [-1.14, 1.15],
];

const GLASS_Z = {
  side: [-1.6, 1.16] as const,
  windscreen: [0.44, 1.17] as const,
  backlight: [-2.28, -1.82] as const,
  sunroof: [-1.06, 0.16] as const,
};

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Fritsch–Carlson slopes for a monotone cubic through the keyframes.
 *
 * This matters more than it sounds. Smoothstepping between keyframes forces
 * the slope to zero *at* every keyframe, so a long ramp like the windscreen
 * comes out terraced — each keyframe becomes a visible step across the glass.
 * A monotone cubic keeps C1 continuity through the knots without overshooting
 * into bulges the car does not have.
 */
function monotoneSlopes(xs: number[], ys: number[]): number[] {
  const count = xs.length;
  const widths: number[] = [];
  const secants: number[] = [];

  for (let i = 0; i < count - 1; i += 1) {
    widths.push(xs[i + 1] - xs[i]);
    secants.push((ys[i + 1] - ys[i]) / widths[i]);
  }

  const slopes = new Array<number>(count).fill(0);
  slopes[0] = secants[0];
  slopes[count - 1] = secants[count - 2];

  for (let i = 1; i < count - 1; i += 1) {
    // A turning point gets a flat tangent, which is what stops the overshoot.
    if (secants[i - 1] * secants[i] <= 0) continue;
    const a = 2 * widths[i] + widths[i - 1];
    const b = widths[i] + 2 * widths[i - 1];
    slopes[i] = (a + b) / (a / secants[i - 1] + b / secants[i]);
  }

  return slopes;
}

type Channel = 'top' | 'shoulder' | 'wShoulder' | 'wTop' | 'rTop';

const CHANNELS: Channel[] = ['top', 'shoulder', 'wShoulder', 'wTop', 'rTop'];
const KNOTS = KEYS.map((key) => key.z);
const CURVES = new Map<Channel, { values: number[]; slopes: number[] }>(
  CHANNELS.map((channel) => {
    const values = KEYS.map((key) => key[channel]);
    return [channel, { values, slopes: monotoneSlopes(KNOTS, values) }];
  }),
);

/** The interpolated profile at any Z. */
function keyAt(z: number): Key {
  if (z <= KNOTS[0]) return KEYS[0];
  if (z >= KNOTS[KNOTS.length - 1]) return KEYS[KEYS.length - 1];

  let index = 0;
  while (index < KNOTS.length - 2 && KNOTS[index + 1] < z) index += 1;

  const width = KNOTS[index + 1] - KNOTS[index];
  const t = (z - KNOTS[index]) / width;
  const t2 = t * t;
  const t3 = t2 * t;

  // Cubic Hermite basis.
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const at = (channel: Channel) => {
    const curve = CURVES.get(channel)!;
    return (
      h00 * curve.values[index] +
      h10 * width * curve.slopes[index] +
      h01 * curve.values[index + 1] +
      h11 * width * curve.slopes[index + 1]
    );
  };

  return {
    z,
    top: at('top'),
    shoulder: at('shoulder'),
    wShoulder: at('wShoulder'),
    wTop: at('wTop'),
    rTop: at('rTop'),
  };
}

/**
 * Height of the wheel arch lip at this station. A slightly squared-off dome
 * rather than a circle, because that is the shape Audi actually stamps.
 */
function archLip(z: number) {
  let lip = 0;
  for (const axle of [Q5.frontAxle, Q5.rearAxle]) {
    const distance = Math.abs(z - axle);
    if (distance >= ARCH_RADIUS) continue;
    const t = distance / ARCH_RADIUS;
    lip = Math.max(lip, AXLE_Y + ARCH_RADIUS * Math.pow(1 - Math.pow(t, 2.3), 1 / 2.3));
  }
  return lip;
}

/** Underside of the sills, dropping to the bumper valances at either end. */
function rocker(z: number) {
  const end = smoothstep(clamp((Math.abs(z) - 1.75) / 0.55, 0, 1));
  return 0.302 - 0.048 * end;
}

/** One closed cross-section, wound anticlockwise seen from the front. */
function ringAt(z: number): Vector3[] {
  const key = keyAt(z);
  const lip = archLip(z);
  const bottom = Math.max(rocker(z), lip);
  // 1 directly over an axle, 0 clear of the arch.
  const blister = clamp((lip - AXLE_Y) / ARCH_RADIUS, 0, 1);

  const wShoulder = key.wShoulder + 0.012 * blister;
  const wBottom = wShoulder - 0.105 + 0.095 * blister;

  const top = Math.max(key.top, bottom + 0.08);
  const wTop = Math.max(key.wTop, 0.05);
  const rTop = Math.min(key.rTop, wTop * 0.85, (top - bottom) * 0.34);
  const shoulder = clamp(key.shoulder, bottom + 0.022, top - rTop - 0.016);
  // Crisp at the arch lip, softly rolled along the sills.
  const rBottom = clamp(0.055 - 0.042 * blister, 0.004, Math.min(wBottom * 0.5, (shoulder - bottom) * 0.5));

  const half: Vector3[] = [];
  const add = (x: number, y: number) => half.push(new Vector3(x, y, z));

  // Underbody, out to where the bottom edge starts to roll.
  const bx = wBottom - rBottom;
  for (let i = 0; i < SEG.bottomEdge; i += 1) add((bx * i) / SEG.bottomEdge, bottom);

  // The roll itself.
  for (let i = 0; i < SEG.bottomCorner; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / SEG.bottomCorner);
    add(bx + rBottom * Math.cos(angle), bottom + rBottom + rBottom * Math.sin(angle));
  }

  // Sill and lower door, up to the shoulder crease.
  for (let i = 0; i < SEG.lowerSide; i += 1) {
    const t = i / SEG.lowerSide;
    add(wBottom + (wShoulder - wBottom) * t, bottom + rBottom + (shoulder - bottom - rBottom) * t);
  }

  // Shoulder to the roof: the tumblehome, and where the side glass lives.
  const upperTop = top - rTop;
  for (let i = 0; i < SEG.upperSide; i += 1) {
    const t = i / SEG.upperSide;
    add(wShoulder + (wTop - wShoulder) * t, shoulder + (upperTop - shoulder) * t);
  }

  // Roll into the roof.
  for (let i = 0; i < SEG.topCorner; i += 1) {
    const angle = (Math.PI / 2) * (i / SEG.topCorner);
    add(wTop - rTop + rTop * Math.cos(angle), upperTop + rTop * Math.sin(angle));
  }

  // The flat top, ending exactly on the centreline.
  for (let i = 0; i < SEG.topEdge; i += 1) {
    const t = i / (SEG.topEdge - 1);
    add((wTop - rTop) * (1 - t), top);
  }

  const ring = half.slice();
  for (let i = half.length - 2; i >= 1; i -= 1) {
    ring.push(new Vector3(-half[i].x, half[i].y, z));
  }
  return ring;
}

/** Stations for the whole car, densified where a shut line has to be crisp. */
function stationsFor(count: number): number[] {
  const zs: number[] = [];
  for (let i = 0; i < count; i += 1) {
    zs.push(-HALF_LENGTH + Q5.length * (i / (count - 1)));
  }
  for (const line of SHUT_LINES) zs.push(line - 0.008, line + 0.008);
  // Keep the chamfer at the nose and tail from being smeared across a station.
  zs.push(-HALF_LENGTH + 0.022, HALF_LENGTH - 0.022);
  return [...new Set(zs)].sort((a, b) => a - b);
}

/** Rings over a Z range, for a panel that only covers part of the car. */
function ringsBetween(from: number, to: number, count: number): Vector3[][] {
  const rings: Vector3[][] = [];
  for (let i = 0; i < count; i += 1) {
    rings.push(ringAt(from + (to - from) * (i / (count - 1))));
  }
  return rings;
}

const within = (value: number, range: readonly [number, number]) =>
  value >= range[0] && value <= range[1];

/* -------------------------------------------------------------------------- */
/* Small shape helpers                                                         */
/* -------------------------------------------------------------------------- */

/** A closed polygon with rounded corners, for lamps and the Singleframe. */
function polygonShape(points: Array<[number, number]>, radius: number): Shape {
  const shape = new Shape();
  const count = points.length;

  for (let i = 0; i < count; i += 1) {
    const previous = new Vector2(...points[(i - 1 + count) % count]);
    const current = new Vector2(...points[i]);
    const next = new Vector2(...points[(i + 1) % count]);

    const toPrevious = previous.clone().sub(current);
    const toNext = next.clone().sub(current);
    const r = Math.min(radius, toPrevious.length() / 2, toNext.length() / 2);

    const start = current.clone().add(toPrevious.normalize().multiplyScalar(r));
    const end = current.clone().add(toNext.normalize().multiplyScalar(r));

    if (i === 0) shape.moveTo(start.x, start.y);
    else shape.lineTo(start.x, start.y);
    shape.quadraticCurveTo(current.x, current.y, end.x, end.y);
  }

  shape.closePath();
  return shape;
}

/** Extrude a shape and centre it on its own thickness. */
function slab(shape: Shape, depth: number, bevel = 0): BufferGeometry {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** The four rings, as geometry rather than a decal. */
function fourRings(radius: number, tube: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i += 1) {
    const ring = new TorusGeometry(radius, tube, 8, 36);
    ring.translate((i - 1.5) * radius * 1.55, 0, 0);
    parts.push(ring);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) return parts[0];
  for (const part of parts) part.dispose();
  return merged;
}

/* -------------------------------------------------------------------------- */
/* The car                                                                     */
/* -------------------------------------------------------------------------- */

export type CarQuality = 'low' | 'medium' | 'high';

export class AudiQ5 {
  readonly group = new Group();

  /** Everything the paint swatches repaint. */
  private readonly paint: MeshPhysicalMaterial;
  private readonly lamps: MeshStandardMaterial[] = [];
  private readonly tails: MeshStandardMaterial[] = [];
  private readonly beams: PointLight[] = [];
  private readonly owned = new Set<BufferGeometry | Material>();

  private lightsOn = false;

  /**
   * The shared trim materials. Built once and handed out by reference, so the
   * whole car draws from a handful of programs rather than one per part.
   */
  private readonly chrome = this.standard({
    color: 0xc4cad2,
    metalness: 1,
    roughness: 0.2,
    envMapIntensity: 1.15,
  });

  private readonly satin = this.standard({ color: 0x7d848d, metalness: 0.9, roughness: 0.38 });

  private readonly blackGloss = this.standard({ color: 0x0d0f12, metalness: 0.35, roughness: 0.14 });

  private readonly blackTrim = this.standard({ color: 0x17191d, metalness: 0.1, roughness: 0.72 });

  /** Dark anodised aluminium: the skid plates at either end. */
  private readonly skid = this.standard({ color: 0x585f68, metalness: 0.85, roughness: 0.46 });

  constructor(quality: CarQuality = 'high') {
    const stationCount = quality === 'high' ? 132 : quality === 'medium' ? 96 : 68;

    this.paint = this.own(
      new MeshPhysicalMaterial({
        color: PAINTS[1].colour,
        metalness: PAINTS[1].metallic,
        roughness: 0.26,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.15,
      }),
    );

    this.group.add(this.buildBody(stationCount));
    this.group.add(this.buildGlass());
    this.group.add(this.buildFront());
    this.group.add(this.buildRear());
    this.group.add(this.buildSides());
    this.group.add(this.buildRoof());
    this.group.add(this.buildInterior());
    this.group.add(this.buildWheels(quality));

    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    this.setLights(false);
  }

  /* --- Materials -------------------------------------------------------- */

  private own<T extends BufferGeometry | Material>(thing: T): T {
    this.owned.add(thing);
    return thing;
  }

  private standard(options: ConstructorParameters<typeof MeshStandardMaterial>[0]) {
    return this.own(new MeshStandardMaterial(options));
  }

  private mesh(geometry: BufferGeometry, material: Material, group?: Group) {
    const mesh = new Mesh(this.own(geometry), material);
    group?.add(mesh);
    return mesh;
  }

  /* --- The shell -------------------------------------------------------- */

  private buildBody(stationCount: number) {
    const stations = stationsFor(stationCount);
    const rings = stations.map(ringAt);

    const cavity = this.standard({ color: 0x07080a, metalness: 0.2, roughness: 0.6 });

    /**
     * Which material a given quad wears. This is where the car stops being a
     * single blob: window apertures, the underbody and the panel gaps all come
     * out of the same shell with a second material rather than extra meshes.
     */
    const group = (station: number, j: number) => {
      const z = (stations[station] + stations[station + 1]) / 2;

      // Underbody.
      if (j < SEG.bottomEdge || j > RING - SEG.bottomEdge) return 1;

      // Door and tailgate shut lines.
      if (j >= AT.bottomCorner + 1 && j <= mirror(AT.bottomCorner + 1)) {
        const side = j <= AT.topCorner + 2 || j >= mirror(AT.topCorner + 2);
        if (side && SHUT_LINES.some((line) => Math.abs(z - line) < 0.005)) return 1;
      }

      // Side glass.
      const onSide =
        (j >= BAND.sideGlass[0] && j <= BAND.sideGlass[1]) ||
        (j >= BAND.sideGlassLeft[0] && j <= BAND.sideGlassLeft[1]);
      if (onSide && SIDE_CAVITY.some((range) => within(z, range))) return 1;

      // Windscreen, backlight and the panoramic roof panel.
      if (j >= BAND.upper[0] && j <= BAND.upper[1]) {
        if (within(z, GLASS_Z.windscreen) || within(z, GLASS_Z.backlight)) return 1;
      }
      if (j >= BAND.roof[0] && j <= BAND.roof[1] && within(z, GLASS_Z.sunroof)) return 1;

      return 0;
    };

    const geometry = loftSections(rings, {
      capStart: true,
      capEnd: true,
      group,
      capGroup: 0,
    });

    const body = new Mesh(this.own(geometry), [this.paint, cavity]);
    body.name = 'body';
    return body;
  }

  /* --- Glazing ---------------------------------------------------------- */

  private glassMaterial(opacity: number) {
    return this.own(
      new MeshPhysicalMaterial({
        color: 0x0a0e14,
        metalness: 0,
        roughness: 0.05,
        transparent: true,
        opacity,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.05,
      }),
    );
  }

  private buildGlass() {
    const glass = new Group();
    glass.name = 'glazing';

    const tinted = this.glassMaterial(0.86);
    const clear = this.glassMaterial(0.46);

    // Windscreen and backlight: bands across the top of the same rings.
    const screen = ringsBetween(GLASS_Z.windscreen[0], GLASS_Z.windscreen[1], 16);
    this.mesh(loftBand(screen, BAND.upper[0], BAND.upper[1], 0.002), clear, glass);

    const back = ringsBetween(GLASS_Z.backlight[0], GLASS_Z.backlight[1], 12);
    this.mesh(loftBand(back, BAND.upper[0], BAND.upper[1], 0.002), tinted, glass);

    // Panoramic roof.
    const sunroof = ringsBetween(GLASS_Z.sunroof[0], GLASS_Z.sunroof[1], 14);
    this.mesh(loftBand(sunroof, BAND.roof[0], BAND.roof[1], 0.002), tinted, glass);

    // Side glass, one pane per door plus the quarter light.
    for (const [from, to] of SIDE_PANES) {
      const rings = ringsBetween(from, to, 14);
      // Only the windscreen is clear glass; everything aft of it is privacy
      // tinted, which is how the car leaves the factory.
      const material = tinted;
      this.mesh(loftBand(rings, BAND.sideGlass[0], BAND.sideGlass[1], 0.003), material, glass);
      this.mesh(
        loftBand(rings, BAND.sideGlassLeft[0], BAND.sideGlassLeft[1], 0.003),
        material,
        glass,
      );
    }

    return glass;
  }

  /* --- Sides: trim, mirrors, handles, arches ---------------------------- */

  private buildSides() {
    const sides = new Group();
    sides.name = 'sides';

    const chrome = this.chrome;

    // Window surround: along the shoulder crease the glass sits on, and again
    // along its top edge, so it reads as a frame rather than a stripe. Brushed
    // rather than polished — mirror chrome at this width blows out under any
    // lighting rig worth using.
    const surround = this.standard({
      color: 0xa9b0b9,
      metalness: 1,
      roughness: 0.3,
      envMapIntensity: 0.95,
    });

    const cabin = ringsBetween(GLASS_Z.side[0], GLASS_Z.side[1], 30);
    const top = BAND.sideGlass[1];
    for (const [from, to] of [
      BAND.belt,
      BAND.beltLeft,
      [top, top + 1] as const,
      [mirror(top + 1), mirror(top)] as const,
    ]) {
      this.mesh(loftBand(cabin, from, to, 0.004), surround, sides);
    }

    // Aluminium sill blades, tucked under the doors rather than standing off
    // them — this is trim, not a running board.
    for (const side of [1, -1]) {
      const sill = this.mesh(new BoxGeometry(0.035, 0.04, 2.3), this.satin, sides);
      sill.position.set(side * 0.878, 0.345, -0.06);
      sill.rotation.z = side * 0.2;
    }

    // Door handles, sitting just below the chrome.
    for (const side of [1, -1]) {
      for (const z of [0.5, -0.66]) {
        const recess = this.mesh(new BoxGeometry(0.018, 0.052, 0.2), this.blackGloss, sides);
        recess.position.set(side * 0.932, 0.962, z);

        const handle = this.mesh(new BoxGeometry(0.032, 0.03, 0.15), chrome, sides);
        handle.position.set(side * 0.942, 0.966, z);
      }
    }

    // Mirrors, on the sail panel at the base of the A-pillar.
    for (const side of [1, -1]) {
      const wing = new Group();
      wing.position.set(side * 0.878, 1.046, 0.98);

      const arm = this.mesh(new BoxGeometry(0.09, 0.05, 0.085), this.blackGloss);
      arm.position.set(side * 0.045, -0.03, -0.03);
      wing.add(arm);

      const shell = this.mesh(
        slab(
          polygonShape([[-0.1, -0.048], [0.1, -0.058], [0.11, 0.048], [-0.095, 0.052]], 0.028),
          0.08,
          0.006,
        ),
        this.blackGloss,
      );
      shell.position.set(side * 0.115, 0, 0);
      shell.rotation.y = Math.PI / 2;
      wing.add(shell);

      const glass = this.mesh(new PlaneGeometry(0.175, 0.09), this.satin);
      glass.position.set(side * 0.118, 0, -0.038);
      glass.rotation.y = Math.PI + side * 0.14;
      wing.add(glass);

      const indicator = this.standard({
        color: 0xff8c1a,
        emissive: 0xff7a00,
        emissiveIntensity: 0.35,
        roughness: 0.3,
      });
      this.lamps.push(indicator);
      const blade = this.mesh(new BoxGeometry(0.014, 0.014, 0.1), indicator);
      blade.position.set(side * 0.152, -0.012, 0.015);
      wing.add(blade);

      sides.add(wing);
    }

    return sides;
  }

  /* --- Roof ------------------------------------------------------------- */

  private buildRoof() {
    const roof = new Group();
    roof.name = 'roof';

    // Anodised roof rails, bedded into the gutter at each end.
    for (const side of [1, -1]) {
      const rail = this.mesh(new BoxGeometry(0.045, 0.038, 1.56), this.satin, roof);
      rail.position.set(side * 0.545, 1.655, -0.48);

      for (const z of [0.22, -1.18]) {
        const foot = this.mesh(new BoxGeometry(0.042, 0.05, 0.1), this.blackTrim, roof);
        foot.position.set(side * 0.545, 1.625, z);
      }
    }

    // Shark-fin aerial.
    const fin = this.mesh(
      slab(polygonShape([[-0.085, -0.005], [0.075, -0.005], [0.055, 0.052], [-0.085, 0.062]], 0.02), 0.036, 0.004),
      this.paint,
      roof,
    );
    fin.position.set(0, 1.634, -1.42);

    // Roof spoiler over the backlight.
    const spoiler = this.mesh(new BoxGeometry(1.1, 0.045, 0.24), this.paint, roof);
    spoiler.position.set(0, 1.628, -1.76);
    spoiler.rotation.x = 0.3;

    return roof;
  }

  /* --- Front end -------------------------------------------------------- */

  private buildFront() {
    const front = new Group();
    front.name = 'front';

    // The loft's end cap is a flat plane here, so every part in this group is
    // measured off it: negative is inside the bodywork, positive is proud.
    const nose = HALF_LENGTH;
    const chrome = this.chrome;
    const mesh = this.standard({ color: 0x0b0c0f, metalness: 0.55, roughness: 0.42 });

    /* Singleframe: the wide hexagon that makes an Audi an Audi. */
    const grilleOutline: Array<[number, number]> = [
      [-0.5, 0.21],
      [0.5, 0.21],
      [0.552, 0.02],
      [0.45, -0.21],
      [-0.45, -0.21],
      [-0.552, 0.02],
    ];
    const grille = new Group();
    grille.position.set(0, 0.705, nose);

    const outer = polygonShape(grilleOutline, 0.045);
    const inner = polygonShape(
      grilleOutline.map(([x, y]) => [x * 0.95, y * 0.89]) as Array<[number, number]>,
      0.04,
    );
    outer.holes.push(new Shape(inner.getPoints(48).reverse()));

    const surround = this.mesh(slab(outer, 0.045, 0.004), chrome);
    surround.position.z = 0.014;
    grille.add(surround);

    const backing = this.mesh(slab(inner, 0.04), mesh);
    backing.position.z = -0.016;
    grille.add(backing);

    // Horizontal slats: the standard Q5 grille, not the S line honeycomb.
    for (let i = 0; i < 6; i += 1) {
      const t = i / 5;
      const y = 0.172 - t * 0.344;
      // Follow the hexagon's taper above and below its widest point.
      const width = 2 * (0.552 - Math.abs(y - 0.02) * 0.42) - 0.06;
      const slat = this.mesh(new BoxGeometry(width, 0.02, 0.022), chrome);
      slat.position.set(0, y, 0.008);
      grille.add(slat);
    }
    front.add(grille);

    // The rings, on the bonnet edge above the grille.
    const rings = this.mesh(fourRings(0.05, 0.008), chrome, front);
    rings.position.set(0, 0.888, nose + 0.014);

    /* Matrix LED headlamps, flush with the nose. */
    const lensMaterial = this.own(
      new MeshPhysicalMaterial({
        color: 0x9fb4c8,
        metalness: 0,
        roughness: 0.04,
        transparent: true,
        opacity: 0.34,
        clearcoat: 1,
      }),
    );

    for (const side of [1, -1]) {
      const lamp = new Group();
      lamp.position.set(side * 0.665, 0.812, nose);

      const outline: Array<[number, number]> = [
        [-0.142, -0.05],
        [0.132, -0.062],
        [0.142, 0.05],
        [-0.126, 0.062],
      ];
      const shell = polygonShape(outline, 0.024);

      const housing = this.mesh(slab(shell, 0.1), this.standard({ color: 0x0a0b0e, roughness: 0.5 }));
      housing.position.z = -0.05;
      lamp.add(housing);

      const reflector = this.mesh(
        slab(shell, 0.008),
        this.standard({ color: 0x2c3440, metalness: 0.8, roughness: 0.28 }),
      );
      reflector.position.z = -0.004;
      lamp.add(reflector);

      const lens = this.mesh(slab(shell, 0.028, 0.005), lensMaterial);
      lens.position.z = 0.014;
      lamp.add(lens);

      // Daytime running light: the wing-shaped signature.
      const drl = this.standard({
        color: 0xf2f7ff,
        emissive: 0xd8e8ff,
        emissiveIntensity: 1,
        roughness: 0.25,
      });
      this.lamps.push(drl);

      const bar = this.mesh(new BoxGeometry(0.24, 0.014, 0.012), drl);
      bar.position.set(0, 0.032, 0.012);
      bar.rotation.z = -side * 0.04;
      lamp.add(bar);

      const wing = this.mesh(new BoxGeometry(0.085, 0.012, 0.01), drl);
      wing.position.set(-side * 0.05, -0.036, 0.012);
      lamp.add(wing);

      // Projectors.
      for (const offset of [-0.05, 0.035]) {
        const projector = this.mesh(new SphereGeometry(0.026, 16, 12), this.satin);
        projector.position.set(offset, -0.004, 0.006);
        projector.scale.z = 0.5;
        lamp.add(projector);
      }

      // Indicator strip along the lower edge.
      const indicator = this.standard({
        color: 0xff8c1a,
        emissive: 0xff7a00,
        emissiveIntensity: 0.3,
        roughness: 0.3,
      });
      this.lamps.push(indicator);
      const arrow = this.mesh(new BoxGeometry(0.2, 0.009, 0.009), indicator);
      lamp.add(arrow);
      arrow.position.set(0, -0.05, 0.012);

      const beam = new PointLight(0xdfeaff, 0, 4.5, 2);
      beam.position.set(0, 0, 0.3);
      lamp.add(beam);
      this.beams.push(beam);

      front.add(lamp);
    }

    /* Bumper: plate, corner intakes and the skid plate. */
    front.add(this.plate(new Vector3(0, 0.392, nose + 0.014), 0));

    for (const side of [1, -1]) {
      const intake = this.mesh(
        slab(
          polygonShape([[-0.15, -0.068], [0.15, -0.08], [0.146, 0.068], [-0.146, 0.078]], 0.03),
          0.05,
        ),
        mesh,
        front,
      );
      intake.position.set(side * 0.53, 0.4, nose - 0.008);

      // Vertical fins in the corner intakes.
      for (let i = 0; i < 3; i += 1) {
        const fin = this.mesh(new BoxGeometry(0.01, 0.12, 0.018), this.satin, front);
        fin.position.set(side * (0.46 + i * 0.07), 0.4, nose + 0.008);
      }
    }

    // Skid plate under the whole face.
    const valance = this.mesh(new BoxGeometry(1.12, 0.055, 0.14), this.skid, front);
    valance.position.set(0, 0.288, nose - 0.055);
    valance.rotation.x = 0.4;

    return front;
  }

  /* --- Rear end --------------------------------------------------------- */

  private buildRear() {
    const rear = new Group();
    rear.name = 'rear';

    // Turned to face aft, so every part below is laid out the same way as the
    // front: local +Z is proud of the tailgate, local -Z is inside it.
    const face = new Group();
    face.rotation.y = Math.PI;
    face.position.z = -HALF_LENGTH;
    rear.add(face);

    const chrome = this.chrome;

    /* Tail lamps: a cluster on the tailgate that wraps onto the quarter. */
    const lensMaterial = this.own(
      new MeshPhysicalMaterial({
        color: 0x5a0a12,
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.68,
        clearcoat: 1,
      }),
    );

    const bar = this.standard({
      color: 0xff2b3c,
      emissive: 0xff1f2e,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });
    this.tails.push(bar);

    // The cluster's inner surface: dim red parked, lit when the lights are on.
    const glow = this.standard({
      color: 0x9e1420,
      emissive: 0xd4111f,
      emissiveIntensity: 0.2,
      roughness: 0.45,
    });
    this.tails.push(glow);

    for (const side of [1, -1]) {
      const cluster = new Group();
      cluster.position.set(side * 0.45, 1.108, 0);

      const outline: Array<[number, number]> = [
        [-0.25, -0.062],
        [0.238, -0.072],
        [0.256, 0.062],
        [-0.232, 0.072],
      ];
      const shell = polygonShape(outline, 0.028);

      const housing = this.mesh(slab(shell, 0.07), this.standard({ color: 0x120508, roughness: 0.5 }));
      housing.position.z = -0.035;
      cluster.add(housing);

      const backing = this.mesh(slab(shell, 0.008), glow);
      backing.position.z = -0.006;
      cluster.add(backing);

      const lens = this.mesh(slab(shell, 0.03, 0.005), lensMaterial);
      lens.position.z = 0.012;
      cluster.add(lens);

      const strip = this.mesh(new BoxGeometry(0.44, 0.016, 0.012), bar);
      strip.position.set(0, 0.024, 0.01);
      cluster.add(strip);

      const hook = this.mesh(new BoxGeometry(0.12, 0.015, 0.01), bar);
      hook.position.set(side * 0.13, -0.028, 0.01);
      cluster.add(hook);

      face.add(cluster);
    }

    /* Badging. */
    const rings = this.mesh(fourRings(0.048, 0.0078), chrome, face);
    rings.position.set(0, 0.915, 0.012);

    face.add(this.badge('Q5', new Vector3(-0.4, 0.735, 0.008), 0.19, 0.048));
    face.add(this.badge('40 TDI', new Vector3(0.36, 0.74, 0.008), 0.175, 0.04));
    face.add(this.badge('quattro', new Vector3(0.36, 0.688, 0.008), 0.185, 0.034, 600));

    /* Plate, bumper, diffuser and the exhaust trims. */
    face.add(this.plate(new Vector3(0, 0.52, 0.012), 0));

    const diffuser = this.mesh(new BoxGeometry(0.96, 0.09, 0.13), this.skid, face);
    diffuser.position.set(0, 0.3, -0.055);
    diffuser.rotation.x = -0.42;

    const reflectorMaterial = this.standard({
      color: 0x8c0f16,
      emissive: 0x6a0a10,
      emissiveIntensity: 0.2,
      roughness: 0.4,
    });
    this.tails.push(reflectorMaterial);

    for (const side of [1, -1]) {
      const outlet = this.mesh(
        slab(polygonShape([[-0.085, -0.03], [0.085, -0.03], [0.07, 0.03], [-0.07, 0.03]], 0.016), 0.05),
        chrome,
        face,
      );
      outlet.position.set(side * 0.5, 0.36, 0.008);

      const pipe = this.mesh(
        new CylinderGeometry(0.026, 0.026, 0.1, 12, 1, true),
        this.standard({ color: 0x08090b, roughness: 0.85, side: DoubleSide }),
        face,
      );
      pipe.position.set(side * 0.5, 0.36, -0.03);
      pipe.rotation.x = Math.PI / 2;

      const marker = this.mesh(new BoxGeometry(0.075, 0.026, 0.014), reflectorMaterial, face);
      marker.position.set(side * 0.66, 0.375, 0.006);
    }

    // Reversing lamps, tucked under the clusters.
    const reverse = this.standard({
      color: 0xf4f7ff,
      emissive: 0xdfe9ff,
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    this.lamps.push(reverse);
    for (const side of [1, -1]) {
      const lamp = this.mesh(new BoxGeometry(0.1, 0.02, 0.01), reverse, face);
      lamp.position.set(side * 0.28, 1.018, 0.008);
    }

    return rear;
  }

  /* --- Plates and badges ------------------------------------------------ */

  /** The registration itself: CH01BX8725, on a 500 x 120mm HSRP. */
  private plate(position: Vector3, rotationY: number) {
    const group = new Group();
    group.position.copy(position);
    group.rotation.y = rotationY;

    const backing = this.mesh(new BoxGeometry(0.5, 0.12, 0.012), this.blackTrim, group);
    backing.position.z = -0.008;

    const texture = numberPlateTexture(Q5.registration);
    const face = this.mesh(
      new PlaneGeometry(0.5, 0.12),
      this.standard({ map: texture, roughness: 0.42, metalness: 0 }),
      group,
    );
    face.position.z = 0.0005;

    return group;
  }

  private badge(text: string, position: Vector3, width: number, height: number, weight = 700) {
    const texture = badgeTexture(text, weight);
    const material = this.standard({
      map: texture,
      transparent: true,
      metalness: 0.55,
      roughness: 0.3,
      envMapIntensity: 1.2,
    });

    const mesh = this.mesh(new PlaneGeometry(width, height), material);
    mesh.position.copy(position);
    return mesh;
  }

  /* --- Interior --------------------------------------------------------- */

  private buildInterior() {
    const cabin = new Group();
    cabin.name = 'interior';

    const leather = this.standard({ color: 0x22242a, roughness: 0.78, metalness: 0.04 });
    const plastic = this.standard({ color: 0x16181d, roughness: 0.85 });

    const floor = this.mesh(new BoxGeometry(1.6, 0.04, 2.7), plastic, cabin);
    floor.position.set(0, 0.66, -0.15);

    const dash = this.mesh(new BoxGeometry(1.62, 0.2, 0.34), plastic, cabin);
    dash.position.set(0, 1.02, 1.06);
    dash.rotation.x = 0.22;

    const screen = this.mesh(
      new PlaneGeometry(0.26, 0.12),
      this.standard({ color: 0x0a1220, emissive: 0x14304e, emissiveIntensity: 0.5, roughness: 0.2 }),
      cabin,
    );
    screen.position.set(0.05, 1.12, 0.92);
    screen.rotation.x = -0.18;

    const console3d = this.mesh(new BoxGeometry(0.34, 0.22, 0.9), plastic, cabin);
    console3d.position.set(0, 0.78, 0.5);

    // Right-hand drive: Chandigarh plates, so the wheel is on the right.
    const wheel = this.mesh(new TorusGeometry(0.175, 0.022, 10, 28), leather, cabin);
    wheel.position.set(0.36, 1.06, 0.82);
    wheel.rotation.x = 1.12;

    const column = this.mesh(new CylinderGeometry(0.035, 0.035, 0.2, 10), plastic, cabin);
    column.position.set(0.36, 1.0, 0.9);
    column.rotation.x = Math.PI / 2 - 0.45;

    const seat = (x: number, z: number) => {
      const base = this.mesh(new BoxGeometry(0.5, 0.14, 0.5), leather, cabin);
      base.position.set(x, 0.78, z);

      const back = this.mesh(new BoxGeometry(0.5, 0.62, 0.14), leather, cabin);
      back.position.set(x, 1.08, z - 0.26);
      back.rotation.x = -0.16;

      const rest = this.mesh(new BoxGeometry(0.26, 0.18, 0.12), leather, cabin);
      rest.position.set(x, 1.42, z - 0.31);
    };

    seat(0.36, 0.36);
    seat(-0.36, 0.36);
    seat(0.36, -0.5);
    seat(-0.36, -0.5);

    const bench = this.mesh(new BoxGeometry(1.34, 0.14, 0.5), leather, cabin);
    bench.position.set(0, 0.78, -0.5);

    return cabin;
  }

  /* --- Wheels ----------------------------------------------------------- */

  private buildWheels(quality: CarQuality) {
    const wheels = new Group();
    wheels.name = 'wheels';

    const template = this.wheel(quality);

    const positions: Array<[number, number]> = [
      [Q5.trackFront / 2, Q5.frontAxle],
      [-Q5.trackFront / 2, Q5.frontAxle],
      [Q5.trackRear / 2, Q5.rearAxle],
      [-Q5.trackRear / 2, Q5.rearAxle],
    ];

    for (const [x, z] of positions) {
      const wheel = template.clone();
      wheel.position.set(x, AXLE_Y, z);
      // The lathe and the alloy face are built about +Y; swing the assembly so
      // the outer face points away from the car on whichever side it is on.
      wheel.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      wheels.add(wheel);
    }

    return wheels;
  }

  /** One 19" 5-twin-spoke alloy inside a 235/55 tyre, built about +Y. */
  private wheel(quality: CarQuality) {
    const wheel = new Group();

    const halfWidth = Q5.tyreWidth / 2;
    const rubber = this.standard({ color: 0x151517, roughness: 0.92, metalness: 0.02 });

    // Tyre carcass: a lathe of the real sidewall profile.
    const profile: Array<[number, number]> = [
      [Q5.rimRadius, -halfWidth],
      [Q5.rimRadius + 0.022, -halfWidth - 0.004],
      [0.3, -halfWidth + 0.005],
      [0.343, -halfWidth + 0.02],
      [0.364, -halfWidth + 0.04],
      [0.3695, -halfWidth + 0.062],
      [0.3705, 0],
      [0.3695, halfWidth - 0.062],
      [0.364, halfWidth - 0.04],
      [0.343, halfWidth - 0.02],
      [0.3, halfWidth - 0.005],
      [Q5.rimRadius + 0.022, halfWidth + 0.004],
      [Q5.rimRadius, halfWidth],
    ];
    const segments = quality === 'low' ? 24 : quality === 'medium' ? 36 : 48;
    const tyre = this.mesh(
      new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), segments),
      rubber,
      wheel,
    );
    tyre.rotation.y = Math.PI;

    // Tread, as a thin band a hair proud of the carcass.
    const tread = treadTexture();
    const treadMesh = this.mesh(
      new CylinderGeometry(0.3712, 0.3712, 0.17, segments, 1, true),
      this.standard({ map: tread, color: 0x1b1b1e, roughness: 0.95, metalness: 0.02 }),
      wheel,
    );
    treadMesh.rotation.y = Math.PI;

    // Sidewall shoulder, so the rubber is not one flat tone.
    const shoulder = this.mesh(
      new TorusGeometry(0.336, 0.036, 8, segments),
      this.standard({ color: 0x111113, roughness: 0.96 }),
      wheel,
    );
    shoulder.rotation.x = Math.PI / 2;
    shoulder.scale.set(1, 1, 0.55);

    // Rim: barrel, outer lip, and the dish the spokes sit in.
    const alloy = this.standard({ color: 0xb6bcc4, metalness: 0.95, roughness: 0.24, envMapIntensity: 1.3 });

    const barrel = this.mesh(
      new CylinderGeometry(Q5.rimRadius, Q5.rimRadius, 0.2, segments, 1, true),
      this.standard({ color: 0x3e4247, metalness: 0.9, roughness: 0.4, side: DoubleSide }),
      wheel,
    );
    barrel.position.y = 0.005;

    const lip = this.mesh(new TorusGeometry(Q5.rimRadius - 0.006, 0.012, 8, segments), alloy, wheel);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = halfWidth - 0.012;

    const inner = this.mesh(new CircleGeometry(Q5.rimRadius, segments), this.standard({ color: 0x101114, roughness: 0.9 }), wheel);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = -halfWidth + 0.03;

    // Five twin spokes, merged into one geometry so a wheel stays cheap.
    const blades: BufferGeometry[] = [];
    for (let arm = 0; arm < 5; arm += 1) {
      for (const lean of [-1, 1]) {
        const shape = polygonShape(
          [
            [-0.052 * lean, 0.055],
            [0.03 * lean, 0.055],
            [0.022 * lean, 0.228],
            [-0.024 * lean, 0.228],
          ],
          0.012,
        );
        const blade = slab(shape, 0.03);
        const mesh = new Mesh(blade);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = (arm / 5) * Math.PI * 2 + lean * 0.13;
        mesh.position.y = halfWidth - 0.055;
        mesh.updateMatrix();
        blade.applyMatrix4(mesh.matrix);
        blades.push(blade);
      }
    }
    const spokes = mergeGeometries(blades, false);
    if (spokes) this.mesh(spokes, alloy, wheel);
    for (const blade of blades) if (blade !== spokes) blade.dispose();

    // Hub, centre cap and the rings on it.
    const hub = this.mesh(new CylinderGeometry(0.062, 0.062, 0.05, 20), alloy, wheel);
    hub.position.y = halfWidth - 0.055;

    const cap = this.mesh(new CylinderGeometry(0.052, 0.052, 0.012, 20), this.blackGloss, wheel);
    cap.position.y = halfWidth - 0.03;

    const capRings = this.mesh(fourRings(0.0105, 0.0022), this.chrome, wheel);
    capRings.position.y = halfWidth - 0.022;
    capRings.rotation.x = -Math.PI / 2;

    // Brake disc and caliper, visible between the spokes.
    const disc = this.mesh(
      new CylinderGeometry(0.175, 0.175, 0.024, 28),
      this.standard({ color: 0x50555c, metalness: 0.85, roughness: 0.55 }),
      wheel,
    );
    disc.position.y = halfWidth - 0.115;

    const caliper = this.mesh(
      new BoxGeometry(0.055, 0.05, 0.13),
      this.standard({ color: 0x1d2026, metalness: 0.5, roughness: 0.45 }),
      wheel,
    );
    caliper.position.set(0.145, halfWidth - 0.115, 0.055);

    return wheel;
  }

  /* --- Controls --------------------------------------------------------- */

  /** Repaint the body. `metallic` is the flake in the paint, 0..1. */
  setPaint(colour: number, metallic = 0.6) {
    this.paint.color.setHex(colour);
    this.paint.metalness = metallic;
    this.paint.needsUpdate = true;
  }

  /** Headlamps, tail lamps and the two soft beams in front of the car. */
  setLights(on: boolean) {
    this.lightsOn = on;
    for (const material of this.lamps) material.emissiveIntensity = on ? 1.6 : 0.12;
    for (const material of this.tails) material.emissiveIntensity = on ? 1.5 : 0.18;
    for (const beam of this.beams) beam.intensity = on ? 1.6 : 0;
  }

  get lit() {
    return this.lightsOn;
  }

  dispose() {
    for (const thing of this.owned) {
      if ('dispose' in thing) thing.dispose();
      if (thing instanceof MeshStandardMaterial || thing instanceof MeshBasicMaterial) {
        thing.map?.dispose();
      }
    }
    this.owned.clear();
  }
}

import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { contactShadow } from './geometry';
import { DESK } from './layout';

/** Where the lamp stands: the back-left corner, the one free spot on the desk. */
const BASE = new Vector3(-0.68, DESK.top, -0.4);
/** Where the shade points: the open desk between the paper tray and the keyboard. */
const AIM = new Vector3(-0.36, DESK.top, 0.02);

/** Warm, like an incandescent bulb, against the cool blue of night and the screen. */
const BULB = 0xffd29a;
const BULB_OFF = 0x6f6a60;
const LIGHT_ON = 2.4;

const _up = new Vector3(0, 1, 0);
const _bulb = new Color();

/**
 * An anglepoise lamp in the machine's own beige.
 *
 * It switches itself on as the room gets dark — dusk and after, or under a
 * heavy enough sky — and a click toggles it by hand, after which it stays
 * where it was put until the visitor hands it back with `lamp auto`.
 *
 * Switching on is not instant. It stutters once before it catches, the way an
 * old bulb in a sprung fitting does, because a lamp that simply appears lit
 * reads as a state change rather than as a thing someone just turned on.
 */
export class DeskLamp {
  readonly group = new Group();
  /** What a click on the lamp has to hit. */
  readonly hitboxes: Object3D[] = [];

  on = false;
  /** False once the visitor has switched it by hand. */
  auto = true;

  private readonly light: SpotLight;
  private readonly bulb: MeshBasicMaterial;
  private readonly lining: MeshBasicMaterial;
  private timers: number[] = [];

  constructor(quality: Quality) {
    const plastic = new MeshStandardMaterial({ color: 0xe2ddd2, roughness: 0.55, metalness: 0 });
    const joint = new MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.3 });

    this.group.position.copy(BASE);
    // Turn the lamp so its arms reach toward where it shines.
    this.group.rotation.y = -Math.atan2(AIM.z - BASE.z, AIM.x - BASE.x);

    /* --- Base, arms, joints ------------------------------------------------- */
    // In the lamp's own frame +x points at the desk; y is up.
    const base = new Mesh(new CylinderGeometry(0.068, 0.074, 0.02, 32), plastic);
    base.position.y = 0.01;
    base.castShadow = quality !== 'low';
    this.group.add(base);

    const shoulder = new Vector3(0, 0.03, 0);
    const elbow = new Vector3(-0.05, 0.34, 0);
    const wrist = new Vector3(0.2, 0.43, 0);

    for (const [from, to] of [
      [shoulder, elbow],
      [elbow, wrist],
    ] as const) {
      // Paired rods, like the real thing's parallel springs-and-bars.
      for (const side of [-0.012, 0.012]) {
        const rod = this.rod(from, to, 0.0055, plastic);
        rod.position.z += side;
        rod.castShadow = quality !== 'low';
        this.group.add(rod);
      }
    }

    for (const at of [shoulder, elbow, wrist]) {
      const knuckle = new Mesh(new CylinderGeometry(0.014, 0.014, 0.04, 16), joint);
      knuckle.rotation.x = Math.PI / 2;
      knuckle.position.copy(at);
      this.group.add(knuckle);
    }

    /* --- Shade ------------------------------------------------------------- */
    const shade = new Group();
    shade.position.copy(wrist);
    // Aim the shade's mouth down and forward, at the open desk.
    this.group.updateMatrixWorld();
    const local = this.group.worldToLocal(AIM.clone());
    const towardAim = local.sub(wrist).normalize();
    shade.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), towardAim);
    this.group.add(shade);

    const cone = new Mesh(
      new CylinderGeometry(0.03, 0.078, 0.115, 32, 1, true),
      plastic,
    );
    cone.position.y = -0.04;
    cone.castShadow = quality !== 'low';
    shade.add(cone);

    // The inside of the shade, which glows when the bulb does.
    this.lining = new MeshBasicMaterial({ color: BULB_OFF, side: DoubleSide });
    const lining = new Mesh(new CylinderGeometry(0.028, 0.075, 0.112, 32, 1, true), this.lining);
    lining.position.y = -0.04;
    lining.scale.setScalar(0.97);
    shade.add(lining);

    const cap = new Mesh(new CylinderGeometry(0.03, 0.03, 0.012, 24), plastic);
    cap.position.y = 0.018;
    shade.add(cap);

    this.bulb = new MeshBasicMaterial({ color: BULB_OFF });
    const bulb = new Mesh(new SphereGeometry(0.022, 20, 14), this.bulb);
    bulb.position.y = -0.03;
    shade.add(bulb);

    /* --- The light itself -------------------------------------------------- */
    this.light = new SpotLight(BULB, 0, 2.2, MathUtils.degToRad(42), 0.65, 1.6);
    this.light.position.set(0, -0.04, 0);
    shade.add(this.light);
    // The target has to be in the scene graph to be aimed at, so it rides in
    // the shade too, a little way down its axis.
    this.light.target.position.set(0, -1, 0);
    shade.add(this.light.target);
    if (quality === 'high') {
      this.light.castShadow = true;
      this.light.shadow.mapSize.set(512, 512);
      this.light.shadow.bias = -0.002;
      this.light.shadow.camera.near = 0.05;
    }

    /* --- Grounding, and what to click -------------------------------------- */
    const pool = contactShadow(0.2, 0.2, 0.45);
    pool.position.y = 0.0012;
    this.group.add(pool);

    // One generous invisible box rather than every rod: nobody aims at a joint.
    const hit = new Mesh(
      new CylinderGeometry(0.09, 0.09, 0.5, 8),
      new MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(0.06, 0.25, 0);
    this.group.add(hit);
    this.hitboxes.push(hit);
  }

  /** A rod from a to b, in the lamp's own frame. */
  private rod(a: Vector3, b: Vector3, radius: number, material: MeshStandardMaterial) {
    const length = a.distanceTo(b);
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 10), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(_up, b.clone().sub(a).normalize()));
    return mesh;
  }

  /** Follow the room's light, unless the visitor has taken over. */
  follow(darkness: number) {
    if (!this.auto) return;
    // A little hysteresis, so a sky sitting on the threshold does not strobe it.
    if (!this.on && darkness > 0.5) this.set(true);
    else if (this.on && darkness < 0.35) this.set(false);
  }

  /** By hand. Returns the new state. */
  toggle() {
    this.auto = false;
    this.set(!this.on);
    return this.on;
  }

  set(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];

    if (!on) {
      this.level(0);
      return;
    }

    // On, off, half, on: the stutter of a bulb catching.
    const steps: Array<[number, number]> = [
      [0, 1],
      [70, 0],
      [140, 0.55],
      [210, 0.1],
      [300, 1],
    ];
    for (const [at, level] of steps) {
      this.timers.push(window.setTimeout(() => this.level(level), at));
    }
  }

  private level(level: number) {
    this.light.intensity = LIGHT_ON * level;
    // The bulb and the lining are unlit, so their colour is their glow.
    this.bulb.color.set(BULB_OFF).lerp(_bulb.set(BULB), level);
    this.lining.color.set(BULB_OFF).lerp(_bulb.set(0xf6dcb2), level);
  }

  destroy() {
    for (const timer of this.timers) window.clearTimeout(timer);
  }
}

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { contactShadow, roundedSlab } from './geometry';
import { DESK, UNIT } from './layout';

/**
 * The system unit — the horizontal case the monitor stands on.
 *
 * Everything that dates this machine lives on its front panel: a half-height
 * 5.25" bay, a 3.5" floppy below it with its own eject button, a turbo-era
 * power switch, and two indicator lamps. The lid is otherwise a plain beige
 * plane, because it is about to have a monitor put on it and almost none of it
 * will be seen.
 */
export class SystemUnit {
  readonly group = new Group();

  /** Counts as "the machine" when raycasting for a click. */
  readonly hitboxes: Object3D[] = [];

  private readonly powerLed: MeshBasicMaterial;
  private readonly driveLed: MeshBasicMaterial;

  /** Platinum beige, the same plastic as the monitor and the keyboard. */
  private readonly plastic = new MeshStandardMaterial({
    color: 0xd9d1bf,
    roughness: 0.76,
    metalness: 0.01,
  });

  /** The same beige in shadow, for the recesses cut into it. */
  private readonly shade = new MeshStandardMaterial({
    color: 0xb6ad99,
    roughness: 0.84,
    metalness: 0.01,
  });

  private readonly dark = new MeshStandardMaterial({
    color: 0x35322c,
    roughness: 0.66,
    metalness: 0.04,
  });

  constructor(quality: Quality) {
    const { width: W, height: H, depth: D, frontZ } = UNIT;
    const centreY = DESK.top + H / 2;
    const centreZ = frontZ - D / 2;

    /* --- The box ---------------------------------------------------------- */

    const body = new Mesh(
      roundedSlab(W, H, 0.006, { depth: D, bevel: 0.004 }),
      this.plastic,
    );
    body.position.set(0, centreY, frontZ);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    this.hitboxes.push(body);

    /* --- Front panel ------------------------------------------------------ */
    // Front detail sits a hair proud of the face so each piece catches its own
    // edge of light rather than reading as printed on.
    const faceZ = frontZ + 0.002;

    // Half-height 5.25" bay, right of centre.
    const bay = new Mesh(new BoxGeometry(0.146, 0.026, 0.004), this.shade);
    bay.position.set(0.098, centreY + 0.022, faceZ);
    this.group.add(bay);

    const bayLip = new Mesh(new BoxGeometry(0.146, 0.004, 0.006), this.dark);
    bayLip.position.set(0.098, centreY + 0.011, faceZ + 0.001);
    this.group.add(bayLip);

    // 3.5" floppy under it, with its eject button and activity lamp.
    const floppy = new Mesh(new BoxGeometry(0.104, 0.02, 0.004), this.shade);
    floppy.position.set(0.098, centreY - 0.024, faceZ);
    this.group.add(floppy);

    const slot = new Mesh(new BoxGeometry(0.086, 0.005, 0.006), this.dark);
    slot.position.set(0.09, centreY - 0.02, faceZ + 0.001);
    this.group.add(slot);

    const eject = new Mesh(new BoxGeometry(0.012, 0.006, 0.005), this.plastic);
    eject.position.set(0.14, centreY - 0.029, faceZ + 0.001);
    this.group.add(eject);

    this.driveLed = new MeshBasicMaterial({ color: 0x241a16 });
    const driveLamp = new Mesh(new BoxGeometry(0.008, 0.004, 0.003), this.driveLed);
    driveLamp.position.set(0.044, centreY - 0.024, faceZ + 0.001);
    this.group.add(driveLamp);

    // Power switch and its lamp, left of centre.
    const power = new Mesh(
      new CylinderGeometry(0.011, 0.011, 0.007, 16),
      this.shade,
    );
    power.rotation.x = Math.PI / 2;
    power.position.set(-0.15, centreY + 0.004, faceZ + 0.002);
    this.group.add(power);

    this.powerLed = new MeshBasicMaterial({ color: 0x1d2420 });
    const powerLamp = new Mesh(
      new CylinderGeometry(0.0045, 0.0045, 0.004, 12),
      this.powerLed,
    );
    powerLamp.rotation.x = Math.PI / 2;
    powerLamp.position.set(-0.11, centreY + 0.004, faceZ + 0.002);
    this.group.add(powerLamp);

    // A plain name plate rather than anybody's badge.
    const badge = new Mesh(new BoxGeometry(0.058, 0.009, 0.002), this.shade);
    badge.position.set(-0.132, centreY - 0.03, faceZ);
    this.group.add(badge);

    /* --- Sides and back --------------------------------------------------- */

    if (quality !== 'low') {
      // Vent louvres down the right flank, where the supply breathes.
      for (let i = 0; i < 9; i += 1) {
        const louvre = new Mesh(new BoxGeometry(0.004, 0.004, 0.14), this.shade);
        louvre.position.set(W / 2 - 0.001, centreY + 0.028 - i * 0.007, centreZ - 0.06);
        this.group.add(louvre);
      }
    }

    // A seam around the lid, which is what says the case comes apart.
    const seam = new Mesh(new BoxGeometry(W + 0.002, 0.002, D - 0.01), this.shade);
    seam.position.set(0, DESK.top + H - 0.014, centreZ);
    this.group.add(seam);

    /* --- Feet and the pool it sits in ------------------------------------- */

    for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) {
      for (const z of [frontZ - 0.04, frontZ - D + 0.05]) {
        const foot = new Mesh(new BoxGeometry(0.026, 0.005, 0.026), this.dark);
        foot.position.set(x, DESK.top + 0.0025, z);
        this.group.add(foot);
      }
    }

    const grounded = contactShadow(W * 1.45, D * 1.35, 0.6);
    grounded.position.set(0, DESK.top + 0.0015, centreZ);
    this.group.add(grounded);
  }

  /** Called by the experience when the machine powers on or off. */
  setPowered(on: boolean) {
    this.powerLed.color.set(on ? 0x7be08f : 0x1d2420);
    this.driveLed.color.set(on ? 0x4a2b22 : 0x241a16);
  }

  /**
   * The drive lamp flickers with disk activity. Driven from the OS's own
   * keystroke impulse, so it blinks when the machine is actually doing
   * something rather than on a timer.
   */
  setActivity(level: number) {
    const lit = Math.min(Math.max(level, 0), 1);
    this.driveLed.color.setRGB(0.29 + lit * 0.71, 0.17 + lit * 0.21, 0.13);
  }
}

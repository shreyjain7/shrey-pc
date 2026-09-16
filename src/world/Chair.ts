import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { contactShadow, roundedSlab } from './geometry';
import { leatherTexture } from './textures';

const SEAT_HEIGHT = 0.45;

/**
 * A tan leather task chair, pulled out from the desk and turned toward it.
 *
 * The chair is the only warm thing in the shot, so it carries a lot of the
 * scene's colour. Three details are what keep it from reading as two brown
 * boxes on a stick: the cushions are bevelled slabs rather than cuboids, the
 * backrest is held on a chrome arm that curves up from behind the seat instead
 * of a straight post, and the star base has real castors on it.
 */
export class Chair {
  readonly group = new Group();

  private readonly leather: MeshStandardMaterial;

  private readonly chrome = new MeshStandardMaterial({
    color: 0x9a9ca0,
    roughness: 0.26,
    metalness: 0.9,
  });

  private readonly black = new MeshStandardMaterial({
    color: 0x1e1e22,
    roughness: 0.72,
    metalness: 0.12,
  });

  constructor(quality: Quality) {
    const grain = leatherTexture();
    grain.repeat.set(3, 3);

    // Muted, not saturated: under a bright key a clean tan reads as orange, so
    // the colour is taken down and greyed before the light ever hits it.
    this.leather = new MeshStandardMaterial({
      color: 0x7d5231,
      roughnessMap: grain,
      roughness: 0.68,
      metalness: 0.02,
    });

    this.buildBase(quality);
    this.buildSeat();
    this.buildBack();

    // The pool the star base sits in. A radial gradient, so it does not care
    // that the group it rides in is turned.
    const pool = contactShadow(0.92, 0.92, 0.3);
    pool.position.y = 0.002;
    this.group.add(pool);

    // Pulled out from the desk and turned a few degrees toward it, which is
    // how a chair someone just got up from actually sits.
    this.group.position.set(0.56, 0, 0.66);
    this.group.rotation.y = -0.34;
  }

  private buildBase(quality: Quality) {
    const arms = 5;
    const reach = 0.28;
    const segments = quality === 'low' ? 8 : 16;

    for (let i = 0; i < arms; i += 1) {
      const angle = (i / arms) * Math.PI * 2;

      // Each arm tapers as it reaches out, and drops toward its castor.
      const arm = new Mesh(new BoxGeometry(0.05, 0.026, reach), this.black);
      arm.position.set(
        Math.sin(angle) * (reach / 2),
        0.058,
        Math.cos(angle) * (reach / 2),
      );
      arm.rotation.y = angle;
      arm.castShadow = true;
      this.group.add(arm);

      const castor = new Mesh(
        new CylinderGeometry(0.026, 0.026, 0.016, segments),
        this.black,
      );
      castor.rotation.x = Math.PI / 2;
      castor.rotation.y = angle;
      castor.position.set(Math.sin(angle) * reach, 0.026, Math.cos(angle) * reach);
      castor.castShadow = true;
      this.group.add(castor);
    }

    // Hub, gas cylinder and the chrome sleeve over it.
    const hub = new Mesh(
      new CylinderGeometry(0.052, 0.058, 0.04, segments),
      this.black,
    );
    hub.position.y = 0.062;
    this.group.add(hub);

    const column = new Mesh(
      new CylinderGeometry(0.026, 0.03, SEAT_HEIGHT - 0.14, segments),
      this.chrome,
    );
    column.position.y = 0.08 + (SEAT_HEIGHT - 0.14) / 2;
    column.castShadow = true;
    this.group.add(column);

    const sleeve = new Mesh(
      new CylinderGeometry(0.038, 0.038, 0.09, segments),
      this.black,
    );
    sleeve.position.y = 0.13;
    this.group.add(sleeve);

    // The mechanism plate the seat bolts onto.
    const plate = new Mesh(new BoxGeometry(0.16, 0.024, 0.2), this.black);
    plate.position.y = SEAT_HEIGHT - 0.055;
    this.group.add(plate);
  }

  private buildSeat() {
    const seat = new Mesh(
      roundedSlab(0.46, 0.44, 0.045, { depth: 0.075, bevel: 0.016 }),
      this.leather,
    );
    // roundedSlab faces +Z with its depth behind it; laid flat, that puts the
    // cushion's top face up and its thickness below.
    seat.rotation.x = -Math.PI / 2;
    seat.position.set(0, SEAT_HEIGHT, 0);
    seat.castShadow = true;
    seat.receiveShadow = true;
    this.group.add(seat);
  }

  private buildBack() {
    // The chrome cantilever: up out of the back of the seat, curving forward
    // at the top to meet the backrest.
    const curve = new CatmullRomCurve3([
      new Vector3(0, SEAT_HEIGHT - 0.035, -0.15),
      new Vector3(0, SEAT_HEIGHT + 0.07, -0.27),
      new Vector3(0, SEAT_HEIGHT + 0.24, -0.29),
      new Vector3(0, SEAT_HEIGHT + 0.36, -0.235),
    ]);

    const arm = new Mesh(new TubeGeometry(curve, 20, 0.013, 8, false), this.chrome);
    arm.castShadow = true;
    this.group.add(arm);

    // A pad, not a panel: carried high on the arm with a clear gap above the
    // seat, which is the shape that says "task chair" from across the room.
    const backrest = new Mesh(
      roundedSlab(0.37, 0.26, 0.045, { depth: 0.06, bevel: 0.014 }),
      this.leather,
    );
    backrest.position.set(0, SEAT_HEIGHT + 0.35, -0.21);
    // Reclined a little, the way a task chair rests when nobody is in it.
    backrest.rotation.x = -0.17;
    backrest.castShadow = true;
    this.group.add(backrest);
  }
}

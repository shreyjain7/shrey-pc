import {
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { contactShadow } from './geometry';
import { leafTexture } from './textures';

/** Where each leaf goes: [turn, lean, height, length, tilt]. */
const LEAVES: Array<[number, number, number, number, number]> = [
  [0.2, 0.34, 0.86, 0.3, -0.5],
  [1.35, 0.46, 0.7, 0.34, -0.3],
  [2.5, 0.3, 0.95, 0.28, -0.7],
  [3.5, 0.52, 0.62, 0.32, -0.2],
  [4.4, 0.28, 0.82, 0.26, -0.6],
  [5.4, 0.44, 0.74, 0.3, -0.35],
  [0.85, 0.16, 1.04, 0.24, -0.9],
  [2.95, 0.2, 0.99, 0.26, -0.8],
];

/**
 * A monstera in a pot, standing behind the desk.
 *
 * Every leaf is one double-sided quad wearing a painted silhouette as its
 * alpha mask — the shape is the plant, and it is not something boxes can do.
 * The stems are real tubes on curves, because a leaf floating on nothing reads
 * as a sticker; the arc from soil to blade is what sells it.
 */
export class Plant {
  readonly group = new Group();

  private readonly stem = new MeshStandardMaterial({
    color: 0x4c7a3a,
    roughness: 0.82,
    metalness: 0,
  });

  constructor(quality: Quality) {
    const segments = quality === 'low' ? 10 : 20;

    /* --- Pot --------------------------------------------------------------- */

    const pot = new Mesh(
      new CylinderGeometry(0.15, 0.115, 0.26, quality === 'low' ? 12 : 28),
      new MeshStandardMaterial({ color: 0xbfb9ae, roughness: 0.88, metalness: 0.02 }),
    );
    pot.position.y = 0.13;
    pot.castShadow = true;
    pot.receiveShadow = true;
    this.group.add(pot);

    const rim = new Mesh(
      new CylinderGeometry(0.157, 0.157, 0.026, quality === 'low' ? 12 : 28),
      new MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.84, metalness: 0.02 }),
    );
    rim.position.y = 0.25;
    this.group.add(rim);

    const soil = new Mesh(
      new CylinderGeometry(0.142, 0.142, 0.012, quality === 'low' ? 12 : 24),
      new MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.98, metalness: 0 }),
    );
    soil.position.y = 0.253;
    this.group.add(soil);

    /* --- Leaves ------------------------------------------------------------ */

    // No alphaMap: three reads that from the texture's *green* channel, which
    // on a green leaf is not the silhouette at all. The map's own alpha is,
    // and alphaTest cuts it cleanly without needing a sorted transparent pass.
    const map = leafTexture();
    const foliage = new MeshStandardMaterial({
      map,
      transparent: true,
      alphaTest: 0.4,
      side: DoubleSide,
      roughness: 0.68,
      metalness: 0,
    });

    const count = quality === 'low' ? 5 : LEAVES.length;

    for (let i = 0; i < count; i += 1) {
      const [turn, lean, height, length, tilt] = LEAVES[i];
      const reach = lean * 0.6;
      const x = Math.sin(turn) * reach;
      const z = Math.cos(turn) * reach;

      // Stem: out of the soil, arcing over toward where the blade hangs.
      const curve = new CatmullRomCurve3([
        new Vector3(0, 0.25, 0),
        new Vector3(x * 0.2, 0.25 + height * 0.45, z * 0.2),
        new Vector3(x * 0.6, 0.25 + height * 0.85, z * 0.6),
        new Vector3(x, 0.25 + height, z),
      ]);

      const stalk = new Mesh(
        new TubeGeometry(curve, segments, 0.008, 5, false),
        this.stem,
      );
      stalk.castShadow = true;
      this.group.add(stalk);

      // Blade: hung off the stem's tip, turned outward and drooping.
      const leaf = new Mesh(new PlaneGeometry(length * 0.72, length), foliage);
      leaf.position.set(x, 0.25 + height, z);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = turn;
      leaf.rotation.x = tilt;
      // The plane's own origin is its centre, so push it out along its length
      // to hang from the stem rather than be skewered through the middle.
      leaf.translateY(-length * 0.42);
      leaf.castShadow = quality === 'high';
      this.group.add(leaf);
    }

    const pool = contactShadow(0.52, 0.52, 0.55);
    pool.position.y = 0.002;
    this.group.add(pool);

    // Behind the desk's right shoulder, where it fills the gap between the
    // machine and the chair without crowding either.
    this.group.position.set(0.78, 0, -0.66);
  }
}

import {
  BackSide,
  CircleGeometry,
  ClampToEdgeWrapping,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { backdropTexture, studioFloorTexture } from './textures';

/**
 * The studio.
 *
 * There is no room here — no walls, no window, no ceiling. The desk stands on
 * a seamless light-grey ground under a domed backdrop, and the two meet
 * without a horizon. Three things do that work together:
 *
 *  1. The ground is a wide circle, so no corner can ever be in shot, wearing a
 *     baked radial falloff that darkens away from where the key lands.
 *  2. Fog carries the ground's far reaches to one exact grey.
 *  3. The dome's bottom stop is that same grey, so the two surfaces meet at an
 *     identical colour and the join is invisible.
 *
 * The backdrop is geometry rather than `scene.background`, because an opaque
 * scene background would paint over the transparent canvas and bury the CSS3D
 * layer the screen lives in. A dome is depth-tested like anything else, so the
 * depth-only plane on the glass rejects it exactly as it did the old walls.
 */

/** The grey the ground, the fog and the dome's horizon all share. */
export const STUDIO_FAR = 0xcfcfd4;

export class Room {
  readonly group = new Group();

  constructor(quality: Quality) {
    /* --- Backdrop ---------------------------------------------------------- */

    const dome = new Mesh(
      new SphereGeometry(30, quality === 'low' ? 16 : 32, quality === 'low' ? 10 : 20),
      new MeshBasicMaterial({
        map: backdropTexture(),
        side: BackSide,
        // Unlit and unfogged: this *is* the far distance, not a thing in it.
        fog: false,
        depthWrite: false,
      }),
    );
    this.group.add(dome);

    /* --- Ground ------------------------------------------------------------ */

    const map = studioFloorTexture();
    // Clamped rather than repeated: past the falloff the texture holds its rim
    // colour instead of tiling a second bright pool further out.
    map.wrapS = ClampToEdgeWrapping;
    map.wrapT = ClampToEdgeWrapping;
    // The circle is 60m across but the light pool should be about 9, so the
    // gradient is scaled up and re-centred over the desk.
    const spread = 60 / 9;
    map.repeat.set(spread, spread);
    map.offset.set(-(spread - 1) / 2, -(spread - 1) / 2);

    const ground = new Mesh(
      new CircleGeometry(30, quality === 'low' ? 32 : 64),
      new MeshStandardMaterial({
        color: 0xe4e4e7,
        map,
        roughness: 0.94,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    // A hair below zero so the contact shadows laid on it never z-fight.
    ground.position.y = -0.001;
    ground.receiveShadow = quality !== 'low';
    this.group.add(ground);
  }

  /**
   * Nothing in a studio moves. Kept so the world's update loop does not have
   * to special-case this one object.
   */
  update(_elapsed: number) {}
}

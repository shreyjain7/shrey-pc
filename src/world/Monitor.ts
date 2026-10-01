import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RectAreaLight,
} from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { Quality } from '../experience/Sizes';
import { roundedSlab, taperAlongZ } from './geometry';
import { smudgeTexture, vignetteTexture } from './textures';
import {
  MONITOR,
  MONITOR_BOTTOM,
  PX_TO_M,
  SCREEN_CENTER,
  SCREEN_PX,
  SCREEN_Z,
  UNIT_TOP,
} from './layout';

const { bodyWidth: W, bodyHeight: H, bodyDepth: D, screenWidth: SW, screenHeight: SH } = MONITOR;

/** The recessed well the glass sits in, a touch proud of the picture itself. */
const WELL_W = SW + 0.026;
const WELL_H = SH + 0.026;
const WELL_DEPTH = 0.016;

/** Thickness of the bezel the well is cut into. */
const FACE_DEPTH = 0.045;

/** Centre of the bezel, measured up from the system unit's lid. */
const BODY_CENTRE_Y = MONITOR_BOTTOM + H / 2;

/**
 * The CRT: bezel, tube, tilt base, glass, and the live OS projected onto it.
 *
 * What makes a monitor of this period read is the depth behind the picture.
 * The bezel is a flat slab, but the body funnels hard as it goes back — a real
 * tube is a cone ending in a neck, and squeezing the box along Z is what gives
 * the silhouette that taper instead of leaving it a shoebox. The pedestal
 * underneath is the tilt-swivel foot the whole thing rocks on.
 *
 * Everything about the glass is unchanged from the CRT this replaces, because
 * it is what makes the machine usable: a depth-only plane punches a hole in
 * the canvas, and the OS's real DOM is projected into it by CSS3DRenderer.
 */
export class Monitor {
  readonly group = new Group();
  /** Meshes that count as "the monitor" when raycasting for a click. */
  readonly hitboxes: Object3D[] = [];

  readonly powerLed: Mesh;

  private readonly screenLight: RectAreaLight;

  /** Platinum beige. The same plastic as the system unit under it. */
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

  private readonly darkPlastic = new MeshStandardMaterial({
    color: 0x35322c,
    roughness: 0.62,
    metalness: 0.04,
  });

  constructor(screenElement: HTMLElement, quality: Quality) {
    const screenY = SCREEN_CENTER.y;

    /* --- Bezel: the panel the screen well is cut into ---------------------- */

    // The well is cut where the glass is, which is above the bezel's centre
    // because the chin carrying the controls is deeper than the brow.
    const wellLift = screenY - BODY_CENTRE_Y;

    const face = new Mesh(
      roundedSlab(W, H, 0.022, {
        depth: FACE_DEPTH,
        bevel: 0.007,
        holeWidth: WELL_W,
        holeHeight: WELL_H,
        holeRadius: 0.016,
        holeOffsetY: wellLift,
      }),
      this.plastic,
    );
    face.position.set(0, BODY_CENTRE_Y, MONITOR.frontZ);
    face.castShadow = true;
    face.receiveShadow = true;
    this.group.add(face);
    this.hitboxes.push(face);

    /* --- The well itself --------------------------------------------------- */

    // A shallow open box behind the cut-out, so the glass reads as sunk into
    // the plastic rather than stuck onto it.
    const well = new Mesh(
      roundedSlab(WELL_W, WELL_H, 0.016, {
        depth: WELL_DEPTH,
        bevel: 0.002,
        holeWidth: SW,
        holeHeight: SH,
        holeRadius: 0.009,
      }),
      this.shade,
    );
    well.position.set(0, screenY, MONITOR.frontZ - FACE_DEPTH);
    this.group.add(well);
    this.hitboxes.push(well);

    /* --- The tube: a funnel, not a box ------------------------------------- */

    const tubeDepth = D - FACE_DEPTH;
    const tube = new Mesh(
      taperAlongZ(
        roundedSlab(W - 0.012, H - 0.012, 0.03, { depth: tubeDepth, bevel: 0.008 }),
        0.56,
        tubeDepth,
      ),
      this.plastic,
    );
    tube.position.set(0, BODY_CENTRE_Y, MONITOR.frontZ - FACE_DEPTH);
    tube.castShadow = true;
    tube.receiveShadow = true;
    this.group.add(tube);
    this.hitboxes.push(tube);

    // The neck, and the cap over the yoke at the very back.
    const neck = new Mesh(
      new CylinderGeometry(0.036, 0.03, 0.05, quality === 'low' ? 8 : 16),
      this.shade,
    );
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, BODY_CENTRE_Y, MONITOR.frontZ - D - 0.02);
    this.group.add(neck);

    /* --- Chin: controls and the power lamp --------------------------------- */

    const chinCentreY = MONITOR_BOTTOM + MONITOR.chin / 2;
    const faceZ = MONITOR.frontZ + 0.003;

    // A row of small square buttons, left of centre.
    for (let i = 0; i < 4; i += 1) {
      const button = new Mesh(new BoxGeometry(0.014, 0.008, 0.003), this.shade);
      button.position.set(-0.13 + i * 0.019, chinCentreY - 0.012, faceZ);
      this.group.add(button);
    }

    // Two thumbwheels — brightness and contrast — on the right.
    for (const x of [0.15, 0.185]) {
      const wheel = new Mesh(
        new CylinderGeometry(0.009, 0.009, 0.006, 12),
        this.shade,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, chinCentreY - 0.012, faceZ);
      this.group.add(wheel);
    }

    // A plain name plate rather than anybody's logo.
    const badge = new Mesh(new BoxGeometry(0.05, 0.008, 0.002), this.shade);
    badge.position.set(-0.02, chinCentreY + 0.014, MONITOR.frontZ + 0.002);
    this.group.add(badge);

    this.powerLed = new Mesh(
      new CylinderGeometry(0.0045, 0.0045, 0.004, 12),
      new MeshBasicMaterial({ color: 0x24261f }),
    );
    this.powerLed.rotation.x = Math.PI / 2;
    this.powerLed.position.set(0.045, chinCentreY - 0.012, faceZ);
    this.group.add(this.powerLed);

    /* --- Tilt-swivel base --------------------------------------------------- */

    // A rounded pedestal under the bezel, narrower than the case, with a lip
    // that reads as the ring the whole monitor rocks on.
    const base = new Mesh(
      taperAlongZ(
        roundedSlab(W - 0.11, MONITOR.baseHeight, 0.018, {
          depth: D * 0.62,
          bevel: 0.005,
        }),
        0.86,
        D * 0.62,
      ),
      this.plastic,
    );
    base.position.set(0, UNIT_TOP + MONITOR.baseHeight / 2, MONITOR.frontZ - 0.03);
    base.castShadow = true;
    this.group.add(base);
    this.hitboxes.push(base);

    const ring = new Mesh(
      new CylinderGeometry(0.075, 0.082, 0.008, quality === 'low' ? 12 : 24),
      this.darkPlastic,
    );
    ring.position.set(0, UNIT_TOP + 0.004, MONITOR.frontZ - D * 0.32);
    this.group.add(ring);

    /* --- The hole in the canvas -------------------------------------------- */
    // Depth-only: writes to the depth buffer so the room behind never paints
    // here, but contributes no colour, leaving the canvas transparent and the
    // CSS3D layer beneath visible.
    const occluder = new Mesh(
      new PlaneGeometry(SW, SH),
      new MeshBasicMaterial({ colorWrite: false, side: DoubleSide }),
    );
    occluder.position.copy(SCREEN_CENTER);
    occluder.renderOrder = -1;
    this.group.add(occluder);
    this.hitboxes.push(occluder);

    /* --- The live DOM, projected onto the glass ---------------------------- */
    screenElement.style.width = `${SCREEN_PX.width}px`;
    screenElement.style.height = `${SCREEN_PX.height}px`;

    const cssObject = new CSS3DObject(screenElement);
    cssObject.position.copy(SCREEN_CENTER);
    cssObject.scale.setScalar(PX_TO_M);
    this.group.add(cssObject);

    /* --- Glass -------------------------------------------------------------- */
    // Three thin planes stacked in front of the DOM, all drawn after it:
    // a tint, the tube's corner falloff, and dust caught in the light.
    const glass = new Mesh(
      new PlaneGeometry(SW, SH),
      new MeshPhysicalMaterial({
        color: 0x9ab0c4,
        transparent: true,
        opacity: 0.05,
        roughness: 0.06,
        metalness: 0,
        depthWrite: false,
      }),
    );
    glass.position.set(SCREEN_CENTER.x, screenY, SCREEN_Z + 0.003);
    glass.renderOrder = 10;
    this.group.add(glass);

    // Corners of a real tube fall off; the alphaMap's luminance is the mask.
    const vignette = new Mesh(
      new PlaneGeometry(SW, SH),
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.36,
        alphaMap: vignetteTexture(),
        depthWrite: false,
      }),
    );
    vignette.position.set(SCREEN_CENTER.x, screenY, SCREEN_Z + 0.0035);
    vignette.renderOrder = 11;
    this.group.add(vignette);

    if (quality !== 'low') {
      const smudge = new Mesh(
        new PlaneGeometry(SW, SH),
        new MeshBasicMaterial({
          map: smudgeTexture(),
          transparent: true,
          opacity: 0.06,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      smudge.position.set(SCREEN_CENTER.x, screenY, SCREEN_Z + 0.004);
      smudge.renderOrder = 12;
      this.group.add(smudge);
    }

    /* --- Screen spill -------------------------------------------------------- */
    // Puts the machine's own glow onto the chin, the desk and the keyboard.
    this.screenLight = new RectAreaLight(0x9fc4ff, 0, SW, SH);
    this.screenLight.position.set(SCREEN_CENTER.x, screenY, SCREEN_Z + 0.01);
    this.screenLight.lookAt(SCREEN_CENTER.x, screenY, 2);
    this.group.add(this.screenLight);
  }

  /** Called by the OS when the machine powers on or off. */
  setPowered(on: boolean) {
    (this.powerLed.material as MeshBasicMaterial).color.set(on ? 0x7be08f : 0x24261f);
  }

  /** Screen spill tracks how bright the OS actually is right now. */
  setGlow(intensity: number) {
    this.screenLight.intensity = intensity;
  }
}

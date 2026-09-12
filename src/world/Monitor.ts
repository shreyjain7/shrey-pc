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
import { DESK, MONITOR, PX_TO_M, SCREEN_CENTER, SCREEN_PX, SCREEN_Z } from './layout';

const { bodyWidth: W, bodyHeight: H, bodyDepth: D, screenWidth: SW, screenHeight: SH } = MONITOR;

/** The recessed well the glass sits in, a touch proud of the picture itself. */
const WELL_W = SW + 0.028;
const WELL_H = SH + 0.028;
const WELL_DEPTH = 0.018;

/** Thickness of the front panel the well is cut into. */
const FACE_DEPTH = 0.05;

/** Centre of the case, measured up from the desk it stands on. */
const BODY_CENTRE_Y = DESK.top + H / 2;

/**
 * The compact Macintosh: case, glass, and the live OS projected onto it.
 *
 * The all-in-one is one piece of beige plastic — no stand, no neck, no
 * separate monitor — so the silhouette has to do the work: a vertical front
 * face, sides that draw in toward the back, a deep chin carrying the floppy
 * slot, and the handle recess cut into the top.
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

  /** Platinum beige. Warmer and lighter than the grey CRT it replaces. */
  private readonly plastic = new MeshStandardMaterial({
    color: 0xd8d0be,
    roughness: 0.78,
    metalness: 0.01,
  });

  /** The same beige in shadow, for the recesses cut into it. */
  private readonly shade = new MeshStandardMaterial({
    color: 0xb3aa97,
    roughness: 0.84,
    metalness: 0.01,
  });

  private readonly darkPlastic = new MeshStandardMaterial({
    color: 0x37342e,
    roughness: 0.62,
    metalness: 0.04,
  });

  constructor(screenElement: HTMLElement, quality: Quality) {
    const screenY = SCREEN_CENTER.y;

    /* --- Front face: the panel the screen well is cut into ---------------- */

    // The well is cut where the glass is, which is above the case's centre
    // because the chin is so much deeper than the brow.
    const wellLift = screenY - BODY_CENTRE_Y;

    const face = new Mesh(
      roundedSlab(W, H, 0.03, {
        depth: FACE_DEPTH,
        bevel: 0.008,
        holeWidth: WELL_W,
        holeHeight: WELL_H,
        holeRadius: 0.018,
        holeOffsetY: wellLift,
      }),
      this.plastic,
    );
    face.position.set(0, BODY_CENTRE_Y, MONITOR.frontZ);
    face.castShadow = true;
    face.receiveShadow = true;
    this.group.add(face);
    this.hitboxes.push(face);

    /* --- The well itself, and its floor ----------------------------------- */

    // Walls: a shallow open box behind the cut-out, so the glass reads as
    // sunk into the plastic rather than stuck onto it.
    const well = new Mesh(
      roundedSlab(WELL_W, WELL_H, 0.018, {
        depth: WELL_DEPTH,
        bevel: 0.002,
        holeWidth: SW,
        holeHeight: SH,
        holeRadius: 0.01,
      }),
      this.shade,
    );
    well.position.set(0, screenY, MONITOR.frontZ - FACE_DEPTH);
    this.group.add(well);
    this.hitboxes.push(well);

    /* --- Body: tapering back, the way the case draws in ------------------- */

    const bodyDepth = D - FACE_DEPTH;
    const body = new Mesh(
      taperAlongZ(
        roundedSlab(W - 0.01, H - 0.01, 0.035, { depth: bodyDepth, bevel: 0.01 }),
        0.82,
        bodyDepth,
      ),
      this.plastic,
    );
    body.position.set(0, BODY_CENTRE_Y, MONITOR.frontZ - FACE_DEPTH);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    this.hitboxes.push(body);

    /* --- The chin: floppy slot and badge ---------------------------------- */

    const chinCentreY = DESK.top + MONITOR.chin / 2;

    // The slot sits low and right, as it does on the real case.
    const slot = new Mesh(new BoxGeometry(0.17, 0.011, 0.012), this.darkPlastic);
    slot.position.set(0.085, chinCentreY - 0.03, MONITOR.frontZ + 0.004);
    this.group.add(slot);

    // The eject notch under one end of it.
    const notch = new Mesh(new BoxGeometry(0.014, 0.005, 0.01), this.shade);
    notch.position.set(0.085 + 0.17 / 2 - 0.012, chinCentreY - 0.046, MONITOR.frontZ + 0.004);
    this.group.add(notch);

    // A name plate rather than anybody's logo.
    const badge = new Mesh(new BoxGeometry(0.052, 0.013, 0.003), this.shade);
    badge.position.set(-0.145, chinCentreY + 0.042, MONITOR.frontZ + 0.003);
    this.group.add(badge);

    this.powerLed = new Mesh(
      new CylinderGeometry(0.005, 0.005, 0.004, 12),
      new MeshBasicMaterial({ color: 0x2a2a2a }),
    );
    this.powerLed.rotation.x = Math.PI / 2;
    this.powerLed.position.set(-0.205, chinCentreY - 0.03, MONITOR.frontZ + 0.003);
    this.group.add(this.powerLed);

    /* --- The top: handle recess and vents --------------------------------- */

    // A rounded trough sunk into the top, behind the brow — the carry handle.
    const handle = new Mesh(
      new BoxGeometry(0.15, 0.022, 0.055),
      this.shade,
    );
    handle.position.set(0, DESK.top + H - 0.011, MONITOR.frontZ - D * 0.55);
    this.group.add(handle);

    if (quality !== 'low') {
      // Cooling slots across the back of the top, which a fanless case needs.
      for (let i = 0; i < 7; i += 1) {
        const vent = new Mesh(new BoxGeometry(0.2, 0.004, 0.009), this.shade);
        vent.position.set(
          0,
          DESK.top + H - 0.002,
          MONITOR.frontZ - D * 0.66 - i * 0.016,
        );
        this.group.add(vent);
      }
    }

    /* --- Feet -------------------------------------------------------------- */

    for (const x of [-W / 2 + 0.055, W / 2 - 0.055]) {
      for (const z of [MONITOR.frontZ - 0.05, MONITOR.frontZ - D + 0.07]) {
        const foot = new Mesh(new BoxGeometry(0.03, 0.006, 0.03), this.darkPlastic);
        foot.position.set(x, DESK.top + 0.003, z);
        this.group.add(foot);
      }
    }

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
        opacity: 0.4,
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
    (this.powerLed.material as MeshBasicMaterial).color.set(on ? 0x7be08f : 0x2a2a2a);
  }

  /** Screen spill tracks how bright the OS actually is right now. */
  setGlow(intensity: number) {
    this.screenLight.intensity = intensity;
  }
}

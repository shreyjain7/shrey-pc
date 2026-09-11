import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
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

const OPENING_W = MONITOR.screenWidth + 0.006;
const OPENING_H = MONITOR.screenHeight + 0.006;
const OUTER_W = MONITOR.screenWidth + MONITOR.bezel * 2;
/** Extra plastic below the glass, where the brand badge and buttons live. */
const CHIN = 0.052;
const OUTER_H = MONITOR.screenHeight + MONITOR.bezel + CHIN;

const BEZEL_DEPTH = 0.06;

/** A beige-grey CRT with the live OS rendered onto its glass by CSS3DRenderer. */
export class Monitor {
  readonly group = new Group();
  /** Meshes that count as "the monitor" when raycasting for a click. */
  readonly hitboxes: Object3D[] = [];

  readonly powerLed: Mesh;

  private readonly screenLight: RectAreaLight;

  private readonly plastic = new MeshStandardMaterial({
    color: 0xb9b3a4,
    roughness: 0.72,
    metalness: 0.02,
  });

  private readonly darkPlastic = new MeshStandardMaterial({
    color: 0x2c2c31,
    roughness: 0.6,
    metalness: 0.05,
  });

  constructor(screenElement: HTMLElement, quality: Quality) {
    // The glass sits a little above the desk on a swivel base.
    const bezelCentreY =
      DESK.top + MONITOR.standHeight + MONITOR.bezel + MONITOR.screenHeight / 2;
    // The chin hangs below the glass, so the plastic's centre is lower than the glass'.
    const plasticCentreY = bezelCentreY - (CHIN - MONITOR.bezel) / 2;

    // --- Front bezel: a rounded slab with the screen cut out of it -----------
    const bezel = new Mesh(
      roundedSlab(OUTER_W, OUTER_H, 0.022, {
        depth: BEZEL_DEPTH,
        bevel: 0.006,
        holeWidth: OPENING_W,
        holeHeight: OPENING_H,
        holeRadius: 0.014,
      }),
      this.plastic,
    );
    bezel.position.set(0, plasticCentreY, MONITOR.frontZ);
    bezel.castShadow = true;
    bezel.receiveShadow = true;
    this.group.add(bezel);
    this.hitboxes.push(bezel);

    // --- Body: solid, tapering back like a real picture tube ----------------
    const bodyDepth = MONITOR.bodyDepth - BEZEL_DEPTH;
    const body = new Mesh(
      taperAlongZ(
        roundedSlab(OUTER_W - 0.012, OUTER_H - 0.012, 0.03, {
          depth: bodyDepth,
          bevel: 0.008,
        }),
        0.68,
        bodyDepth,
      ),
      this.plastic,
    );
    body.position.set(0, plasticCentreY, MONITOR.frontZ - BEZEL_DEPTH);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    this.hitboxes.push(body);

    // --- Stand --------------------------------------------------------------
    const neck = new Mesh(
      new CylinderGeometry(0.055, 0.075, MONITOR.standHeight, 20),
      this.darkPlastic,
    );
    neck.position.set(0, DESK.top + MONITOR.standHeight / 2, MONITOR.frontZ - 0.18);
    neck.castShadow = true;
    this.group.add(neck);

    const base = new Mesh(new CylinderGeometry(0.135, 0.145, 0.018, 28), this.darkPlastic);
    base.position.set(0, DESK.top + 0.009, MONITOR.frontZ - 0.18);
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);
    this.hitboxes.push(base);

    // --- Chin details: badge and power LED ----------------------------------
    const badge = new Mesh(new BoxGeometry(0.075, 0.006, 0.004), this.darkPlastic);
    badge.position.set(
      -OUTER_W / 2 + 0.075,
      plasticCentreY - OUTER_H / 2 + 0.02,
      MONITOR.frontZ + 0.002,
    );
    this.group.add(badge);

    this.powerLed = new Mesh(
      new CylinderGeometry(0.0045, 0.0045, 0.004, 12),
      new MeshBasicMaterial({ color: 0x2a2a2a }),
    );
    this.powerLed.rotation.x = Math.PI / 2;
    this.powerLed.position.set(
      OUTER_W / 2 - 0.038,
      plasticCentreY - OUTER_H / 2 + 0.02,
      MONITOR.frontZ + 0.002,
    );
    this.group.add(this.powerLed);

    // --- The hole in the canvas ---------------------------------------------
    // Depth-only: writes to the depth buffer so the room behind never paints
    // here, but contributes no colour, leaving the canvas transparent and the
    // CSS3D layer beneath visible.
    const occluder = new Mesh(
      new PlaneGeometry(MONITOR.screenWidth, MONITOR.screenHeight),
      new MeshBasicMaterial({ colorWrite: false, side: DoubleSide }),
    );
    occluder.position.copy(SCREEN_CENTER);
    occluder.renderOrder = -1;
    this.group.add(occluder);
    this.hitboxes.push(occluder);

    // --- The live DOM, projected onto the glass ------------------------------
    screenElement.style.width = `${SCREEN_PX.width}px`;
    screenElement.style.height = `${SCREEN_PX.height}px`;

    const cssObject = new CSS3DObject(screenElement);
    cssObject.position.copy(SCREEN_CENTER);
    cssObject.scale.setScalar(PX_TO_M);
    this.group.add(cssObject);

    // --- Glass ---------------------------------------------------------------
    // Three thin planes stacked in front of the DOM, all drawn after it:
    // a tint, the tube's corner falloff, and dust caught in the light.
    //
    // All unlit on purpose. A physical material here picks up the studio's key and
    // fill as a specular sheet across the whole pane, which whites out the DOM
    // behind it — the brighter the set, the less of the screen you can read.
    const glass = new Mesh(
      new PlaneGeometry(MONITOR.screenWidth, MONITOR.screenHeight),
      new MeshBasicMaterial({
        color: 0x8ea8c8,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
    );
    glass.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_Z + 0.003);
    glass.renderOrder = 10;
    this.group.add(glass);

    // Corners of a real tube fall off; the alphaMap's luminance is the mask.
    const vignette = new Mesh(
      new PlaneGeometry(MONITOR.screenWidth, MONITOR.screenHeight),
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.16,
        alphaMap: vignetteTexture(),
        depthWrite: false,
      }),
    );
    vignette.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_Z + 0.0035);
    vignette.renderOrder = 11;
    this.group.add(vignette);

    if (quality !== 'low') {
      const smudge = new Mesh(
        new PlaneGeometry(MONITOR.screenWidth, MONITOR.screenHeight),
        new MeshBasicMaterial({
          map: smudgeTexture(),
          transparent: true,
          opacity: 0.06,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      smudge.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_Z + 0.004);
      smudge.renderOrder = 12;
      this.group.add(smudge);
    }

    // --- Screen spill --------------------------------------------------------
    // The single most important light in the room: it puts the monitor's own
    // glow onto the desk, the keyboard and the bezel.
    this.screenLight = new RectAreaLight(0x9fc4ff, 0, MONITOR.screenWidth, MONITOR.screenHeight);
    this.screenLight.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_Z + 0.01);
    this.screenLight.lookAt(SCREEN_CENTER.x, SCREEN_CENTER.y, 2);
    this.group.add(this.screenLight);
  }

  /** Called by the OS when the machine powers on or off. */
  setPowered(on: boolean) {
    (this.powerLed.material as MeshBasicMaterial).color.set(on ? 0x66ff9a : 0x2a2a2a);
  }

  /** Screen spill tracks how bright the OS actually is right now. */
  setGlow(intensity: number) {
    this.screenLight.intensity = intensity;
  }
}

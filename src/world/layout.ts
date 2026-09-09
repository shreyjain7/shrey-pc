import { Vector3 } from 'three';

/**
 * One place for the numbers the camera, the monitor and the CSS3D screen all
 * have to agree on. Scene units are metres.
 */

export const DESK = {
  top: 0.75,
  width: 1.9,
  depth: 0.8,
  thickness: 0.04,
};

export const MONITOR = {
  /** Visible glass, 4:3. */
  screenWidth: 0.46,
  screenHeight: 0.345,
  /** Thickness of the plastic around the glass. */
  bezel: 0.035,
  /** CRTs are deep — this is what sells the silhouette. */
  bodyDepth: 0.44,
  standHeight: 0.055,
  /** Front face of the bezel. */
  frontZ: -0.02,
};

/** The glass sits a hair behind the front of the bezel. */
export const SCREEN_Z = MONITOR.frontZ - 0.004;

export const SCREEN_CENTER = new Vector3(
  0,
  DESK.top + MONITOR.standHeight + MONITOR.bezel + MONITOR.screenHeight / 2,
  SCREEN_Z,
);

/**
 * CSS pixels per metre for the CSS3D layer. The screen DOM is authored at
 * SCREEN_PX below and then scaled down into world space, so 1 CSS px is a
 * fixed, crisp fraction of a metre.
 */
export const SCREEN_PX = {
  width: 1280,
  height: 960,
};

export const PX_TO_M = MONITOR.screenWidth / SCREEN_PX.width;

/** Where the camera rests when nothing is focused. */
export const IDLE_CAMERA = {
  position: new Vector3(0.3, 1.31, 1.22),
  target: new Vector3(0, 1.03, -0.12),
};

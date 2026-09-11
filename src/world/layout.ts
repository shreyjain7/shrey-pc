import { Vector3 } from 'three';

/**
 * One place for the numbers the camera, the monitor and the CSS3D screen all
 * have to agree on. Scene units are metres.
 */

export const DESK = {
  top: 0.75,
  width: 1.98,
  depth: 0.92,
  thickness: 0.04,
  /** Centre of the top along Z; the front edge lands at centreZ + depth/2. */
  centreZ: -0.16,
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
  position: new Vector3(0.34, 1.4, 1.52),
  target: new Vector3(0, 1.06, -0.15),
};

/**
 * Where the tower sits. On the desk rather than under it, and angled so the
 * glass panel faces the resting camera — the machine is meant to be watched
 * while it works, not hidden by a desk leg.
 */
export const TOWER = {
  position: new Vector3(-0.6, DESK.top, -0.16),
  /** Negative yaw swings the +X glass side toward the idle camera. */
  rotationY: -0.4,
};

/**
 * The workstation pose.
 *
 * The OS docks over the right of the viewport here, so this is framed for the
 * strip that is left over: the tower lands at about a quarter of the way
 * across, with the keyboard and the near edge of the CRT beside it. Aiming
 * right of the desk's centre is what pushes the machine into that strip
 * instead of leaving it behind the dock.
 */
export const WORKSTATION_CAMERA = {
  position: new Vector3(1.3, 1.42, 2.0),
  target: new Vector3(0.16, 1.0, -0.1),
};

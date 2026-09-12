import { Vector3 } from 'three';

/**
 * One place for the numbers the camera, the machine and the CSS3D screen all
 * have to agree on. Scene units are metres.
 */

export const DESK = {
  top: 0.74,
  width: 1.72,
  depth: 0.78,
  thickness: 0.035,
  /** Centre of the top along Z; the front edge lands at centreZ + depth/2. */
  centreZ: -0.16,
};

/**
 * The compact Macintosh.
 *
 * Proportioned after the 1984 all-in-one — taller than it is wide, deep, and
 * with far more plastic below the glass than above it, which is what makes the
 * silhouette read — but scaled off the screen rather than off the real case.
 * A true 9" tube is 175mm across, and an operating system is unreadable at
 * that size from across a room, so the glass keeps its useful width and the
 * body is built around it. The shape is honest; the scale is not.
 */
export const MONITOR = {
  /** Visible glass, 4:3. */
  screenWidth: 0.42,
  screenHeight: 0.315,

  bodyWidth: 0.54,
  bodyHeight: 0.63,
  bodyDepth: 0.46,

  /** Plastic above the glass, and the much deeper band below it. */
  brow: 0.075,
  chin: 0.24,

  /** Front face of the case. */
  frontZ: -0.02,
};

/** The glass is recessed into its well rather than flush with the front. */
export const SCREEN_Z = MONITOR.frontZ - 0.018;

/**
 * Screen centre. The case stands on the desk — no stand, no neck — so this is
 * measured up from the desk through the chin.
 */
export const SCREEN_CENTER = new Vector3(
  0,
  DESK.top + MONITOR.chin + MONITOR.screenHeight / 2,
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
  position: new Vector3(0.30, 1.42, 1.34),
  target: new Vector3(0, 1.08, -0.14),
};

/**
 * The workstation pose.
 *
 * The OS docks over the right of the viewport here, so this is framed for the
 * strip that is left over: the drive lands about a quarter of the way across,
 * with the keyboard and the near edge of the Macintosh beside it. Aiming right
 * of the desk's centre is what pushes the machine into that strip instead of
 * leaving it behind the dock.
 */
export const WORKSTATION_CAMERA = {
  position: new Vector3(1.18, 1.44, 1.76),
  target: new Vector3(0.14, 1.02, -0.1),
};

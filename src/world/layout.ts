import { Vector3 } from 'three';

/**
 * One place for the numbers the camera, the machine and the CSS3D screen all
 * have to agree on. Scene units are metres.
 */

/** A steel office desk: dark laminate top, light grey frame, one pedestal. */
export const DESK = {
  top: 0.73,
  width: 1.84,
  depth: 0.82,
  thickness: 0.03,
  /** Centre of the top along Z; the front edge lands at centreZ + depth/2. */
  centreZ: -0.16,
};

/**
 * The system unit: the horizontal "pizza box" the monitor stands on.
 *
 * This is the shape that dates the machine. A desktop case lies flat and wears
 * its drives on the front — the monitor sitting on its lid is what makes the
 * pair read as one object rather than two.
 */
export const UNIT = {
  width: 0.46,
  height: 0.105,
  depth: 0.42,
  /** Front panel. The desk's front edge is at DESK.centreZ + DESK.depth / 2. */
  frontZ: 0.01,
};

/** Lid of the system unit — what the monitor's pedestal stands on. */
export const UNIT_TOP = DESK.top + UNIT.height;

/**
 * The CRT.
 *
 * Proportioned after a 15" desktop monitor of the period: a deep bezel, a
 * shallow brow, a chin carrying the controls, and a tube that funnels back to
 * a neck. Scaled off the screen rather than off the real tube, because an
 * operating system has to stay readable from across a room.
 */
export const MONITOR = {
  /** Visible glass, 4:3. */
  screenWidth: 0.4,
  screenHeight: 0.3,

  bodyWidth: 0.5,
  bodyHeight: 0.435,
  bodyDepth: 0.4,

  /** Plastic above the glass, and the deeper band below carrying the knobs. */
  brow: 0.055,
  chin: 0.08,

  /** Front of the bezel, set back from the system unit's own front edge. */
  frontZ: -0.035,

  /** The tilt-swivel pedestal between the unit's lid and the bezel. */
  baseHeight: 0.04,
};

/** Underside of the monitor's bezel. */
export const MONITOR_BOTTOM = UNIT_TOP + MONITOR.baseHeight;

/** The glass is recessed into its bezel rather than flush with the front. */
export const SCREEN_Z = MONITOR.frontZ - 0.016;

/** Screen centre, measured up through the desk, the unit and the chin. */
export const SCREEN_CENTER = new Vector3(
  0,
  MONITOR_BOTTOM + MONITOR.chin + MONITOR.screenHeight / 2,
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

/**
 * Where the opening flight begins: back and high enough to hold the whole
 * desk, the chair and the plant at once, which is the shot the setup is built
 * to be seen in before the camera comes down to the machine.
 */
export const ENTRY_CAMERA = {
  position: new Vector3(-2.05, 2.4, 3.15),
  target: new Vector3(-0.02, 0.94, -0.16),
};

/** Where the camera rests when nothing is focused. */
export const IDLE_CAMERA = {
  position: new Vector3(0.34, 1.5, 1.62),
  target: new Vector3(0, 1.06, -0.12),
};

/**
 * The workstation pose.
 *
 * The OS docks over the right of the viewport here, so this is framed for the
 * strip that is left over: the system unit lands about a quarter of the way
 * across, with the keyboard and the near edge of the monitor beside it. Aiming
 * right of the desk's centre is what pushes the machine into that strip
 * instead of leaving it behind the dock.
 */
export const WORKSTATION_CAMERA = {
  position: new Vector3(1.3, 1.52, 1.95),
  target: new Vector3(0.16, 1.02, -0.08),
};

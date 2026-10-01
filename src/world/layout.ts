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
 * How big the OS's own DOM is, before the CSS3D layer scales it onto the glass.
 *
 * 1280x960 is the size the OS is designed at, and on a laptop or a tablet it
 * projects down to something crisp and readable.
 *
 * A phone cannot have that. Its glass lands in a few hundred CSS pixels, and a
 * 1280px surface squeezed into 340 of them puts 12px type at under four. So a
 * phone gets a smaller surface: the same OS, laid out in less room, which then
 * projects at close to its authored size. That keeps the machine in frame and
 * the words legible at once. It also keeps the layer under 1024px, the size
 * past which iOS splits a composited layer into tiles.
 */
const SCREEN_FULL = { width: 1280, height: 960 };
const SCREEN_COMPACT = { width: 560, height: 420 };

export const SCREEN_PX = { ...SCREEN_FULL };

/**
 * Chosen once, before the monitor is built, because the CSS3D object bakes the
 * scale at construction. Turning a phone does not change it.
 */
export function useCompactScreen(compact: boolean) {
  const source = compact ? SCREEN_COMPACT : SCREEN_FULL;
  SCREEN_PX.width = source.width;
  SCREEN_PX.height = source.height;
}

export const isCompactScreen = () => SCREEN_PX.width === SCREEN_COMPACT.width;

/** Metres per CSS pixel. Read after `useCompactScreen`, never cached above it. */
export const pxToM = () => MONITOR.screenWidth / SCREEN_PX.width;

/**
 * Where the opening flight begins: far back across the studio and high, so
 * the desk is a small thing half-dissolved in the fog, and the whole way in is
 * the room resolving around it until the machine fills the frame. About
 * eleven metres out — past the ground's light pool, inside the dome.
 */
export const ENTRY_CAMERA = {
  position: new Vector3(-5.6, 4.3, 9.4),
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

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
 * How big the OS's own DOM is, before the CSS3D layer scales it onto the glass.
 *
 * A desk is a desk: 1280x960 is the size the OS is designed at, and on a
 * monitor-sized viewport it projects down to something crisp and readable.
 *
 * A phone cannot have that. The glass lands in a few hundred device pixels
 * there, and a 1280px surface squeezed into 340 of them puts 12px type at
 * under four — unreadable, whatever the camera does. So a narrow device gets
 * a smaller surface: the same OS, laid out in less room, which then projects
 * at something close to its authored size. It is the only way to have both
 * the machine in frame and words you can actually read.
 */
const SCREEN_FULL = { width: 1280, height: 960 };
const SCREEN_COMPACT = { width: 560, height: 420 };

export const SCREEN_PX = { ...SCREEN_FULL };

/**
 * Chosen once, before the monitor is built, because the CSS3D object bakes the
 * scale at construction. Changing it later would need the monitor rebuilding.
 */
export function useCompactScreen(compact: boolean) {
  const source = compact ? SCREEN_COMPACT : SCREEN_FULL;
  SCREEN_PX.width = source.width;
  SCREEN_PX.height = source.height;
}

/** Metres per CSS pixel. Read after `useCompactScreen`, never cached above it. */
export const pxToM = () => MONITOR.screenWidth / SCREEN_PX.width;

/**
 * Where the opening flight begins: back across the room, higher and swung
 * round, so the first two seconds travel the whole desk before settling.
 */
export const ENTRY_CAMERA = {
  position: new Vector3(-1.55, 2.05, 2.62),
  target: new Vector3(-0.1, 0.92, -0.3),
};

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

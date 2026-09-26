type PermissionRequest = () => Promise<'granted' | 'denied'>;

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: PermissionRequest };
type MotionCtor = typeof DeviceMotionEvent & { requestPermission?: PermissionRequest };

/** Degrees of tilt, away from how the phone was being held, that reach full swing. */
const FULL_TILT = 22;
/** Per event: how quickly the rest pose follows the hand (~4s at 60Hz). */
const DRIFT = 0.004;
/** A jolt in m/s² between two readings that counts as one shake of the wrist. */
const JOLT = 14;

/**
 * The phone's own motion: which way it is tilted, and whether it is being
 * shaken.
 *
 * iOS hides both behind a permission that can only be asked for from inside
 * a tap, so nothing here starts on its own there — `enable()` is wired to a
 * button. Everywhere else it needs no prompt and can start straight away.
 */
export class Motion {
  readonly supported: boolean;
  readonly needsPermission: boolean;
  enabled = false;

  private rest: { x: number; y: number } | null = null;
  private lastMagnitude = 0;
  private jolts: number[] = [];
  private lastShake = 0;

  constructor(
    private readonly onTilt: (x: number, y: number) => void,
    private readonly onShake: () => void,
  ) {
    const orientation = window.DeviceOrientationEvent as OrientationCtor | undefined;
    // A laptop can report orientation too, and has a cursor for parallax.
    this.supported =
      typeof orientation !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    this.needsPermission = this.supported && typeof orientation?.requestPermission === 'function';
  }

  /** On iOS, call this from a click handler or the prompt never appears. */
  async enable() {
    if (!this.supported) return false;

    if (this.needsPermission) {
      try {
        const orientation = window.DeviceOrientationEvent as OrientationCtor;
        if ((await orientation.requestPermission!()) !== 'granted') return false;
        // One grant covers both on iOS; asking for motion too costs no prompt.
        const motion = window.DeviceMotionEvent as MotionCtor | undefined;
        await motion?.requestPermission?.().catch(() => 'denied');
      } catch {
        return false;
      }
    }

    if (!this.enabled) {
      window.addEventListener('deviceorientation', this.onOrientation);
      window.addEventListener('devicemotion', this.onMotion);
    }
    this.enabled = true;
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    this.enabled = false;
    this.rest = null;
    this.onTilt(0, 0);
  }

  private onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;

    // beta and gamma are fixed to the device, not the screen, so turning the
    // phone on its side swaps which of them means "left and right".
    const angle =
      screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0);
    let x = event.gamma;
    let y = event.beta;
    if (angle === 90) [x, y] = [event.beta, -event.gamma];
    else if (angle === -90 || angle === 270) [x, y] = [-event.beta, event.gamma];
    else if (angle === 180) [x, y] = [-event.gamma, -event.beta];

    // Tilt is measured from however the phone is being held, not from flat,
    // and that rest pose slowly follows the hand — so lying down, or passing
    // the phone to someone, re-centres the room instead of pinning it askew.
    if (!this.rest) this.rest = { x, y };
    this.rest.x += (x - this.rest.x) * DRIFT;
    this.rest.y += (y - this.rest.y) * DRIFT;

    this.onTilt((x - this.rest.x) / FULL_TILT, (y - this.rest.y) / FULL_TILT);
  };

  /** Four hard jolts inside a second is a shake; one is just a bump. */
  private onMotion = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;

    const magnitude = Math.hypot(a.x, a.y, a.z);
    const jolt = Math.abs(magnitude - this.lastMagnitude);
    this.lastMagnitude = magnitude;
    if (jolt < JOLT) return;

    const now = performance.now();
    this.jolts = this.jolts.filter((time) => now - time < 1000);
    this.jolts.push(now);

    if (this.jolts.length >= 4 && now - this.lastShake > 3000) {
      this.lastShake = now;
      this.jolts = [];
      this.onShake();
    }
  };
}

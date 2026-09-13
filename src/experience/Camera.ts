import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import type { Sizes } from './Sizes';
import { ENTRY_CAMERA, IDLE_CAMERA, MONITOR, SCREEN_CENTER, WORKSTATION_CAMERA } from '../world/layout';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export type CameraMode = 'idle' | 'workstation' | 'focused';

/** How far the user may swing the view away from the resting pose. */
const AZIMUTH_LIMIT = MathUtils.degToRad(34);
const POLAR_LIMIT = MathUtils.degToRad(17);

/** Seconds for each transition. Longer moves get longer flights. */
const DURATIONS: Record<string, number> = {
  'idle>focused': 1.5,
  'focused>idle': 1.4,
  'idle>workstation': 1.05,
  'workstation>idle': 1.05,
  'workstation>focused': 0.95,
  'focused>workstation': 1.1,
};

interface Pose {
  position: Vector3;
  target: Vector3;
}

/**
 * Three camera states and an interruptible flight between any two of them:
 *
 *  - **idle** orbits the desk, draggable, drifting gently with the pointer.
 *  - **workstation** pulls back and to the right so the tower, the desk and
 *    the CRT are all in frame at once — this is the pose the machine is
 *    watched from while the OS runs in its docked panel.
 *  - **focused** sits square on the glass, close enough that it fills the view.
 *
 * Rather than tweening a single blend between two fixed poses, each mode
 * publishes a *live* pose every frame (so orbiting and parallax keep working
 * mid-flight), and a transition simply eases from wherever the camera actually
 * was when the mode changed toward that live pose. Re-targeting halfway
 * through re-captures the current position, so an interrupted flight never
 * snaps.
 */
export class Camera {
  readonly instance: PerspectiveCamera;

  mode: CameraMode = 'idle';

  /** 0 at the moment the mode changed, 1 once the flight has landed. */
  private progress = 1;
  private duration = 1;

  /** Where the camera actually was when the current flight began. */
  private readonly from: Pose = { position: new Vector3(), target: new Vector3() };
  /** Where it is looking right now — tracked so a flight can start from it. */
  private readonly lookAt = new Vector3().copy(IDLE_CAMERA.target);

  /** Rest poses expressed as spheres around each mode's own target. */
  private readonly idleRest = new Spherical();
  private readonly workRest = new Spherical();

  /** User-applied orbit offsets, and where they are easing toward. */
  private orbit = { azimuth: 0, polar: 0 };
  private orbitTarget = { azimuth: 0, polar: 0 };

  /** Pointer parallax, in normalised device coords, smoothed. */
  private parallax = { x: 0, y: 0 };
  private parallaxTarget = { x: 0, y: 0 };

  private dragging = false;
  private dragPointer: number | null = null;
  private dragLast = { x: 0, y: 0 };

  private readonly offset = new Vector3();
  private readonly focusPosition = new Vector3();
  /** Scratch, reused every frame so the loop allocates nothing. */
  private readonly livePosition = new Vector3();
  private readonly liveTarget = new Vector3();

  private onSettled: ((mode: CameraMode) => void) | null = null;

  constructor(private sizes: Sizes) {
    this.instance = new PerspectiveCamera(38, sizes.aspect, 0.1, 60);

    this.offset.copy(IDLE_CAMERA.position).sub(IDLE_CAMERA.target);
    this.idleRest.setFromVector3(this.offset);

    this.offset.copy(WORKSTATION_CAMERA.position).sub(WORKSTATION_CAMERA.target);
    this.workRest.setFromVector3(this.offset);

    this.instance.position.copy(IDLE_CAMERA.position);
    this.instance.lookAt(IDLE_CAMERA.target);

    this.updateFraming();
    sizes.on(() => this.resize());

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /* ---------------------------------------------------------------------- */
  /* Input                                                                   */
  /* ---------------------------------------------------------------------- */

  /** Both room poses are draggable; only the glass is locked off. */
  private get orbitable() {
    return this.mode !== 'focused';
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.orbitable || event.button !== 0) return;
    this.dragging = true;
    this.dragPointer = event.pointerId;
    this.dragLast = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.dragPointer !== event.pointerId) return;
    this.dragging = false;
    this.dragPointer = null;
  };

  private onPointerMove = (event: PointerEvent) => {
    this.parallaxTarget.x = (event.clientX / this.sizes.width) * 2 - 1;
    this.parallaxTarget.y = (event.clientY / this.sizes.height) * 2 - 1;

    if (!this.dragging || this.dragPointer !== event.pointerId || !this.orbitable) return;

    const dx = event.clientX - this.dragLast.x;
    const dy = event.clientY - this.dragLast.y;
    this.dragLast = { x: event.clientX, y: event.clientY };

    // Scale by viewport so a swipe travels the same arc on any screen.
    this.orbitTarget.azimuth = MathUtils.clamp(
      this.orbitTarget.azimuth - (dx / this.sizes.width) * 2.4,
      -AZIMUTH_LIMIT,
      AZIMUTH_LIMIT,
    );
    this.orbitTarget.polar = MathUtils.clamp(
      this.orbitTarget.polar - (dy / this.sizes.height) * 1.6,
      -POLAR_LIMIT,
      POLAR_LIMIT,
    );
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.orbitable) return;
    // Never steal arrows from a focused field (the terminal, for instance).
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

    const step = MathUtils.degToRad(6);
    if (event.key === 'ArrowLeft') this.orbitTarget.azimuth += step;
    else if (event.key === 'ArrowRight') this.orbitTarget.azimuth -= step;
    else if (event.key === 'ArrowUp') this.orbitTarget.polar += step * 0.6;
    else if (event.key === 'ArrowDown') this.orbitTarget.polar -= step * 0.6;
    else return;

    event.preventDefault();
    this.orbitTarget.azimuth = MathUtils.clamp(this.orbitTarget.azimuth, -AZIMUTH_LIMIT, AZIMUTH_LIMIT);
    this.orbitTarget.polar = MathUtils.clamp(this.orbitTarget.polar, -POLAR_LIMIT, POLAR_LIMIT);
  };

  /** Swing the view back to the resting pose. */
  resetView() {
    this.orbitTarget = { azimuth: 0, polar: 0 };
  }

  get isDefaultView() {
    return Math.abs(this.orbitTarget.azimuth) < 0.01 && Math.abs(this.orbitTarget.polar) < 0.01;
  }

  /* ---------------------------------------------------------------------- */
  /* Framing                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Pull the camera back far enough that the glass fits the viewport on both
   * axes. Portrait phones are width-limited, so they need the widest berth.
   */
  private updateFraming() {
    // A narrow viewport reads better with a slightly wider lens.
    this.instance.fov = this.sizes.portrait ? 46 : 38;
    this.instance.aspect = this.sizes.aspect;
    this.instance.updateProjectionMatrix();

    const vFov = MathUtils.degToRad(this.instance.fov);
    const margin = this.sizes.compact ? 1.01 : 1.06;
    const fitHeight = (MONITOR.screenHeight * margin) / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.instance.aspect);
    const fitWidth = (MONITOR.screenWidth * margin) / 2 / Math.tan(hFov / 2);

    this.focusPosition.set(
      SCREEN_CENTER.x,
      SCREEN_CENTER.y,
      SCREEN_CENTER.z + Math.max(fitHeight, fitWidth),
    );
  }

  resize() {
    this.updateFraming();
  }

  /* ---------------------------------------------------------------------- */
  /* State                                                                   */
  /* ---------------------------------------------------------------------- */

  /** Fly to `mode`. Safe to call mid-flight; the current pose is re-captured. */
  setMode(mode: CameraMode, onSettled?: (mode: CameraMode) => void) {
    if (mode === this.mode) {
      onSettled?.(mode);
      return;
    }

    this.duration = DURATIONS[`${this.mode}>${mode}`] ?? 1.2;
    this.from.position.copy(this.instance.position);
    this.from.target.copy(this.lookAt);
    this.progress = 0;
    this.mode = mode;
    this.dragging = false;
    this.onSettled = onSettled ?? null;
  }

  /**
   * The opening flight.
   *
   * Not a mode change — the camera is already idle and `setMode` would refuse
   * it — so this plants the camera at the establishing pose and restarts the
   * same ease that every other flight uses. Orbit and parallax keep working
   * throughout, because the live pose is recomputed every frame rather than
   * baked at the start.
   */
  arrive(duration = 2.8) {
    this.from.position.copy(ENTRY_CAMERA.position);
    this.from.target.copy(ENTRY_CAMERA.target);
    this.instance.position.copy(ENTRY_CAMERA.position);
    this.lookAt.copy(ENTRY_CAMERA.target);
    this.instance.lookAt(this.lookAt);

    this.mode = 'idle';
    this.progress = 0;
    this.duration = duration;
    this.dragging = false;
    this.onSettled = null;
  }

  focus(onSettled?: (mode: CameraMode) => void) {
    this.setMode('focused', onSettled);
  }

  unfocus(onSettled?: (mode: CameraMode) => void) {
    this.setMode('idle', onSettled);
  }

  /** True once the dolly-in has finished — the screen only takes input then. */
  get isSettledOnScreen() {
    return this.mode === 'focused' && this.progress >= 1;
  }

  get isMoving() {
    return this.progress < 1;
  }

  /* ---------------------------------------------------------------------- */
  /* Frame                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * The pose the current mode wants *right now*, written into the scratch
   * vectors. Orbit, parallax and sway all fold in here, weighted down in the
   * workstation pose and off entirely on the glass.
   */
  private computeLivePose(elapsed: number) {
    if (this.mode === 'focused') {
      this.livePosition.copy(this.focusPosition);
      this.liveTarget.copy(SCREEN_CENTER);
      return;
    }

    const workstation = this.mode === 'workstation';
    const rest = workstation ? this.workRest : this.idleRest;
    const anchor = workstation ? WORKSTATION_CAMERA.target : IDLE_CAMERA.target;
    // The wide pose stays steadier — big drift at that distance reads as drunk.
    const weight = workstation ? 0.45 : 1;

    const sway = Math.sin(elapsed * 0.35) * 0.012 + Math.sin(elapsed * 0.21) * 0.008;

    const azimuth =
      rest.theta + (this.orbit.azimuth + this.parallax.x * 0.06 + sway * 0.6) * weight;
    const polar = MathUtils.clamp(
      rest.phi + (-this.orbit.polar + this.parallax.y * 0.035 - sway * 0.3) * weight,
      0.2,
      Math.PI / 2 + 0.1,
    );

    this.offset.setFromSphericalCoords(rest.radius, polar, azimuth);
    this.livePosition.copy(anchor).add(this.offset);
    this.liveTarget.copy(anchor);
  }

  update(delta: number, elapsed: number) {
    const wasMoving = this.progress < 1;
    this.progress = Math.min(this.progress + delta / this.duration, 1);

    this.orbit.azimuth = MathUtils.damp(this.orbit.azimuth, this.orbitTarget.azimuth, 5, delta);
    this.orbit.polar = MathUtils.damp(this.orbit.polar, this.orbitTarget.polar, 5, delta);

    // Parallax stands down while the user is actively dragging.
    const parallaxWeight = this.dragging ? 0 : 1;
    this.parallax.x = MathUtils.damp(this.parallax.x, this.parallaxTarget.x * parallaxWeight, 3, delta);
    this.parallax.y = MathUtils.damp(this.parallax.y, this.parallaxTarget.y * parallaxWeight, 3, delta);

    this.computeLivePose(elapsed);

    if (this.progress < 1) {
      const t = easeInOutCubic(this.progress);
      this.livePosition.lerpVectors(this.from.position, this.livePosition, t);
      this.liveTarget.lerpVectors(this.from.target, this.liveTarget, t);
    }

    this.instance.position.copy(this.livePosition);
    this.lookAt.copy(this.liveTarget);
    this.instance.lookAt(this.lookAt);

    if (wasMoving && this.progress >= 1 && this.onSettled) {
      const callback = this.onSettled;
      this.onSettled = null;
      callback(this.mode);
    }
  }

  destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

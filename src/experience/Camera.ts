import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import type { Sizes } from './Sizes';
import { IDLE_CAMERA, MONITOR, SCREEN_CENTER } from '../world/layout';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export type CameraMode = 'idle' | 'focused';

/** How far the user may swing the view away from the resting pose. */
const AZIMUTH_LIMIT = MathUtils.degToRad(34);
const POLAR_LIMIT = MathUtils.degToRad(17);

/**
 * Two camera states and a tween between them:
 *  - idle: orbits the desk, draggable, drifting gently with the pointer
 *  - focused: square on to the CRT glass, close enough that it fills the frame
 */
export class Camera {
  readonly instance: PerspectiveCamera;

  mode: CameraMode = 'idle';
  /** 0 = idle pose, 1 = focused pose. */
  private blend = 0;
  private direction = -1;
  private readonly duration = 1.5;

  /** Rest pose expressed as a sphere around the idle target. */
  private readonly rest = new Spherical();

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
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly focusPosition = new Vector3();

  private onSettled: ((mode: CameraMode) => void) | null = null;

  constructor(private sizes: Sizes) {
    this.instance = new PerspectiveCamera(38, sizes.aspect, 0.1, 60);

    this.offset.copy(IDLE_CAMERA.position).sub(IDLE_CAMERA.target);
    this.rest.setFromVector3(this.offset);

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

  private onPointerDown = (event: PointerEvent) => {
    if (this.mode !== 'idle' || event.button !== 0) return;
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

    if (!this.dragging || this.dragPointer !== event.pointerId || this.mode !== 'idle') return;

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
    if (this.mode !== 'idle') return;
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

  focus(onSettled?: (mode: CameraMode) => void) {
    if (this.mode === 'focused') return;
    this.mode = 'focused';
    this.direction = 1;
    this.dragging = false;
    this.onSettled = onSettled ?? null;
  }

  unfocus(onSettled?: (mode: CameraMode) => void) {
    if (this.mode === 'idle') return;
    this.mode = 'idle';
    this.direction = -1;
    this.onSettled = onSettled ?? null;
  }

  /** True once the dolly-in has finished — the screen only takes input then. */
  get isSettledOnScreen() {
    return this.mode === 'focused' && this.blend === 1;
  }

  get isMoving() {
    return this.blend > 0 && this.blend < 1;
  }

  update(delta: number, elapsed: number) {
    const previous = this.blend;
    this.blend = MathUtils.clamp(this.blend + (this.direction * delta) / this.duration, 0, 1);

    const t = easeInOutCubic(this.blend);
    const drift = 1 - t;

    this.orbit.azimuth = MathUtils.damp(this.orbit.azimuth, this.orbitTarget.azimuth, 5, delta);
    this.orbit.polar = MathUtils.damp(this.orbit.polar, this.orbitTarget.polar, 5, delta);

    // Parallax stands down while the user is actively dragging.
    const parallaxWeight = this.dragging ? 0 : 1;
    this.parallax.x = MathUtils.damp(this.parallax.x, this.parallaxTarget.x * parallaxWeight, 3, delta);
    this.parallax.y = MathUtils.damp(this.parallax.y, this.parallaxTarget.y * parallaxWeight, 3, delta);

    const sway = Math.sin(elapsed * 0.35) * 0.012 + Math.sin(elapsed * 0.21) * 0.008;

    const azimuth =
      this.rest.theta + (this.orbit.azimuth + this.parallax.x * 0.06 + sway * 0.6) * drift;
    const polar = MathUtils.clamp(
      this.rest.phi + (-this.orbit.polar + this.parallax.y * 0.035 - sway * 0.3) * drift,
      0.2,
      Math.PI / 2 + 0.1,
    );

    this.offset.setFromSphericalCoords(this.rest.radius, polar, azimuth);

    this.position.set(
      MathUtils.lerp(IDLE_CAMERA.target.x + this.offset.x, this.focusPosition.x, t),
      MathUtils.lerp(IDLE_CAMERA.target.y + this.offset.y, this.focusPosition.y, t),
      MathUtils.lerp(IDLE_CAMERA.target.z + this.offset.z, this.focusPosition.z, t),
    );

    this.target.set(
      MathUtils.lerp(IDLE_CAMERA.target.x, SCREEN_CENTER.x, t),
      MathUtils.lerp(IDLE_CAMERA.target.y, SCREEN_CENTER.y, t),
      MathUtils.lerp(IDLE_CAMERA.target.z, SCREEN_CENTER.z, t),
    );

    this.instance.position.copy(this.position);
    this.instance.lookAt(this.target);

    const arrived = (previous < 1 && this.blend === 1) || (previous > 0 && this.blend === 0);
    if (arrived && this.onSettled) {
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

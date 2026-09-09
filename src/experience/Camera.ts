import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Sizes } from './Sizes';
import { IDLE_CAMERA, MONITOR, SCREEN_CENTER } from '../world/layout';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export type CameraMode = 'idle' | 'focused';

/**
 * Two camera states and a tween between them:
 *  - idle: rests off to one side of the desk, drifting with the pointer
 *  - focused: square on to the CRT glass, close enough that the screen fills the frame
 */
export class Camera {
  readonly instance: PerspectiveCamera;

  mode: CameraMode = 'idle';
  /** 0 = idle pose, 1 = focused pose. */
  private blend = 0;
  private direction = -1;
  private readonly duration = 1.5;

  /** Pointer parallax, in normalised device coords, smoothed. */
  private parallax = { x: 0, y: 0 };
  private parallaxTarget = { x: 0, y: 0 };

  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly focusPosition = new Vector3();

  private onSettled: ((mode: CameraMode) => void) | null = null;

  constructor(private sizes: Sizes) {
    this.instance = new PerspectiveCamera(38, sizes.aspect, 0.1, 60);
    this.instance.position.copy(IDLE_CAMERA.position);
    this.instance.lookAt(IDLE_CAMERA.target);

    this.updateFocusDistance();
    sizes.on(() => this.resize());

    window.addEventListener('pointermove', this.onPointerMove);
  }

  private onPointerMove = (event: PointerEvent) => {
    this.parallaxTarget.x = (event.clientX / this.sizes.width) * 2 - 1;
    this.parallaxTarget.y = (event.clientY / this.sizes.height) * 2 - 1;
  };

  /**
   * Pull the camera back far enough that the glass fits the viewport on both
   * axes, with a little breathing room around the bezel.
   */
  private updateFocusDistance() {
    const vFov = MathUtils.degToRad(this.instance.fov);
    const margin = this.sizes.touch ? 1.02 : 1.06;
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
    this.instance.aspect = this.sizes.aspect;
    this.instance.updateProjectionMatrix();
    this.updateFocusDistance();
  }

  focus(onSettled?: (mode: CameraMode) => void) {
    if (this.mode === 'focused') return;
    this.mode = 'focused';
    this.direction = 1;
    this.onSettled = onSettled ?? null;
  }

  unfocus(onSettled?: (mode: CameraMode) => void) {
    if (this.mode === 'idle') return;
    this.mode = 'idle';
    this.direction = -1;
    this.onSettled = onSettled ?? null;
  }

  /** True once the dolly-in has finished — the screen only accepts input then. */
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

    // Parallax and idle drift fade out completely as we settle on the screen.
    const drift = 1 - t;
    this.parallax.x = MathUtils.damp(this.parallax.x, this.parallaxTarget.x, 3, delta);
    this.parallax.y = MathUtils.damp(this.parallax.y, this.parallaxTarget.y, 3, delta);

    const sway = Math.sin(elapsed * 0.35) * 0.012 + Math.sin(elapsed * 0.21) * 0.008;
    const idleX = IDLE_CAMERA.position.x + (this.parallax.x * 0.16 + sway) * drift;
    const idleY = IDLE_CAMERA.position.y + (-this.parallax.y * 0.09 - sway * 0.5) * drift;
    const idleZ = IDLE_CAMERA.position.z;

    this.position.set(
      MathUtils.lerp(idleX, this.focusPosition.x, t),
      MathUtils.lerp(idleY, this.focusPosition.y, t),
      MathUtils.lerp(idleZ, this.focusPosition.z, t),
    );

    this.target.set(
      MathUtils.lerp(IDLE_CAMERA.target.x + this.parallax.x * 0.035 * drift, SCREEN_CENTER.x, t),
      MathUtils.lerp(IDLE_CAMERA.target.y - this.parallax.y * 0.02 * drift, SCREEN_CENTER.y, t),
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
  }
}

import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import type { Sizes } from './Sizes';
import { ENTRY_CAMERA, IDLE_CAMERA, MONITOR, SCREEN_CENTER, WORKSTATION_CAMERA } from '../world/layout';

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Holds longer at both ends than the cubic: a dwell, a rush, a settle. */
const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
type Easing = (t: number) => number;

export type CameraMode = 'idle' | 'workstation' | 'focused';

/** How far the dolly may travel either side of a pose's authored distance. */
const ZOOM_MIN = 0.52;
const ZOOM_MAX = 2.4;
/**
 * At the screen the dolly may go much closer: that is where zooming is for
 * reading, and the view pans to keep whatever is under the cursor (or between
 * the fingers) where it was, so getting close never loses your place.
 */
const ZOOM_MIN_FOCUSED = 0.28;
/**
 * A phone sees the same 1280px desktop as a laptop on a glass a quarter the
 * size, so it is allowed about twice as close again.
 */
const ZOOM_MIN_FOCUSED_PHONE = 0.14;
/** How far below the glass a portrait screen aims at rest, in metres. */
const PORTRAIT_DROP = 0.13;
/** Where a double-tap takes the view, as a fraction of the resting distance. */
const DOUBLE_TAP_ZOOM = 0.4;
const DOUBLE_TAP_ZOOM_PHONE = 0.3;
/** How far past the glass's edge a zoomed-in view may pan, as a fraction. */
const PAN_SLACK = 0.06;

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

  /**
   * How the phone is being held relative to how it was picked up, -1..1 on
   * each axis. A phone has no hover, so the room's parallax comes from the
   * hand instead — and because a tilt is a much bigger, more deliberate
   * gesture than a cursor drifting across a page, it is allowed a much wider
   * swing than the pointer's.
   */
  private tilt = { x: 0, y: 0 };
  private tiltTarget = { x: 0, y: 0 };

  /**
   * Dolly, as a multiplier on whatever distance the current pose wants. One is
   * the pose as authored; below one is closer. Smoothed, so a wheel notch
   * glides rather than jumps.
   */
  private zoom = 1;
  private zoomTarget = 1;
  /**
   * At the screen only: how far the view has slid across the glass, in metres,
   * so a zoomed-in camera can look at one corner of the desktop.
   */
  private pan = { x: 0, y: 0 };
  private panTarget = { x: 0, y: 0 };
  /** The midpoint of a two-finger pinch, for panning with it. */
  private pinchMid: { x: number; y: number } | null = null;
  /** Safari's trackpad pinch: the zoom when the gesture began. */
  private gestureFrom = 0;
  /** For telling a tap from a drag, and a double-tap from two taps. */
  private tapStart: { x: number; y: number; time: number } | null = null;
  private lastTap: { x: number; y: number; time: number } | null = null;
  /** Live pointers, so two of them can be measured against each other. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchFrom = 0;

  private dragging = false;
  private dragPointer: number | null = null;
  private dragLast = { x: 0, y: 0 };

  private readonly offset = new Vector3();
  private readonly focusPosition = new Vector3();
  /** Scratch, reused every frame so the loop allocates nothing. */
  private readonly livePosition = new Vector3();
  private readonly liveTarget = new Vector3();

  private onSettled: ((mode: CameraMode) => void) | null = null;
  /** The curve of the flight in progress. Mode changes use the cubic. */
  private easing: Easing = easeInOutCubic;
  /**
   * Set by `arrive` for a `setMode` called in the same breath, so the opening
   * flight can end at any pose and still be one long flight rather than a
   * hop to idle and a second hop on. Cleared on the next frame either way.
   */
  private arrival: { duration: number; easing: Easing } | null = null;

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
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('gesturestart', this.onGestureStart, { passive: false });
    document.addEventListener('gesturechange', this.onGestureChange, { passive: false });
  }

  /* ---------------------------------------------------------------------- */
  /* Input                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Scroll to dolly.
   *
   * A wheel over the screen belongs to whatever window is under it — the OS
   * has its own scrolling — so those are left alone and only the room takes
   * the gesture.
   */
  private onWheel = (event: WheelEvent) => {
    // A trackpad pinch arrives as a wheel with ctrlKey set, wherever it lands.
    // It always belongs to the camera: left to the browser, it zooms the whole
    // page and the room ends up drawn into one corner of it.
    const pinch = event.ctrlKey;
    const target = event.target;
    if (!pinch && target instanceof Element && target.closest('.screen')) return;

    event.preventDefault();
    // Multiplicative, so a notch feels the same close up as far away. A pinch
    // reports far smaller deltas than a wheel notch, so it is scaled up.
    this.zoomAt(
      this.zoomTarget * Math.exp(event.deltaY * (pinch ? 0.01 : 0.0012)),
      event.clientX,
      event.clientY,
    );
  };

  /**
   * Safari's trackpad pinch. iOS fires these alongside the pointer events the
   * pinch below already reads, so they only count when no finger is down.
   */
  private onGestureStart = (event: Event) => {
    event.preventDefault();
    this.gestureFrom = this.touches.size ? 0 : this.zoomTarget;
  };

  private onGestureChange = (event: Event) => {
    event.preventDefault();
    const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
    if (!this.gestureFrom || !gesture.scale) return;
    this.zoomAt(
      this.gestureFrom / gesture.scale,
      gesture.clientX ?? this.sizes.width / 2,
      gesture.clientY ?? this.sizes.height / 2,
    );
  };

  /** How close the dolly may get here. */
  private get zoomFloor() {
    if (this.mode !== 'focused') return ZOOM_MIN;
    return this.sizes.phone ? ZOOM_MIN_FOCUSED_PHONE : ZOOM_MIN_FOCUSED;
  }

  /**
   * Dolly to `next`, keeping the point under (x, y) on screen where it was.
   *
   * Away from the screen the room zooms about its centre, as it always has.
   * At the screen, the view also slides across the glass by however far that
   * point would otherwise have moved — the way a map zooms toward the cursor.
   */
  private zoomAt(next: number, x: number, y: number) {
    const from = this.zoomTarget;
    const to = MathUtils.clamp(next, this.zoomFloor, ZOOM_MAX);
    this.zoomTarget = to;
    if (this.mode !== 'focused' || from === to) return;

    const ndcX = (x / this.sizes.width) * 2 - 1;
    const ndcY = -((y / this.sizes.height) * 2 - 1);
    const [halfW0, halfH0] = this.halfExtents(from);
    const [halfW1, halfH1] = this.halfExtents(to);
    this.panTarget.x += ndcX * (halfW0 - halfW1);
    this.panTarget.y += ndcY * (halfH0 - halfH1);
  }

  /** Half the visible width and height on the glass at a given zoom, in metres. */
  private halfExtents(zoom: number): [number, number] {
    const distance = (this.focusPosition.z - SCREEN_CENTER.z) * zoom;
    const half = Math.tan(MathUtils.degToRad(this.instance.fov) / 2) * distance;
    return [half * this.instance.aspect, half];
  }

  /**
   * Keep a zoomed-in view over the glass. Once zoomed out far enough to see
   * all of it, there is nothing to pan to, and it drifts back to centre.
   */
  private clampPan() {
    const [halfW, halfH] = this.halfExtents(this.zoomTarget);
    const reachX = Math.max((MONITOR.screenWidth / 2) * (1 + PAN_SLACK) - halfW, 0);
    const reachY = Math.max((MONITOR.screenHeight / 2) * (1 + PAN_SLACK) - halfH, 0);
    this.panTarget.x = MathUtils.clamp(this.panTarget.x, -reachX, reachX);
    this.panTarget.y = MathUtils.clamp(this.panTarget.y, -reachY, reachY);
  }

  /** Pinch, measured off whichever two pointers are down. */
  private pinch() {
    if (this.touches.size < 2) {
      this.pinchFrom = 0;
      this.pinchMid = null;
      return false;
    }

    const [a, b] = [...this.touches.values()];
    const spread = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    if (!this.pinchFrom || !this.pinchMid) {
      this.pinchFrom = spread;
      this.pinchMid = mid;
      return true;
    }

    if (spread > 0) {
      this.zoomAt(this.zoomTarget * (this.pinchFrom / spread), mid.x, mid.y);
      this.pinchFrom = spread;
    }

    // Two fingers moving together drag the glass along with them.
    if (this.mode === 'focused') {
      const [, halfH] = this.halfExtents(this.zoomTarget);
      const metresPerPixel = (halfH * 2) / this.sizes.height;
      this.panTarget.x -= (mid.x - this.pinchMid.x) * metresPerPixel;
      this.panTarget.y += (mid.y - this.pinchMid.y) * metresPerPixel;
    }
    this.pinchMid = mid;
    return true;
  }

  /** Both room poses are draggable; only the glass is locked off. */
  private get orbitable() {
    return this.mode !== 'focused';
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.tapStart =
        this.touches.size === 1
          ? { x: event.clientX, y: event.clientY, time: performance.now() }
          : null;
      // A second finger means a pinch, not a swing.
      if (this.touches.size > 1) this.dragging = false;
    }

    if (!this.orbitable || event.button !== 0 || this.touches.size > 1) return;
    this.dragging = true;
    this.dragPointer = event.pointerId;
    this.dragLast = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && event.type === 'pointerup') this.detectDoubleTap(event);
    this.touches.delete(event.pointerId);
    if (this.touches.size < 2) {
      this.pinchFrom = 0;
      this.pinchMid = null;
    }
    if (this.dragPointer !== event.pointerId) return;
    this.dragging = false;
    this.dragPointer = null;
  };

  private onPointerMove = (event: PointerEvent) => {
    this.parallaxTarget.x = (event.clientX / this.sizes.width) * 2 - 1;
    this.parallaxTarget.y = (event.clientY / this.sizes.height) * 2 - 1;

    if (this.touches.has(event.pointerId)) {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pinch()) return;
    }

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

  /**
   * Double-tap at the screen zooms toward the spot, and again zooms back out —
   * what every phone already does with a page, and the quickest way to read
   * a desktop that is the same size as a laptop's on a much smaller glass.
   * The taps still reach the OS beneath, as taps on a phone always do.
   */
  private detectDoubleTap(event: PointerEvent) {
    const start = this.tapStart;
    this.tapStart = null;
    if (!start || this.touches.size > 1) return;

    const now = performance.now();
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 12 || now - start.time > 300) {
      this.lastTap = null;
      return;
    }

    const last = this.lastTap;
    const isDouble =
      last && now - last.time < 320 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 36;
    if (!isDouble) {
      this.lastTap = { x: event.clientX, y: event.clientY, time: now };
      return;
    }

    this.lastTap = null;
    if (this.mode !== 'focused' || this.progress < 1) return;

    if (this.zoomTarget > 0.75) {
      this.zoomAt(this.sizes.phone ? DOUBLE_TAP_ZOOM_PHONE : DOUBLE_TAP_ZOOM, event.clientX, event.clientY);
    } else {
      this.zoomTarget = 1;
      this.panTarget = { x: 0, y: 0 };
    }
  }

  /** Fed from the device's orientation; zero when there is none. */
  setTilt(x: number, y: number) {
    this.tiltTarget.x = MathUtils.clamp(x, -1, 1);
    this.tiltTarget.y = MathUtils.clamp(y, -1, 1);
  }

  /** Swing the view back to the resting pose. */
  resetView() {
    this.orbitTarget = { azimuth: 0, polar: 0 };
    this.zoomTarget = 1;
    this.panTarget = { x: 0, y: 0 };
  }

  get isDefaultView() {
    return (
      Math.abs(this.orbitTarget.azimuth) < 0.01 &&
      Math.abs(this.orbitTarget.polar) < 0.01 &&
      Math.abs(this.zoomTarget - 1) < 0.01
    );
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
    // Sitting down no longer means the glass swallowing the frame. The margin
    // leaves the beige around it — the case, the chin, the slot — in shot
    // while the OS is being used, which is the whole point of putting the
    // thing in a room. Pinch, ctrl-scroll or double-tap override it.
    //
    // A portrait phone is fitted on width instead, and given room for the
    // whole bezel and a strip of the room either side of it, so it lands on
    // the same picture a laptop does — the machine, not a glass edge to edge.
    const margin = 1.46;
    const widthMargin = this.sizes.portrait ? (MONITOR.bodyWidth / MONITOR.screenWidth) * 1.28 : margin;
    const fitHeight = (MONITOR.screenHeight * margin) / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.instance.aspect);
    const fitWidth = (MONITOR.screenWidth * widthMargin) / 2 / Math.tan(hFov / 2);

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

    const arrival = this.arrival;
    this.arrival = null;
    this.duration = arrival?.duration ?? DURATIONS[`${this.mode}>${mode}`] ?? 1.2;
    this.easing = arrival?.easing ?? easeInOutCubic;
    this.from.position.copy(this.instance.position);
    this.from.target.copy(this.lookAt);
    this.progress = 0;
    this.mode = mode;
    this.dragging = false;
    // The glass allows a much closer dolly than the room. Leaving it zoomed
    // right in must not carry that into a room pose, inside the desk.
    this.zoomTarget = Math.max(this.zoomTarget, this.zoomFloor);
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
  arrive(duration = 4.6) {
    this.from.position.copy(ENTRY_CAMERA.position);
    this.from.target.copy(ENTRY_CAMERA.target);
    this.instance.position.copy(ENTRY_CAMERA.position);
    this.lookAt.copy(ENTRY_CAMERA.target);
    this.instance.lookAt(this.lookAt);

    this.mode = 'idle';
    this.progress = 0;
    this.duration = duration;
    this.dragging = false;
    // A long flight wants a long dwell on the wide shot before it commits,
    // and a soft landing at the desk — the quintic gives both.
    this.easing = easeInOutQuint;
    this.onSettled = null;
    this.arrival = { duration, easing: easeInOutQuint };
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
      // Dolly along the screen's own normal, so zooming out at the glass backs
      // away from it squarely rather than swinging round.
      // A tall screen has far more height than the glass needs, so at rest it
      // aims a little low and the whole machine — monitor, unit, keyboard —
      // sits in the middle instead of the glass with bare wall above it. The
      // bias fades out as the view closes in on the glass.
      const settle = this.sizes.portrait ? MathUtils.clamp((this.zoom - 0.5) / 0.5, 0, 1) : 0;
      const y = SCREEN_CENTER.y + this.pan.y - PORTRAIT_DROP * settle;
      this.livePosition.set(
        SCREEN_CENTER.x + this.pan.x,
        y,
        SCREEN_CENTER.z + (this.focusPosition.z - SCREEN_CENTER.z) * this.zoom,
      );
      this.liveTarget.set(SCREEN_CENTER.x + this.pan.x, y, SCREEN_CENTER.z);
      return;
    }

    const workstation = this.mode === 'workstation';
    const rest = workstation ? this.workRest : this.idleRest;
    const anchor = workstation ? WORKSTATION_CAMERA.target : IDLE_CAMERA.target;
    // The wide pose stays steadier — big drift at that distance reads as drunk.
    const weight = workstation ? 0.45 : 1;

    const sway = Math.sin(elapsed * 0.35) * 0.012 + Math.sin(elapsed * 0.21) * 0.008;

    const azimuth =
      rest.theta +
      (this.orbit.azimuth + this.parallax.x * 0.06 - this.tilt.x * 0.3 + sway * 0.6) * weight;
    const polar = MathUtils.clamp(
      rest.phi +
        (-this.orbit.polar + this.parallax.y * 0.035 - this.tilt.y * 0.14 - sway * 0.3) * weight,
      0.2,
      Math.PI / 2 + 0.1,
    );

    this.offset.setFromSphericalCoords(rest.radius * this.zoom, polar, azimuth);
    this.livePosition.copy(anchor).add(this.offset);
    this.liveTarget.copy(anchor);
  }

  update(delta: number, elapsed: number) {
    // Only a setMode made before the first frame after arrive() may claim it.
    this.arrival = null;
    const wasMoving = this.progress < 1;
    this.progress = Math.min(this.progress + delta / this.duration, 1);

    this.orbit.azimuth = MathUtils.damp(this.orbit.azimuth, this.orbitTarget.azimuth, 5, delta);
    this.orbit.polar = MathUtils.damp(this.orbit.polar, this.orbitTarget.polar, 5, delta);
    this.zoom = MathUtils.damp(this.zoom, this.zoomTarget, 6, delta);
    // Pan only means anything at the glass; anywhere else it eases home.
    if (this.mode === 'focused') this.clampPan();
    else this.panTarget = { x: 0, y: 0 };
    this.pan.x = MathUtils.damp(this.pan.x, this.panTarget.x, 6, delta);
    this.pan.y = MathUtils.damp(this.pan.y, this.panTarget.y, 6, delta);

    // Parallax stands down while the user is actively dragging.
    const parallaxWeight = this.dragging ? 0 : 1;
    this.parallax.x = MathUtils.damp(this.parallax.x, this.parallaxTarget.x * parallaxWeight, 3, delta);
    this.parallax.y = MathUtils.damp(this.parallax.y, this.parallaxTarget.y * parallaxWeight, 3, delta);
    // Heavier than the pointer: a hand trembles, and the room should not.
    this.tilt.x = MathUtils.damp(this.tilt.x, this.tiltTarget.x * parallaxWeight, 4, delta);
    this.tilt.y = MathUtils.damp(this.tilt.y, this.tiltTarget.y * parallaxWeight, 4, delta);

    this.computeLivePose(elapsed);

    if (this.progress < 1) {
      const t = this.easing(this.progress);
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
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('gesturestart', this.onGestureStart);
    document.removeEventListener('gesturechange', this.onGestureChange);
  }
}

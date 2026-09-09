import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Raycaster,
  Scene,
  Vector2,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { Camera } from '../experience/Camera';
import type { Sizes } from '../experience/Sizes';
import { Desk } from './Desk';
import { Monitor } from './Monitor';
import { Peripherals } from './Peripherals';
import { Room } from './Room';

/** Assembles the scene and owns the "did the user click the monitor?" question. */
export class World {
  readonly monitor: Monitor;

  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pointerDownAt: { x: number; y: number } | null = null;
  private hovering = false;

  constructor(
    scene: Scene,
    private camera: Camera,
    private sizes: Sizes,
    screenElement: HTMLElement,
    private onMonitorClick: () => void,
  ) {
    // Required before any RectAreaLight can be lit.
    RectAreaLightUniformsLib.init();

    const room = new Room();
    const desk = new Desk();
    this.monitor = new Monitor(screenElement);
    const peripherals = new Peripherals();

    scene.add(room.group, desk.group, this.monitor.group, peripherals.group);

    scene.add(new AmbientLight(0x9099b5, 0.75));
    scene.add(new HemisphereLight(0x6d7ea3, 0x2a211b, 1.05));

    const key = new DirectionalLight(0xbfd0ff, 1.15);
    key.position.set(-2.2, 3.4, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.camera.left = -2.5;
    key.shadow.camera.right = 2.5;
    key.shadow.camera.top = 2.5;
    key.shadow.camera.bottom = -2.5;
    key.shadow.bias = -0.0012;
    scene.add(key);

    const rim = new DirectionalLight(0x8899cc, 0.5);
    rim.position.set(2.6, 1.6, -2.2);
    scene.add(rim);

    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  private setPointer(event: PointerEvent) {
    this.pointer.x = (event.clientX / this.sizes.width) * 2 - 1;
    this.pointer.y = -(event.clientY / this.sizes.height) * 2 + 1;
  }

  private hitsMonitor(event: PointerEvent) {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera.instance);
    return this.raycaster.intersectObjects(this.monitor.hitboxes, false).length > 0;
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down || this.camera.mode !== 'idle') return;

    // Ignore drags — only a clean tap should fly the camera in.
    const travelled = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (travelled > 8) return;

    if (this.hitsMonitor(event)) this.onMonitorClick();
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.camera.mode !== 'idle') {
      if (this.hovering) {
        this.hovering = false;
        document.body.classList.remove('is-hovering-monitor');
      }
      return;
    }

    const hit = this.hitsMonitor(event);
    if (hit === this.hovering) return;
    this.hovering = hit;
    document.body.classList.toggle('is-hovering-monitor', hit);
  };

  destroy() {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
  }
}

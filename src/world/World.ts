import {
  AmbientLight,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Raycaster,
  Scene,
  Vector2,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { Camera } from '../experience/Camera';
import type { Sizes } from '../experience/Sizes';
import { Desk } from './Desk';
import { Dust } from './Dust';
import { Monitor } from './Monitor';
import { Peripherals } from './Peripherals';
import { Room } from './Room';
import { useCompactScreen } from './layout';

export interface BuildStep {
  name: string;
  run: () => void;
}

/**
 * Assembles the scene and owns the "did the user click the monitor?" question.
 *
 * Construction is split into named steps so the loading screen can report what
 * it is actually doing rather than animating a fake bar.
 */
export class World {
  monitor!: Monitor;
  private room!: Room;

  private peripherals!: Peripherals;
  private dust!: Dust;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pointerDownAt: { x: number; y: number } | null = null;
  private hovering = false;

  constructor(
    private scene: Scene,
    private camera: Camera,
    private sizes: Sizes,
    private screenElement: HTMLElement,
    private onMonitorClick: () => void,
  ) {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  /** The ordered work of building the scene, one named chunk at a time. */
  steps(): BuildStep[] {
    const quality = this.sizes.quality;

    // Settled before anything is built: the monitor bakes the surface scale
    // into its CSS3D object at construction.
    useCompactScreen(this.sizes.compact);

    return [
      {
        name: 'room.geo',
        run: () => {
          // Required before any RectAreaLight can be lit.
          RectAreaLightUniformsLib.init();
          // Warm haze, so distance washes out toward the daylight rather than
          // toward black. A dark fog in a bright room reads as grime.
          this.scene.fog = new FogExp2(0xcbb99c, quality === 'low' ? 0.028 : 0.042);
          this.room = new Room(quality);
          this.scene.add(this.room.group);
        },
      },
      {
        name: 'desk.geo',
        run: () => {
          this.scene.add(new Desk().group);
        },
      },
      {
        name: 'crt.assembly',
        run: () => {
          this.monitor = new Monitor(this.screenElement, quality);
          this.scene.add(this.monitor.group);
        },
      },
      {
        name: 'peripherals.geo',
        run: () => {
          this.peripherals = new Peripherals(quality);
          this.scene.add(this.peripherals.group);
        },
      },
      {
        name: 'lighting.rig',
        run: () => {
          // Daylight: a bright warm sky, a bounce off the oak floor, and a sun
          // angled in from the window side rather than from the front.
          this.scene.add(new AmbientLight(0xf0e2c8, 1.15));
          this.scene.add(new HemisphereLight(0xfff3dd, 0x6b4a2c, 1.6));

          const key = new DirectionalLight(0xfff0d4, 2.35);
          key.position.set(2.6, 3.2, 1.2);
          key.castShadow = quality !== 'low';
          const shadowSize = quality === 'high' ? 2048 : 1024;
          key.shadow.mapSize.set(shadowSize, shadowSize);
          key.shadow.camera.near = 0.5;
          key.shadow.camera.far = 10;
          key.shadow.camera.left = -2.5;
          key.shadow.camera.right = 2.5;
          key.shadow.camera.top = 2.5;
          key.shadow.camera.bottom = -2.5;
          key.shadow.bias = -0.0012;
          this.scene.add(key);

          // A cool fill from the opposite side keeps the beige from going flat.
          const fill = new DirectionalLight(0xc9d8f0, 0.55);
          fill.position.set(-2.8, 1.8, 1.6);
          this.scene.add(fill);
        },
      },
      {
        name: 'dust.particles',
        run: () => {
          this.dust = new Dust(quality);
          this.scene.add(this.dust.points);
        },
      },
    ];
  }

  update(delta: number, elapsed: number) {
    this.dust?.update(delta, elapsed);
    this.room?.update(elapsed);
    this.peripherals?.update(delta);
  }

  private setPointer(event: PointerEvent) {
    this.pointer.x = (event.clientX / this.sizes.width) * 2 - 1;
    this.pointer.y = -(event.clientY / this.sizes.height) * 2 + 1;
  }

  private hitsMonitor(event: PointerEvent) {
    if (!this.monitor) return false;
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

    // Ignore drags — the camera orbits on drag, so only a clean tap flies in.
    const travelled = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (travelled > 10) return;

    if (this.hitsMonitor(event)) {
      this.onMonitorClick();
      return;
    }
    // Clicking the case is how you get a closer look at it.
  };

  private onPointerMove = (event: PointerEvent) => {
    // Hover styling is meaningless on touch and costs a raycast per move.
    if (this.sizes.touch) return;

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

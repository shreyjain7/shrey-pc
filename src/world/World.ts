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
import { CASE, Tower } from './Tower';
import { TOWER } from './layout';

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
  tower!: Tower;

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
    private onTowerClick: () => void = () => {},
  ) {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  /** The ordered work of building the scene, one named chunk at a time. */
  steps(): BuildStep[] {
    const quality = this.sizes.quality;

    return [
      {
        name: 'room.geo',
        run: () => {
          // Required before any RectAreaLight can be lit.
          RectAreaLightUniformsLib.init();
          // Just enough haze for the lamp and window to read as volumes.
          this.scene.fog = new FogExp2(0x0a0d14, quality === 'low' ? 0.05 : 0.08);
          this.scene.add(new Room(quality).group);
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
        name: 'tower.assembly',
        run: () => {
          this.tower = new Tower(quality);
          // The tower's geometry is centred on its own origin, so it has to
          // be lifted by half its height to stand on the desk.
          this.tower.group.position.set(
            TOWER.position.x,
            TOWER.position.y + CASE.height / 2,
            TOWER.position.z,
          );
          this.tower.group.rotation.y = TOWER.rotationY;
          this.scene.add(this.tower.group);
        },
      },
      {
        name: 'lighting.rig',
        run: () => {
          this.scene.add(new AmbientLight(0x9099b5, 0.75));
          this.scene.add(new HemisphereLight(0x6d7ea3, 0x2a211b, 1.05));

          const key = new DirectionalLight(0xbfd0ff, 1.15);
          key.position.set(-2.2, 3.4, 2.4);
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

          const rim = new DirectionalLight(0x8899cc, 0.5);
          rim.position.set(2.6, 1.6, -2.2);
          this.scene.add(rim);
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
    this.tower?.update(delta);
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

  private hitsTower(event: PointerEvent) {
    if (!this.tower) return false;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera.instance);
    return this.raycaster.intersectObjects(this.tower.hitboxes, false).length > 0;
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
    if (this.hitsTower(event)) this.onTowerClick();
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

    const hit = this.hitsMonitor(event) || this.hitsTower(event);
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

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
import { Chair } from './Chair';
import { Daylight } from './Daylight';
import { DeskLamp } from './DeskLamp';
import { Desk } from './Desk';
import { Monitor } from './Monitor';
import { Peripherals } from './Peripherals';
import { Plant } from './Plant';
import { Room, STUDIO_FAR } from './Room';
import { SystemUnit } from './SystemUnit';
import { telemetry } from './telemetry';
import { Weather } from './Weather';

export interface BuildStep {
  name: string;
  run: () => void;
}

/**
 * Assembles the scene and owns the "did the user click the machine?" question.
 *
 * Construction is split into named steps so the loading screen can report what
 * it is actually doing rather than animating a fake bar.
 */
export class World {
  monitor!: Monitor;
  unit!: SystemUnit;

  private room!: Room;
  private peripherals!: Peripherals;
  /** The rig, lit for the visitor's time of day. Exists once the lights do. */
  daylight: Daylight | null = null;
  /** The real weather, and the lamp that comes on when it gets dark. */
  weather: Weather | null = null;
  lamp: DeskLamp | null = null;
  /** Told when the lamp is clicked, for the switch's click. */
  onLampToggle: (on: boolean) => void = () => {};

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

    return [
      {
        name: 'studio.floor',
        run: () => {
          // Required before any RectAreaLight can be lit.
          RectAreaLightUniformsLib.init();
          // The same grey the page is painted behind the canvas, so the far
          // rim of the ground dissolves into it instead of ending.
          this.scene.fog = new FogExp2(STUDIO_FAR, quality === 'low' ? 0.06 : 0.085);
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
        name: 'system.unit',
        run: () => {
          this.unit = new SystemUnit(quality);
          this.scene.add(this.unit.group);
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
        name: 'chair.geo',
        run: () => {
          this.scene.add(new Chair(quality).group);
          this.scene.add(new Plant(quality).group);
        },
      },
      {
        name: 'lighting.rig',
        run: () => {
          // Studio lighting: a big soft key from above and in front, a broad
          // fill from the opposite side to keep the beige from going flat, and
          // enough ambient that nothing in the scene is ever actually dark.
          // Restraint matters here — the reference's charm is that it is
          // evenly lit and shadowless except where things touch the ground.
          // These are the daytime values; Daylight moves them with the clock.
          const ambient = new AmbientLight(0xffffff, 1.55);
          const hemi = new HemisphereLight(0xffffff, 0xc4c4ca, 1.2);
          this.scene.add(ambient, hemi);

          const key = new DirectionalLight(0xfff6ea, 2.1);
          key.position.set(2.1, 3.4, 2.5);
          key.castShadow = quality !== 'low';
          const shadowSize = quality === 'high' ? 2048 : 1024;
          key.shadow.mapSize.set(shadowSize, shadowSize);
          key.shadow.camera.near = 0.5;
          key.shadow.camera.far = 12;
          key.shadow.camera.left = -2.5;
          key.shadow.camera.right = 2.5;
          key.shadow.camera.top = 2.5;
          key.shadow.camera.bottom = -2.5;
          key.shadow.bias = -0.0012;
          this.scene.add(key);

          const fill = new DirectionalLight(0xeaeef6, 0.75);
          fill.position.set(-2.8, 1.9, 1.5);
          this.scene.add(fill);

          // A little separation off the back edges, so the beige case does not
          // merge into the grey behind it.
          const rim = new DirectionalLight(0xffffff, 0.4);
          rim.position.set(-1.2, 1.7, -2.6);
          this.scene.add(rim);

          this.daylight = new Daylight({
            ambient,
            hemi,
            key,
            fill,
            rim,
            fog: this.scene.fog as FogExp2,
            dome: this.room.dome,
          });
        },
      },
      {
        name: 'lamp.weather',
        run: () => {
          const daylight = this.daylight!;

          this.lamp = new DeskLamp(quality);
          this.scene.add(this.lamp.group);
          const lamp = this.lamp;
          daylight.onChange(() => lamp.follow(daylight.darkness));
          lamp.follow(daylight.darkness);

          this.weather = new Weather(quality, daylight);
          this.scene.add(this.weather.group);
        },
      },
    ];
  }

  update(delta: number, elapsed: number) {
    this.room?.update(elapsed);
    this.weather?.update(elapsed);
    this.peripherals?.update(delta);
    // The drive lamp blinks with whatever the OS is actually doing.
    this.unit?.setActivity(telemetry.state.keys);
  }

  /** Power state, forwarded to every lamp on the machine. */
  setPowered(on: boolean) {
    this.monitor?.setPowered(on);
    this.unit?.setPowered(on);
  }

  /** Screen spill tracks how bright the OS actually is right now. */
  setGlow(intensity: number) {
    // At night the screen is the brightest thing in the room, so it lights
    // more of it.
    this.monitor?.setGlow(intensity * (this.daylight?.screenBoost ?? 1));
  }

  private setPointer(event: PointerEvent) {
    this.pointer.x = (event.clientX / this.sizes.width) * 2 - 1;
    this.pointer.y = -(event.clientY / this.sizes.height) * 2 + 1;
  }

  /**
   * The monitor and the box under it are one machine as far as a click is
   * concerned — nobody aims at the bezel specifically.
   */
  private hitsMachine(event: PointerEvent) {
    if (!this.monitor) return false;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera.instance);
    const targets = this.unit
      ? [...this.monitor.hitboxes, ...this.unit.hitboxes]
      : this.monitor.hitboxes;
    return this.raycaster.intersectObjects(targets, false).length > 0;
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  };

  /** Whether the pointer is over the desk lamp. */
  private hitsLamp(event: PointerEvent) {
    if (!this.lamp) return false;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera.instance);
    return this.raycaster.intersectObjects(this.lamp.hitboxes, false).length > 0;
  }

  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    // At the glass the canvas takes no input; the room poses both do.
    if (!down || this.camera.mode === 'focused') return;

    // Ignore drags — the camera orbits on drag, so only a clean tap counts.
    const travelled = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (travelled > 10) return;

    // The lamp first: it stands nearer the camera than the machine behind it.
    if (this.lamp && this.hitsLamp(event)) {
      this.onLampToggle(this.lamp.toggle());
      return;
    }

    if (this.camera.mode === 'idle' && this.hitsMachine(event)) this.onMonitorClick();
  };

  private onPointerMove = (event: PointerEvent) => {
    // Hover styling is meaningless on touch and costs a raycast per move.
    if (this.sizes.touch) return;

    if (this.camera.mode === 'focused') {
      if (this.hovering) {
        this.hovering = false;
        document.body.classList.remove('is-hovering-monitor');
      }
      return;
    }

    const hit = this.hitsLamp(event) || (this.camera.mode === 'idle' && this.hitsMachine(event));
    if (hit === this.hovering) return;
    this.hovering = hit;
    document.body.classList.toggle('is-hovering-monitor', hit);
  };

  destroy() {
    this.daylight?.destroy();
    this.weather?.destroy();
    this.lamp?.destroy();
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
  }
}

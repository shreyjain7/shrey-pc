import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { roundedSlab } from './geometry';
import { telemetry } from './telemetry';
import { stickyNoteTexture } from './textures';
import { DESK, MONITOR } from './layout';

/**
 * Everything else on and around the desk.
 *
 * Three of these are not set dressing: the keyboard lights the keycap you
 * actually pressed, the mouse tracks the operating system's own cursor across
 * the mousepad, and the speaker cones move with whatever the music player is
 * playing. They all read from the telemetry bus, so the desk reacts to the
 * machine rather than looping an idle animation.
 */

/** How far the mouse may travel on the pad, in world units. */
const MOUSE_RANGE = {
  minX: 0.235,
  maxX: 0.385,
  minZ: 0.035,
  maxZ: 0.165,
};

const KEY_BASE = new Color(0x33333a);
const KEY_LIT = new Color(0x5fd0ff);

/**
 * The mouth of the floppy slot, matched to where the Macintosh's chin puts it:
 * low and right of centre, a hair proud of the front face.
 */
const SLOT = {
  x: 0.085,
  y: DESK.top + MONITOR.chin / 2 - 0.03,
  /** Inside the chin, not against it — a disk that has gone in is not seen. */
  z: MONITOR.frontZ - 0.055,
};

export class Peripherals {
  readonly group = new Group();
  readonly deskLamp: SpotLight;

  /** Keycaps, and the per-key backlight brightness that decays each frame. */
  private keycaps!: InstancedMesh;
  private keyHeat!: Float32Array;
  private keyCount = 0;
  private readonly keyColor = new Color();

  /** The disk off the top of the stack, and where it sits when idle. */
  private loose: Group | null = null;
  private looseRest = new Vector3();
  /**
   * The slot, expressed in the stack's own space. The disk is a child of a
   * group that is both moved and turned, so a world position means nothing to
   * it — this is converted once, at build time, rather than every frame.
   */
  private slotLocal = new Vector3();
  /** 0 on the desk, 1 fully seated in the slot. Eased, never snapped. */
  private insert = 0;
  private wasPowered = false;

  private mouse!: Group;
  private mouseAt = { x: 0.31, z: 0.1 };
  private mouseLed!: MeshBasicMaterial;

  private readonly cones: Mesh[] = [];
  private readonly keyLeds: MeshBasicMaterial[] = [];

  /** The same platinum beige as the machine, so the set reads as one. */
  private readonly plastic = new MeshStandardMaterial({
    color: 0xd8d0be,
    roughness: 0.78,
    metalness: 0.01,
  });

  /** Beige a shade down, for keycaps and the legend strip. */
  private readonly capPlastic = new MeshStandardMaterial({
    color: 0xcfc6b1,
    roughness: 0.84,
    metalness: 0.01,
  });

  private readonly metal = new MeshStandardMaterial({
    color: 0x3a3a42,
    roughness: 0.35,
    metalness: 0.85,
  });

  constructor(private quality: Quality) {
    this.group.add(
      this.buildMousepad(),
      this.buildKeyboard(),
      this.buildMouse(),
      this.buildMug(),
      this.buildBooks(),
      this.buildPenCup(),
      this.buildCables(),
    );

    if (quality !== 'low') {
      this.group.add(this.buildFloppies(), this.buildStickyNotes());
    }

    const lamp = this.buildLamp();
    this.deskLamp = lamp.light;
    this.group.add(lamp.group);
  }

  /* ---------------------------------------------------------------------- */

  private buildMousepad() {
    const pad = new Mesh(
      roundedSlab(0.26, 0.19, 0.012, { depth: 0.004 }),
      new MeshStandardMaterial({ color: 0x6f5a44, roughness: 0.96 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0.3, DESK.top + 0.002, 0.1);
    pad.receiveShadow = true;
    return pad;
  }

  private buildKeyboard() {
    const group = new Group();
    // The 1984 board was tiny — no numeric pad, no function row, barely wider
    // than the machine's own chin.
    const width = 0.335;
    const depth = 0.13;

    const base = new Mesh(
      roundedSlab(width, depth, 0.008, { depth: 0.018, bevel: 0.003 }),
      this.plastic,
    );
    base.rotation.x = -Math.PI / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Keycaps as one instanced mesh — 75 draw calls collapsed into one. The
    // per-instance colour attribute is what lets a single cap light up.
    const columns = 12;
    const rows = 4;
    const keySize = 0.0225;
    const gap = 0.0035;
    this.keyCount = columns * rows;

    this.keycaps = new InstancedMesh(
      new BoxGeometry(keySize, 0.008, keySize),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }),
      this.keyCount,
    );
    this.keycaps.castShadow = true;
    this.keyHeat = new Float32Array(this.keyCount);

    const dummy = new Object3D();
    const matrix = new Matrix4();
    const spanX = columns * (keySize + gap) - gap;
    const spanZ = rows * (keySize + gap) - gap;

    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        dummy.position.set(
          -spanX / 2 + keySize / 2 + column * (keySize + gap),
          0.012,
          -spanZ / 2 + keySize / 2 + row * (keySize + gap),
        );
        dummy.updateMatrix();
        matrix.copy(dummy.matrix);
        this.keycaps.setMatrixAt(index, matrix);
        this.keycaps.setColorAt(index, KEY_BASE);
        index += 1;
      }
    }
    this.keycaps.instanceMatrix.needsUpdate = true;
    if (this.keycaps.instanceColor) this.keycaps.instanceColor.needsUpdate = true;
    group.add(this.keycaps);

    // Spacebar, across the front row — beige like everything else here.
    const spacebar = new Mesh(new BoxGeometry(keySize * 6, 0.008, keySize), this.capPlastic);
    spacebar.position.set(0, 0.012, spanZ / 2 + keySize + gap * 2);
    spacebar.castShadow = true;
    group.add(spacebar);

    // Status LEDs. The middle one now means "the machine is powered".
    for (let i = 0; i < 3; i += 1) {
      const material = new MeshBasicMaterial({ color: 0x24242a });
      this.keyLeds.push(material);

      const led = new Mesh(new PlaneGeometry(0.005, 0.003), material);
      led.rotation.x = -Math.PI / 2;
      led.position.set(width / 2 - 0.05 + i * 0.013, 0.0195, -depth / 2 + 0.014);
      group.add(led);
    }

    group.position.set(-0.02, DESK.top, 0.14);
    // A couple of degrees of tilt, like feet-up on a real board.
    group.rotation.x = -0.045;
    group.rotation.y = 0.04;
    return group;
  }

  private buildMouse() {
    const group = new Group();

    // A box with one square button on the front, which is all it ever was.
    const shell = new Mesh(
      roundedSlab(0.043, 0.062, 0.006, { depth: 0.024, bevel: 0.004 }),
      this.plastic,
    );
    shell.rotation.x = -Math.PI / 2;
    shell.position.y = 0.012;
    shell.castShadow = true;
    group.add(shell);

    const button = new Mesh(
      roundedSlab(0.03, 0.021, 0.003, { depth: 0.004, bevel: 0.001 }),
      this.capPlastic,
    );
    button.rotation.x = -Math.PI / 2;
    button.position.set(0, 0.0245, -0.016);
    group.add(button);

    // The sensor glow underneath, which brightens as the cursor moves.
    this.mouseLed = new MeshBasicMaterial({ color: 0x1a0d0d });
    const sensor = new Mesh(new PlaneGeometry(0.012, 0.012), this.mouseLed);
    sensor.rotation.x = Math.PI / 2;
    sensor.position.y = 0.0005;
    group.add(sensor);

    group.position.set(this.mouseAt.x, DESK.top + 0.001, this.mouseAt.z);
    group.rotation.y = -0.16;
    this.mouse = group;
    return group;
  }

  private buildMug() {
    const group = new Group();
    const ceramic = new MeshStandardMaterial({ color: 0x9c3b34, roughness: 0.35 });

    const body = new Mesh(new CylinderGeometry(0.041, 0.036, 0.095, 24), ceramic);
    body.position.y = 0.0475;
    body.castShadow = true;
    group.add(body);

    const coffee = new Mesh(
      new CylinderGeometry(0.037, 0.037, 0.002, 24),
      new MeshStandardMaterial({ color: 0x2a1508, roughness: 0.2 }),
    );
    coffee.position.y = 0.082;
    group.add(coffee);

    const handle = new Mesh(new TorusGeometry(0.026, 0.007, 10, 22, Math.PI * 1.2), ceramic);
    handle.position.set(0.045, 0.05, 0);
    handle.rotation.z = -Math.PI / 2.6;
    handle.castShadow = true;
    group.add(handle);

    group.position.set(0.5, DESK.top, -0.02);
    return group;
  }

  private buildBooks() {
    const group = new Group();
    const covers = [0x35505f, 0x4a3444, 0x3d4a52];

    covers.forEach((color, index) => {
      const book = new Mesh(
        new BoxGeometry(0.17 - index * 0.008, 0.026, 0.235 - index * 0.01),
        new MeshStandardMaterial({ color, roughness: 0.85 }),
      );
      book.position.set(0, 0.013 + index * 0.026, 0);
      book.rotation.y = index * 0.06 - 0.06;
      book.castShadow = true;
      book.receiveShadow = true;
      group.add(book);
    });

    group.position.set(0.5, DESK.top, -0.26);
    group.rotation.y = 0.22;
    return group;
  }

  private buildPenCup() {
    const group = new Group();

    const cup = new Mesh(
      new CylinderGeometry(0.035, 0.031, 0.1, 18, 1, true),
      new MeshStandardMaterial({ color: 0x2d3138, roughness: 0.6, metalness: 0.4, side: 2 }),
    );
    cup.position.y = 0.05;
    cup.castShadow = true;
    group.add(cup);

    const inks = [0x2b6cb0, 0xc53030, 0x2f855a, 0x1a202c, 0xd69e2e];
    inks.forEach((color, index) => {
      const pen = new Mesh(
        new CylinderGeometry(0.0035, 0.0035, 0.15, 8),
        new MeshStandardMaterial({ color, roughness: 0.45 }),
      );
      const angle = (index / inks.length) * Math.PI * 2;
      pen.position.set(Math.cos(angle) * 0.014, 0.095, Math.sin(angle) * 0.014);
      pen.rotation.set(Math.sin(angle) * 0.22, 0, -Math.cos(angle) * 0.22);
      pen.castShadow = true;
      group.add(pen);
    });

    group.position.set(0.63, DESK.top, -0.14);
    return group;
  }

  /**
   * A stack of 3.5" disks and one out of the box, which is what actually sat
   * beside a Macintosh — there was nowhere else to keep anything.
   */
  private buildFloppies() {
    const group = new Group();

    const shell = new MeshStandardMaterial({ color: 0x3f4550, roughness: 0.7 });
    const shutter = new MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.35, metalness: 0.7 });
    const label = new MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.92 });

    const disk = (y: number, turn: number) => {
      const one = new Group();

      const body = new Mesh(roundedSlab(0.09, 0.094, 0.004, { depth: 0.0032 }), shell);
      body.rotation.x = -Math.PI / 2;
      body.castShadow = true;
      one.add(body);

      // The metal shutter along one edge, and the paper label above it.
      const slide = new Mesh(new BoxGeometry(0.038, 0.0034, 0.016), shutter);
      slide.position.set(-0.016, 0.0002, -0.037);
      one.add(slide);

      const sticker = new Mesh(new BoxGeometry(0.072, 0.0034, 0.042), label);
      sticker.position.set(0, 0.0004, 0.018);
      one.add(sticker);

      one.position.y = y;
      one.rotation.y = turn;
      return one;
    };

    for (let i = 0; i < 4; i += 1) {
      group.add(disk(i * 0.0038, (Math.random() - 0.5) * 0.12));
    }
    // One pulled off the top and left lying askew — this is the one that
    // loads itself when the machine wakes.
    this.loose = disk(0.0165, 0.6);
    this.looseRest = this.loose.position.clone();
    group.add(this.loose);

    group.position.set(-0.33, DESK.top + 0.002, 0.2);
    group.rotation.y = 0.18;

    group.updateMatrixWorld();
    this.slotLocal.set(SLOT.x, SLOT.y, SLOT.z);
    group.worldToLocal(this.slotLocal);

    return group;
  }

  private buildStickyNotes() {
    const group = new Group();
    const colours = ['#f6e05e', '#f6ad55', '#9ae6b4'];

    const spots = [
      { x: 0.0, z: 0.0, turn: 0.22 },
      { x: 0.068, z: 0.035, turn: -0.35 },
      { x: 0.03, z: -0.055, turn: 0.6 },
    ];

    colours.forEach((colour, index) => {
      const note = new Mesh(
        new PlaneGeometry(0.058, 0.058),
        new MeshStandardMaterial({ map: stickyNoteTexture(colour), roughness: 0.95 }),
      );
      const spot = spots[index];
      // Lying flat on the desk, slightly overlapping and askew.
      note.rotation.x = -Math.PI / 2;
      note.rotation.z = spot.turn;
      note.position.set(0.6 + spot.x, DESK.top + 0.001 + index * 0.0006, 0.14 + spot.z);
      note.receiveShadow = true;
      group.add(note);
    });

    return group;
  }

  /** Signal and power runs draping off the back edge of the desk. */
  private buildCables() {
    const group = new Group();
    const material = new MeshStandardMaterial({ color: 0x121215, roughness: 0.85 });
    const segments = this.quality === 'low' ? 12 : 26;

    const runs: Vector3[][] = [
      // Monitor, over the back edge.
      [
        new Vector3(0.02, 0.86, MONITOR.frontZ - 0.4),
        new Vector3(0.12, 0.79, -0.56),
        new Vector3(0.17, 0.71, -0.66),
        new Vector3(0.21, 0.32, -0.69),
        new Vector3(0.26, 0.03, -0.6),
      ],
      // Tower rear I/O, following it down.
      [
        new Vector3(-0.52, 0.88, -0.35),
        new Vector3(-0.5, 0.8, -0.55),
        new Vector3(-0.45, 0.71, -0.67),
        new Vector3(-0.4, 0.3, -0.69),
        new Vector3(-0.3, 0.03, -0.62),
      ],
    ];

    for (const points of runs) {
      const curve = new CatmullRomCurve3(points);
      const tube = new Mesh(new TubeGeometry(curve, segments, 0.006, 6, false), material);
      tube.castShadow = this.quality === 'high';
      group.add(tube);
    }

    return group;
  }

  private buildLamp() {
    const group = new Group();

    const base = new Mesh(new CylinderGeometry(0.062, 0.068, 0.014, 24), this.metal);
    base.position.y = 0.007;
    base.castShadow = true;
    group.add(base);

    const stem = new Mesh(new CylinderGeometry(0.008, 0.008, 0.34, 14), this.metal);
    stem.position.y = 0.18;
    stem.castShadow = true;
    group.add(stem);

    // The lamp now stands at the right of the desk, so the arm reaches left
    // across it — every x below is mirrored from the original build.
    const arm = new Mesh(new CylinderGeometry(0.007, 0.007, 0.2, 14), this.metal);
    arm.position.set(-0.07, 0.345, 0.03);
    arm.rotation.z = -Math.PI / 2.3;
    arm.rotation.y = 0.35;
    arm.castShadow = true;
    group.add(arm);

    const shade = new Mesh(
      new CylinderGeometry(0.038, 0.062, 0.07, 22, 1, true),
      new MeshStandardMaterial({
        color: 0x2f3238,
        roughness: 0.5,
        metalness: 0.6,
        side: 2,
      }),
    );
    shade.position.set(-0.16, 0.315, 0.06);
    shade.rotation.z = -0.55;
    shade.rotation.x = -0.25;
    shade.castShadow = true;
    group.add(shade);

    const bulb = new Mesh(
      new SphereGeometry(0.02, 12, 10),
      new MeshBasicMaterial({ color: 0xffd9a0 }),
    );
    bulb.position.set(-0.175, 0.295, 0.07);
    group.add(bulb);

    const light = new SpotLight(0xffc98a, 3.6, 2.4, Math.PI / 4, 0.7, 1.3);
    light.position.set(-0.175, 0.295, 0.07);
    // Aimed across the desk at the mousepad and the keyboard's right half.
    light.target.position.set(-0.29, 0, 0.28);
    light.castShadow = this.quality !== 'low';
    light.shadow.mapSize.set(this.quality === 'high' ? 1024 : 512, this.quality === 'high' ? 1024 : 512);
    light.shadow.bias = -0.0015;
    group.add(light, light.target);

    group.position.set(0.84, DESK.top, -0.06);
    return { group, light };
  }

  /* ---------------------------------------------------------------------- */
  /* Per-frame                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Everything reactive on the desk, driven off the telemetry bus.
   *
   * The keycaps are the fiddly part: a keystroke lights one random cap, and
   * every cap's brightness decays independently, so a run of typing leaves a
   * scatter of fading keys behind it rather than one uniform pulse.
   */
  update(delta: number) {
    const state = telemetry.state;

    this.updateKeyboard(delta, state.keys, state.powered);
    this.updateMouse(delta, state.cursor.x, state.cursor.y, state.powered);
    this.updateDisk(delta, state.powered);

    // Speaker drivers ride the music player's output level.
    for (const cone of this.cones) {
      const push = state.audio * 0.004;
      cone.position.z = MathUtils.damp(cone.position.z, 0.044 + push, 22, delta);
      const swell = 1 + state.audio * 0.08;
      cone.scale.setScalar(MathUtils.damp(cone.scale.x, swell, 18, delta));
    }
  }

  /**
   * The disk loads itself when the machine wakes, and is spat back out when it
   * sleeps.
   *
   * Three eased stages off one 0..1 value, so there is no state machine to get
   * stuck: it lifts off the desk, tracks across to the slot, then slides in.
   * Because it is driven from the value rather than from events, a power cycle
   * mid-flight simply reverses it.
   */
  private updateDisk(delta: number, powered: boolean) {
    if (!this.loose) return;

    // Only start once the machine has actually been woken, not on first paint.
    if (powered !== this.wasPowered) this.wasPowered = powered;

    this.insert = MathUtils.damp(this.insert, powered ? 1 : 0, 2.6, delta);
    const t = this.insert;
    if (t < 0.0015) {
      this.loose.position.copy(this.looseRest);
      this.loose.rotation.set(0, 0.6, 0);
      return;
    }

    // Lift: up off the stack early, back down as it seats.
    const lift = Math.sin(Math.min(t, 1) * Math.PI) * 0.055;
    // Travel: across the desk and into the slot's mouth.
    const ease = t * t * (3 - 2 * t);

    this.loose.position.lerpVectors(this.looseRest, this.slotLocal, ease);
    this.loose.position.y += lift;

    // A 3.5" disk goes in flat, label up — it only has to square up with the
    // slot, which is the Y turn coming off its askew resting angle.
    this.loose.rotation.set(0, 0.6 * (1 - ease) - 0.18 * ease, 0);
  }

  private updateKeyboard(delta: number, impulse: number, powered: boolean) {
    if (!this.keycaps.instanceColor) return;

    // A fresh keystroke picks a cap to light. The bus value is a decaying
    // spike, so testing near its peak fires once per press rather than once
    // per frame for as long as it takes to fade.
    if (powered && impulse > 0.82) {
      const index = Math.floor(Math.random() * this.keyCount);
      this.keyHeat[index] = 1;
    }

    let dirty = false;
    const decay = Math.exp(-4.5 * delta);

    for (let i = 0; i < this.keyCount; i += 1) {
      const heat = this.keyHeat[i];
      if (heat <= 0.002) {
        if (heat !== 0) {
          this.keyHeat[i] = 0;
          this.keycaps.setColorAt(i, KEY_BASE);
          dirty = true;
        }
        continue;
      }

      this.keyHeat[i] = heat * decay;
      this.keyColor.copy(KEY_BASE).lerp(KEY_LIT, this.keyHeat[i] * 0.85);
      this.keycaps.setColorAt(i, this.keyColor);
      dirty = true;
    }

    if (dirty) this.keycaps.instanceColor.needsUpdate = true;

    // Caps-lock LED stands in for the power light.
    this.keyLeds[1]?.color.setRGB(powered ? 0.4 : 0.14, powered ? 1 : 0.14, powered ? 0.6 : 0.16);
  }

  private updateMouse(delta: number, cursorX: number, cursorY: number, powered: boolean) {
    const targetX = MathUtils.lerp(MOUSE_RANGE.minX, MOUSE_RANGE.maxX, cursorX);
    const targetZ = MathUtils.lerp(MOUSE_RANGE.minZ, MOUSE_RANGE.maxZ, cursorY);

    const previousX = this.mouseAt.x;
    const previousZ = this.mouseAt.z;

    // Damped rather than snapped: a mouse has mass, and the lag is what makes
    // the mirroring read as a hand moving it instead of a teleport.
    this.mouseAt.x = MathUtils.damp(this.mouseAt.x, targetX, 9, delta);
    this.mouseAt.z = MathUtils.damp(this.mouseAt.z, targetZ, 9, delta);

    this.mouse.position.x = this.mouseAt.x;
    this.mouse.position.z = this.mouseAt.z;

    // Lean into the direction of travel, and brighten the sensor while moving.
    const speed = Math.hypot(this.mouseAt.x - previousX, this.mouseAt.z - previousZ) / Math.max(delta, 0.001);
    const tilt = MathUtils.clamp((this.mouseAt.x - targetX) * 2.2, -0.12, 0.12);
    this.mouse.rotation.z = MathUtils.damp(this.mouse.rotation.z, tilt, 8, delta);
    this.mouse.rotation.y = MathUtils.damp(this.mouse.rotation.y, -0.16 + tilt * 0.5, 8, delta);

    const glow = powered ? MathUtils.clamp(0.16 + speed * 1.4, 0, 1) : 0;
    this.mouseLed.color.setRGB(glow, glow * 0.12, glow * 0.1);
  }
}

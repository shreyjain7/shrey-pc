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
  TubeGeometry,
  Vector3,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { contactShadow, roundedSlab } from './geometry';
import { telemetry } from './telemetry';
import { DESK, UNIT } from './layout';

/**
 * Everything else on and around the desk.
 *
 * Two of these are not set dressing: the keyboard lights the keycap you
 * actually pressed, and the mouse tracks the operating system's own cursor
 * across the desk. Both read from the telemetry bus, so the desk reacts to the
 * machine rather than looping an idle animation.
 */

/** How far the mouse may travel, in world units. */
const MOUSE_RANGE = {
  minX: 0.285,
  maxX: 0.43,
  minZ: 0.05,
  maxZ: 0.185,
};

const KEY_BASE = new Color(0xcfc6b1);
const KEY_LIT = new Color(0xa8dcff);

/** Where the keyboard sits, and how big it is. */
const BOARD = {
  x: -0.04,
  z: 0.15,
  width: 0.44,
  depth: 0.155,
};

export class Peripherals {
  readonly group = new Group();

  /** Keycaps, and the per-key backlight brightness that decays each frame. */
  private keycaps!: InstancedMesh;
  private keyHeat!: Float32Array;
  private keyCount = 0;
  private readonly keyColor = new Color();

  private mouse!: Group;
  private mouseAt = { x: 0.35, z: 0.11 };

  private readonly keyLeds: MeshBasicMaterial[] = [];

  /** Platinum beige, the same plastic as the machine. */
  private readonly plastic = new MeshStandardMaterial({
    color: 0xd9d1bf,
    roughness: 0.76,
    metalness: 0.01,
  });

  /** Beige a shade down, for keycaps and recesses. */
  private readonly capPlastic = new MeshStandardMaterial({
    color: 0xcfc6b1,
    roughness: 0.84,
    metalness: 0.01,
  });

  private readonly paper = new MeshStandardMaterial({
    color: 0xf2f0ea,
    roughness: 0.92,
    metalness: 0,
  });

  constructor(quality: Quality) {
    this.group.add(
      this.buildKeyboard(),
      this.buildMouse(),
      this.buildPaperTray(),
      this.buildLooseSheet(),
      this.buildBinders(),
      this.buildMug(),
      this.buildCables(),
    );

    this.group.add(this.buildContactShadows(quality));
  }

  /**
   * The pools everything on the desk sits in.
   *
   * Collected here rather than spread through each builder, because they are
   * one idea — the desk is one surface, and these all lie on it at the same
   * height with the same material. Sized a little wider than the thing above
   * them, since a shadow is never exactly the footprint.
   */
  private buildContactShadows(quality: Quality) {
    const group = new Group();
    const y = DESK.top + 0.0012;

    // [x, z, width, depth, strength]
    const pools: Array<[number, number, number, number, number]> = [
      [BOARD.x, BOARD.z, BOARD.width + 0.09, BOARD.depth + 0.08, 0.5],
      [this.mouseAt.x, this.mouseAt.z, 0.12, 0.14, 0.42],
      [-0.62, 0.02, 0.36, 0.3, 0.48],
      [0.44, -0.3, 0.26, 0.24, 0.45],
      [0.54, -0.08, 0.15, 0.15, 0.42],
    ];

    if (quality !== 'low') pools.push([-0.3, 0.16, 0.26, 0.2, 0.26]); // loose sheet

    for (const [x, z, width, depth, strength] of pools) {
      const pool = contactShadow(width, depth, strength);
      pool.position.set(x, y, z);
      group.add(pool);
    }

    return group;
  }

  /* ---------------------------------------------------------------------- */

  /**
   * A full-size board: function row, main block, and a numeric pad. The layout
   * is what dates it — a machine of this era came with all 101 keys, and the
   * pad hanging off the right end is the giveaway at a glance.
   */
  private buildKeyboard() {
    const group = new Group();

    const base = new Mesh(
      roundedSlab(BOARD.width, BOARD.depth, 0.006, { depth: 0.02, bevel: 0.003 }),
      this.plastic,
    );
    base.rotation.x = -Math.PI / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Keycaps as one instanced mesh — ninety-odd draw calls collapsed into
    // one. The per-instance colour attribute is what lets a single cap light.
    const keySize = 0.0165;
    const gap = 0.003;
    const pitch = keySize + gap;

    const mainCols = 15;
    const padCols = 4;
    const rows = 5;
    this.keyCount = (mainCols + padCols) * rows;

    this.keycaps = new InstancedMesh(
      new BoxGeometry(keySize, 0.007, keySize),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 }),
      this.keyCount,
    );
    this.keycaps.castShadow = true;
    this.keyHeat = new Float32Array(this.keyCount);

    const mainSpan = mainCols * pitch - gap;
    const padSpan = padCols * pitch - gap;
    const cluster = 0.018;
    const totalSpan = mainSpan + cluster + padSpan;
    const left = -totalSpan / 2;
    const spanZ = rows * pitch - gap;
    // Keys sit toward the front; the back strip carries the legend and lamps.
    const frontZ = -spanZ / 2 + 0.012;

    const dummy = new Object3D();
    const matrix = new Matrix4();
    let index = 0;

    const place = (x: number, z: number) => {
      dummy.position.set(x, 0.0135, z);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      this.keycaps.setMatrixAt(index, matrix);
      this.keycaps.setColorAt(index, KEY_BASE);
      index += 1;
    };

    for (let row = 0; row < rows; row += 1) {
      const z = frontZ + row * pitch;
      // The function row is set back off the main block by half a key.
      const rowZ = row === 0 ? z - gap * 2 : z;

      for (let column = 0; column < mainCols; column += 1) {
        place(left + keySize / 2 + column * pitch, rowZ);
      }
      for (let column = 0; column < padCols; column += 1) {
        place(left + mainSpan + cluster + keySize / 2 + column * pitch, rowZ);
      }
    }

    this.keycaps.instanceMatrix.needsUpdate = true;
    if (this.keycaps.instanceColor) this.keycaps.instanceColor.needsUpdate = true;
    group.add(this.keycaps);

    // Spacebar, across the front row.
    const spacebar = new Mesh(
      new BoxGeometry(keySize * 7, 0.007, keySize),
      this.capPlastic,
    );
    spacebar.position.set(left + mainSpan * 0.42, 0.0135, frontZ + rows * pitch);
    spacebar.castShadow = true;
    group.add(spacebar);

    // Status lamps in the back-right corner: num, caps, scroll.
    for (let i = 0; i < 3; i += 1) {
      const material = new MeshBasicMaterial({ color: 0x2a2a24 });
      this.keyLeds.push(material);

      const led = new Mesh(new PlaneGeometry(0.0045, 0.003), material);
      led.rotation.x = -Math.PI / 2;
      led.position.set(
        left + mainSpan + cluster + 0.012 + i * 0.012,
        0.0205,
        -BOARD.depth / 2 + 0.012,
      );
      group.add(led);
    }

    group.position.set(BOARD.x, DESK.top, BOARD.z);
    // A couple of degrees of tilt, like feet-up on a real board.
    group.rotation.x = -0.05;
    group.rotation.y = 0.03;
    return group;
  }

  private buildMouse() {
    const group = new Group();

    const shell = new Mesh(
      roundedSlab(0.052, 0.086, 0.02, { depth: 0.026, bevel: 0.008 }),
      this.plastic,
    );
    shell.rotation.x = -Math.PI / 2;
    shell.position.y = 0.013;
    shell.castShadow = true;
    group.add(shell);

    // Two buttons with the split between them, which is the period detail.
    for (const side of [-1, 1]) {
      const button = new Mesh(
        roundedSlab(0.022, 0.032, 0.006, { depth: 0.004, bevel: 0.0015 }),
        this.capPlastic,
      );
      button.rotation.x = -Math.PI / 2;
      button.position.set(side * 0.0125, 0.0265, -0.024);
      group.add(button);
    }

    group.position.set(this.mouseAt.x, DESK.top + 0.001, this.mouseAt.z);
    group.rotation.y = -0.14;
    this.mouse = group;
    return group;
  }

  /**
   * Stacked letter trays on the left of the desk, with paper in them. In the
   * reference this is what balances the machine — a pale block at the far end
   * of a long dark top.
   */
  private buildPaperTray() {
    const group = new Group();
    const trayMaterial = new MeshStandardMaterial({
      color: 0xcdc6b6,
      roughness: 0.85,
      metalness: 0.02,
    });

    for (let i = 0; i < 2; i += 1) {
      const y = i * 0.055;

      // The tray itself: a shallow open frame, so paper can sit in it.
      const floor = new Mesh(new BoxGeometry(0.235, 0.008, 0.185), trayMaterial);
      floor.position.set(0, y + 0.028, 0);
      floor.castShadow = true;
      floor.receiveShadow = true;
      group.add(floor);

      for (const side of [-1, 1]) {
        const wall = new Mesh(new BoxGeometry(0.008, 0.045, 0.185), trayMaterial);
        wall.position.set(side * 0.117, y + 0.0125, 0);
        group.add(wall);
      }

      const backWall = new Mesh(new BoxGeometry(0.235, 0.028, 0.008), trayMaterial);
      backWall.position.set(0, y + 0.018, -0.0925);
      group.add(backWall);

      // A ream in each, slightly askew.
      const stack = new Mesh(new BoxGeometry(0.2, 0.022, 0.155), this.paper);
      stack.position.set(0, y + 0.043, 0.004);
      stack.rotation.y = (i === 0 ? 1 : -1) * 0.035;
      stack.castShadow = true;
      group.add(stack);
    }

    group.position.set(-0.62, DESK.top, 0.02);
    group.rotation.y = 0.09;
    return group;
  }

  /** One sheet left flat on the desk beside the keyboard. */
  private buildLooseSheet() {
    const sheet = new Mesh(new PlaneGeometry(0.21, 0.15), this.paper);
    sheet.rotation.x = -Math.PI / 2;
    sheet.rotation.z = 0.22;
    sheet.position.set(-0.3, DESK.top + 0.0018, 0.16);
    sheet.receiveShadow = true;
    return sheet;
  }

  /** Two ring binders standing against nothing behind the machine. */
  private buildBinders() {
    const group = new Group();

    const spines = [
      { color: 0x4a332a, width: 0.055, height: 0.29 },
      { color: 0x6b4a33, width: 0.045, height: 0.265 },
    ];

    let x = 0;
    for (const { color, width, height } of spines) {
      const binder = new Mesh(
        new BoxGeometry(width, height, 0.23),
        new MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02 }),
      );
      binder.position.set(x, height / 2, 0);
      binder.rotation.z = 0.02;
      binder.castShadow = true;
      binder.receiveShadow = true;
      group.add(binder);
      x += width + 0.004;
    }

    group.position.set(0.44, DESK.top, -0.3);
    group.rotation.y = -0.16;
    return group;
  }

  private buildMug() {
    const group = new Group();
    const ceramic = new MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.3 });

    const body = new Mesh(new CylinderGeometry(0.039, 0.034, 0.092, 24), ceramic);
    body.position.y = 0.046;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const coffee = new Mesh(
      new CylinderGeometry(0.035, 0.035, 0.002, 20),
      new MeshStandardMaterial({ color: 0x33211a, roughness: 0.25 }),
    );
    coffee.position.y = 0.079;
    group.add(coffee);

    // The handle, as a squashed ring on its side.
    const handle = new Mesh(
      new CylinderGeometry(0.0055, 0.0055, 0.052, 8),
      ceramic,
    );
    handle.position.set(0.042, 0.05, 0);
    handle.rotation.z = 0.1;
    group.add(handle);

    for (const y of [0.03, 0.07]) {
      const arm = new Mesh(new CylinderGeometry(0.0055, 0.0055, 0.018, 8), ceramic);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(0.036, y, 0);
      group.add(arm);
    }

    group.position.set(0.54, DESK.top, -0.08);
    return group;
  }

  /**
   * Keyboard and mouse leads, running back to the front of the system unit.
   * Without them both read as props sitting near the machine.
   *
   * These are not hung like the cables behind the desk — a lead lying on a
   * surface cannot sag, it can only wander. So each one is a curve that stays
   * a couple of millimetres above the laminate the whole way and bows
   * *sideways* instead of downward. Sagging them dropped the middle of each
   * run under the desk top, which is what turned them into straight sticks.
   */
  private buildCables() {
    const group = new Group();
    const lead = new MeshStandardMaterial({
      color: 0xb9b1a0,
      roughness: 0.88,
      metalness: 0,
    });

    const restY = DESK.top + 0.005;

    // [from, to, how far the middle wanders to one side]
    const runs: Array<[Vector3, Vector3, number]> = [
      [
        new Vector3(BOARD.x + 0.05, restY, BOARD.z - BOARD.depth / 2 + 0.004),
        new Vector3(-0.07, restY + 0.022, UNIT.frontZ + 0.004),
        -0.055,
      ],
      [
        new Vector3(this.mouseAt.x - 0.004, restY, this.mouseAt.z - 0.044),
        new Vector3(0.07, restY + 0.022, UNIT.frontZ + 0.004),
        0.045,
      ],
    ];

    for (const [from, to, bow] of runs) {
      const middle = from.clone().add(to).multiplyScalar(0.5);
      middle.x += bow;
      middle.y = restY;

      const curve = new CatmullRomCurve3([from, middle, to]);
      const mesh = new Mesh(new TubeGeometry(curve, 24, 0.0032, 6, false), lead);
      mesh.castShadow = true;
      group.add(mesh);
    }

    return group;
  }

  /* ---------------------------------------------------------------------- */

  /**
   * Both reactive pieces, driven off the telemetry bus.
   *
   * The keyboard is deliberately not a uniform pulse: each keystroke lights
   * one random cap, which then decays on its own clock, so a burst of typing
   * leaves a scatter of fading keys behind it.
   */
  update(delta: number) {
    const state = telemetry.state;

    this.updateKeyboard(delta, state.keys, state.powered);
    this.updateMouse(delta, state.cursor.x, state.cursor.y);
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
      this.keyColor.copy(KEY_BASE).lerp(KEY_LIT, this.keyHeat[i] * 0.8);
      this.keycaps.setColorAt(i, this.keyColor);
      dirty = true;
    }

    if (dirty) this.keycaps.instanceColor.needsUpdate = true;

    // Num-lock lamp stands in for the power light.
    this.keyLeds[0]?.color.setRGB(powered ? 0.35 : 0.16, powered ? 0.95 : 0.16, powered ? 0.5 : 0.14);
  }

  private updateMouse(delta: number, cursorX: number, cursorY: number) {
    const targetX = MathUtils.lerp(MOUSE_RANGE.minX, MOUSE_RANGE.maxX, cursorX);
    const targetZ = MathUtils.lerp(MOUSE_RANGE.minZ, MOUSE_RANGE.maxZ, cursorY);

    // Damped rather than snapped: a mouse has mass, and the lag is what makes
    // the mirroring read as a hand moving it instead of a teleport.
    this.mouseAt.x = MathUtils.damp(this.mouseAt.x, targetX, 9, delta);
    this.mouseAt.z = MathUtils.damp(this.mouseAt.z, targetZ, 9, delta);

    this.mouse.position.x = this.mouseAt.x;
    this.mouse.position.z = this.mouseAt.z;

    // Lean into the direction of travel.
    const tilt = MathUtils.clamp((this.mouseAt.x - targetX) * 2.2, -0.12, 0.12);
    this.mouse.rotation.z = MathUtils.damp(this.mouse.rotation.z, tilt, 8, delta);
    this.mouse.rotation.y = MathUtils.damp(this.mouse.rotation.y, -0.14 + tilt * 0.5, 8, delta);
  }
}

import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { roundedSlab } from './geometry';
import { telemetry } from './telemetry';

/**
 * The machine itself: a glass-panelled tower that actually runs.
 *
 * This is the piece that makes the room read as a computer rather than a
 * screensaver. Every fan in here spins at a speed derived from the load the
 * operating system is genuinely under, the RGB cycles, the drive LED blinks
 * when the virtual filesystem is written to, and the CPU block glows with the
 * core temperature. Nothing is on a fixed loop — pull up the Case Cam, run a
 * `find` in the terminal, and watch the intake fans spool.
 *
 * Everything is procedural: rounded slabs for the chassis, extruded rings and
 * an instanced blade cluster per fan, and a physical material for the tempered
 * glass. No models, no textures, nothing fetched.
 */

/** Outer shell, in metres. A compact mid-tower that fits on a desk. */
export const CASE = {
  width: 0.19,
  height: 0.42,
  depth: 0.4,
};

const HALF_W = CASE.width / 2;
const HALF_H = CASE.height / 2;
const HALF_D = CASE.depth / 2;

/** Blades per fan. Dropped on weak devices, where they read as a blur anyway. */
const BLADES = { low: 5, medium: 7, high: 9 };

/* -------------------------------------------------------------------------- */
/* Fans                                                                        */
/* -------------------------------------------------------------------------- */

interface FanOptions {
  radius: number;
  blades: number;
  /** Fans are built facing +Z and rotated into place by the caller. */
  thickness?: number;
  /** Anticlockwise fans on the exhaust side sell the airflow direction. */
  reverse?: boolean;
  ring?: boolean;
}

/**
 * One fan: a static shroud plus a rotor that actually turns.
 *
 * The blades are a single InstancedMesh parented to the rotor, so a nine-blade
 * fan is one draw call and spinning it is one quaternion write per frame
 * rather than nine matrix updates.
 */
class Fan {
  readonly group = new Group();
  readonly rotor = new Group();
  readonly ringMaterial: MeshBasicMaterial | null = null;

  /** Multiplier on the shared RPM, so intakes and exhausts differ slightly. */
  readonly speedScale: number;
  private readonly direction: number;

  constructor(options: FanOptions, materials: { shroud: MeshStandardMaterial; blade: MeshStandardMaterial }) {
    const { radius, blades } = options;
    const thickness = options.thickness ?? 0.012;
    this.direction = options.reverse ? -1 : 1;
    // A little spread stops six fans from looking like one rigid assembly.
    this.speedScale = 0.86 + Math.random() * 0.28;

    // --- Shroud: the square frame with the round bore ---------------------
    const shroud = new Mesh(
      roundedSlab(radius * 2.08, radius * 2.08, radius * 0.16, {
        depth: thickness,
        holeWidth: radius * 1.94,
        holeHeight: radius * 1.94,
        holeRadius: radius * 0.94,
      }),
      materials.shroud,
    );
    shroud.position.z = thickness / 2;
    this.group.add(shroud);

    // --- Rotor: hub plus the blade cluster --------------------------------
    const hub = new Mesh(
      new CylinderGeometry(radius * 0.34, radius * 0.34, thickness * 0.8, 16),
      materials.shroud,
    );
    hub.rotation.x = Math.PI / 2;
    this.rotor.add(hub);

    const bladeGeometry = new BoxGeometry(radius * 0.62, thickness * 0.42, radius * 0.3);
    const cluster = new InstancedMesh(bladeGeometry, materials.blade, blades);
    const dummy = new Object3D();

    for (let i = 0; i < blades; i += 1) {
      const angle = (i / blades) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * radius * 0.62, Math.sin(angle) * radius * 0.62, 0);
      // Point the blade outward, then pitch it so it reads as a real aerofoil.
      dummy.rotation.set(0, 0, angle);
      dummy.rotateX(this.direction * 0.62);
      dummy.updateMatrix();
      cluster.setMatrixAt(i, dummy.matrix);
    }
    cluster.instanceMatrix.needsUpdate = true;
    this.rotor.add(cluster);
    this.group.add(this.rotor);

    // --- Optional lit ring, the part that actually catches the eye ---------
    if (options.ring !== false) {
      this.ringMaterial = new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.95,
        side: DoubleSide,
      });
      const ring = new Mesh(new RingGeometry(radius * 0.82, radius * 0.96, 28), this.ringMaterial);
      ring.position.z = thickness + 0.0006;
      this.group.add(ring);
    }
  }

  /** `rpm` is the shared figure from telemetry; each fan trims it a little. */
  spin(rpm: number, delta: number) {
    // rev/min → rad/s.
    const radians = ((rpm * this.speedScale) / 60) * Math.PI * 2;
    this.rotor.rotation.z += this.direction * radians * delta;
  }
}

/* -------------------------------------------------------------------------- */
/* The tower                                                                   */
/* -------------------------------------------------------------------------- */

export class Tower {
  readonly group = new Group();
  /** Raycast targets — clicking the case opens the Case Cam. */
  readonly hitboxes: Object3D[] = [];

  private readonly fans: Fan[] = [];
  private readonly rgbStrips: MeshBasicMaterial[] = [];
  private readonly ramGlow: MeshBasicMaterial[] = [];
  private readonly cpuGlow: MeshBasicMaterial;
  private readonly gpuGlow: MeshBasicMaterial;
  private readonly powerLed: MeshBasicMaterial;
  private readonly driveLed: MeshBasicMaterial;
  private readonly interiorLight: PointLight | null = null;

  private hue = 0;

  /* --- Shared materials, so the whole case is a handful of programs ------ */

  private readonly steel = new MeshStandardMaterial({
    color: 0x1f2228,
    roughness: 0.42,
    metalness: 0.82,
  });

  private readonly steelDark = new MeshStandardMaterial({
    color: 0x141619,
    roughness: 0.56,
    metalness: 0.6,
  });

  private readonly plastic = new MeshStandardMaterial({
    color: 0x1a1d23,
    roughness: 0.78,
    metalness: 0.05,
  });

  private readonly blade = new MeshStandardMaterial({
    color: 0x424852,
    roughness: 0.55,
    metalness: 0.15,
    side: DoubleSide,
  });

  private readonly pcb = new MeshStandardMaterial({
    color: 0x1b232b,
    roughness: 0.72,
    metalness: 0.22,
  });

  private readonly heatsink = new MeshStandardMaterial({
    color: 0x9aa3ad,
    roughness: 0.28,
    metalness: 0.94,
  });

  constructor(private quality: Quality) {
    const blades = BLADES[quality];

    this.cpuGlow = new MeshBasicMaterial({ color: 0x101418 });
    this.gpuGlow = new MeshBasicMaterial({ color: 0x101418 });
    this.powerLed = new MeshBasicMaterial({ color: 0x14171b });
    this.driveLed = new MeshBasicMaterial({ color: 0x14171b });

    this.buildChassis();
    this.buildMotherboard();
    this.buildCooler(blades);
    this.buildGpu(blades);
    this.buildMemory();
    this.buildStorage();
    this.buildIntakes(blades);
    this.buildExhaust(blades);
    this.buildFrontPanel();
    this.buildCables();
    // Glass goes on last so it sorts in front of everything it covers.
    this.buildGlass();

    if (quality !== 'low') {
      // One light inside the case, carrying the RGB colour onto the internals.
      // Two lights: one carrying the RGB colour onto the internals, and a
      // fixed fill so the components read even when the strips are dim.
      this.interiorLight = new PointLight(0x5fd0ff, 0, 0.55, 1.6);
      this.interiorLight.position.set(0.02, 0.02, 0.05);
      this.group.add(this.interiorLight);

      const fill = new PointLight(0xbcd2f0, 0.3, 0.6, 1.8);
      fill.position.set(HALF_W - 0.02, 0.08, 0.1);
      this.group.add(fill);
    }
  }

  /* --- Chassis ---------------------------------------------------------- */

  private buildChassis() {
    // Five solid faces; the sixth is the glass panel on +X.
    const panels: Array<[BoxGeometry, [number, number, number]]> = [
      [new BoxGeometry(CASE.width, 0.006, CASE.depth), [0, HALF_H, 0]],
      [new BoxGeometry(CASE.width, 0.008, CASE.depth), [0, -HALF_H, 0]],
      [new BoxGeometry(CASE.width, CASE.height, 0.006), [0, 0, -HALF_D]],
      [new BoxGeometry(0.006, CASE.height, CASE.depth), [-HALF_W, 0, 0]],
    ];

    for (const [geometry, position] of panels) {
      const panel = new Mesh(geometry, this.steel);
      panel.position.set(...position);
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.group.add(panel);
      this.hitboxes.push(panel);
    }

    // Feet, so it does not read as floating on the desk.
    for (const x of [-HALF_W + 0.03, HALF_W - 0.03]) {
      for (const z of [-HALF_D + 0.04, HALF_D - 0.04]) {
        const foot = new Mesh(new BoxGeometry(0.022, 0.008, 0.03), this.plastic);
        foot.position.set(x, -HALF_H - 0.005, z);
        this.group.add(foot);
      }
    }

    // Rear I/O cluster and the PSU cutout.
    const io = new Mesh(new BoxGeometry(0.13, 0.05, 0.004), this.steelDark);
    io.position.set(0.01, HALF_H - 0.09, -HALF_D - 0.003);
    this.group.add(io);

    for (let i = 0; i < 4; i += 1) {
      const port = new Mesh(new BoxGeometry(0.012, 0.006, 0.003), new MeshBasicMaterial({ color: 0x1c3a5c }));
      port.position.set(-0.03 + i * 0.018, HALF_H - 0.084, -HALF_D - 0.006);
      this.group.add(port);
    }
  }

  /** The tempered side panel. Built last, drawn last, tinted just enough. */
  private buildGlass() {
    const glass = new Mesh(
      new PlaneGeometry(CASE.depth - 0.014, CASE.height - 0.012),
      new MeshPhysicalMaterial({
        // Barely tinted: a darker pane looks more like real smoked glass, but
        // at this size it turns the internals into a black rectangle, and the
        // internals are the entire point of the panel.
        color: 0x3d4c60,
        transparent: true,
        opacity: 0.13,
        roughness: 0.04,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(HALF_W, 0, 0);
    glass.renderOrder = 6;
    this.group.add(glass);
    this.hitboxes.push(glass);

    // The four thumbscrews that hold it on.
    for (const y of [-HALF_H + 0.02, HALF_H - 0.02]) {
      for (const z of [-HALF_D + 0.02, HALF_D - 0.02]) {
        const screw = new Mesh(new CylinderGeometry(0.0035, 0.0035, 0.004, 8), this.heatsink);
        screw.rotation.z = Math.PI / 2;
        screw.position.set(HALF_W + 0.002, y, z);
        this.group.add(screw);
      }
    }
  }

  /* --- Motherboard and the parts bolted to it --------------------------- */

  private buildMotherboard() {
    const board = new Mesh(new BoxGeometry(0.004, 0.3, 0.3), this.pcb);
    board.position.set(-HALF_W + 0.016, 0.03, -0.02);
    this.group.add(board);

    // Chipset heatsinks and the M.2 shield, as low slabs on the board face.
    for (const [y, z, height] of [
      [-0.05, 0.02, 0.05],
      [-0.11, 0.02, 0.035],
    ] as const) {
      const shield = new Mesh(new BoxGeometry(0.006, height, 0.07), this.steelDark);
      shield.position.set(-HALF_W + 0.021, y + 0.03, z);
      this.group.add(shield);
    }

    // VRM heatsink along the top edge of the board.
    const vrm = new Mesh(new BoxGeometry(0.007, 0.045, 0.11), this.steelDark);
    vrm.position.set(-HALF_W + 0.022, 0.15, -0.05);
    this.group.add(vrm);
  }

  private buildCooler(blades: number) {
    const cooler = new Group();

    // Fin stack: thin plates on the shared heatsink material.
    const finCount = this.quality === 'low' ? 8 : 16;
    for (let i = 0; i < finCount; i += 1) {
      const fin = new Mesh(new BoxGeometry(0.0012, 0.075, 0.07), this.heatsink);
      fin.position.set(-0.03 + (i / (finCount - 1)) * 0.06, 0, 0);
      cooler.add(fin);
    }

    // Heat pipes arcing over the top of the stack.
    for (const offset of [-0.02, 0, 0.02]) {
      const pipe = new Mesh(new TorusGeometry(0.018, 0.003, 6, 14, Math.PI), this.heatsink);
      pipe.rotation.y = Math.PI / 2;
      pipe.position.set(0, 0.038, offset);
      cooler.add(pipe);
    }

    // The lit block on top — this is what tracks core temperature.
    const block = new Mesh(new BoxGeometry(0.062, 0.008, 0.072), this.cpuGlow);
    block.position.set(0, 0.043, 0);
    cooler.add(block);

    const fan = new Fan({ radius: 0.036, blades, reverse: true }, { shroud: this.plastic, blade: this.blade });
    // Bolted to the side of the stack, blowing toward the exhaust.
    fan.group.rotation.y = Math.PI / 2;
    fan.group.position.set(0, 0, 0.042);
    fan.group.rotation.x = Math.PI / 2;
    cooler.add(fan.group);
    this.fans.push(fan);

    cooler.position.set(-HALF_W + 0.062, 0.09, -0.02);
    this.group.add(cooler);
  }

  private buildGpu(blades: number) {
    const gpu = new Group();

    const board = new Mesh(new BoxGeometry(0.115, 0.01, 0.2), this.pcb);
    gpu.add(board);

    // Shroud over the cooler, and the backplate under it.
    const shroud = new Mesh(
      roundedSlab(0.2, 0.105, 0.006, { depth: 0.026 }),
      this.steelDark,
    );
    shroud.rotation.x = -Math.PI / 2;
    shroud.rotation.z = Math.PI / 2;
    shroud.position.set(0, 0.018, 0);
    gpu.add(shroud);

    const backplate = new Mesh(new BoxGeometry(0.118, 0.003, 0.19), this.steel);
    backplate.position.y = -0.008;
    gpu.add(backplate);

    // Two axial fans, facing up through the shroud.
    for (const z of [-0.05, 0.05]) {
      const fan = new Fan({ radius: 0.031, blades }, { shroud: this.plastic, blade: this.blade });
      fan.group.rotation.x = -Math.PI / 2;
      fan.group.position.set(0, 0.02, z);
      gpu.add(fan.group);
      this.fans.push(fan);
    }

    // The lit logo bar down the long edge of the card.
    const logo = new Mesh(new BoxGeometry(0.004, 0.006, 0.09), this.gpuGlow);
    logo.position.set(0.056, 0.016, 0.03);
    gpu.add(logo);

    gpu.position.set(-HALF_W + 0.078, -0.04, -0.01);
    this.group.add(gpu);
  }

  private buildMemory() {
    // Two sticks standing next to the cooler, with RGB diffusers on top.
    for (let i = 0; i < 2; i += 1) {
      const stick = new Mesh(new BoxGeometry(0.004, 0.052, 0.13), this.pcb);
      stick.position.set(-HALF_W + 0.026, 0.1, 0.078 + i * 0.011);
      this.group.add(stick);

      const diffuser = new MeshBasicMaterial({ color: 0x0d1014 });
      this.ramGlow.push(diffuser);

      const cap = new Mesh(new BoxGeometry(0.0045, 0.006, 0.128), diffuser);
      cap.position.set(-HALF_W + 0.026, 0.129, 0.078 + i * 0.011);
      this.group.add(cap);
    }
  }

  private buildStorage() {
    // PSU shroud across the floor of the case, with a drive cage on top.
    const shroud = new Mesh(new BoxGeometry(CASE.width - 0.012, 0.08, CASE.depth - 0.03), this.steelDark);
    shroud.position.set(0, -HALF_H + 0.044, -0.008);
    this.group.add(shroud);

    // Vent slots along the shroud's visible flank.
    for (let i = 0; i < 7; i += 1) {
      const slot = new Mesh(new BoxGeometry(0.001, 0.03, 0.008), this.plastic);
      slot.position.set(HALF_W - 0.008, -HALF_H + 0.044, -0.09 + i * 0.026);
      this.group.add(slot);
    }

    const drive = new Mesh(new BoxGeometry(0.07, 0.018, 0.1), this.steel);
    drive.position.set(-0.01, -HALF_H + 0.093, -0.05);
    this.group.add(drive);
  }

  private buildIntakes(blades: number) {
    // Three 120mm intakes stacked behind the front mesh.
    const count = this.quality === 'low' ? 2 : 3;
    for (let i = 0; i < count; i += 1) {
      const fan = new Fan({ radius: 0.037, blades }, { shroud: this.plastic, blade: this.blade });
      fan.group.position.set(0, HALF_H - 0.062 - i * 0.082, HALF_D - 0.022);
      this.group.add(fan.group);
      this.fans.push(fan);
    }
  }

  private buildExhaust(blades: number) {
    const fan = new Fan(
      { radius: 0.034, blades, reverse: true },
      { shroud: this.plastic, blade: this.blade },
    );
    fan.group.rotation.y = Math.PI;
    fan.group.position.set(0, HALF_H - 0.055, -HALF_D + 0.018);
    this.group.add(fan.group);
    this.fans.push(fan);
  }

  private buildFrontPanel() {
    // Mesh front: a dark slab with a grid of holes suggested by fine slats.
    const front = new Mesh(
      roundedSlab(CASE.width, CASE.height, 0.008, { depth: 0.008, bevel: 0.002 }),
      this.plastic,
    );
    front.position.set(0, 0, HALF_D + 0.008);
    front.castShadow = true;
    this.group.add(front);
    this.hitboxes.push(front);

    for (let i = 0; i < 22; i += 1) {
      const slat = new Mesh(new BoxGeometry(CASE.width - 0.03, 0.0012, 0.002), this.steelDark);
      slat.position.set(0, HALF_H - 0.03 - i * 0.016, HALF_D + 0.009);
      this.group.add(slat);
    }

    // Two RGB light bars down the front edges — the case's signature.
    for (const x of [-HALF_W + 0.006, HALF_W - 0.006]) {
      const material = new MeshBasicMaterial({ color: 0x0d1014 });
      this.rgbStrips.push(material);

      const strip = new Mesh(new BoxGeometry(0.004, CASE.height - 0.05, 0.004), material);
      strip.position.set(x, 0, HALF_D + 0.01);
      this.group.add(strip);
    }

    // Front I/O: power button, the two LEDs, a pair of USB ports.
    const button = new Mesh(new CylinderGeometry(0.006, 0.006, 0.003, 14), this.steel);
    button.rotation.x = Math.PI / 2;
    button.position.set(0, HALF_H - 0.018, HALF_D + 0.012);
    this.group.add(button);

    const power = new Mesh(new CylinderGeometry(0.0022, 0.0022, 0.002, 10), this.powerLed);
    power.rotation.x = Math.PI / 2;
    power.position.set(-0.022, HALF_H - 0.018, HALF_D + 0.012);
    this.group.add(power);

    const drive = new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.002, 10), this.driveLed);
    drive.rotation.x = Math.PI / 2;
    drive.position.set(0.022, HALF_H - 0.018, HALF_D + 0.012);
    this.group.add(drive);
  }

  /** Braided runs from behind the shroud up to the board and the card. */
  private buildCables() {
    if (this.quality === 'low') return;

    const material = new MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.9 });

    const runs: Vector3[][] = [
      [
        new Vector3(-HALF_W + 0.03, -HALF_H + 0.09, -0.12),
        new Vector3(-HALF_W + 0.05, -0.02, -0.13),
        new Vector3(-HALF_W + 0.05, 0.12, -0.12),
        new Vector3(-HALF_W + 0.04, 0.17, -0.08),
      ],
      [
        new Vector3(-HALF_W + 0.03, -HALF_H + 0.09, -0.1),
        new Vector3(-HALF_W + 0.06, -HALF_H + 0.13, -0.02),
        new Vector3(-HALF_W + 0.075, -0.028, 0.05),
      ],
    ];

    for (const points of runs) {
      const tube = new Mesh(
        new TubeGeometry(new CatmullRomCurve3(points), 14, 0.0045, 5, false),
        material,
      );
      this.group.add(tube);
    }
  }

  /* --- Per-frame -------------------------------------------------------- */

  /**
   * Drive everything from the telemetry bus.
   *
   * The colours are computed as HSL and written straight onto the basic
   * materials, so lighting the case costs nothing beyond a few `setHSL` calls
   * and one point light.
   */
  update(delta: number) {
    const state = telemetry.state;

    for (const fan of this.fans) fan.spin(state.rpm, delta);

    if (!state.powered) {
      this.dim();
      return;
    }

    // The RGB cycle speeds up under load, which is the cheapest possible way
    // to make the case look like it is straining.
    this.hue = (this.hue + delta * (0.04 + state.cpu * 0.16)) % 1;

    for (let i = 0; i < this.rgbStrips.length; i += 1) {
      // Offset the second bar so the case never looks like one flat colour.
      this.rgbStrips[i].color.setHSL((this.hue + i * 0.08) % 1, 0.85, 0.56 + state.cpu * 0.12);
    }

    for (let i = 0; i < this.ramGlow.length; i += 1) {
      this.ramGlow[i].color.setHSL((this.hue + 0.14 + i * 0.05) % 1, 0.8, 0.42 + state.ram * 0.2);
    }

    for (const fan of this.fans) {
      fan.ringMaterial?.color.setHSL((this.hue + 0.5) % 1, 0.75, 0.3 + state.cpu * 0.3);
    }

    // The cooler runs blue when cold and slides to red as the core heats.
    const heat = Math.min(Math.max((state.tempCpu - 34) / 46, 0), 1);
    this.cpuGlow.color.setHSL(0.58 - heat * 0.58, 0.9, 0.34 + heat * 0.22);
    this.gpuGlow.color.setHSL((this.hue + 0.3) % 1, 0.8, 0.3 + state.gpu * 0.3);

    // Power steady, drive flickering — the two LEDs a real case has.
    this.powerLed.color.setRGB(0.2, 0.85, 0.6);
    const blink = state.disk;
    this.driveLed.color.setRGB(0.06 + blink * 0.94, 0.03 + blink * 0.5, 0.02);

    if (this.interiorLight) {
      this.interiorLight.color.setHSL(this.hue, 0.8, 0.55);
      this.interiorLight.intensity = 0.5 + state.cpu * 0.45;
    }
  }

  private dim() {
    for (const material of [...this.rgbStrips, ...this.ramGlow]) material.color.setRGB(0.05, 0.06, 0.07);
    for (const fan of this.fans) fan.ringMaterial?.color.setRGB(0.04, 0.05, 0.06);
    this.cpuGlow.color.setRGB(0.06, 0.08, 0.09);
    this.gpuGlow.color.setRGB(0.06, 0.08, 0.09);
    this.powerLed.color.setRGB(0.08, 0.09, 0.1);
    this.driveLed.color.setRGB(0.08, 0.09, 0.1);
    if (this.interiorLight) this.interiorLight.intensity = 0;
  }
}

import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { cable, contactShadow, roundedSlab } from './geometry';
import { DESK, MONITOR, UNIT } from './layout';

/**
 * A grey steel office desk: dark laminate top, light painted frame, and a
 * drawer pedestal under the right-hand half.
 *
 * The silhouette is the whole point of this piece of furniture — a flat dark
 * plane on pale square legs, with one heavy block hanging off it. So the top
 * gets a bevel (the lit edge of a chamfer is most of what says "laminate over
 * board" at this distance), the legs are square-section rather than round, and
 * the pedestal is inset from the top on every side so its shadow line reads.
 */
export class Desk {
  readonly group = new Group();

  /** Near-black laminate. Matte, because a gloss top would mirror the studio. */
  private readonly top = new MeshStandardMaterial({
    color: 0x35353a,
    roughness: 0.66,
    metalness: 0.06,
  });

  /** The underside never catches the key, so it reads darker and flatter. */
  private readonly topUnder = new MeshStandardMaterial({
    color: 0x232327,
    roughness: 0.9,
    metalness: 0,
  });

  /** Painted steel — the pale grey the whole frame and pedestal are in. */
  private readonly steel = new MeshStandardMaterial({
    color: 0xb2b4b8,
    roughness: 0.52,
    metalness: 0.32,
  });

  /** The same paint in shadow, for drawer faces and the recessed panel. */
  private readonly steelShade = new MeshStandardMaterial({
    color: 0x9b9da1,
    roughness: 0.58,
    metalness: 0.28,
  });

  private readonly chrome = new MeshStandardMaterial({
    color: 0x86888c,
    roughness: 0.3,
    metalness: 0.85,
  });

  private readonly rubber = new MeshStandardMaterial({
    color: 0x1b1b1f,
    roughness: 0.95,
    metalness: 0,
  });

  constructor() {
    this.buildTop();
    this.buildPedestal();
    this.buildLegs();
    this.buildCables();
  }

  private buildTop() {
    // roundedSlab extrudes along -Z with its front face on z = 0; laying it
    // flat puts the work surface at y = 0 and the thickness below it.
    const slab = roundedSlab(DESK.width, DESK.depth, 0.01, {
      depth: DESK.thickness,
      bevel: 0.004,
    });
    slab.rotateX(-Math.PI / 2);

    const top = new Mesh(slab, this.top);
    top.position.set(0, DESK.top, DESK.centreZ);
    top.castShadow = true;
    top.receiveShadow = true;
    this.group.add(top);

    const lip = new Mesh(
      new BoxGeometry(DESK.width - 0.016, 0.01, DESK.depth - 0.016),
      this.topUnder,
    );
    lip.position.set(0, DESK.top - DESK.thickness - 0.004, DESK.centreZ);
    this.group.add(lip);
  }

  /**
   * The drawer block under the right half: two drawers, each with a pressed
   * handle recess, standing clear of the floor on a plinth.
   */
  private buildPedestal() {
    const width = 0.42;
    const depth = DESK.depth - 0.09;
    const height = DESK.top - DESK.thickness - 0.075;
    const x = DESK.width / 2 - width / 2 - 0.19;
    const z = DESK.centreZ - 0.012;
    const frontZ = z + depth / 2;

    const box = new Mesh(new BoxGeometry(width, height, depth), this.steel);
    box.position.set(x, height / 2 + 0.075, z);
    box.castShadow = true;
    box.receiveShadow = true;
    this.group.add(box);

    // Two drawer faces, proud of the carcass by a millimetre so the gap
    // between them catches a line of shadow.
    const faceHeight = height * 0.42;
    for (let i = 0; i < 2; i += 1) {
      const centreY = 0.075 + height - faceHeight / 2 - 0.012 - i * (faceHeight + 0.014);

      const face = new Mesh(
        roundedSlab(width - 0.02, faceHeight, 0.006, { depth: 0.012, bevel: 0.002 }),
        this.steelShade,
      );
      face.position.set(x, centreY, frontZ + 0.006);
      this.group.add(face);

      // The pressed pull: a shallow dark slot rather than a knob.
      const pull = new Mesh(new BoxGeometry(0.1, 0.014, 0.008), this.chrome);
      pull.position.set(x + 0.09, centreY, frontZ + 0.012);
      this.group.add(pull);
    }

    // Plinth, set back all round so the block appears to float a little.
    const plinth = new Mesh(
      new BoxGeometry(width - 0.05, 0.075, depth - 0.05),
      this.rubber,
    );
    plinth.position.set(x, 0.0375, z);
    this.group.add(plinth);

    const pool = contactShadow(width + 0.24, depth + 0.24, 0.32);
    pool.position.set(x, 0.002, z);
    this.group.add(pool);
  }

  private buildLegs() {
    const legHeight = DESK.top - DESK.thickness;
    const insetZ = DESK.depth / 2 - 0.075;
    const centreZ = DESK.centreZ;

    // Only the left half stands on legs — the pedestal carries the right.
    const legXs = [-DESK.width / 2 + 0.07, DESK.width / 2 - 0.07];

    const legGeometry = roundedSlab(0.046, legHeight, 0.006, {
      depth: 0.046,
      bevel: 0.003,
    });

    for (const x of legXs) {
      for (const z of [centreZ - insetZ, centreZ + insetZ]) {
        const leg = new Mesh(legGeometry, this.steel);
        leg.position.set(x, legHeight / 2, z + 0.023);
        leg.castShadow = true;
        this.group.add(leg);

        const foot = new Mesh(new BoxGeometry(0.052, 0.008, 0.052), this.rubber);
        foot.position.set(x, 0.004, z);
        this.group.add(foot);

        const pool = contactShadow(0.16, 0.16, 0.3);
        pool.position.set(x, 0.002, z);
        this.group.add(pool);
      }
    }

    // The modesty panel across the left bay, recessed behind the front edge.
    const panel = new Mesh(new BoxGeometry(0.72, legHeight - 0.16, 0.016), this.steelShade);
    panel.position.set(-DESK.width / 2 + 0.44, (legHeight - 0.16) / 2 + 0.1, centreZ - 0.14);
    panel.castShadow = true;
    this.group.add(panel);

    // A brace tying the two left legs front to back.
    const brace = new Mesh(new BoxGeometry(0.026, 0.026, insetZ * 2), this.steel);
    brace.position.set(legXs[0], 0.1, centreZ);
    brace.castShadow = true;
    this.group.add(brace);
  }

  /**
   * The runs out of the back of the machine and over the desk's rear edge.
   * Without them everything up there reads as unplugged props sitting near
   * each other.
   */
  private buildCables() {
    const backZ = DESK.centreZ - DESK.depth / 2 + 0.04;
    const floorY = 0.012;

    const runs: Array<[Vector3, Vector3, number]> = [
      // Monitor signal lead, out of the tube's neck and down behind the desk.
      [
        new Vector3(0.03, DESK.top + UNIT.height + 0.02, MONITOR.frontZ - MONITOR.bodyDepth),
        new Vector3(0.14, DESK.top - 0.12, backZ),
        0.07,
      ],
      // Mains, off the back of the system unit.
      [
        new Vector3(-0.14, DESK.top + 0.03, UNIT.frontZ - UNIT.depth),
        new Vector3(0.05, DESK.top - 0.14, backZ),
        0.09,
      ],
      // And the run off the desk to the floor, which is where it all goes.
      [
        new Vector3(0.1, DESK.top - 0.13, backZ),
        new Vector3(0.36, floorY, backZ - 0.24),
        0.16,
      ],
    ];

    for (const [from, to, sag] of runs) {
      const mesh = new Mesh(cable(from, to, sag), this.rubber);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }
}

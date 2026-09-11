import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { cable, roundedSlab } from './geometry';
import { DESK, MONITOR, TOWER } from './layout';

/**
 * Warm wooden top on dark steel legs, to push against the cold screen light.
 *
 * The top is a bevelled slab rather than a box: at this camera distance the
 * lit edge of a chamfer is most of what tells you the thing is wood and not a
 * grey rectangle. The legs are braced and footed for the same reason — the
 * highlights those edges catch are what give the frame its depth.
 */
export class Desk {
  readonly group = new Group();

  private readonly wood = new MeshStandardMaterial({
    color: 0x6b4a30,
    roughness: 0.62,
    metalness: 0.04,
  });

  /** The underside never catches the lamp, so it reads darker and flatter. */
  private readonly woodUnder = new MeshStandardMaterial({
    color: 0x4a3322,
    roughness: 0.85,
    metalness: 0,
  });

  private readonly steel = new MeshStandardMaterial({
    color: 0x1b1b21,
    roughness: 0.42,
    metalness: 0.7,
  });

  private readonly rubber = new MeshStandardMaterial({
    color: 0x111114,
    roughness: 0.95,
    metalness: 0,
  });

  constructor() {
    this.buildTop();
    this.buildLegs();
    this.buildCables();
  }

  private buildTop() {
    // roundedSlab extrudes along -Z with its front face on z = 0; laying it
    // flat puts the work surface at y = 0 and the thickness below it.
    const slab = roundedSlab(DESK.width, DESK.depth, 0.014, {
      depth: DESK.thickness,
      bevel: 0.005,
    });
    slab.rotateX(-Math.PI / 2);

    const top = new Mesh(slab, this.wood);
    top.position.set(0, DESK.top, DESK.centreZ);
    top.castShadow = true;
    top.receiveShadow = true;
    this.group.add(top);

    // A darker panel just under the lip, so the edge reads as a thickness
    // rather than a painted line.
    const lip = new Mesh(
      new BoxGeometry(DESK.width - 0.02, 0.012, DESK.depth - 0.02),
      this.woodUnder,
    );
    lip.position.set(0, DESK.top - DESK.thickness - 0.005, DESK.centreZ);
    this.group.add(lip);
  }

  private buildLegs() {
    const legHeight = DESK.top - DESK.thickness;
    const insetX = DESK.width / 2 - 0.08;
    const insetZ = DESK.depth / 2 - 0.08;
    const centreZ = DESK.centreZ;

    // Slightly tapered box legs: wider at the top than the floor.
    const legGeometry = roundedSlab(0.05, legHeight, 0.008, {
      depth: 0.05,
      bevel: 0.004,
    });

    for (const x of [-insetX, insetX]) {
      for (const z of [centreZ - insetZ, centreZ + insetZ]) {
        const leg = new Mesh(legGeometry, this.steel);
        leg.position.set(x, legHeight / 2, z + 0.025);
        leg.castShadow = true;
        this.group.add(leg);

        const foot = new Mesh(new BoxGeometry(0.058, 0.01, 0.058), this.rubber);
        foot.position.set(x, 0.005, z);
        this.group.add(foot);
      }
    }

    // A brace across each end, and one along the back: this is what stops the
    // legs reading as four unrelated posts.
    const braceGeometry = new BoxGeometry(0.03, 0.03, insetZ * 2);
    for (const x of [-insetX, insetX]) {
      const brace = new Mesh(braceGeometry, this.steel);
      brace.position.set(x, 0.1, centreZ);
      brace.castShadow = true;
      this.group.add(brace);
    }

    const spine = new Mesh(new BoxGeometry(insetX * 2, 0.026, 0.026), this.steel);
    spine.position.set(0, 0.1, centreZ - insetZ);
    spine.castShadow = true;
    this.group.add(spine);

    // Cable tray slung under the back edge.
    const tray = new Mesh(new BoxGeometry(0.62, 0.016, 0.09), this.steel);
    tray.position.set(0.1, DESK.top - DESK.thickness - 0.08, centreZ - insetZ + 0.04);
    this.group.add(tray);
  }

  /**
   * Cables from the monitor and the tower, drooping behind the desk and down
   * to the floor. Without them everything on the desk reads as unplugged
   * props sitting near each other.
   */
  private buildCables() {
    const backZ = DESK.centreZ - DESK.depth / 2 + 0.06;
    const trayY = DESK.top - DESK.thickness - 0.07;

    const runs: Array<[Vector3, Vector3, number]> = [
      // Monitor: out of the back of the stand, over the edge, into the tray.
      [
        new Vector3(0.02, DESK.top + 0.01, MONITOR.frontZ - 0.2),
        new Vector3(0.12, trayY, backZ),
        0.06,
      ],
      // Tower: from the back of the case down to the tray.
      [
        new Vector3(TOWER.position.x + 0.12, DESK.top + 0.06, TOWER.position.z - 0.14),
        new Vector3(0.06, trayY, backZ),
        0.08,
      ],
      // And one run off the tray to the floor, which is where it all goes.
      [
        new Vector3(0.1, trayY, backZ),
        new Vector3(0.34, 0.012, backZ - 0.22),
        0.14,
      ],
    ];

    for (const [from, to, sag] of runs) {
      const mesh = new Mesh(cable(from, to, sag), this.rubber);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }
}

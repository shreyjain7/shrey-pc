import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { DESK } from './layout';

/** Warm wooden top on dark steel legs, to push against the cold screen light. */
export class Desk {
  readonly group = new Group();

  private readonly wood = new MeshStandardMaterial({
    color: 0x6b4a30,
    roughness: 0.62,
    metalness: 0.04,
  });

  private readonly steel = new MeshStandardMaterial({
    color: 0x1b1b21,
    roughness: 0.42,
    metalness: 0.7,
  });

  constructor() {
    const top = new Mesh(
      new BoxGeometry(DESK.width, DESK.thickness, DESK.depth),
      this.wood,
    );
    top.position.set(0, DESK.top - DESK.thickness / 2, -DESK.depth / 2 + 0.1);
    top.castShadow = true;
    top.receiveShadow = true;
    this.group.add(top);

    const legHeight = DESK.top - DESK.thickness;
    const legGeometry = new BoxGeometry(0.05, legHeight, 0.05);
    const insetX = DESK.width / 2 - 0.08;
    const insetZ = DESK.depth / 2 - 0.08;
    const centreZ = -DESK.depth / 2 + 0.1;

    for (const x of [-insetX, insetX]) {
      for (const z of [centreZ - insetZ, centreZ + insetZ]) {
        const leg = new Mesh(legGeometry, this.steel);
        leg.position.set(x, legHeight / 2, z);
        leg.castShadow = true;
        this.group.add(leg);
      }
    }
  }
}

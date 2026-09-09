import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';

const WALL_Z = -1.35;
const WALL_X = 2.2;
const CEILING_Y = 2.7;

/** The box the desk sits in. Deliberately plain — the machine is the subject. */
export class Room {
  readonly group = new Group();

  private readonly wallMaterial = new MeshStandardMaterial({
    color: 0x2f3140,
    roughness: 0.95,
    metalness: 0,
  });

  private readonly floorMaterial = new MeshStandardMaterial({
    color: 0x1e222a,
    roughness: 0.8,
    metalness: 0.05,
  });

  private readonly trimMaterial = new MeshStandardMaterial({
    color: 0x15151b,
    roughness: 0.7,
  });

  constructor() {
    const floor = new Mesh(new PlaneGeometry(12, 12), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const backWall = new Mesh(new PlaneGeometry(9, 6), this.wallMaterial);
    backWall.position.set(0, 2, WALL_Z);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    const leftWall = new Mesh(new PlaneGeometry(6, 6), this.wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-WALL_X, 2, 1);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    const rightWall = new Mesh(new PlaneGeometry(6, 6), this.wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(WALL_X, 2, 1);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);

    const ceiling = new Mesh(new PlaneGeometry(9, 9), this.wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, CEILING_Y, 0);
    this.group.add(ceiling);

    // Skirting board, purely so the wall/floor join catches a highlight.
    const skirting = new Mesh(new BoxGeometry(9, 0.09, 0.03), this.trimMaterial);
    skirting.position.set(0, 0.045, WALL_Z + 0.016);
    skirting.castShadow = true;
    this.group.add(skirting);
  }
}

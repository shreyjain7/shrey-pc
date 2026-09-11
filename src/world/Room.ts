import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RectAreaLight,
} from 'three';
import type { Quality } from '../experience/Sizes';
import { posterTexture, rugTexture } from './textures';

const WALL_Z = -1.35;
const WALL_X = 2.2;
const CEILING_Y = 2.7;

/**
 * The box the desk sits in: walls, a shuttered window throwing cold light
 * across the back wall, framed prints, a floating shelf and a rug.
 */
export class Room {
  readonly group = new Group();

  private readonly wall = new MeshStandardMaterial({
    color: 0x2f3140,
    roughness: 0.95,
    metalness: 0,
  });

  private readonly floorMaterial = new MeshStandardMaterial({
    color: 0x1e222a,
    roughness: 0.8,
    metalness: 0.05,
  });

  private readonly trim = new MeshStandardMaterial({ color: 0x15151b, roughness: 0.7 });
  private readonly frame = new MeshStandardMaterial({ color: 0x14161c, roughness: 0.55 });
  private readonly shelfWood = new MeshStandardMaterial({ color: 0x4a3423, roughness: 0.7 });

  /**
   * `studio` swaps the room for a product-shot backdrop: one pale ground plane
   * and nothing else, so the desk reads as an object floating in light rather
   * than furniture in a bedroom. The walls, window, posters and shelf are all
   * skipped — with fog matched to the background they would only appear as a
   * horizon line where there should be none.
   */
  constructor(
    private quality: Quality,
    studio = false,
  ) {
    if (studio) {
      this.buildStudioFloor();
      return;
    }

    this.buildShell();
    this.buildRug();
    this.buildWindow();
    this.buildPosters();
    if (quality !== 'low') this.buildShelf();
  }

  /** A large, soft, pale ground. Its only real job is to catch the shadow. */
  private buildStudioFloor() {
    const floor = new Mesh(
      new PlaneGeometry(40, 40),
      new MeshStandardMaterial({ color: 0xe9e9ec, roughness: 0.94, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private buildShell() {
    const floor = new Mesh(new PlaneGeometry(12, 12), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const back = new Mesh(new PlaneGeometry(9, 6), this.wall);
    back.position.set(0, 2, WALL_Z);
    back.receiveShadow = true;
    this.group.add(back);

    const left = new Mesh(new PlaneGeometry(6, 6), this.wall);
    left.rotation.y = Math.PI / 2;
    left.position.set(-WALL_X, 2, 1);
    left.receiveShadow = true;
    this.group.add(left);

    const right = new Mesh(new PlaneGeometry(6, 6), this.wall);
    right.rotation.y = -Math.PI / 2;
    right.position.set(WALL_X, 2, 1);
    right.receiveShadow = true;
    this.group.add(right);

    const ceiling = new Mesh(new PlaneGeometry(9, 9), this.wall);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, CEILING_Y, 0);
    this.group.add(ceiling);

    // Skirting board, so the wall/floor join catches a highlight.
    const skirting = new Mesh(new BoxGeometry(9, 0.09, 0.03), this.trim);
    skirting.position.set(0, 0.045, WALL_Z + 0.016);
    skirting.castShadow = true;
    this.group.add(skirting);
  }

  private buildRug() {
    const rug = new Mesh(
      new PlaneGeometry(2.6, 1.9),
      new MeshStandardMaterial({ map: rugTexture(), roughness: 1, metalness: 0 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = 0.06;
    // Just off the floor so it never z-fights.
    rug.position.set(0.05, 0.002, 0.35);
    rug.receiveShadow = true;
    this.group.add(rug);
  }

  /**
   * A shuttered window high on the back wall. The blinds are real slats, and a
   * cold RectAreaLight behind them is what actually lights that side of the room.
   */
  private buildWindow() {
    const group = new Group();
    const width = 0.86;
    const height = 1.05;

    const sky = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({ color: 0x121d33 }),
    );
    sky.position.z = -0.02;
    group.add(sky);

    // Distant city lights beyond the glass.
    if (this.quality !== 'low') {
      for (let i = 0; i < 26; i += 1) {
        const light = new Mesh(
          new PlaneGeometry(0.012, 0.008),
          new MeshBasicMaterial({
            color: Math.random() > 0.75 ? 0xffd9a0 : 0x9fc4ff,
            transparent: true,
            opacity: 0.35 + Math.random() * 0.5,
          }),
        );
        light.position.set(
          (Math.random() - 0.5) * width * 0.9,
          -height / 2 + Math.random() * height * 0.55,
          -0.018,
        );
        group.add(light);
      }
    }

    // Horizontal blind slats.
    const slat = new BoxGeometry(width, 0.036, 0.012);
    const slatMaterial = new MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.8 });
    for (let i = 0; i < 13; i += 1) {
      const mesh = new Mesh(slat, slatMaterial);
      mesh.position.set(0, height / 2 - 0.05 - i * 0.078, 0.01);
      mesh.rotation.x = -0.55;
      mesh.castShadow = this.quality === 'high';
      group.add(mesh);
    }

    const jamb = new BoxGeometry(0.045, height + 0.09, 0.055);
    for (const x of [-width / 2 - 0.02, width / 2 + 0.02]) {
      const post = new Mesh(jamb, this.frame);
      post.position.set(x, 0, 0.012);
      group.add(post);
    }
    const head = new BoxGeometry(width + 0.13, 0.045, 0.055);
    for (const y of [height / 2 + 0.022, -height / 2 - 0.022]) {
      const rail = new Mesh(head, this.frame);
      rail.position.set(0, y, 0.012);
      group.add(rail);
    }

    const moon = new RectAreaLight(0x9dbcff, this.quality === 'low' ? 1.6 : 2.6, width, height);
    moon.position.set(0, 0, 0.06);
    moon.lookAt(0, -0.6, 3);
    group.add(moon);

    group.position.set(1.28, 1.72, WALL_Z + 0.03);
    this.group.add(group);
  }

  private buildPosters() {
    const posters = [
      {
        texture: posterTexture({
          background: '#131a26',
          ink: '#e8f1ff',
          accent: '#5fd0ff',
          title: 'ALGORITHMS',
          subtitle: 'sort · search · repeat',
          motif: 'grid' as const,
        }),
        position: [-1.16, 1.82, WALL_Z + 0.025] as const,
        size: 0.5,
      },
      {
        texture: posterTexture({
          background: '#1c1620',
          ink: '#ffeede',
          accent: '#ffb454',
          title: 'MANIPAL',
          subtitle: 'institute of technology',
          motif: 'orbit' as const,
        }),
        position: [0.58, 1.66, WALL_Z + 0.025] as const,
        size: 0.34,
      },
    ];

    for (const poster of posters) {
      const group = new Group();

      const art = new Mesh(
        new PlaneGeometry(poster.size, poster.size),
        new MeshStandardMaterial({ map: poster.texture, roughness: 0.85 }),
      );
      group.add(art);

      const bar = 0.018;
      const half = poster.size / 2 + bar / 2;
      const horizontal = new BoxGeometry(poster.size + bar * 2, bar, 0.02);
      const vertical = new BoxGeometry(bar, poster.size, 0.02);
      for (const y of [half, -half]) {
        const mesh = new Mesh(horizontal, this.frame);
        mesh.position.set(0, y, -0.004);
        group.add(mesh);
      }
      for (const x of [half, -half]) {
        const mesh = new Mesh(vertical, this.frame);
        mesh.position.set(x, 0, -0.004);
        group.add(mesh);
      }

      const [px, py, pz] = poster.position;
      group.position.set(px, py, pz);
      this.group.add(group);
    }
  }

  /** A floating shelf above the desk with a few odds and ends on it. */
  private buildShelf() {
    const group = new Group();

    const board = new Mesh(new BoxGeometry(0.92, 0.028, 0.19), this.shelfWood);
    board.castShadow = true;
    board.receiveShadow = true;
    group.add(board);

    for (const x of [-0.36, 0.36]) {
      const bracket = new Mesh(new BoxGeometry(0.02, 0.09, 0.13), this.frame);
      bracket.position.set(x, -0.058, -0.02);
      group.add(bracket);
    }

    const covers = [0x3f5a68, 0x5a3f4e, 0x46543f, 0x4c4a63];
    covers.forEach((color, index) => {
      const book = new Mesh(
        new BoxGeometry(0.026, 0.15 + (index % 2) * 0.022, 0.115),
        new MeshStandardMaterial({ color, roughness: 0.85 }),
      );
      book.position.set(-0.38 + index * 0.032, 0.09 + (index % 2) * 0.011, 0);
      book.rotation.z = index === 3 ? 0.22 : 0;
      book.castShadow = true;
      group.add(book);
    });

    const pot = new Mesh(
      new BoxGeometry(0.09, 0.075, 0.09),
      new MeshStandardMaterial({ color: 0x7d5b46, roughness: 0.85 }),
    );
    pot.position.set(0.3, 0.052, 0);
    pot.castShadow = true;
    group.add(pot);

    const leaf = new MeshStandardMaterial({ color: 0x4a7c52, roughness: 0.75 });
    for (let i = 0; i < 7; i += 1) {
      const frond = new Mesh(new BoxGeometry(0.014, 0.1 + Math.random() * 0.07, 0.014), leaf);
      frond.position.set(
        0.3 + (Math.random() - 0.5) * 0.06,
        0.12 + Math.random() * 0.04,
        (Math.random() - 0.5) * 0.05,
      );
      frond.rotation.set((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 1.1);
      group.add(frond);
    }

    // Warm bounce so the shelf is not a silhouette.
    const glow = new PointLight(0xffc98a, 0.35, 1.1, 2);
    glow.position.set(0.1, 0.16, 0.16);
    group.add(glow);

    group.position.set(-0.38, 1.2, WALL_Z + 0.1);
    this.group.add(group);
  }
}

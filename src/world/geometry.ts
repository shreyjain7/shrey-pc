import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape, Vector3 } from 'three';

/** A rounded rectangle centred on the origin, for extruding. */
export function roundedRectShape(width: number, height: number, radius: number): Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);

  const shape = new Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

interface ExtrudeOptions {
  depth: number;
  bevel?: number;
  holeWidth?: number;
  holeHeight?: number;
  holeRadius?: number;
}

/**
 * A rounded slab extruded along -Z, optionally with a rounded window cut out of
 * it. Front face lands on z = 0 so callers can position by the front.
 */
export function roundedSlab(
  width: number,
  height: number,
  radius: number,
  options: ExtrudeOptions,
): BufferGeometry {
  const shape = roundedRectShape(width, height, radius);

  if (options.holeWidth && options.holeHeight) {
    shape.holes.push(
      roundedRectShape(options.holeWidth, options.holeHeight, options.holeRadius ?? 0.01),
    );
  }

  const bevel = options.bevel ?? 0;
  const geometry = new ExtrudeGeometry(shape, {
    depth: options.depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });

  // ExtrudeGeometry grows along +Z from the shape plane; flip so the detailed
  // front face is the one pointing at the camera.
  geometry.translate(0, 0, -options.depth);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Squeeze a geometry's X/Y as it recedes along -Z. This is what gives the CRT
 * its funnel-shaped back instead of reading as a plain box.
 */
export function taperAlongZ(geometry: BufferGeometry, backScale: number, depth: number) {
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const z = position.getZ(i);
    // 0 at the front face, 1 at the very back.
    const t = Math.min(Math.max(-z / depth, 0), 1);
    const scale = 1 + (backScale - 1) * t * t;
    position.setX(i, position.getX(i) * scale);
    position.setY(i, position.getY(i) * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* -------------------------------------------------------------------------- */
/* Lofting                                                                     */
/* -------------------------------------------------------------------------- */

export interface LoftOptions {
  /** Close the lowest-z ring with a triangle fan. */
  capStart?: boolean;
  capEnd?: boolean;
  /**
   * Material index for the quad between station `i` and `i + 1` at ring point
   * `j`. This is what lets a single lofted shell carry paint, glass cavities,
   * shut lines and an underbody without being cut into separate meshes.
   */
  group?: (station: number, ringIndex: number) => number;
  capGroup?: number;
}

/**
 * Skin a stack of equally-sampled closed rings into a solid.
 *
 * Rings must be ordered by increasing Z and wound anticlockwise in XY as seen
 * from +Z; the quads are emitted so the result faces outwards. This is the
 * workhorse behind anything whose cross-section changes along its length — a
 * car body being the obvious one.
 */
export function loftSections(rings: Vector3[][], options: LoftOptions = {}): BufferGeometry {
  const stations = rings.length;
  const size = rings[0].length;
  const positions: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const point = rings[i][j];
      positions.push(point.x, point.y, point.z);
      uvs.push(j / (size - 1), i / (stations - 1));
    }
  }

  // Triangles are bucketed by material so the shell stays a single mesh.
  const buckets = new Map<number, number[]>();
  const face = (material: number, a: number, b: number, c: number) => {
    let bucket = buckets.get(material);
    if (!bucket) buckets.set(material, (bucket = []));
    bucket.push(a, b, c);
  };

  for (let i = 0; i < stations - 1; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const next = (j + 1) % size;
      const a = i * size + j;
      const aNext = i * size + next;
      const b = (i + 1) * size + j;
      const bNext = (i + 1) * size + next;
      const material = options.group?.(i, j) ?? 0;
      face(material, a, bNext, b);
      face(material, a, aNext, bNext);
    }
  }

  const capMaterial = options.capGroup ?? 0;
  const cap = (station: number, front: boolean) => {
    const centre = new Vector3();
    for (const point of rings[station]) centre.add(point);
    centre.multiplyScalar(1 / size);

    const hub = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    uvs.push(0.5, front ? 1 : 0);

    for (let j = 0; j < size; j += 1) {
      const a = station * size + j;
      const b = station * size + ((j + 1) % size);
      if (front) face(capMaterial, hub, a, b);
      else face(capMaterial, hub, b, a);
    }
  };

  if (options.capStart) cap(0, false);
  if (options.capEnd) cap(stations - 1, true);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));

  const indices: number[] = [];
  for (const [material, bucket] of [...buckets].sort((a, b) => a[0] - b[0])) {
    geometry.addGroup(indices.length, bucket.length, material);
    for (const index of bucket) indices.push(index);
  }

  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Skin a *slice* of the same rings into an open strip, pushed `offset` metres
 * out along the section's own outward direction.
 *
 * Because it reuses the rings the body was lofted from, a pane built this way
 * sits exactly on the surface it belongs to: glass follows the tumblehome, a
 * chrome trim follows the shoulder line, without any of them being modelled
 * twice.
 */
export function loftBand(
  rings: Vector3[][],
  from: number,
  to: number,
  offset = 0,
): BufferGeometry {
  const stations = rings.length;
  const span = to - from + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const centre = new Vector3();
  const outward = new Vector3();

  for (let i = 0; i < stations; i += 1) {
    const ring = rings[i];
    centre.set(0, 0, 0);
    for (const point of ring) centre.add(point);
    centre.multiplyScalar(1 / ring.length);

    for (let k = 0; k < span; k += 1) {
      const point = ring[from + k];
      outward.set(point.x - centre.x, point.y - centre.y, 0);
      if (outward.lengthSq() < 1e-8) outward.set(0, 1, 0);
      outward.normalize().multiplyScalar(offset);
      positions.push(point.x + outward.x, point.y + outward.y, point.z);
      uvs.push(k / Math.max(span - 1, 1), i / Math.max(stations - 1, 1));
    }
  }

  for (let i = 0; i < stations - 1; i += 1) {
    for (let k = 0; k < span - 1; k += 1) {
      const a = i * span + k;
      const aNext = i * span + k + 1;
      const b = (i + 1) * span + k;
      const bNext = (i + 1) * span + k + 1;
      indices.push(a, bNext, b, a, aNext, bNext);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

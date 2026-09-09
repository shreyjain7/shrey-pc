import { BufferGeometry, ExtrudeGeometry, Shape } from 'three';

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

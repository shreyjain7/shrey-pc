import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
} from 'three';
import type { Quality } from '../experience/Sizes';

/**
 * Dust drifting through the lamp light. Cheap, but it does more for the sense
 * of a real room than any amount of extra geometry.
 */
export class Dust {
  readonly points: Points;

  private readonly velocities: Float32Array;
  private readonly count: number;
  private readonly bounds = { x: 2.2, y: 1.9, z: 1.6 };

  constructor(quality: Quality) {
    this.count = quality === 'high' ? 320 : quality === 'medium' ? 180 : 90;

    const positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * this.bounds.x * 2;
      positions[i * 3 + 1] = 0.35 + Math.random() * this.bounds.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.bounds.z * 2;

      // Slow, mostly upward drift with a little lateral wander.
      this.velocities[i * 3] = (Math.random() - 0.5) * 0.012;
      this.velocities[i * 3 + 1] = 0.004 + Math.random() * 0.012;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: 0xffd9b0,
        size: 0.006,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.38,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
  }

  update(delta: number, elapsed: number) {
    const positions = this.points.geometry.attributes.position as BufferAttribute;
    const array = positions.array as Float32Array;

    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3;
      // A shared sine gives the whole cloud a lazy convection current.
      array[i3] += (this.velocities[i3] + Math.sin(elapsed * 0.3 + i) * 0.004) * delta;
      array[i3 + 1] += this.velocities[i3 + 1] * delta;
      array[i3 + 2] += (this.velocities[i3 + 2] + Math.cos(elapsed * 0.24 + i) * 0.004) * delta;

      // Recycle motes out of the top back to the floor.
      if (array[i3 + 1] > 0.35 + this.bounds.y) {
        array[i3] = (Math.random() - 0.5) * this.bounds.x * 2;
        array[i3 + 1] = 0.35;
        array[i3 + 2] = (Math.random() - 0.5) * this.bounds.z * 2;
      }
    }

    positions.needsUpdate = true;
  }
}

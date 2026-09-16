import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * Every texture in the scene is drawn to a canvas at load time. Nothing is
 * fetched, so the whole site stays a single JS bundle with no image payload.
 */

function canvas(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d');
  if (ctx) draw(ctx, size);
  return element;
}

/**
 * Dust, fingerprints and cleaning-cloth swirls on the CRT glass. Used as an
 * alpha/roughness break-up so the glass never reads as a perfect plane.
 */
export function smudgeTexture(): Texture {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Broad cloth swirls.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 40 + Math.random() * 130;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,0.09)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // A few sharper fingerprint smears near the lower half.
    for (let i = 0; i < 5; i += 1) {
      const x = Math.random() * size;
      const y = size * 0.5 + Math.random() * size * 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + Math.random() * 16, 14 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Fine dust.
    for (let i = 0; i < 700; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
  });

  const texture = new CanvasTexture(element);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** Soft radial falloff, used to darken the corners of the tube. */
export function vignetteTexture(): Texture {
  const element = canvas(256, (ctx, size) => {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.2,
      size / 2,
      size / 2,
      size * 0.62,
    );
    // Black centre, white rim: used as an alphaMap, so luminance is the mask.
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The soft dark pool an object casts where it meets a surface.
 *
 * A shadow map catches the big cast shadow across the room but loses the tight
 * darkening right under a thing, which is most of what tells you it is resting
 * on the desk rather than hovering a millimetre above it. This is that
 * darkening, painted: opaque at the centre, gone by the rim.
 */
export function contactShadowTexture(): Texture {
  const element = canvas(128, (ctx, size) => {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    // Held near full for the first third, so the core reads as contact rather
    // than as a soft blob with no centre.
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.34, 'rgba(255,255,255,0.82)');
    gradient.addColorStop(0.68, 'rgba(255,255,255,0.26)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The studio floor's falloff.
 *
 * A seamless backdrop has no horizon and no edges — the ground simply runs out
 * of light. This is that: bright where the key lands, darkening away in every
 * direction, so the plane's rim never announces itself as a rim. Multiplied
 * onto the floor material, so it shades rather than tints.
 */
export function studioFloorTexture(): Texture {
  const element = canvas(512, (ctx, size) => {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size * 0.44,
      size * 0.04,
      size / 2,
      size * 0.44,
      size * 0.52,
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.38, '#f2f2f3');
    gradient.addColorStop(0.72, '#c9c9cd');
    gradient.addColorStop(1, '#9d9da3');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Brushed leather: fine grain plus a few broad creases, used as a roughness
 * break-up on the chair so its cushions are not two flat brown boxes.
 */
export function leatherTexture(): Texture {
  const element = canvas(256, (ctx, size) => {
    ctx.fillStyle = '#7f7f7f';
    ctx.fillRect(0, 0, size, size);

    // Grain.
    const grain = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < grain.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      grain.data[i] += n;
      grain.data[i + 1] += n;
      grain.data[i + 2] += n;
    }
    ctx.putImageData(grain, 0, 0);

    // Creases, which is what actually reads at this distance.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      const y = Math.random() * size;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        size * 0.3,
        y + (Math.random() - 0.5) * 40,
        size * 0.7,
        y + (Math.random() - 0.5) * 40,
        size,
        y + (Math.random() - 0.5) * 20,
      );
      ctx.stroke();
    }
  });

  const texture = new CanvasTexture(element);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * A split monstera leaf, drawn as a silhouette.
 *
 * Leaves are the one thing in the scene that cannot be made of boxes — the
 * shape *is* the plant. So each one is a single double-sided plane wearing
 * this as an alpha mask: a lobed outline with the characteristic slits cut in
 * from the rim, plus a midrib and veins painted into the colour. Twenty of
 * these cost one texture and twenty quads.
 */
export function leafTexture(): Texture {
  const element = canvas(256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const tip = size * 0.06;
    const base = size * 0.96;
    const halfWidth = size * 0.31;

    // The blade: two mirrored bezier sweeps from stem to tip.
    ctx.beginPath();
    ctx.moveTo(cx, base);
    ctx.bezierCurveTo(cx + halfWidth, base - size * 0.2, cx + halfWidth, tip + size * 0.26, cx, tip);
    ctx.bezierCurveTo(cx - halfWidth, tip + size * 0.26, cx - halfWidth, base - size * 0.2, cx, base);
    ctx.closePath();
    ctx.fillStyle = '#3f7a35';
    ctx.fill();

    // Midrib and veins, a shade lighter so they catch as the leaf turns.
    ctx.strokeStyle = 'rgba(150, 196, 120, 0.55)';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.moveTo(cx, base);
    ctx.lineTo(cx, tip + size * 0.02);
    ctx.stroke();

    ctx.lineWidth = size * 0.007;
    for (let i = 1; i <= 6; i += 1) {
      const t = i / 7;
      const y = base - (base - tip) * t;
      const reach = halfWidth * Math.sin(t * Math.PI) * 0.92;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.quadraticCurveTo(cx + side * reach * 0.6, y - size * 0.03, cx + side * reach, y - size * 0.07);
        ctx.stroke();
      }
    }

    // The slits. Cut in from each edge toward the midrib, stopping short of it.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineWidth = size * 0.035;
    for (let i = 1; i <= 5; i += 1) {
      const t = i / 6;
      const y = base - (base - tip) * t;
      const reach = halfWidth * Math.sin(t * Math.PI);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * (reach + size * 0.02), y - size * 0.05);
        ctx.lineTo(cx + side * size * 0.045, y + size * 0.015);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The studio's backdrop, as a vertical gradient.
 *
 * Painted onto a dome around the whole scene rather than set as
 * `scene.background`, which would make the canvas opaque and bury the CSS3D
 * layer the screen lives in. A dome is ordinary geometry, so the depth-only
 * plane on the glass rejects it exactly the way it rejected the old room's
 * walls. Its horizon stop is also the fog colour, which is what lets the
 * ground run out of light instead of running out of geometry.
 */
export function backdropTexture(): Texture {
  const element = canvas(64, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    // v runs zenith (0) to nadir (1), so the horizon is the equator at 0.5.
    // Everything from just above it down is held at one flat colour — the fog
    // colour — so wherever the ground's far rim actually lands, it lands on
    // its own shade and the join cannot be seen.
    gradient.addColorStop(0, '#c6c6cc'); // a soft darkening overhead
    gradient.addColorStop(0.3, '#dedee2'); // the bright band behind the desk
    gradient.addColorStop(0.44, '#cfcfd4');
    gradient.addColorStop(1, '#cfcfd4'); // horizon — must equal STUDIO_FAR
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

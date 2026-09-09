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

/** Brushed-plastic speckle for the monitor and keyboard shells. */
export function plasticTexture(): Texture {
  const element = canvas(256, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 24000; i += 1) {
      const shade = 118 + Math.random() * 24;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
  });

  const texture = new CanvasTexture(element);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

/** Straight-grained wood for the desk top. */
export function woodTexture(): Texture {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = '#6b4a30';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 150; i += 1) {
      const y = Math.random() * size;
      const shade = Math.random() > 0.5 ? 255 : 0;
      ctx.strokeStyle = `rgba(${shade},${shade * 0.7},${shade * 0.4},${0.02 + Math.random() * 0.05})`;
      ctx.lineWidth = 0.6 + Math.random() * 3.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      // Gentle waver so the grain is not perfectly straight.
      for (let x = 0; x <= size; x += 32) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
      }
      ctx.stroke();
    }

    // A couple of knots.
    for (let i = 0; i < 3; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      for (let r = 3; r < 22; r += 3) {
        ctx.strokeStyle = `rgba(40,22,10,${0.16 - r * 0.005})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.6, 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** Flat-weave carpet for the rug under the desk. */
export function rugTexture(): Texture {
  const element = canvas(256, (ctx, size) => {
    ctx.fillStyle = '#2c2f3d';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 1);
    }

    // Border stripes.
    ctx.strokeStyle = 'rgba(190,150,110,0.5)';
    ctx.lineWidth = 5;
    ctx.strokeRect(16, 16, size - 32, size - 32);
    ctx.strokeStyle = 'rgba(190,150,110,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, size - 56, size - 56);
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface PosterOptions {
  background: string;
  ink: string;
  accent: string;
  title: string;
  subtitle: string;
  /** 'grid' | 'orbit' | 'bars' — the abstract graphic filling the poster. */
  motif: 'grid' | 'orbit' | 'bars';
}

/** Framed prints for the wall, so it is not a blank plane behind the desk. */
export function posterTexture(options: PosterOptions): Texture {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size * 0.44);

    if (options.motif === 'grid') {
      ctx.strokeStyle = options.accent;
      ctx.lineWidth = 2;
      // A perspective grid receding to a horizon.
      for (let i = -6; i <= 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 26, 120);
        ctx.lineTo(i * 7, -60);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i += 1) {
        const y = -60 + i * i * 3.6;
        ctx.globalAlpha = 1 - i / 9;
        ctx.beginPath();
        ctx.moveTo(-170, y);
        ctx.lineTo(170, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (options.motif === 'orbit') {
      ctx.strokeStyle = options.accent;
      ctx.lineWidth = 2.5;
      for (let i = 1; i <= 4; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, i * 34, i * 34 * 0.42, i * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = options.accent;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = options.accent;
      const heights = [40, 96, 62, 140, 84, 116, 54];
      heights.forEach((height, index) => {
        ctx.globalAlpha = 0.45 + (index % 3) * 0.22;
        ctx.fillRect(-160 + index * 46, 110 - height, 30, height);
      });
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    ctx.fillStyle = options.ink;
    ctx.textAlign = 'center';
    ctx.font = '600 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(options.title, size / 2, size * 0.79);
    ctx.font = '400 18px "Segoe UI", system-ui, sans-serif';
    ctx.globalAlpha = 0.65;
    ctx.fillText(options.subtitle, size / 2, size * 0.85);
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Handwriting-ish scribbles for the sticky notes. */
export function stickyNoteTexture(color: string): Texture {
  const element = canvas(128, (ctx, size) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(60,50,30,0.45)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 5; i += 1) {
      const y = 26 + i * 18;
      ctx.beginPath();
      ctx.moveTo(16, y);
      // Ragged right edge so it reads as writing, not ruled lines.
      ctx.lineTo(16 + 40 + Math.random() * 55, y + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
  });

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

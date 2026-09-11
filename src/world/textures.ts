import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

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

/* -------------------------------------------------------------------------- */
/* The car                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An Indian high-security registration plate.
 *
 * 500x120mm at 1:1, so the aspect ratio is the real one: a blue IND band with
 * the chakra hologram on the left, a hot-stamped code bottom right, and the
 * registration itself grouped the way it is actually read out.
 */
export function numberPlateTexture(registration: string): Texture {
  const width = 1000;
  const height = 240;

  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');

  if (ctx) {
    // Retroreflective white, slightly cooler at the top like the real film.
    const sheen = ctx.createLinearGradient(0, 0, 0, height);
    sheen.addColorStop(0, '#f7f8f4');
    sheen.addColorStop(0.55, '#eceee7');
    sheen.addColorStop(1, '#dcdfd6');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);

    // The blue band: IND over the chakra hologram.
    const band = 78;
    ctx.fillStyle = '#0b3aa0';
    ctx.fillRect(0, 0, band, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IND', band / 2, height - 44);

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(band / 2, 62, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(band / 2, 62);
      ctx.lineTo(band / 2 + Math.cos(angle) * 22, 62 + Math.sin(angle) * 22);
      ctx.stroke();
    }

    // Embossed border.
    ctx.strokeStyle = '#12141a';
    ctx.lineWidth = 9;
    ctx.strokeRect(4.5, 4.5, width - 9, height - 9);

    // "CH01BX8725" reads as "CH 01 BX 8725" on the plate itself.
    const grouped = registration
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/, '$1 $2 $3 $4');

    ctx.fillStyle = '#0c0e13';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 148;
    do {
      ctx.font = `700 ${size}px "Arial Narrow", "Haettenschweiler", Impact, Arial, sans-serif`;
      size -= 4;
    } while (ctx.measureText(grouped).width > width - band - 56 && size > 60);
    ctx.fillText(grouped, band + (width - band) / 2, height / 2 - 4);

    // Hot-stamped laser code, as required under the HSRP rules.
    ctx.fillStyle = 'rgba(20,22,28,0.55)';
    ctx.font = '600 22px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('IND · 0102CH', width - 22, height - 24);
  }

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Directional tread for the tyres — tiles around the circumference. */
export function treadTexture(): Texture {
  const element = canvas(256, (ctx, size) => {
    ctx.fillStyle = '#1a1a1d';
    ctx.fillRect(0, 0, size, size);

    // Three circumferential grooves (vertical here — u runs around the tyre).
    ctx.fillStyle = '#0a0a0c';
    for (const x of [size * 0.3, size * 0.5, size * 0.7]) {
      ctx.fillRect(x - size * 0.022, 0, size * 0.044, size);
    }

    // Angled sipes in each shoulder block.
    ctx.strokeStyle = '#0b0b0d';
    ctx.lineWidth = size * 0.02;
    for (let i = 0; i < 22; i += 1) {
      const y = (i / 22) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size * 0.28, y + size * 0.05);
      ctx.moveTo(size * 0.72, y + size * 0.05);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    // A little wear so the rubber is not a flat colour.
    for (let i = 0; i < 4000; i += 1) {
      const shade = 22 + Math.random() * 22;
      ctx.fillStyle = `rgba(${shade},${shade},${shade + 2},0.5)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });

  const texture = new CanvasTexture(element);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 26);
  return texture;
}

/** Chrome lettering on transparent film, for the badges on the tailgate. */
export function badgeTexture(text: string, weight = 700): Texture {
  const width = 512;
  const height = 128;

  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let size = 92;
    do {
      ctx.font = `${weight} ${size}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
      size -= 3;
    } while (ctx.measureText(text).width > width - 24 && size > 20);

    // Two passes: a dark drop underneath, bright metal on top, so the letters
    // still read as raised once a metallic material flattens the midtones.
    ctx.fillStyle = 'rgba(8,10,14,0.7)';
    ctx.fillText(text, width / 2, height / 2 + 3);
    ctx.fillStyle = '#f4f7fb';
    ctx.fillText(text, width / 2, height / 2);
  }

  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A photographic studio as an equirectangular canvas: a long overhead softbox,
 * two side boxes and a dark floor.
 *
 * Assigned to `scene.environment`, this is what gives the paint its rolling
 * highlight and the chrome something to reflect. three.js runs it through
 * PMREM for us, so a 1024x512 canvas is enough.
 */
export function studioEnvTexture(): Texture {
  const width = 1024;
  const height = 512;

  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');

  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#cfd8e4');
    sky.addColorStop(0.42, '#78838f');
    sky.addColorStop(0.5, '#3c4148');
    sky.addColorStop(0.52, '#191c21');
    sky.addColorStop(1, '#0b0d10');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const box = (x: number, y: number, w: number, h: number, strength: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
      gradient.addColorStop(0, `rgba(255,255,255,${strength})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - w, y - h, w * 2, h * 2);
    };

    // The overhead strip — the highlight that runs the length of the roof.
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, height * 0.03, width, height * 0.05);
    box(width * 0.5, height * 0.06, width * 0.6, height * 0.14, 0.55);

    // Two key boxes either side, and a soft fill behind.
    box(width * 0.22, height * 0.3, 150, 110, 0.95);
    box(width * 0.74, height * 0.28, 130, 96, 0.8);
    box(width * 0.98, height * 0.36, 120, 90, 0.35);

    // A dim bounce off the floor keeps the sills from going solid black.
    box(width * 0.5, height * 0.72, 420, 120, 0.1);
  }

  const texture = new CanvasTexture(element);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

import { fs, HOME, join } from '../fs';
import { notify } from '../Notifications';
import { openApp, registerOpener, screenRoot } from '../system';
import { askForName, el } from '../ui';

const PALETTE = [
  '#f2f5fa', '#5fd0ff', '#6ee7a8', '#ffb454',
  '#ff8fa3', '#b18cff', '#4a5568', '#0b1017',
];

interface Instance {
  load: (path: string) => void;
}

let instance: Instance | null = null;

export function paint(path: string) {
  if (!instance) openApp('paint');
  instance?.load(path);
}

/** A small raster editor. Saves a PNG data URL into the filesystem. */
export function createPaint(): HTMLElement {
  const root = el('div', 'paint');

  const WIDTH = 520;
  const HEIGHT = 340;

  let colour = PALETTE[1];
  let size = 4;
  let erasing = false;
  let drawing = false;
  let last: { x: number; y: number } | null = null;
  let path: string | null = null;

  const bar = el('div', 'paint__bar');

  const swatches = el('div', 'paint__swatches');
  for (const value of PALETTE) {
    const swatch = el('button', 'paint__swatch');
    swatch.type = 'button';
    swatch.style.background = value;
    swatch.title = value;
    swatch.addEventListener('click', () => {
      colour = value;
      erasing = false;
      syncTools();
    });
    swatches.append(swatch);
  }

  const sizeInput = el('input', 'paint__size');
  sizeInput.type = 'range';
  sizeInput.min = '1';
  sizeInput.max = '28';
  sizeInput.value = String(size);
  sizeInput.title = 'Brush size';

  const eraser = el('button', 'paint__button', 'Eraser');
  eraser.type = 'button';
  const clear = el('button', 'paint__button', 'Clear');
  clear.type = 'button';
  const save = el('button', 'paint__button paint__button--primary', 'Save');
  save.type = 'button';

  bar.append(swatches, sizeInput, eraser, clear, save);

  const canvas = el('canvas', 'paint__canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const stage = el('div', 'paint__stage');
  stage.append(canvas);

  const status = el('div', 'paint__status', 'Draw with the mouse or a finger.');
  root.append(bar, stage, status);

  const ctx = canvas.getContext('2d');

  function fill() {
    if (!ctx) return;
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function syncTools() {
    eraser.classList.toggle('is-active', erasing);
    for (const node of swatches.children) {
      const swatch = node as HTMLElement;
      swatch.classList.toggle('is-active', !erasing && swatch.title === colour);
    }
    status.textContent = (erasing ? 'Eraser' : 'Brush ' + colour) + ' · ' + size + 'px';
  }

  /** Canvas pixels from a pointer event, correcting for any CSS scaling. */
  function point(event: PointerEvent) {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    };
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    if (!ctx) return;
    ctx.strokeStyle = erasing ? '#12161d' : colour;
    ctx.lineWidth = erasing ? size * 2.2 : size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    drawing = true;
    last = point(event);
    // A tap with no movement should still leave a dot.
    stroke(last, { x: last.x + 0.01, y: last.y });
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || !last) return;
    const next = point(event);
    stroke(last, next);
    last = next;
  });

  const stop = (event: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    last = null;
    canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  sizeInput.addEventListener('input', () => {
    size = Number(sizeInput.value);
    syncTools();
  });

  eraser.addEventListener('click', () => {
    erasing = !erasing;
    syncTools();
  });

  clear.addEventListener('click', () => {
    fill();
    status.textContent = 'Cleared.';
  });

  save.addEventListener('click', () => {
    const data = canvas.toDataURL('image/png');
    const suggest = path
      ? path.slice(path.lastIndexOf('/') + 1)
      : fs.uniqueName(join(HOME, 'Pictures'), 'drawing', '.png');

    askForName(screenRoot(), 'Save drawing', suggest, (value) => {
      const target = join(HOME, 'Pictures', value);
      if (fs.write(target, data, 'paint')) {
        path = target;
        notify('Saved', target);
      } else {
        notify('Could not save', value);
      }
    });
  });

  function load(next: string) {
    const data = fs.read(next);
    if (!data || !ctx) return;
    const image = new Image();
    image.onload = () => {
      fill();
      ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
    };
    image.src = data;
    path = next;
    status.textContent = next;
  }

  instance = { load };
  root.addEventListener('app:destroy', () => {
    instance = null;
  });

  fill();
  syncTools();
  return root;
}

registerOpener('paint', (path) => paint(path));

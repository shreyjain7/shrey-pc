import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { AudiQ5, PAINTS, Q5, Q5_SPEC } from '../../world/AudiQ5';
import { studioEnvTexture } from '../../world/textures';
import { telemetry } from '../../world/telemetry';
import { ticker } from '../anim';
import { notify } from '../Notifications';
import { sceneQuality } from '../system';
import { button, el } from '../ui';

/**
 * Garage — a turntable for the car.
 *
 * A second, self-contained three.js scene living inside an OS window: its own
 * renderer, its own studio lighting rig and its own environment map, so
 * nothing here touches the room the desk is in. The car itself is built by
 * `src/world/AudiQ5.ts` and is the only thing in the scene besides a floor.
 *
 * Drag to orbit, wheel to dolly, or take one of the four fixed shots. The
 * export button runs the same object graph through three's glTF exporter, so
 * the model leaves here as a `.glb` that opens in Blender.
 */

interface Shot {
  id: string;
  label: string;
  azimuth: number;
  elevation: number;
  distance: number;
}

/** Azimuth is measured from dead ahead of the car, turning to its right. */
const SHOTS: Shot[] = [
  { id: 'hero', label: 'Front ¾', azimuth: 0.62, elevation: 0.21, distance: 9.4 },
  { id: 'side', label: 'Side', azimuth: Math.PI / 2, elevation: 0.07, distance: 9.8 },
  { id: 'rear', label: 'Rear ¾', azimuth: Math.PI - 0.68, elevation: 0.2, distance: 9.4 },
  { id: 'top', label: 'Plan', azimuth: 0.5, elevation: 1.16, distance: 10.2 },
];

const TARGET = new Vector3(0, 0.86, 0);

export function createGarage(): HTMLElement {
  const root = el('div', 'garage');
  const layout = el('div', 'garage__layout');

  /* --- Stage ------------------------------------------------------------ */

  const stage = el('section', 'garage__stage');
  const canvas = el('canvas', 'garage__canvas');
  stage.append(canvas);

  const hud = el('div', 'garage__hud');
  hud.append(el('span', 'garage__hud-model', Q5.model));
  hud.append(el('span', 'garage__hud-year', String(Q5.year)));
  stage.append(hud);

  const plate = el('div', 'garage__plate');
  plate.append(el('span', 'garage__plate-band', 'IND'));
  plate.append(el('span', 'garage__plate-text', 'CH 01 BX 8725'));
  stage.append(plate);

  const hint = el('p', 'garage__hint', 'Drag to orbit · scroll to zoom');
  stage.append(hint);

  /* --- Panel ------------------------------------------------------------ */

  const panel = el('section', 'garage__panel');
  // Three fixed slots, so the spec sheet still reads on a device that would
  // not give us a renderer to fill the controls with.
  const controls = el('div', 'garage__controls');
  const sheet = el('div', 'garage__sheet');
  const footer = el('div', 'garage__footer');
  panel.append(controls, sheet, footer);

  sheet.append(el('h3', 'garage__heading', 'Specification'));
  const specs = el('dl', 'garage__specs');
  for (const [label, value] of Q5_SPEC) {
    specs.append(el('dt', 'garage__spec-label', label));
    specs.append(el('dd', 'garage__spec-value', value));
  }
  sheet.append(specs);

  let renderer: WebGLRenderer | null = null;
  let car: AudiQ5 | null = null;
  let stop = () => {};

  try {
    renderer = new WebGLRenderer({ canvas, antialias: sceneQuality() === 'high', alpha: false });
  } catch {
    // Some devices refuse a third WebGL context. Say so instead of showing a
    // black rectangle and pretending.
    stage.append(el('p', 'garage__fallback', 'This device would not open another 3D view.'));
  }

  const quality = sceneQuality();

  if (renderer) {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setClearColor(0x0b0d11, 1);

    const scene = new Scene();
    scene.background = new Color(0x0b0d11);

    const environment = studioEnvTexture();
    scene.environment = environment;

    car = new AudiQ5(quality);
    const pivot = new Group();
    pivot.add(car.group);
    scene.add(pivot);

    /* --- Floor: a disc that fades into the background ------------------- */

    const floor = new Mesh(
      new CircleGeometry(11, 64),
      new MeshStandardMaterial({ color: 0x101318, roughness: 0.55, metalness: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    /* --- Lighting rig --------------------------------------------------- */

    scene.add(new HemisphereLight(0x9fb4d0, 0x0c0f14, 0.9));

    const key = new DirectionalLight(0xf2f6ff, 2.2);
    key.position.set(4.2, 6.4, 5.2);
    key.castShadow = quality !== 'low';
    key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 22;
    key.shadow.camera.left = -4.5;
    key.shadow.camera.right = 4.5;
    key.shadow.camera.top = 4.5;
    key.shadow.camera.bottom = -4.5;
    key.shadow.bias = -0.0009;
    scene.add(key);

    const fill = new DirectionalLight(0x9fc0ff, 0.85);
    fill.position.set(-5.4, 3.2, -3.6);
    scene.add(fill);

    const rim = new DirectionalLight(0xffe6c4, 1.1);
    rim.position.set(-2.4, 2.2, -6.2);
    scene.add(rim);

    /* --- Camera --------------------------------------------------------- */

    const camera = new PerspectiveCamera(32, 1.6, 0.1, 60);

    const shot = { ...SHOTS[0] };
    const current = { azimuth: SHOTS[0].azimuth - 0.5, elevation: 0.32, distance: 13 };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let turntable = !reduced;
    let dragging = false;
    let idle = 0;

    const place = () => {
      const { azimuth, elevation, distance } = current;
      camera.position.set(
        TARGET.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
        TARGET.y + Math.sin(elevation) * distance,
        TARGET.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
      camera.lookAt(TARGET);
    };

    /* --- Input ---------------------------------------------------------- */

    let last = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      idle = 0;
      last = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      // The canvas is projected onto the CRT, so a pointer delta in page
      // pixels is larger than the delta the user sees. Rate is tuned against
      // the element's own box rather than the window's.
      const scale = 340 / Math.max(canvas.clientWidth, 1);
      shot.azimuth -= (event.clientX - last.x) * 0.0075 * scale;
      shot.elevation += (event.clientY - last.y) * 0.005 * scale;
      shot.elevation = Math.min(Math.max(shot.elevation, -0.12), 1.32);
      current.azimuth = shot.azimuth;
      current.elevation = shot.elevation;
      last = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove('is-dragging');
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      shot.distance = Math.min(Math.max(shot.distance + event.deltaY * 0.006, 5.2), 16);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    /* --- Controls ------------------------------------------------------- */

    controls.append(el('h3', 'garage__heading', 'Shot'));
    const shots = el('div', 'garage__shots');
    const shotButtons = SHOTS.map((preset) => {
      const node = button(preset.label, 'garage__chip', () => {
        shot.azimuth = preset.azimuth;
        shot.elevation = preset.elevation;
        shot.distance = preset.distance;
        for (const other of shotButtons) other.classList.remove('is-active');
        node.classList.add('is-active');
      });
      shots.append(node);
      return node;
    });
    shotButtons[0].classList.add('is-active');
    controls.append(shots);

    controls.append(el('h3', 'garage__heading', 'Paint'));
    const swatches = el('div', 'garage__swatches');
    const swatchNodes = PAINTS.map((option, index) => {
      const node = el('button', 'garage__swatch');
      node.type = 'button';
      node.title = option.name;
      node.setAttribute('aria-label', option.name);
      node.style.setProperty('--paint', '#' + option.colour.toString(16).padStart(6, '0'));
      node.addEventListener('click', () => {
        car?.setPaint(option.colour, option.metallic);
        paintName.textContent = option.name;
        for (const other of swatchNodes) other.classList.remove('is-active');
        node.classList.add('is-active');
      });
      swatches.append(node);
      if (index === 1) node.classList.add('is-active');
      return node;
    });
    controls.append(swatches);

    const paintName = el('p', 'garage__paint-name', PAINTS[1].name);
    controls.append(paintName);

    const toggles = el('div', 'garage__toggles');
    const lightsButton = button('Headlights', 'garage__toggle', () => {
      car?.setLights(!car.lit);
      lightsButton.classList.toggle('is-on', car?.lit ?? false);
    });
    const turntableButton = button('Turntable', 'garage__toggle', () => {
      turntable = !turntable;
      turntableButton.classList.toggle('is-on', turntable);
    });
    turntableButton.classList.toggle('is-on', turntable);
    toggles.append(lightsButton, turntableButton);
    controls.append(toggles);

    const exportButton = button('Export .glb', 'garage__export', async () => {
      exportButton.disabled = true;
      exportButton.textContent = 'Exporting…';

      // Loaded on demand: most visitors never press this, and the exporter is
      // dead weight in the initial bundle if they do not.
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

      new GLTFExporter().parse(
        car!.group,
        (result) => {
          const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'audi-q5-2019-tdi-' + Q5.registration.toLowerCase() + '.glb';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);

          exportButton.disabled = false;
          exportButton.textContent = 'Export .glb';
          notify('Garage', 'Saved ' + link.download);
        },
        () => {
          exportButton.disabled = false;
          exportButton.textContent = 'Export .glb';
          notify('Garage', 'The export failed.');
        },
        { binary: true },
      );
    });
    footer.append(exportButton);

    footer.append(
      el(
        'p',
        'garage__note',
        'Built procedurally from three.js primitives — no model file, no textures fetched. ' +
          'The body is one lofted shell of ' +
          (quality === 'high' ? '132' : quality === 'medium' ? '96' : '68') +
          ' cross-sections.',
      ),
    );

    /* --- Loop ----------------------------------------------------------- */

    let clock = 0;
    // The window manager mounts this element *after* the app builds it, so the
    // canvas is still detached on the first frame or two. Only a canvas that
    // has been in the document and has since left means the window closed.
    let mounted = false;

    stop = ticker((delta) => {
      if (canvas.isConnected) mounted = true;
      else if (mounted) return false;
      else return true;

      const cap = quality === 'high' ? 1 / 60 : 1 / 30;
      clock += delta;
      if (clock < cap) return true;
      const step = clock;
      clock = 0;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 8 || height < 8) return true;

      const ratio = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        renderer!.setPixelRatio(ratio);
        renderer!.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      // The turntable only takes over once the pointer has been still for a
      // moment, so it never fights a drag that is still settling.
      idle = dragging ? 0 : idle + step;
      if (turntable && idle > 1.2) shot.azimuth += step * 0.22;

      const ease = 1 - Math.pow(0.0016, step);
      current.azimuth += (shot.azimuth - current.azimuth) * ease;
      current.elevation += (shot.elevation - current.elevation) * ease;
      current.distance += (shot.distance - current.distance) * ease;
      place();

      renderer!.render(scene, camera);
      return true;
    });

    place();

    root.addEventListener('app:destroy', () => {
      stop();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);

      car?.dispose();
      floor.geometry.dispose();
      (floor.material as MeshStandardMaterial).dispose();
      environment.dispose();
      renderer?.dispose();
    });
  }

  layout.append(stage, panel);
  root.append(layout);

  // A second scene is real GPU work; say so on the bus so the fans in the room
  // react to this window being open. Released here rather than alongside the
  // renderer, so a device that refused the context does not leave the bus
  // holding a load that never lands.
  telemetry.setGpuLoad(0.55);
  telemetry.process(0.6);
  root.addEventListener('app:destroy', () => telemetry.setGpuLoad(0));

  return root;
}

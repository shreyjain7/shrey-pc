import {
  ACESFilmicToneMapping,
  Matrix4,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { PX_TO_M } from '../world/layout';
import type { Camera } from './Camera';
import type { Sizes } from './Sizes';


/**
 * Two renderers, one camera.
 *
 * The CSS3D layer sits *behind* the WebGL canvas and holds the real, live DOM
 * of the operating system. The canvas is cleared to transparent, and an
 * invisible depth-only plane sitting exactly on the CRT glass stops the room
 * geometry from painting over that region — so the DOM shows through the hole
 * while anything in front of the glass still occludes it correctly.
 */
export class Renderer {
  readonly webgl: WebGLRenderer;
  readonly css: CSS3DRenderer;

  /** The room camera, re-expressed in the CSS pass's pixel units. */
  private readonly cssCamera = new PerspectiveCamera();
  private readonly cssScale = new Matrix4();
  private cssObjects: CSS3DObject[] = [];
  private readonly saved: Matrix4[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    cssTarget: HTMLElement,
    private scene: Scene,
    private camera: Camera,
    private sizes: Sizes,
  ) {
    this.webgl = new WebGLRenderer({
      canvas,
      alpha: true,
      // MSAA is not worth the fill rate on a phone.
      antialias: sizes.quality === 'high',
      powerPreference: 'high-performance',
    });
    this.webgl.setClearColor(0x000000, 0);
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.05;
    // Soft shadows are the single most expensive knob here, so weaker
    // devices get the cheap filter and the low tier gets none at all.
    this.webgl.shadowMap.enabled = sizes.quality !== 'low';
    this.webgl.shadowMap.type = sizes.quality === 'high' ? PCFSoftShadowMap : PCFShadowMap;

    this.css = new CSS3DRenderer({ element: cssTarget });
    // Its world matrix is written by hand every frame, below.
    this.cssCamera.matrixWorldAutoUpdate = false;

    this.resize();
    sizes.on(() => this.resize());
  }

  resize() {
    this.webgl.setSize(this.sizes.width, this.sizes.height);
    this.webgl.setPixelRatio(this.sizes.pixelRatio);
    this.css.setSize(this.sizes.width, this.sizes.height);
  }

  update() {
    this.renderCss();
    this.webgl.render(this.scene, this.camera.instance);
  }

  /**
   * Project the OS onto the glass, with the whole scene scaled up so that the
   * CSS it produces is well conditioned.
   *
   * The room is modelled in metres and the screen element scaled down to fit
   * it (a 1280px surface times 0.0003). Handed to CSS3DRenderer as it is, that
   * puts the camera about two CSS pixels in front of the element inside an
   * 800px perspective, with the element shrunk by three thousand. The maths
   * still projects correctly, and Chromium draws it — but iOS Safari decides
   * which parts of a 3D-transformed layer are visible, and which tiles to
   * paint, in single-precision floats, and with the eye that close to the
   * plane it gets that wrong: one tile of the desktop lands in a corner of the
   * glass and the rest of the hole shows the page behind.
   *
   * Scaling the world by pixels-per-metre changes nothing about the picture —
   * both the camera and the object move out by the same factor — but the
   * element now sits at scale 1, thousands of pixels from the eye, which is
   * the ordinary case every browser's compositor is built for.
   *
   * Only the CSS pass sees the scaled matrices. The object's world matrix is
   * put back straight afterwards, so raycasting and everything else in the
   * scene keeps working in metres.
   */
  private renderCss() {
    const camera = this.camera.instance;
    // The CSS pass runs in pixels, not metres: one unit is one CSS pixel on
    // the glass.
    const unitsPerMetre = 1 / PX_TO_M;
    this.cssScale.makeScale(unitsPerMetre, unitsPerMetre, unitsPerMetre);
    this.scene.updateMatrixWorld();
    camera.updateMatrixWorld();

    if (!this.cssObjects.length) {
      this.scene.traverse((object) => {
        if (object instanceof CSS3DObject) this.cssObjects.push(object);
      });
    }

    // Same lens; only where it stands is rescaled, not how it is turned.
    const css = this.cssCamera;
    css.projectionMatrix.copy(camera.projectionMatrix);
    css.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    css.layers.mask = camera.layers.mask;
    css.matrixWorld.copy(camera.matrixWorld);
    css.matrixWorld.elements[12] *= unitsPerMetre;
    css.matrixWorld.elements[13] *= unitsPerMetre;
    css.matrixWorld.elements[14] *= unitsPerMetre;
    css.matrixWorldInverse.copy(css.matrixWorld).invert();

    this.cssObjects.forEach((object, index) => {
      (this.saved[index] ??= new Matrix4()).copy(object.matrixWorld);
      object.matrixWorld.premultiply(this.cssScale);
    });

    // Stop the renderer recomputing the world matrices just written.
    const autoUpdate = this.scene.matrixWorldAutoUpdate;
    this.scene.matrixWorldAutoUpdate = false;
    this.css.render(this.scene, css);
    this.scene.matrixWorldAutoUpdate = autoUpdate;

    this.cssObjects.forEach((object, index) => object.matrixWorld.copy(this.saved[index]));
  }

  destroy() {
    this.webgl.dispose();
  }
}

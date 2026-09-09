import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
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

    this.resize();
    sizes.on(() => this.resize());
  }

  resize() {
    this.webgl.setSize(this.sizes.width, this.sizes.height);
    this.webgl.setPixelRatio(this.sizes.pixelRatio);
    this.css.setSize(this.sizes.width, this.sizes.height);
  }

  update() {
    this.css.render(this.scene, this.camera.instance);
    this.webgl.render(this.scene, this.camera.instance);
  }

  destroy() {
    this.webgl.dispose();
  }
}

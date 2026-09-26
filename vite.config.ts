import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    /*
     * A browser list rather than a language level, because that is what makes
     * esbuild write vendor prefixes. Without it Safari got bare `user-select`
     * — which it ignores, so a long press anywhere on iOS started a text
     * selection on the desktop — and bare `backdrop-filter`, which iOS before
     * 18 ignores too, so every frosted pill rendered as flat, see-through white.
     */
    cssTarget: ['safari15', 'ios15', 'chrome100', 'firefox100', 'edge100'],
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        /*
         * three.js is the bulk of the bundle and it almost never changes,
         * while the OS above it changes constantly. Shipping them as one file
         * means every edit to an app invalidates three.js in everyone's cache
         * too. Splitting it out means a repeat visitor re-downloads only the
         * part that actually moved.
         */
        manualChunks: (id) =>
          id.includes('node_modules/three') ? 'three' : undefined,
      },
    },
  },
});

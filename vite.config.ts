import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
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

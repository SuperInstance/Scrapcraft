import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 3000 },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split Three.js (rarely changes) and Maker Lab (large, lazy-feel UX)
        // into separately cached chunks. Browser loads all in parallel via
        // native ES module static analysis, but each chunk caches independently.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (
            id.includes('/src/TileEditor') ||
            id.includes('/src/maker/')    ||
            id.includes('/src/Spark')     ||
            id.includes('/src/spark/')
          ) return 'maker';
        },
      },
    },
  },
});

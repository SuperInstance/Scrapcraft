import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 3000 },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // Level 2: cinema.html is a second page (the story-cinema demo) that
      // shares the engine chunks with index.html.
      input: {
        main: 'index.html',
        cinema: 'cinema.html',
        cinemaMobile: 'cinema-mobile.html', // Level 3 pocket-cinema build (mobile-first)
      },
      // Level 2: three.js ships via CDN importmap (cinema.html carries it),
      // so the bundle stays out of the push path entirely.
      external: ['three'],
      output: {
        // Split the engine into push-sized chunks: the GitHub write path
        // caps a single call well below these bundles, so every chunk must
        // stay small. Buckets are by source directory, halves alphabetical.
        manualChunks(id) {
          if (!id.includes('/src/')) return undefined;
          const half = id.split('/').pop() < 'm' ? 'a' : 'b';
          if (id.includes('/src/companion/')) return `e-companion-${half}`;
          if (id.includes('/src/quests/')) return `e-quests-${half}`;
          if (id.includes('/src/TileEditor')) return 'e-maker-tile';
          if (id.includes('/src/maker/')) return `e-maker-core-${half}`;
          if (id.includes('/src/spark/')) return 'e-maker-spark';
          if (id.includes('/src/onboarding/')) return 'e-onboarding';
          if (id.includes('/src/learning/')) return 'e-learning';
          if (id.includes('/src/level2/') || id.includes('/src/cinema/')) return 'e-cinema';
          return undefined;
        },
      },
    },
  },
});

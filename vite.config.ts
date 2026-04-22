import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      // Multi-entry: the main app + the progression-demo standalone page.
      // Without this, Vite only transforms `index.html`; any extra HTML
      // page has to live in `public/` and is copied verbatim with its
      // `<script src>` imports UNRESOLVED. Registering progression-demo.html
      // here lets Vite rewrite `/src/render/progression/index.ts` etc.
      // into hashed bundle refs that work in production.
      input: {
        main: resolve(__dirname, 'index.html'),
        progressionDemo: resolve(__dirname, 'progression-demo.html'),
      },
    },
  },
});

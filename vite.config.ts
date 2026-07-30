import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/timeforces/, so assets need that
// prefix. Override with BASE_PATH=/ when serving from a domain root.
const base = process.env.BASE_PATH ?? '/timeforces/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    // The CSS minifier rewrites `max-width: 640px` into the range syntax
    // `width <= 640px`, which Safari only understands from 16.4. An older
    // iPhone would then drop every mobile rule at once, silently.
    cssTarget: 'safari14',
  },
});

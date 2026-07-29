import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/study/, so assets need that
// prefix. Override with BASE_PATH=/ when serving from a domain root.
const base = process.env.BASE_PATH ?? '/study/';

export default defineConfig({
  base,
  plugins: [react()],
});

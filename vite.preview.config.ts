// Serves the renderer on its own so the interface can be looked at in a browser during design
// work. It never builds the app: `electron-vite` remains the only build.
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  server: { port: 5199, strictPort: true }
});

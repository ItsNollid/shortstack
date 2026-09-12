// Serves the renderer on its own so the interface can be looked at in a browser during design
// work. It never builds the app: `electron-vite` remains the only build.
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// Same reason as the app's own dev server: the shipped CSP forbids the inline scripts Vite injects
// while serving. The build is untouched.
function stripCspWhileServing() {
  const MARKER = 'http-equiv="Content-Security-Policy"';
  return {
    name: 'shortstack-strip-csp-in-dev',
    apply: 'serve' as const,
    transformIndexHtml(html: string): string {
      const marker = html.indexOf(MARKER);
      if (marker === -1) return html;
      const start = html.lastIndexOf('<meta', marker);
      const end = html.indexOf('/>', marker);
      return start === -1 || end === -1 ? html : html.slice(0, start) + html.slice(end + 2);
    }
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react(), stripCspWhileServing()],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  server: { port: 5199, strictPort: true }
});

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// The production CSP forbids inline scripts, which is exactly what Vite's dev server and React
// Refresh inject. Stripping it while serving keeps `npm run dev` working without weakening what
// actually ships: the build leaves the tag alone. Done by hand rather than by regex so there is no
// doubt about what it matches.
function stripCspWhileServing() {
  const OPEN = '<meta'
  const MARKER = 'http-equiv="Content-Security-Policy"'
  const CLOSE = '/>'
  return {
    name: 'shortstack-strip-csp-in-dev',
    apply: 'serve' as const,
    transformIndexHtml(html: string): string {
      const marker = html.indexOf(MARKER)
      if (marker === -1) return html
      const start = html.lastIndexOf(OPEN, marker)
      const end = html.indexOf(CLOSE, marker)
      if (start === -1 || end === -1) return html
      return html.slice(0, start) + html.slice(end + CLOSE.length)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react(), stripCspWhileServing()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})

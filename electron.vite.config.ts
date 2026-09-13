import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Baked in at build time so a running app can say which build it is. Without this the only way to
// answer "am I on the newest one?" is to compare file timestamps by hand, and the packaged build in
// dist/ is refreshed by a different command than the one in out/ — so being a version behind without
// noticing is the normal failure, not an unlikely one.
function buildStamp() {
  const commit = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    } catch {
      return 'unknown'
    }
  })()
  const dirty = (() => {
    try {
      return execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    } catch {
      return false
    }
  })()
  const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version
  return {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(dirty ? `${commit}+` : commit),
    __APP_VERSION__: JSON.stringify(version)
  }
}

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
    define: buildStamp(),
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
    define: buildStamp(),
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

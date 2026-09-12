import { configDefaults, defineConfig } from 'vitest/config';

// Database tests load better-sqlite3, which is built for Electron's ABI; they run via scripts/test-electron.mjs.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
    environment: 'node',
    pool: 'forks'
  }
});

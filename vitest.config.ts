import { defineConfig } from 'vitest/config';

// better-sqlite3 v13 ships Node-API prebuilds, so database tests run under plain Node
// with the same binary Electron loads: no rebuild and no separate Electron test runner.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    pool: 'forks'
  }
});

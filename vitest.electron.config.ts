import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    exclude: configDefaults.exclude,
    environment: 'node',
    pool: 'forks'
  }
});

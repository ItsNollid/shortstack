// End-to-end tests drive the built application, so they need `npm run build` first. They are kept
// out of `npm test`, which stays fast, and run with `npm run test:e2e`.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One at a time: each test launches a real Electron window.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']]
});

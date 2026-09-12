// Runs the database test suite inside Electron's bundled Node, because better-sqlite3
// is compiled for Electron's ABI rather than the system Node.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const vitestEntry = path.resolve('node_modules', 'vitest', 'vitest.mjs');

const result = spawnSync(electronBinary, [vitestEntry, 'run', '--config', 'vitest.electron.config.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

if (result.error) console.error(result.error);
process.exit(result.status ?? 1);

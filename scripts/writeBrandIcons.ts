// Generates the application icon files electron-builder packages, from the same drawing code the
// app uses at runtime. Run with: npm run icons
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { brandIconPng } from '../src/main/brandIcon';
import { icoFromPngs } from '../src/main/icons/circle';

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const out = path.join(__dirname, '..', 'resources');
mkdirSync(out, { recursive: true });

writeFileSync(path.join(out, 'icon.png'), brandIconPng(512));
writeFileSync(
  path.join(out, 'icon.ico'),
  icoFromPngs(ICO_SIZES.map((size) => ({ size, png: brandIconPng(size) })))
);

console.log(`Wrote resources/icon.png (512) and resources/icon.ico (${ICO_SIZES.join(', ')})`);

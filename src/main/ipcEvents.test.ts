// The renderer subscribes by exact channel name, so a name that is close but wrong means background
// work silently never reaches the screen. That happened: the scheduler announced its changes on
// 'app:queueChanged' while the renderer listened for 'queue:changed'. Nothing failed; the UI just
// never updated on its own.
//
// The typed broadcast() helper now makes the channel an AppEvent, which the compiler checks. This
// is the tripwire for the other route: a raw webContents.send with a string literal, which is how
// the bug got in. Today there are none, so the first test is a guard against regression rather
// than a check on current code.
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { APP_EVENTS } from '../shared/ipc';

const MAIN = path.join(__dirname);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('renderer events', () => {
  it('are only ever sent under a name the contract declares', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(MAIN)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/webContents\.send\(\s*(['"])([^'"]+)\1/g)) {
        const channel = match[2] as string;
        if (!(APP_EVENTS as readonly string[]).includes(channel)) {
          offenders.push(`${path.relative(MAIN, file)}: ${channel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still recognises how this codebase sends events', () => {
    // If sending ever stops looking like webContents.send(, the scan above needs rewriting.
    const sends = sourceFiles(MAIN)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n')
      .match(/webContents\.send\(/g);
    expect(sends?.length ?? 0).toBeGreaterThan(0);
  });
});

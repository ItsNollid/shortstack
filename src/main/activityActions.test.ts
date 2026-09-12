// The exhaustiveness guard in activityCopy covers events the state machine emits. It cannot see the
// actions written directly to the activity log from elsewhere, which is how four of them reached
// History with no copy and showed as raw text like "mark published before". This reads the sources
// and insists every action name that gets written has been given words.
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_ACTIONS } from '../shared/activityCopy';

const MAIN = __dirname;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

/**
 * Every action name written to the activity log. Scoped to appendActivity calls rather than to the
 * word "action:" anywhere, and it takes every quoted name on the line — a first version only read
 * plain literals and so missed the ones chosen by a ternary, which was three of the four that had
 * gone unlabelled. Names computed from a variable are covered by the compile-time guard in
 * activityCopy.test.ts instead.
 */
function writtenActions(): Array<{ action: string; file: string }> {
  const found: Array<{ action: string; file: string }> = [];
  for (const file of sourceFiles(MAIN)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of source.matchAll(/appendActivity\s*\(/g)) {
      const start = call.index ?? 0;
      const window = source.slice(start, start + 400);
      const line = /\baction:([^\n]*)/.exec(window);
      if (line === null) continue;
      for (const name of (line[1] as string).matchAll(/['"]([a-z_]+)['"]/g)) {
        found.push({ action: name[1] as string, file: path.relative(MAIN, file) });
      }
    }
  }
  return found;
}

describe('every action written to the activity log', () => {
  it('has been given copy', () => {
    const unlabelled = writtenActions()
      .filter(({ action }) => !(ACTIVITY_ACTIONS as readonly string[]).includes(action))
      .map(({ action, file }) => `${file}: ${action}`);
    expect([...new Set(unlabelled)]).toEqual([]);
  });

  it('sees the actions it is meant to be checking, including the ones chosen by a ternary', () => {
    // Guards the guard: if the scan stops matching, the test above passes by finding nothing.
    const names = new Set(writtenActions().map((entry) => entry.action));
    expect(names).toContain('edit_metadata');
    expect(names).toContain('mark_published_before');
    expect(names).toContain('posting_created');
    expect(names).toContain('posting_rotated');
  });
});

// Writes CHANGELOG.md and the release notes for the newest version from the same list the app shows
// after an update, so what a GitHub release says and what a person reads inside the app can never
// drift apart. Run with: npm run docs:changelog
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { sortedChangelog, type ChangelogEntry } from '../src/shared/changelog';

const renderEntry = (entry: ChangelogEntry, heading: string): string[] => {
  const lines = [`${heading} ${entry.version} — ${entry.headline}`, '', `_Released ${entry.date}_`, ''];
  for (const change of entry.changes) lines.push(`- ${change}`);
  if (entry.legal !== undefined && entry.legal.length > 0) {
    lines.push('', '**This release changed the privacy policy or terms of use.** ShortStack asks you to agree again before it will run.', '');
    for (const note of entry.legal) lines.push(`- ${note}`);
  }
  lines.push('');
  return lines;
};

const releases = sortedChangelog();
const newest = releases[0];
if (newest === undefined) throw new Error('The changelog is empty');

const root = path.join(__dirname, '..');
writeFileSync(
  path.join(root, 'CHANGELOG.md'),
  [
    '# ShortStack changelog',
    '',
    '_Generated from `src/shared/changelog.ts`, which is what the app shows after an update. Edit that._',
    '',
    ...releases.flatMap((entry) => renderEntry(entry, '##'))
  ].join('\n')
);

// The body of the newest GitHub release, ready to paste or to hand to `gh release create --notes-file`.
const notesDir = path.join(root, 'docs', 'releases');
mkdirSync(notesDir, { recursive: true });
writeFileSync(path.join(notesDir, `${newest.version}.md`), renderEntry(newest, '#').join('\n'));

console.info(`Wrote CHANGELOG.md and docs/releases/${newest.version}.md`);

// Old copies of the database, made before each schema change. One is made every time ShortStack
// changes how it stores things, and nothing ever removed them: the live profile held seven within a
// week. The newest few are all stepping back through an update ever needs.
import * as fs from 'fs';
import * as path from 'path';

/** Enough to step back through a few updates. Anything older is a copy of a database nobody runs. */
export const KEPT_MIGRATION_BACKUPS = 3;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Deletes all but the newest `keep` backups that migrations made of this database, and returns the
 * paths it deleted. Only files named exactly the way a migration names them are considered, so a
 * backup someone made by hand is never touched. A file that cannot be deleted is left for next time:
 * tidying up is never a reason for the app not to start.
 */
export function pruneMigrationBackups(dir: string, baseName: string, keep = KEPT_MIGRATION_BACKUPS): string[] {
  const pattern = new RegExp(`^${escapeRegExp(baseName)}\\.schema-v\\d+\\.(\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z)\\.bak$`);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }

  // The stamp is an ISO time with its colons and dot replaced, so sorting it as text sorts it by time.
  const newestFirst = names
    .map((name) => ({ name, stamp: pattern.exec(name)?.[1] }))
    .filter((entry): entry is { name: string; stamp: string } => entry.stamp !== undefined)
    .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));

  const removed: string[] = [];
  for (const { name } of newestFirst.slice(Math.max(0, keep))) {
    const file = path.join(dir, name);
    try {
      fs.unlinkSync(file);
      removed.push(file);
    } catch {
      // Locked or already gone. Either way, not worth stopping for.
    }
  }
  return removed;
}

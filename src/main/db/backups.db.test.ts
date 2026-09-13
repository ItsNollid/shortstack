import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruneMigrationBackups } from './backups';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-backups-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const touch = (name: string): void => fs.writeFileSync(path.join(dir, name), 'x');
const left = (): string[] => fs.readdirSync(dir).sort();

describe('old database backups', () => {
  // The live profile's folder, as it was: seven migration backups, one made by hand, and the database.
  it('keeps the newest three a migration made, and nothing else is touched', () => {
    touch('shortstack.db');
    touch('shortstack.db.pre-overhaul-2026-09-11.bak');
    touch('shortstack.db.schema-v0.2026-09-12T19-39-37-552Z.bak');
    touch('shortstack.db.schema-v2.2026-09-12T21-20-43-563Z.bak');
    touch('shortstack.db.schema-v3.2026-09-13T04-44-37-189Z.bak');
    touch('shortstack.db.schema-v5.2026-09-13T12-30-10-908Z.bak');
    touch('shortstack.db.schema-v6.2026-09-13T16-41-07-616Z.bak');
    touch('shortstack.db.schema-v7.2026-09-13T17-12-13-420Z.bak');
    touch('other.db.schema-v1.2026-09-01T00-00-00-000Z.bak');

    const removed = pruneMigrationBackups(dir, 'shortstack.db');

    expect(removed.map((file) => path.basename(file)).sort()).toEqual([
      'shortstack.db.schema-v0.2026-09-12T19-39-37-552Z.bak',
      'shortstack.db.schema-v2.2026-09-12T21-20-43-563Z.bak',
      'shortstack.db.schema-v3.2026-09-13T04-44-37-189Z.bak'
    ]);
    expect(left()).toEqual([
      'other.db.schema-v1.2026-09-01T00-00-00-000Z.bak',
      'shortstack.db',
      'shortstack.db.pre-overhaul-2026-09-11.bak',
      'shortstack.db.schema-v5.2026-09-13T12-30-10-908Z.bak',
      'shortstack.db.schema-v6.2026-09-13T16-41-07-616Z.bak',
      'shortstack.db.schema-v7.2026-09-13T17-12-13-420Z.bak'
    ]);
  });

  it('removes nothing while there are three or fewer', () => {
    touch('shortstack.db.schema-v6.2026-09-13T16-41-07-616Z.bak');
    touch('shortstack.db.schema-v7.2026-09-13T17-12-13-420Z.bak');
    expect(pruneMigrationBackups(dir, 'shortstack.db')).toEqual([]);
    expect(left()).toHaveLength(2);
  });

  it('does not fail when the folder is not there', () => {
    expect(pruneMigrationBackups(path.join(dir, 'missing'), 'shortstack.db')).toEqual([]);
  });
});

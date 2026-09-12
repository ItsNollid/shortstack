// Opening the one database the app uses. Everything else goes through the repositories, which write
// only columns from their own allowlists — the module this replaced also carried a set of helpers
// that built UPDATE statements out of whatever keys they were handed.
import type Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import { openDatabase } from './connection';

let database: Database.Database | null = null;

export function initDatabase(): void {
  const file = path.join(app.getPath('userData'), 'shortstack.db');
  const opened = openDatabase(file);
  database = opened.db;

  const { migratedFrom, migratedTo, backupPath } = opened.migration;
  if (migratedFrom !== migratedTo) {
    const backup = backupPath === null ? '' : ` (backup: ${backupPath})`;
    console.info(`[ShortStack] database schema ${migratedFrom} -> ${migratedTo}${backup}`);
  }
}

export function getDb(): Database.Database {
  if (database === null) throw new Error('The database has not been opened yet');
  return database;
}

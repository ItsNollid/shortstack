import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { migrate, type MigrateResult } from './migrations';

export interface OpenedDatabase {
  db: Database.Database;
  migration: MigrateResult;
}

export function openDatabase(file: string, now: () => Date = () => new Date()): OpenedDatabase {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const migration = migrate(db, { backupDir: path.dirname(file), baseName: path.basename(file), now });
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}

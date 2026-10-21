import type Database from 'better-sqlite3';
import { MIGRATIONS_V46 } from './migrations-list-v46.js';
/** Repair the real legacy desktop v46 collision without guessing its unrelated event semantics.
 * The old table is archived intact; all current readers/writers use the canonical ledger.
 */
export const MIGRATIONS_V64 = [{ version: 64, statements: [], after(db: Database.Database) {
  let columns = (db.prepare('PRAGMA table_info(learning_event)').all() as Array<{ name: string }>).map(c => c.name);
  if (!columns.includes('kind') && ['owner_id', 'session_id', 'type', 'v', 'payload', 'ts'].every(c => columns.includes(c))) {
    db.exec('ALTER TABLE learning_event RENAME TO learning_event_v46_legacy');
    for (const sql of MIGRATIONS_V46.flatMap(m => m.statements).filter(s => /\blearning_event\b/.test(s))) db.exec(sql);
    columns = (db.prepare('PRAGMA table_info(learning_event)').all() as Array<{ name: string }>).map(c => c.name);
  }
  // Unknown layouts (e.g. an external plugin's table) are never modified speculatively.
  if (!['owner_id', 'kind', 'payload', 'created_at'].every(c => columns.includes(c))) return;
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS learning_answer_attempt ON learning_event(owner_id, json_extract(payload, '$.attemptKey'))
    WHERE kind = 'quiz.answered' AND json_valid(payload) AND json_extract(payload, '$.attemptKey') IS NOT NULL`);
  db.exec('CREATE INDEX IF NOT EXISTS learning_answer_time ON learning_event(owner_id, kind, created_at)');
} }];

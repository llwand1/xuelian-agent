/** Additive, independent storage: branch replies never become main messages or searchable sessions. */
export const MIGRATIONS_V65 = [{ version: 65, statements: [
  `CREATE TABLE IF NOT EXISTS quote_branch (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    quote TEXT NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL,
    prefix TEXT NOT NULL DEFAULT '', suffix TEXT NOT NULL DEFAULT '',
    context_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(message_id, start_offset, end_offset, quote)
  )`,
  `CREATE INDEX IF NOT EXISTS quote_branch_session ON quote_branch(session_id, message_id)`,
  `CREATE TABLE IF NOT EXISTS quote_branch_message (
    id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES quote_branch(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'complete' CHECK(status IN ('streaming','complete','stopped','error')),
    error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS quote_branch_message_order ON quote_branch_message(branch_id, created_at)`,
] }];

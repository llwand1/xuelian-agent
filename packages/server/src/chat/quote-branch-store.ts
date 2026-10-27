import { randomUUID } from 'node:crypto';
import type { QuoteAnchor, QuoteBranch, QuoteBranchMessage } from '@sb/shared';
import { QUOTE_BRANCH_MAX } from '@sb/shared';
import { getDb } from '../storage/db.js';
import { canAccessSession, sessionExists } from '../auth/ownership.js';

interface BranchRow {
  id: string; session_id: string; message_id: string; quote: string; start_offset: number; end_offset: number;
  prefix: string; suffix: string; context_snapshot: string; created_at: string; updated_at: string;
}
const view = (r: BranchRow): QuoteBranch => ({ id: r.id, sessionId: r.session_id, messageId: r.message_id,
  quote: r.quote, start: r.start_offset, end: r.end_offset, prefix: r.prefix, suffix: r.suffix, createdAt: r.created_at, updatedAt: r.updated_at });
export class QuoteBranchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function assertQuoteParent(id: string, ownerId: string | null): void {
  if (!sessionExists(id) || !canAccessSession(id, ownerId)) throw new QuoteBranchError(404, '会话不存在');
}
export function listQuoteBranches(sessionId: string, ownerId: string | null): QuoteBranch[] {
  assertQuoteParent(sessionId, ownerId);
  return (getDb().prepare('SELECT * FROM quote_branch WHERE session_id=? ORDER BY rowid').all(sessionId) as BranchRow[]).map(view);
}
export function readQuoteBranch(id: string, ownerId: string | null): { branch: QuoteBranch; context: string } {
  const row = getDb().prepare('SELECT b.* FROM quote_branch b JOIN sessions s ON s.id=b.session_id WHERE b.id=? AND s.deleted_at IS NULL').get(id) as BranchRow | undefined;
  if (!row || !canAccessSession(row.session_id, ownerId)) throw new QuoteBranchError(404, '分支不存在');
  return { branch: view(row), context: row.context_snapshot };
}
export function createQuoteBranch(sessionId: string, anchor: QuoteAnchor, ownerId: string | null): QuoteBranch {
  assertQuoteParent(sessionId, ownerId);
  if (typeof anchor.messageId !== 'string' || typeof anchor.quote !== 'string' || !anchor.quote.trim() || anchor.quote.length > QUOTE_BRANCH_MAX
    || !Number.isSafeInteger(anchor.start) || !Number.isSafeInteger(anchor.end) || anchor.start < 0 || anchor.end <= anchor.start || anchor.end - anchor.start !== anchor.quote.length
    || anchor.end > 1_000_000 || typeof anchor.prefix !== 'string' || typeof anchor.suffix !== 'string' || anchor.prefix.length > 80 || anchor.suffix.length > 80) {
    throw new QuoteBranchError(400, '请选择已保存回答中的文字（最多 1200 字）');
  }
  const db = getDb();
  const source = db.prepare("SELECT rowid,content FROM messages WHERE id=? AND session_id=? AND role='assistant' AND length(content)>0 AND tool_calls IS NULL").get(anchor.messageId, sessionId) as { rowid: number; content: string } | undefined;
  if (!source) throw new QuoteBranchError(404, '原回答不存在或已重新生成，请重新选词');
  const existing = db.prepare('SELECT * FROM quote_branch WHERE message_id=? AND start_offset=? AND end_offset=? AND quote=?').get(anchor.messageId, anchor.start, anchor.end, anchor.quote) as BranchRow | undefined;
  if (existing) return view(existing);
  const count = db.prepare('SELECT COUNT(*) n FROM quote_branch WHERE session_id=?').get(sessionId) as { n: number };
  if (count.n >= 500) throw new QuoteBranchError(400, '本会话的分支数量已达上限');
  // Snapshot stops at the source answer; neither later main messages nor other branches are inherited.
  const rows = db.prepare("SELECT role,content FROM messages WHERE session_id=? AND rowid<=? AND role IN ('user','assistant') AND tool_calls IS NULL AND length(content)>0 ORDER BY rowid DESC LIMIT 12").all(sessionId, source.rowid) as Array<{ role: string; content: string }>;
  const context = rows.reverse().map(r => `${r.role === 'user' ? '学习者' : '助手'}：${r.content.slice(0, 7000)}`).join('\n\n').slice(-18000);
  const id = randomUUID();
  db.prepare('INSERT INTO quote_branch(id,session_id,message_id,quote,start_offset,end_offset,prefix,suffix,context_snapshot) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, sessionId, anchor.messageId, anchor.quote, anchor.start, anchor.end, anchor.prefix, anchor.suffix, context);
  return readQuoteBranch(id, ownerId).branch;
}
export function quoteMessages(id: string): QuoteBranchMessage[] {
  const rows = getDb().prepare('SELECT id,role,content,status,error,created_at FROM quote_branch_message WHERE branch_id=? ORDER BY rowid').all(id) as Array<{ id: string; role: QuoteBranchMessage['role']; content: string; status: QuoteBranchMessage['status']; error: string | null; created_at: string }>;
  return rows.map(r => ({ id: r.id, role: r.role, content: r.content, status: r.status, ...(r.error ? { error: r.error } : {}), createdAt: r.created_at }));
}
export function updateQuoteMessage(id: string, content: string, status: QuoteBranchMessage['status'], error?: string): void {
  getDb().prepare('UPDATE quote_branch_message SET content=?,status=?,error=? WHERE id=?').run(content, status, error ?? null, id);
}
export function insertQuoteTurn(branchId: string, question: string): string {
  const db = getDb(), assistantId = randomUUID();
  db.transaction(() => {
    db.prepare("INSERT INTO quote_branch_message(id,branch_id,role,content) VALUES(?,?,'user',?)").run(randomUUID(), branchId, question);
    db.prepare("INSERT INTO quote_branch_message(id,branch_id,role,status) VALUES(?,?,'assistant','streaming')").run(assistantId, branchId);
    db.prepare("UPDATE quote_branch SET updated_at=datetime('now') WHERE id=?").run(branchId);
  })();
  return assistantId;
}

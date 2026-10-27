import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Request } from 'express';
import request from 'supertest';
import { closeDb, getDb, openIsolated } from '../storage/db.js';
import { migrate } from '../storage/migrations.js';
import type { AiCallOptions } from '../ai/gateway.js';

vi.mock('../ai/gateway.js', () => ({ aiText: vi.fn() }));
vi.mock('../llm/router.js', async importOriginal => ({ ...await importOriginal<typeof import('../llm/router.js')>(), routeRole: vi.fn(() => ({ model: 'branch-fixture', streamMode: 'stream' })) }));
vi.mock('../auth/ownership.js', async importOriginal => ({ ...await importOriginal<typeof import('../auth/ownership.js')>(), ownerIdOf: (req: Request) => req.get('x-test-owner') ?? null }));
const { aiText } = await import('../ai/gateway.js');
const { quoteBranchesRouter } = await import('../routes/quote-branches.js');
const { createQuoteBranch, listQuoteBranches, quoteMessages, insertQuoteTurn } = await import('./quote-branch-store.js');
const { beginQuoteReply, quoteBranchDetail, buildQuoteContext, stopQuoteBranch } = await import('./quote-branch-reply.js');
const app = express(); app.use(express.json()); app.use('/api/quote-branches', quoteBranchesRouter);
let dir: string;
const anchor = { messageId: 'answer-a', quote: '闭包', start: 0, end: 2, prefix: '', suffix: '＝函数与环境' };
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-quote-')); openIsolated(dir);
  const db = getDb();
  db.prepare("INSERT INTO sessions(id,title,user_id,updated_at) VALUES('parent','主线','alice','2000-01-01')").run();
  db.prepare("INSERT INTO sessions(id,title,user_id) VALUES('other','其他主线','bob')").run();
  db.prepare("INSERT INTO messages(id,session_id,role,content) VALUES('ask-a','parent','user','什么是闭包？')").run();
  db.prepare("INSERT INTO messages(id,session_id,role,content) VALUES('answer-a','parent','assistant','闭包＝函数与环境。闭包可以保留变量。')").run();
  vi.mocked(aiText).mockImplementation(async (opts: AiCallOptions) => {
    opts.onChunk?.({ content: '分支中的解释', done: false });
    return { ok: true, text: '分支中的解释', model: 'fixture', latencyMs: 1 };
  });
});
afterEach(() => { closeDb(); fs.rmSync(dir, { force: true, recursive: true }); vi.clearAllMocks(); });

describe('hidden quote conversations', () => {
  it('reuses the same exact anchor but separates repeated occurrences; main rows/recency never change', () => {
    const db = getDb(), first = createQuoteBranch('parent', anchor, 'alice');
    expect(createQuoteBranch('parent', anchor, 'alice').id).toBe(first.id);
    expect(createQuoteBranch('parent', { ...anchor, start: 10, end: 12 }, 'alice').id).not.toBe(first.id);
    expect(listQuoteBranches('parent', 'alice')).toHaveLength(2);
    expect(db.prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT COUNT(*) n FROM messages').get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT updated_at FROM sessions WHERE id='parent'").get()).toEqual({ updated_at: '2000-01-01' });
  });
  it('captures only the source-time main context and sends follow-ups solely through the branch gateway', async () => {
    const branch = createQuoteBranch('parent', anchor, 'alice');
    getDb().prepare("INSERT INTO messages(id,session_id,role,content) VALUES('later','parent','assistant','LATER_MAIN_SECRET')").run();
    const response = await request(app).post(`/api/quote-branches/${branch.id}/messages`).set('x-test-owner', 'alice').send({ text: 'BRANCH_ONLY_QUESTION' });
    expect(response.status).toBe(200);
    const events = response.text.trim().split('\n').map(line => JSON.parse(line));
    expect(events.map(e => e.type)).toEqual(['snapshot', 'token', 'done']);
    expect(events.at(-1).detail.busy).toBe(false);
    const options = vi.mocked(aiText).mock.calls[0]![0];
    expect(options.purpose).toBe('chat.quote-branch'); expect(options.ownerId).toBe('alice'); expect(options.tools).toBeUndefined();
    expect(JSON.stringify(options.messages)).not.toContain('LATER_MAIN_SECRET');
    expect(JSON.stringify(options.messages)).toContain('什么是闭包');
    expect(quoteMessages(branch.id).map(m => m.role)).toEqual(['user', 'assistant']);
    expect(getDb().prepare("SELECT COUNT(*) n FROM messages WHERE content LIKE '%BRANCH_ONLY%'").get()).toEqual({ n: 0 });
    expect(getDb().prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({ n: 2 });
    const next = beginQuoteReply(branch.id, '再举例', 'alice'); await next.run(() => {});
    expect(JSON.stringify(vi.mocked(aiText).mock.calls[1]![0].messages)).toContain('BRANCH_ONLY_QUESTION');
    expect(JSON.stringify(vi.mocked(aiText).mock.calls[1]![0].messages)).toContain('分支中的解释');
  });
  it('enforces parent/message ownership for every endpoint including writes and abort', async () => {
    const branch = createQuoteBranch('parent', anchor, 'alice');
    for (const suffix of ['', '/abort', '/messages']) {
      const req = suffix ? request(app).post(`/api/quote-branches/${branch.id}${suffix}`).send({ text: '偷看' }) : request(app).get(`/api/quote-branches/${branch.id}`);
      expect((await req.set('x-test-owner', 'bob')).status).toBe(404);
    }
    expect((await request(app).get('/api/quote-branches?sessionId=parent').set('x-test-owner', 'bob')).status).toBe(404);
    expect((await request(app).post('/api/quote-branches').set('x-test-owner', 'bob').send({ sessionId: 'other', anchor })).status).toBe(404);
    getDb().prepare("UPDATE sessions SET deleted_at=datetime('now') WHERE id='parent'").run();
    expect((await request(app).get(`/api/quote-branches/${branch.id}`)).status).toBe(404);
    expect(aiText).not.toHaveBeenCalled();
  });
  it.each([{ ...anchor, end: 4 }, { ...anchor, quote: '' }, { ...anchor, start: -1 }, { ...anchor, quote: 'x'.repeat(1201), end: 1201 }])('validates anchor bounds: %j', invalid => {
    expect(() => createQuoteBranch('parent', invalid, null)).toThrow();
  });
  it('allows only saved assistant answers and rejects missing parents locally too', () => {
    expect(() => createQuoteBranch('parent', { ...anchor, messageId: 'ask-a' }, null)).toThrow();
    expect(() => createQuoteBranch('missing', anchor, null)).toThrow();
  });
  it('prevents concurrent turns in one branch and persists partial text on stop', async () => {
    const branch = createQuoteBranch('parent', anchor, null), job = beginQuoteReply(branch.id, '解释', null);
    expect(() => beginQuoteReply(branch.id, '重复', null)).toThrow('还在回复');
    expect(quoteBranchDetail(branch.id, null).busy).toBe(true);
    vi.mocked(aiText).mockImplementation(async opts => {
      opts.onChunk?.({ content: '已收到半段', done: false }); stopQuoteBranch(branch.id, null);
      return { ok: false, reason: 'aborted', error: '已取消', text: '已收到半段', model: 'fixture', latencyMs: 1 };
    });
    const result = await job.run(() => {});
    expect(result.busy).toBe(false); expect(result.messages.at(-1)).toMatchObject({ content: '已收到半段', status: 'stopped' });
  });
  it('retains failure details, recovers interrupted rows, and cascades only when the source is deleted', async () => {
    const branch = createQuoteBranch('parent', anchor, null);
    vi.mocked(aiText).mockResolvedValue({ ok: false, reason: 'upstream', error: 'fixture unavailable', text: '半截', model: 'fixture', latencyMs: 1 });
    await beginQuoteReply(branch.id, '问题', null).run(() => {});
    expect(quoteBranchDetail(branch.id, null).messages.at(-1)).toMatchObject({ status: 'error', content: '半截', error: 'fixture unavailable' });
    insertQuoteTurn(branch.id, '重启时的问题');
    expect(quoteBranchDetail(branch.id, null).messages.at(-1)?.status).toBe('error');
    getDb().prepare("DELETE FROM messages WHERE id='answer-a'").run();
    expect(quoteMessages(branch.id)).toEqual([]); expect(listQuoteBranches('parent', null)).toEqual([]);
  });
  it('replays the additive migration idempotently and caps input context without mixing other branches', () => {
    createQuoteBranch('parent', anchor, null);
    getDb().prepare('DELETE FROM schema_version WHERE version=65').run(); migrate(getDb());
    expect(listQuoteBranches('parent', null)).toHaveLength(1);
    const messages = buildQuoteContext('闭包', '来源'.repeat(20000), [{ role: 'user', content: '解释' }], 1000);
    expect(JSON.stringify(messages)).toContain('闭包'); expect(messages.at(-1)?.content).toBe('解释');
    expect(JSON.stringify(messages).length).toBeLessThan(2500);
  });
  it.each([{ text: '', finishReason: 'stop' }, { text: '截断的回答', finishReason: 'length' }])('never labels empty/truncated output as a completed answer: %j', async result => {
    const branch = createQuoteBranch('parent', anchor, null);
    vi.mocked(aiText).mockResolvedValue({ ok: true, ...result, model: 'fixture', latencyMs: 1 });
    const detail = await beginQuoteReply(branch.id, '解释', null).run(() => {});
    expect(detail.messages.at(-1)?.status).toBe('error'); expect(detail.messages.at(-1)?.error).toBeTruthy();
  });
});

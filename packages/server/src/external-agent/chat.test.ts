import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_EXTERNAL_AGENT } from '@sb/shared';
const fixture = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>>, calls: [] as Array<unknown>, fail: false, config: { ...{ enabled: false, name: 'Fixture Agent', baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture', timeoutSeconds: 30, historyMessages: 40 }, token: '' } }));
vi.mock('./settings.js', () => ({ localAgentEnabled: () => true, loadAgentConnection: () => fixture.config }));
vi.mock('./transport.js', () => ({ streamAgent: async function* (_c: unknown, messages: unknown, signal?: AbortSignal) { fixture.calls.push(messages); yield '真实显示片段'; if (fixture.fail) throw new Error('fixture disconnected'); signal?.throwIfAborted(); yield '，回答完成'; } }));
vi.mock('../chat/sse-bus.js', () => ({ publish: (_s: string, event: Record<string, unknown>) => fixture.events.push(event), startNewRound: vi.fn() }));
vi.mock('../events/bus.js', () => ({ publishEvent: vi.fn() }));
vi.mock('../desktop/chat-integration.js', () => ({ withDesktopChatRun: (opts: unknown, run: (v: unknown) => unknown) => run(opts) }));
vi.mock('../desktop/task-store.js', () => ({ patchDesktopRun: vi.fn() }));
import { openIsolated, closeDb, getDb } from '../storage/db.js';
import { routeExternalAgentTurn, agentHistory } from './chat.js';
import { planRegenerate } from '../chat/regenerate.js';
import { planResend } from '../chat/resend.js';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sb-external-chat-')); const db = openIsolated(dir);
  db.prepare("INSERT INTO sessions(id,title) VALUES('s1','新对话'),('s2','其他会话')").run();
  fixture.config = { ...DEFAULT_EXTERNAL_AGENT, name: 'Fixture', token: '', enabled: true }; fixture.calls = []; fixture.events = []; fixture.fail = false;
});
afterEach(() => { closeDb(); rmSync(dir, { recursive: true, force: true }); });
it('reuses native mode when disabled and needs no provider when enabled', async () => {
  const native = vi.fn(async () => ({ ok: true })); fixture.config.enabled = false;
  await routeExternalAgentTurn({ sessionId: 's1', text: 'native' }, native); expect(native).toHaveBeenCalledOnce();
  fixture.config.enabled = true; await routeExternalAgentTurn({ sessionId: 's1', text: '你好' }, native);
  expect(native).toHaveBeenCalledOnce();
  expect(getDb().prepare('SELECT role, content FROM messages').all()).toEqual([{ role: 'user', content: '你好' }, { role: 'assistant', content: '真实显示片段，回答完成' }]);
  expect(fixture.events.at(-1)?.type).toBe('done');
});
it('history, regenerate and edit use SQL as source of truth, never an invisible Codex session', async () => {
  const native = vi.fn(async () => ({ ok: false }));
  await routeExternalAgentTurn({ sessionId: 's1', text: '第一问' }, native);
  const regen = planRegenerate('s1'); expect(regen.ok).toBe(true);
  await routeExternalAgentTurn({ sessionId: 's1', text: regen.text!, skipUserPersist: true }, native);
  expect(getDb().prepare("SELECT COUNT(*) AS n FROM messages WHERE role='user'").get()).toEqual({ n: 1 });
  planResend('s1', '修改后的问题');
  await routeExternalAgentTurn({ sessionId: 's1', text: '修改后的问题', skipUserPersist: true }, native);
  expect(JSON.stringify(fixture.calls.at(-1))).toContain('修改后的问题'); expect(JSON.stringify(fixture.calls.at(-1))).not.toContain('第一问');
  expect(agentHistory('s2', fixture.config, null)).toHaveLength(1);
});
it('persists partial response exactly as displayed and does not silently fall back', async () => {
  fixture.fail = true; const native = vi.fn(async () => ({ ok: true }));
  const result = await routeExternalAgentTurn({ sessionId: 's1', text: '测试失败' }, native);
  expect(result.ok).toBe(false); expect(native).not.toHaveBeenCalled();
  const displayed = fixture.events.filter(e => e.type === 'token').map(e => e.content).join('');
  expect(getDb().prepare("SELECT content FROM messages WHERE role='assistant'").get()).toEqual({ content: displayed });
  expect(displayed).toContain('生成中断'); expect(fixture.events.at(-1)?.type).toBe('done');
});
it('rejects unsupported input before persistence or model calls and stops an aborted turn', async () => {
  const native = vi.fn(async () => ({ ok: true }));
  for (const input of [{ grillMe: true }, { images: [{ dataUrl: 'data:image/png;base64,abc' }] }]) {
    expect((await routeExternalAgentTurn({ sessionId: 's1', text: '不支持', ...input }, native)).ok).toBe(false);
  }
  const controller = new AbortController(); controller.abort();
  expect((await routeExternalAgentTurn({ sessionId: 's1', text: '已取消', signal: controller.signal }, native)).ok).toBe(false);
  expect(fixture.calls).toHaveLength(0); expect(getDb().prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({ n: 0 });
});

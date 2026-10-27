/** Real local cancellation smoke. Only targets the isolated trial on port 18991. */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = 'http://127.0.0.1:18991';
const request = async (route, data, method = 'POST') => {
  const response = await fetch(base + route, { method, headers: { Origin: base, 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(route + ' HTTP ' + response.status);
  return response.json();
};
const view = await request('/api/settings/external-agent', null, 'GET');
if (!view.supported || !view.settings.enabled) throw new Error('Isolated external-agent trial is not enabled');
const session = await request('/api/sessions', {});
const started = Date.now();
let before, after;
try {
  await request('/api/chat/send', { sessionId: session.id, text: '外置 Agent 取消操作验收。本轮将由测试主动停止，请解释牛顿第二定律。', online: false });
  await new Promise(resolve => setTimeout(resolve, 1800));
  before = await request('/api/chat/active', null, 'GET');
  if (!before.sessionIds.includes(session.id)) throw new Error('No active request was available to cancel');
  await request('/api/chat/abort', { sessionId: session.id });
  for (let i = 0; i < 50; i++) {
    after = await request('/api/chat/active', null, 'GET');
    if (!after.sessionIds.includes(session.id)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (after.sessionIds.includes(session.id)) throw new Error('Cancelled request did not settle');
  const result = { ok: true, kind: 'real-local-cancel', elapsedMs: Date.now() - started, activeBefore: true, activeAfter: false,
    note: 'Uses production send/abort and a real Codex bridge, not a fixture. Temporary test session is soft-deleted.' };
  const evidence = fileURLToPath(new URL('../../.runtime/external-agent-evidence/', import.meta.url)); mkdirSync(evidence, { recursive: true });
  writeFileSync(path.join(evidence, 'cancel.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await request('/api/sessions/' + session.id, null, 'DELETE'); }

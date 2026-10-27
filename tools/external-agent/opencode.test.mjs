import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { OpenCodeClient } from '../../packages/web/public/studentbuddy-opencode-client.mjs';
import { createAgentBridge } from '../../packages/web/public/studentbuddy-agent-chat-http.mjs';
async function fixture(run) {
  const state = { mode: 'ok', calls: [], events: new Set(), counter: 0 };
  const emit = (type, properties) => { for (const res of state.events) res.write('data: ' + JSON.stringify({ type, properties }) + '\n\n'); };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    state.calls.push({ url: req.url, method: req.method, body });
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('studentbuddy:fixture-password').toString('base64'));
    const send = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url === '/global/health') return send({ healthy: true });
    if (req.url === '/agent') return send([{ name: 'studentbuddy', permission: [{ permission: '*', pattern: '*', action: state.mode === 'unsafe' ? 'allow' : 'deny' }] }]);
    if (req.url === '/experimental/tool/ids') return send(['bash', 'read', 'webfetch', 'task']);
    if (req.url === '/config/providers') return send({ providers: [{ id: 'fixture', models: { 'chat-model': {} } }] });
    if (req.url === '/session') return send({ id: 'ses_test' + ++state.counter });
    if (req.url === '/event') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders(); state.events.add(res); res.on('close', () => state.events.delete(res)); return; }
    if (req.url.endsWith('/abort') || req.method === 'PATCH') return send(true);
    if (req.url.endsWith('/message')) {
      if (state.mode === 'hold') return;
      const sessionID = req.url.split('/')[2], messageID = 'msg_reply';
      if (state.mode === 'retry') { emit('session.status', { sessionID, status: { type: 'retry', attempt: 1, message: 'Free usage exceeded, subscribe to Go', next: Date.now() + 999999 } }); return; }
      const part = { sessionID, messageID, id: 'part_text', type: 'text', text: '' };
      emit('message.updated', { info: { sessionID: 'ses_other', id: 'other', role: 'assistant' } });
      emit('message.part.updated', { part: { ...part, sessionID: 'ses_other', messageID: 'other', text: 'SECRET' } });
      emit('message.updated', { info: { sessionID, id: 'user', role: 'user' } });
      emit('message.part.updated', { part: { ...part, messageID: 'user', text: 'USER' } });
      emit('message.updated', { info: { sessionID, id: messageID, role: 'assistant' } });
      emit('message.part.updated', { part: { ...part, id: 'reasoning', type: 'reasoning', text: 'PRIVATE' } });
      emit('message.part.updated', { part });
      emit('message.part.delta', { sessionID, messageID, partID: part.id, field: 'text', delta: '你' });
      emit('message.part.updated', { part: { ...part, text: '你好' } });
      await new Promise(resolve => setTimeout(resolve, 15));
      return send({ info: { finish: state.mode === 'length' ? 'length' : 'stop', ...(state.mode === '401' ? { error: { name: 'APIError', data: { statusCode: 401, responseHeaders: { secret: 'DO-NOT-EXPOSE' } } } } : {}) },
        parts: state.mode === 'tool' ? [{ type: 'tool' }] : [{ type: 'text', text: state.mode === 'mismatch' ? 'different' : '你好！' }] });
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  const rpc = new OpenCodeClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, password: 'fixture-password', signal: controller.signal });
  try { await run({ rpc, state, controller }); }
  finally { await rpc.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const history = [{ role: 'system', content: 'study style' }, { role: 'user', content: 'first' }, { role: 'assistant', content: 'previous' }, { role: 'user', content: 'next' }];
test('OpenCode streams only assistant text, reconciles final text, disables tools, and archives its fresh session', () => fixture(async ({ rpc, state }) => {
  await rpc.initialize(); assert.deepEqual(await rpc.models(), ['fixture/chat-model']); const deltas = [];
  assert.equal(await rpc.chat(history, 'fixture/chat-model', null, value => deltas.push(value)), '你好！'); assert.equal(deltas.join(''), '你好！');
  const create = state.calls.find(call => call.url === '/session'); assert.deepEqual(create.body.permission, [{ permission: '*', pattern: '*', action: 'deny' }]);
  const request = state.calls.find(call => call.url.endsWith('/message')).body;
  assert.deepEqual(request.model, { providerID: 'fixture', modelID: 'chat-model' }); assert.equal(request.system, 'study style');
  assert.deepEqual(JSON.parse(request.parts[0].text).conversation, history.slice(1)); assert.deepEqual(request.tools, { bash: false, read: false, webfetch: false, task: false });
  await rpc.stop(); assert.ok(state.calls.some(call => call.method === 'PATCH' && call.body.time.archived)); assert.ok(!state.calls.some(call => call.method === 'DELETE'));
}));
test('OpenCode rejects non-text, failed, truncated and contradictory answers without retry or credential diagnostics', async () => {
  for (const mode of ['401', 'length', 'tool', 'mismatch']) await fixture(async ({ rpc, state }) => {
    state.mode = mode; await rpc.initialize();
    await assert.rejects(rpc.chat(history, 'default', null, () => {}), error => !error.message.includes('DO-NOT-EXPOSE'));
    assert.equal(state.calls.filter(call => call.url.endsWith('/message')).length, 1);
  });
});
test('OpenCode requires a deny-all text agent and validates provider/model before creating a session', () => fixture(async ({ rpc, state }) => {
  state.mode = 'unsafe'; await assert.rejects(rpc.initialize(), /permissions/);
  await assert.rejects(rpc.chat(history, 'no-provider', null, () => {}), /provider\/model/); assert.equal(state.counter, 0);
}));
test('OpenCode cancellation aborts the actual native session and archives it', () => fixture(async ({ rpc, state, controller }) => {
  state.mode = 'hold'; await rpc.initialize();
  const task = rpc.chat(history, 'default', null, () => {});
  for (let i = 0; i < 100 && !state.calls.some(call => call.url.endsWith('/message')); i++) await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort(); await assert.rejects(task); await rpc.stop();
  assert.ok(state.calls.some(call => call.url.endsWith('/abort'))); assert.ok(state.calls.some(call => call.method === 'PATCH'));
}));
test('OpenCode upstream quota retry is surfaced immediately, not left waiting for hours', () => fixture(async ({ rpc, state }) => {
  state.mode = 'retry'; await rpc.initialize();
  await assert.rejects(rpc.chat(history, 'default', null, () => {}), /quota exhausted/); await rpc.stop();
  assert.equal(state.calls.filter(call => call.url.endsWith('/message')).length, 1);
  assert.ok(state.calls.some(call => call.url.endsWith('/abort')));
}));
test('shared HTTP core releases concurrency even when adapter cleanup throws', async () => {
  const server = createAgentBridge({ token: 'test', cwd: '.', maxConcurrent: 1, createRpc: () => ({ initialize() {}, models: () => [], stop() { throw new Error('cleanup'); } }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { for (let i = 0; i < 2; i++) assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/v1/models`, { headers: { Authorization: 'Bearer test' } })).status, 200); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('upstream model errors are 502, not falsely classified as invalid client payloads', async () => {
  const server = createAgentBridge({ token: 'test', cwd: '.', createRpc: () => ({ initialize() {}, stop() {}, chat() { throw new Error('OpenCode provider quota exhausted; select another model'); } }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ stream: false, messages: [{ role: 'user', content: 'test' }] }) });
    assert.equal(response.status, 502); assert.match((await response.json()).error.message, /quota/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

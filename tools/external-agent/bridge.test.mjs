import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import http from 'node:http';
import { createCodexBridge } from '../../packages/web/public/studentbuddy-codex-bridge.mjs';
import { CodexRpc } from '../../packages/web/public/studentbuddy-codex-rpc.mjs';

const token = 'fixture-pairing-key-with-no-real-credentials';
async function bridge(run, options = {}) {
  const state = { mode: 'ok', calls: 0, stopped: 0, aborted: false };
  const server = createCodexBridge({ token, cwd: process.cwd(), timeoutMs: 5000, ...options, createRpc: ({ signal }) => ({
    initialize: async () => {}, models: async () => ['fixture-model'], stop: () => { state.stopped++; },
    chat: async (_messages, _model, _cwd, onDelta) => {
      state.calls++;
      if (state.mode === 'error') throw new Error('fixture failure ' + token);
      onDelta('外置 Agent 的真实片段');
      if (state.mode === 'hold') await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { state.aborted = true; reject(new Error('stopped')); }, { once: true });
      });
      return '外置 Agent 的真实片段';
    },
  }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  const request = (route, body, extra = {}) => fetch(base + route, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    ...extra, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...extra.headers } });
  try { await run({ state, request, base }); }
  finally { server.stopAgents(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const body = { model: 'default', stream: true, messages: [{ role: 'user', content: '你好' }] };
test('bridge enforces pairing, Host, browser Origin and valid text-only messages', () => bridge(async ({ request, state, base }) => {
  assert.equal((await request('/models', null, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await request('/models', null, { headers: { Origin: 'http://evil.example' } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.request(base + '/models', { headers: { Host: 'evil.example', Authorization: 'Bearer ' + token } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await request('/chat/completions', { ...body, tools: [{}] })).status, 400);
  assert.equal((await request('/chat/completions', { ...body, messages: [{ role: 'user', content: [] }] })).status, 400);
  assert.equal((await request('/chat/completions', { ...body, messages: [{ role: 'assistant', content: 'bad' }] })).status, 400);
  assert.equal(state.calls, 0);
}));
test('bridge supports models, SSE and non-streaming clients without hidden retries', () => bridge(async ({ request, state }) => {
  assert.deepEqual((await (await request('/models')).json()).data.map(m => m.id), ['default', 'fixture-model']);
  const sse = await (await request('/chat/completions', body)).text();
  assert.match(sse, /外置 Agent 的真实片段/); assert.match(sse, /\[DONE\]/);
  assert.equal((await (await request('/chat/completions', { ...body, stream: false })).json()).choices[0].message.content, '外置 Agent 的真实片段');
  state.mode = 'error';
  const failure = await (await request('/chat/completions', body)).text();
  assert.match(failure, /error/); assert.doesNotMatch(failure, /\[DONE\]/); assert.ok(!failure.includes(token));
  assert.equal(state.calls, 3);
}));
test('bridge cancellation reaches the agent and concurrent work is bounded', () => bridge(async ({ request, state }) => {
  state.mode = 'hold'; const controller = new AbortController();
  const response = await request('/chat/completions', body, { signal: controller.signal });
  const reader = response.body.getReader(); await reader.read();
  assert.equal((await request('/chat/completions', body)).status, 429);
  controller.abort(); await reader.cancel().catch(() => {});
  for (let i = 0; i < 50 && !state.aborted; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(state.aborted, true);
}, { maxConcurrent: 1 }));

function fakeChild(mode = 'ok') {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.killed = false;
  child.kill = () => { child.killed = true; child.emit('exit', 0); };
  const send = message => child.stdout.write(JSON.stringify(message) + '\n');
  const calls = [];
  child.stdin = new Writable({ write(bytes, _encoding, callback) {
    const message = JSON.parse(bytes.toString()); calls.push(message);
    queueMicrotask(() => {
      if (!message.id) return;
      if (message.method === 'initialize') send({ id: message.id, result: {} });
      else if (message.method === 'config/read') send({ id: message.id, result: { config: { mcp_servers: { private_server: {} }, plugins: { 'private-plugin@local': { enabled: true } } } } });
      else if (message.method === 'thread/start') send({ id: message.id, result: { thread: { id: 'fixture-thread' } } });
      else if (message.method === 'turn/start') {
        if (mode === 'exit') { child.emit('exit', 1); return; }
        if (mode === 'exit-after-ack') { send({ id: message.id, result: { turn: { id: 'turn-1' } } }); setImmediate(() => child.emit('exit', 1)); return; }
        send({ method: 'item/agentMessage/delta', params: { threadId: 'fixture-thread', delta: '你好' } });
        send({ method: 'turn/completed', params: { threadId: 'fixture-thread', turn: { status: mode === 'failed' ? 'failed' : 'completed' } } });
        send({ id: message.id, result: { turn: { id: 'turn-1' } } });
      }
    }); callback();
  } });
  return { child, calls };
}
test('RPC handles notifications before response, isolates ephemeral text threads, and disables inherited tools', async () => {
  const fake = fakeChild(), controller = new AbortController();
  const rpc = new CodexRpc({ cwd: process.cwd(), signal: controller.signal, executable: 'fixture', spawnProcess: () => fake.child });
  await rpc.initialize();
  assert.equal(await rpc.chat(body.messages, 'default', process.cwd(), () => {}), '你好');
  const start = fake.calls.find(c => c.method === 'thread/start');
  assert.equal(start.params.ephemeral, true); assert.equal(start.params.sandbox, 'read-only');
  assert.equal(start.params.config['mcp_servers.private_server.enabled'], false);
  assert.equal(start.params.config['features.shell_tool'], false);
  assert.equal(start.params.config['plugins.private-plugin@local.enabled'], false);
  assert.equal(fake.calls.find(c => c.method === 'turn/start').params.effort, 'low');
  rpc.stop(); assert.equal(fake.child.killed, true);
});
test('RPC child exit and failed turns reject instead of hanging or pretending success', async () => {
  for (const mode of ['exit', 'exit-after-ack', 'failed']) {
    const fake = fakeChild(mode), controller = new AbortController();
    const rpc = new CodexRpc({ cwd: process.cwd(), signal: controller.signal, executable: 'fixture', spawnProcess: () => fake.child });
    await rpc.initialize(); await assert.rejects(rpc.chat(body.messages, 'default', process.cwd(), () => {})); rpc.stop();
  }
});

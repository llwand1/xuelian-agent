import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_EXTERNAL_AGENT } from '@sb/shared';
import { probeAgent, streamAgent } from './transport.js';
import type { AgentConnection } from './settings.js';
let server: Server, config: AgentConnection, mode: string, requests: number, closed: boolean;
beforeEach(async () => {
  mode = 'stream'; requests = 0; closed = false;
  server = createServer((req, res) => {
    requests++;
    expect(req.headers.authorization).toBe('Bearer fixture-secret');
    if (mode === 'denied') { res.writeHead(401); res.end('do not disclose raw secrets'); return; }
    if (mode === 'redirect') { res.writeHead(302, { Location: 'http://example.com' }); res.end(); return; }
    if (mode === 'quota-json') { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'OpenCode provider quota exhausted; private-provider-secret' } })); return; }
    if (mode === 'qoder-auth') { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Qoder authentication required; private-provider-secret' } })); return; }
    if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'fixture-agent' }] })); return; }
    if (mode === 'json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: '一次性回答' }, finish_reason: 'stop' }] })); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const frame = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`;
    if (mode === 'quota-sse') { res.end(frame({ error: { message: 'OpenCode provider quota exhausted; private-provider-secret' } })); return; }
    const bytes = Buffer.from(frame({ choices: [{ delta: { content: '你好，Agent！' } }] }));
    res.write(bytes.subarray(0, 54)); res.write(bytes.subarray(54));
    if (mode === 'hold') { res.on('close', () => { closed = true; }); return; }
    if (mode === 'error') res.end(frame({ error: { message: 'private provider diagnostics' } }));
    else if (mode === 'tools') res.end(frame({ choices: [{ delta: { tool_calls: [] }, finish_reason: 'tool_calls' }] }));
    else if (mode === 'cut') res.end();
    else res.end(frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\r\n\r\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  config = { ...DEFAULT_EXTERNAL_AGENT, token: 'fixture-secret', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` };
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const collect = async (signal?: AbortSignal) => { let text = ''; for await (const delta of streamAgent(config, [{ role: 'user', content: '你好' }], signal)) text += delta; return text; };
it('streams UTF-8/SSE chunks and accepts a non-streaming compatible agent', async () => {
  expect(await collect()).toBe('你好，Agent！'); mode = 'json'; expect(await collect()).toBe('一次性回答');
});
it('probes model list without creating or retrying a generation', async () => {
  expect((await probeAgent(config)).models).toEqual(['fixture-agent']); expect(requests).toBe(1);
});
it('explains that Qoder CLI login is distinct from desktop login without relaying credentials', async () => {
  mode = 'qoder-auth'; await expect(collect()).rejects.toThrow('桌面登录不会自动代替 CLI 登录'); expect(requests).toBe(1);
});
it('explains a known OpenCode quota error for SSE and HTTP without exposing provider diagnostics', async () => {
  for (const failure of ['quota-sse', 'quota-json']) {
    mode = failure; const before = requests;
    await expect(collect()).rejects.toThrow('OpenCode 当前模型额度已用尽'); expect(requests - before).toBe(1);
    await expect(collect()).rejects.not.toThrow('private-provider-secret');
  }
});
it('rejects auth failures, redirect, truncated streams, error frames and tool requests without retry', async () => {
  for (const failure of ['denied', 'redirect', 'cut', 'error', 'tools']) { mode = failure; const before = requests; await expect(collect()).rejects.toThrow(); expect(requests - before).toBe(1); }
});
it('cancels the actual upstream connection on stop', async () => {
  mode = 'hold'; const controller = new AbortController();
  const output = streamAgent(config, [{ role: 'user', content: '等一下' }], controller.signal);
  expect((await output.next()).value).toBe('你好，Agent！'); controller.abort();
  await expect(output.next()).rejects.toThrow();
  for (let i = 0; i < 30 && !closed; i++) await new Promise(resolve => setTimeout(resolve, 10));
  expect(closed).toBe(true);
});

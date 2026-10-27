/** Shared loopback OpenAI-compatible text bridge. No agent-specific credentials or execution here. */
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';

export function validateMessages(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 101) throw new Error('messages must contain 1–101 text messages');
  if (body.tools || body.functions) throw new Error('This is a text-only agent bridge; tool calls are not accepted');
  const messages = body.messages.map(message => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.tool_calls) throw new Error('Only system/user/assistant text messages are supported');
    return { role: message.role, content: message.content };
  });
  if (messages.at(-1).role !== 'user') throw new Error('Last message must be a user message');
  if (messages.reduce((size, message) => size + message.content.length, 0) > 130000) throw new Error('Conversation exceeds 130000 characters');
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 160)) throw new Error('Invalid model');
  return messages;
}
export function createAgentBridge({ token, cwd, createRpc, timeoutMs = 180000, maxConcurrent = 2, ownedBy = 'local-agent' }) {
  let active = 0;
  const controllers = new Set();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || '';
    const address = server.address();
    if (host !== `127.0.0.1:${address.port}` || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers.origin) {
      json(res, 403, { error: { message: 'Local non-browser clients only' } }); return;
    }
    const key = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + token);
    if (key.length !== expected.length || !timingSafeEqual(key, expected)) { json(res, 401, { error: { message: 'Pairing key required' } }); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.search || !['/v1/models', '/v1/chat/completions'].includes(url.pathname) ||
        (url.pathname === '/v1/models' ? req.method !== 'GET' : req.method !== 'POST')) { json(res, 404, { error: { message: 'Endpoint not found' } }); return; }
    if (active >= maxConcurrent) { json(res, 429, { error: { message: 'Agent bridge is busy; no request was queued' } }); return; }
    active++;
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', closed); req.on('aborted', closed);
    let rpc, inputPending = req.method === 'POST';
    try {
      let body, messages;
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Request exceeds 1MB'); chunks.push(chunk); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')); messages = validateMessages(body);
        inputPending = false;
      }
      rpc = createRpc({ cwd, signal: controller.signal });
      await rpc.initialize();
      if (req.method === 'GET') {
        const models = await rpc.models();
        json(res, 200, { object: 'list', data: ['default', ...models].map(id => ({ id, object: 'model', owned_by: ownedBy })) }); return;
      }
      const id = 'chatcmpl-' + randomUUID(), created = Math.floor(Date.now() / 1000), model = body.model || 'default';
      const event = (delta, finish_reason = null) => ({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] });
      let heartbeat;
      const sse = data => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
      if (body.stream !== false) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
        sse(event({ role: 'assistant' }));
        heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 10000);
      }
      try {
        const text = await rpc.chat(messages, model, cwd, delta => { if (body.stream !== false) sse(event({ content: delta })); });
        controller.signal.throwIfAborted();
        if (body.stream === false) json(res, 200, { id, object: 'chat.completion', created, model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] });
        else { sse(event({}, 'stop')); res.end('data: [DONE]\n\n'); }
      } finally { clearInterval(heartbeat); }
    } catch (error) {
      const message = controller.signal.aborted ? 'Agent request cancelled or timed out' : error instanceof Error ? error.message : 'Agent request failed';
      // Scrub secrets and don't surface provider diagnostics beyond a bounded error description.
      const safe = message.replaceAll(token, '[redacted]').slice(0, 500);
      if (!res.destroyed) {
        if (res.headersSent) res.end(`data: ${JSON.stringify({ error: { message: safe } })}\n\n`);
        else json(res, inputPending ? 400 : 502, { error: { message: safe } });
      }
    } finally {
      clearTimeout(timer); res.removeListener('close', closed); req.removeListener('aborted', closed);
      try { await rpc?.stop(); } catch { /* Cleanup cannot turn a completed HTTP reply into an unhandled rejection. */ }
      finally { controller.abort(); controllers.delete(controller); active--; }
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.stopAgents = () => { for (const controller of controllers) controller.abort(); };
  return server;
}

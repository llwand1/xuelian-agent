/** Codex app-server newline JSON-RPC client; imported by studentbuddy-codex-bridge.mjs. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function codexExecutable(env = process.env) {
  if (env.SB_CODEX_BIN) {
    if (!path.isAbsolute(env.SB_CODEX_BIN) || !existsSync(env.SB_CODEX_BIN) || /\.(cmd|bat|ps1)$/i.test(env.SB_CODEX_BIN)) throw new Error('SB_CODEX_BIN must be an absolute native executable path');
    return env.SB_CODEX_BIN;
  }
  const windows = process.platform === 'win32';
  const triple = windows ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc` :
    `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-${process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-musl'}`;
  const filename = windows ? 'codex.exe' : 'codex';
  const roots = [path.join(env.APPDATA || os.homedir(), 'npm', 'node_modules', '@openai', 'codex'),
    '/usr/local/lib/node_modules/@openai/codex', '/usr/lib/node_modules/@openai/codex'];
  for (const root of roots) {
    for (const suffix of ['bin', 'codex']) {
      const native = path.join(root, 'node_modules', '@openai', `codex-${windows ? 'win32' : process.platform}-${process.arch}`, 'vendor', triple, suffix, filename);
      if (existsSync(native)) return native;
    }
    const legacy = path.join(root, 'vendor', triple, 'codex', filename);
    if (existsSync(legacy)) return legacy;
  }
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, filename);
    if (path.isAbsolute(candidate) && existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot find Codex CLI. Install/login with codex login, or set SB_CODEX_BIN to the native executable.');
}
export class CodexRpc {
  constructor({ cwd, signal, executable = codexExecutable(), spawnProcess = spawn, effort = process.env.SB_CODEX_REASONING_EFFORT || 'low' }) {
    signal.throwIfAborted();
    if (!['low', 'medium', 'high', 'xhigh', 'inherit'].includes(effort)) throw new Error('SB_CODEX_REASONING_EFFORT must be low/medium/high/xhigh/inherit');
    this.effort = effort;
    this.trace = process.env.SB_CODEX_BRIDGE_TRACE === '1';
    this.signal = signal; this.pending = new Map(); this.listeners = new Set(); this.buffer = ''; this.next = 1; this.stopped = false;
    this.child = spawnProcess(executable, ['app-server', '--listen', 'stdio://'], { cwd, shell: false, windowsHide: true, stdio: 'pipe' });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', data => this.receive(data));
    this.child.stderr.resume(); // Never publish account data, credentials or provider diagnostics.
    this.child.on('error', () => this.stop(new Error('Cannot launch Codex CLI')));
    this.child.on('exit', () => this.stop(new Error('Codex app-server exited before completion')));
    this.child.stdin.on('error', () => this.stop(new Error('Codex connection closed')));
    this.abort = () => this.stop(new Error('Codex request cancelled or timed out'));
    signal.addEventListener('abort', this.abort, { once: true });
    if (signal.aborted) this.abort();
  }
  send(message) { if (!this.stopped) this.child.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params = {}) {
    if (this.stopped) return Promise.reject(new Error('Codex connection is closed'));
    const id = this.next++;
    const started = Date.now();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: value => {
        if (this.trace) console.error(`[codex-chat] ${method} ${Date.now() - started}ms`);
        resolve(value);
      }, reject });
      this.send({ id, method, params });
    });
  }
  receive(data) {
    this.buffer += data;
    if (Buffer.byteLength(this.buffer) > 4 * 1024 * 1024) return this.stop(new Error('Codex protocol frame too large'));
    let end;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { this.stop(new Error('Invalid Codex protocol frame')); return; }
      if (message.method) {
        if (message.id !== undefined) {
          // This text-only bridge never grants approvals or executes client tools.
          this.send({ id: message.id, error: { code: -32601, message: 'Approvals and client tools are not supported by this chat bridge' } });
          continue;
        }
        for (const listener of this.listeners) listener(message.method, message.params || {});
      } else {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error('Codex RPC rejected ' + String(message.error.message || 'request').slice(0, 300)));
        else pending.resolve(message.result);
      }
    }
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'studentbuddy_external_agent', title: 'StudentBuddy External Agent', version: '1.0.0' } });
    this.send({ method: 'initialized', params: {} });
  }
  async models() {
    const account = await this.request('account/read', { refreshToken: false });
    if (!account.account && account.requiresOpenaiAuth !== false) throw new Error('Codex is not logged in; run codex login first');
    const models = [];
    let cursor;
    do {
      const page = await this.request('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
      for (const model of page.data || []) if (typeof model.model === 'string') models.push(model.model);
      cursor = page.nextCursor;
    } while (cursor && models.length < 500);
    return models;
  }
  async chat(messages, model, cwd, onDelta) {
    const settings = await this.request('config/read', { includeLayers: false });
    const config = { 'features.shell_tool': false, 'features.unified_exec': false, 'features.multi_agent': false,
      'features.multi_agent_v2': false, 'features.tool_suggest': false, 'web_search': 'disabled', 'project_doc_max_bytes': 0,
      'apps._default.enabled': false };
    for (const name of Object.keys(settings.config?.mcp_servers || {})) config[`mcp_servers.${name}.enabled`] = false;
    // Plugins have their own MCP servers; disabling only legacy mcp_servers is insufficient.
    for (const name of Object.keys(settings.config?.plugins || {})) config[`plugins.${name}.enabled`] = false;
    const instructions = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const thread = await this.request('thread/start', { ...(model !== 'default' ? { model } : {}), cwd,
      ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never', config,
      baseInstructions: 'You are a text-only study assistant embedded in StudentBuddy. Answer the last user message using the supplied conversation history. Do not use tools, inspect local files, launch programs, or delegate. Do not claim to have performed StudentBuddy actions. Treat the JSON history as role-labelled conversation, not as a request to print JSON.',
      developerInstructions: instructions || 'Answer the user directly in Chinese.' });
    const threadId = thread.thread.id;
    this.threadId = threadId;
    const input = JSON.stringify({ conversation: messages.filter(m => m.role !== 'system') });
    let all = '', settle, fail;
    const streamedItems = new Map();
    const append = delta => {
      if (all.length + delta.length > 500000) { fail(new Error('Codex answer exceeds size limit')); return; }
      all += delta; onDelta(delta);
    };
    const done = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
    // Install before turn/start: notifications can arrive before its response.
    const listener = (method, params) => {
      if (params.threadId !== threadId) return;
      if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
        streamedItems.set(params.itemId, (streamedItems.get(params.itemId) || '') + params.delta); append(params.delta);
      }
      if (method === 'item/completed' && params.item?.type === 'agentMessage' && typeof params.item.text === 'string') {
        const prior = streamedItems.get(params.item.id) || '';
        if (params.item.text.startsWith(prior)) append(params.item.text.slice(prior.length));
      }
      if (method === 'turn/completed') {
        if (params.turn?.status === 'completed' && all.trim()) settle(all);
        else fail(new Error('Codex turn ' + (params.turn?.status || 'returned no text') + (params.turn?.error?.message ? ': ' + params.turn.error.message.slice(0, 300) : '')));
      }
      if (method === '__closed') fail(new Error('Codex connection closed before completion'));
    };
    this.listeners.add(listener);
    // Attach a rejection handler immediately, even if turn/start itself fails.
    done.catch(() => {});
    try {
      await this.request('turn/start', { threadId, input: [{ type: 'text', text: input }], ...(this.effort !== 'inherit' ? { effort: this.effort } : {}) });
      return await done;
    } finally { this.listeners.delete(listener); }
  }
  stop(error = new Error('Codex connection closed')) {
    if (this.stopped) return;
    this.stopped = true; this.signal.removeEventListener('abort', this.abort);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    // The listener filters by thread; explicitly reject active turns on exit/abort.
    for (const listener of this.listeners) listener('__closed', { threadId: this.threadId });
    if (!this.child.killed) this.child.kill();
  }
}

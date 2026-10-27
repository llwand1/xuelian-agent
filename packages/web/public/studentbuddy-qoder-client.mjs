/** Qoder / Qoder CN headless text adapter. No credentials, user sessions or global settings are copied. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
const modelPattern = /^[\p{L}\p{N}][\p{L}\p{N}_.:/ +()-]{0,159}$/u;
export function qoderCommand(env = process.env) {
  const from = file => ({ executable: /\.[cm]?js$/i.test(file) ? process.execPath : file, args: /\.[cm]?js$/i.test(file) ? [file] : [] });
  const explicit = env.SB_QODER_CLI || env.SB_QODER_BIN;
  if (explicit) {
    if (!path.isAbsolute(explicit) || !fs.statSync(explicit, { throwIfNoEntry: false })?.isFile() || /\.(cmd|bat|ps1)$/i.test(explicit)) throw new Error('SB_QODER_CLI / SB_QODER_BIN must be an absolute native executable or Node CLI entry path');
    return from(explicit);
  }
  const directories = [...(env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin')];
  for (const dir of directories) {
    for (const name of ['qodercn', 'qoder', 'qoderclicn', 'qodercli']) {
      const file = path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
      if (path.isAbsolute(file) && fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return from(file);
    }
    for (const [pkg, entry] of [['@qodercn-ai/qoderclicn', 'qoderclicn.js'], ['@qoder-ai/qodercli', 'qodercli.js']]) {
      const file = path.join(dir, 'node_modules', pkg, 'bundle', entry);
      if (path.isAbsolute(file) && fs.existsSync(file)) return from(file);
    }
  }
  throw new Error('Qoder CLI missing; install Qoder / Qoder CN CLI or set SB_QODER_CLI to its Node entry');
}
export const QODER_TEXT_SETTINGS = {
  disableAllHooks: true, permissions: { deny: ['*'] },
  general: { enableAutoUpdate: false, maxAttempts: 1, retryFetchErrors: false, sessionRetention: { enabled: false }, fileCheckpointing: { enabled: false } },
  context: { fileName: [], loadMemoryFromIncludeDirectories: false }, agentsMdExcludes: ['**'], enabledPlugins: {}, mcpServers: {},
};
export function qoderTextArgs() {
  return ['--setting-sources', '', '--settings', JSON.stringify(QODER_TEXT_SETTINGS), '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', '', '--disallowed-tools', '*', '--permission-mode', 'dont_ask', '--max-model-request-retries', '0'];
}
export function parseQoderModels(text) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '').trim(); let values;
  if (clean.startsWith('[') || clean.startsWith('{')) {
    const value = JSON.parse(clean), list = Array.isArray(value) ? value : value.models || value.data;
    if (Array.isArray(list)) values = list.map(item => typeof item === 'string' ? item : item.id || item.key || item.name);
  } else {
    const lines = clean.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines[0] === 'MODEL') values = lines.slice(1);
  }
  if (!values?.length || values.length > 200 || values.some(value => typeof value !== 'string' || !modelPattern.test(value))) throw new Error('Qoder returned an unrecognized model catalog; update the bridge instead of guessing model IDs');
  return [...new Set(values)];
}
function failure(diagnostics, code) {
  if (/not logged in|authentication_failed|login.required|unauthorized|HTTP 401/i.test(diagnostics)) return new Error('Qoder authentication required; run qodercn login (CN) or qoder login, then test again');
  if (/quota|credit.{0,30}(exhaust|insufficient)|usage.{0,20}exceed|insufficient.{0,20}balance|额度|余额不足/i.test(diagnostics)) return new Error('Qoder provider quota exhausted; choose an available model in Qoder');
  return new Error(`Qoder did not complete the request (exit ${code ?? 'unknown'}); check the CLI account and model. No retry or fallback was used`);
}
export class QoderClient {
  constructor({ cwd, signal, command, spawnProcess = spawn, onChild, onClose }) {
    this.cwd = cwd; this.signal = signal; this.command = command || qoderCommand(); this.spawnProcess = spawnProcess; this.children = new Set();
    this.onChild = onChild; this.onClose = onClose;
  }
  async initialize() {
    const help = await this.run(['--help']);
    for (const flag of ['--tools', '--setting-sources', '--settings', '--strict-mcp-config', '--mcp-config', '--no-session-persistence', '--permission-mode', '--max-model-request-retries']) {
      if (!help.includes(flag)) throw new Error('Qoder CLI lacks text-isolation flags; update the official CLI before connecting');
    }
  }
  async models() { return parseQoderModels(await this.run([...qoderTextArgs(), '--list-models'])); }
  run(args, input, onLine) {
    this.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const env = { ...process.env, QODERCN_MEMORY: '0', QODERCN_MEMORY_USER: '0', QODER_MEMORY: '0', QODER_MEMORY_USER: '0' };
      for (const key of ['QODERCN_SESSION_ID', 'QODER_SESSION_ID', 'QODER_AGENT_SDK_ENTRYPOINT']) delete env[key];
      const child = this.spawnProcess(this.command.executable, [...this.command.args, ...args], { cwd: this.cwd, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      this.children.add(child); let finished = false, stdout = '', stderr = '', buffer = '', size = 0;
      const decoder = new StringDecoder('utf8');
      const finish = (error, value) => {
        if (finished) return; finished = true; this.signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => { child.kill(); finish(new Error('Qoder request cancelled')); };
      this.signal.addEventListener('abort', abort, { once: true });
      const consume = text => {
        if (!onLine) { stdout += text; return; }
        buffer += text; let end;
        while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); if (line) onLine(JSON.parse(line)); }
      };
      child.stdout.on('data', bytes => {
        if (finished) return;
        try { size += bytes.length; if (size > 2 * 1024 * 1024) throw new Error('Qoder output exceeds 2MB'); consume(decoder.write(bytes)); }
        catch (error) { child.kill(); finish(error); }
      });
      child.stderr.on('data', bytes => { if (stderr.length < 8192) stderr += bytes.toString('utf8').slice(0, 8192 - stderr.length); });
      child.on('error', () => finish(new Error('Could not start Qoder CLI; check its executable path')));
      child.once('close', code => {
        this.children.delete(child);
        try { this.onClose?.(child.pid); } catch { /* PID records never override parent/executable checks. */ }
        if (finished) return;
        try {
          consume(decoder.end()); if (onLine && buffer.trim()) onLine(JSON.parse(buffer));
          if (code !== 0) throw failure(stderr, code);
          finish(null, stdout);
        } catch (error) { finish(error); }
      });
      child.stdin.on('error', () => { /* A closed CLI is reported by close/error, not as an unhandled EPIPE. */ });
      try { if (child.pid) this.onChild?.({ pid: child.pid, executable: this.command.executable, entryArgs: this.command.args }); }
      catch { child.kill(); finish(new Error('Could not record the Qoder process lifecycle')); return; }
      child.stdin.end(input || '');
      if (this.signal.aborted) abort();
    });
  }
  async chat(messages, model, _cwd, onDelta) {
    if (model !== 'default' && !modelPattern.test(model)) throw new Error('Invalid Qoder model ID');
    let initialized = false, sessionId, output = '', result;
    const append = text => { if (output.length + text.length > 500000) throw new Error('Qoder answer exceeds size limit'); output += text; if (text) onDelta(text); };
    const event = value => {
      if (value.type === 'system' && value.subtype === 'init') {
        if (initialized || typeof value.session_id !== 'string' || !value.session_id || !Array.isArray(value.tools) || value.tools.length || !Array.isArray(value.mcp_servers) || value.mcp_servers.length || !Array.isArray(value.plugins) || value.plugins.length) throw new Error('Qoder text isolation check failed: session identity, tools, MCP or plugins are invalid');
        initialized = true; sessionId = value.session_id; return;
      }
      if (value.session_id && sessionId && value.session_id !== sessionId) throw new Error('Qoder returned another session');
      if (value.parent_tool_use_id) throw new Error('Qoder returned delegated work in a text-only session');
      if (value.type === 'assistant') {
        if (!initialized) throw new Error('Qoder answer arrived without isolation confirmation');
        const parts = value.message?.content;
        if (value.message?.role && value.message.role !== 'assistant' || !Array.isArray(parts) || parts.some(part => ['tool_use', 'tool_result'].includes(part.type) || part.type === 'text' && typeof part.text !== 'string')) throw new Error('Qoder returned an invalid assistant or a tool action in a text-only session');
        const text = parts.filter(part => part.type === 'text').map(part => part.text || '').join('');
        if (text) { if (!text.startsWith(output)) throw new Error('Qoder assistant snapshots disagree'); append(text.slice(output.length)); }
      }
      if (value.type === 'result') { if (result) throw new Error('Qoder returned duplicate completion results'); result = value; }
      if (value.type === 'control_request' || value.type === 'stream_event' && value.event?.content_block?.type === 'tool_use') throw new Error('Qoder requested a tool or permission; the text request was stopped');
    };
    await this.run([...qoderTextArgs(), '--print', '--output-format', 'stream-json', '--no-session-persistence', '--max-output-tokens', '8192',
      '--system-prompt', 'You are StudentBuddy\'s text-only learning assistant. Answer the last user message in the supplied JSON conversation. Respect its system-role study preferences. Do not invoke tools, files, commands, plugins, skills, delegation or hidden memory. Do not claim to execute StudentBuddy actions.',
      ...(model !== 'default' ? ['--model', model] : [])], JSON.stringify({ conversation: messages }), event);
    if (!initialized || !result) throw new Error('Qoder exited before a verified completion result');
    if (result.subtype !== 'success' || result.is_error !== false || result.permission_denials?.length) throw failure(JSON.stringify({ error: result.error_code, result: result.result, errors: result.errors }), 0);
    if (result.stop_reason && !['end_turn', 'stop', 'stop_sequence'].includes(result.stop_reason)) throw new Error('Qoder answer was truncated or did not stop normally');
    if (typeof result.result !== 'string' || !result.result.trim() || !result.result.startsWith(output)) throw new Error('Qoder final text is empty or inconsistent with the assistant message');
    append(result.result.slice(output.length)); return output;
  }
  async stop() {
    await Promise.all([...this.children].map(child => new Promise(resolve => {
      if (child.exitCode !== null && child.exitCode !== undefined) return resolve();
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000);
      child.once('close', () => { clearTimeout(timer); resolve(); }); child.kill();
    })));
  }
}

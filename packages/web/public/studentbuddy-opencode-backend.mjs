/** Launch an authenticated, pure, text-only native OpenCode server without changing global config. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
export const OPENCODE_CHAT_AGENT = { description: 'StudentBuddy text-only learning conversation', mode: 'primary',
  prompt: 'You are a text-only study assistant. Answer the last user message using the supplied role-labelled JSON history. Do not call tools, inspect local files, execute commands or delegate. Never claim to perform StudentBuddy actions.',
  permission: { '*': 'deny' }, tools: { '*': false } };
export function opencodeExecutable(env = process.env) {
  const name = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  if (env.SB_OPENCODE_BIN) {
    if (!path.isAbsolute(env.SB_OPENCODE_BIN) || !fs.existsSync(env.SB_OPENCODE_BIN) || /\.(cmd|bat|ps1)$/i.test(env.SB_OPENCODE_BIN)) throw new Error('SB_OPENCODE_BIN must be an absolute native executable path');
    return env.SB_OPENCODE_BIN;
  }
  const candidates = (env.PATH || '').split(path.delimiter).flatMap(dir => [path.join(dir, name), path.join(dir, 'node_modules', 'opencode-ai', 'bin', name)]);
  candidates.push(path.join(os.homedir(), '.opencode', 'bin', name), '/usr/local/bin/opencode');
  const found = candidates.find(file => path.isAbsolute(file) && fs.existsSync(file));
  if (!found) throw new Error('Cannot find OpenCode; install it or set SB_OPENCODE_BIN');
  return found;
}
export async function ensureOpenCodeBackend({ dir, port = 4014 }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const passwordFile = path.join(dir, 'backend-password');
  if (!fs.existsSync(passwordFile)) fs.writeFileSync(passwordFile, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
  const password = fs.readFileSync(passwordFile, 'utf8').trim(), username = 'studentbuddy';
  if (!/^[\w-]{32,128}$/.test(password)) throw new Error('Invalid OpenCode backend password file');
  const baseUrl = `http://127.0.0.1:${port}`, headers = { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64') };
  const get = async route => {
    const response = await fetch(baseUrl + route, { headers, redirect: 'error', signal: AbortSignal.timeout(2000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('OpenCode backend HTTP ' + response.status); }
    return response.json();
  };
  try { if ((await get('/global/health')).healthy) return { baseUrl, username, password, close() {} }; }
  catch (error) { if (/HTTP (401|403)/.test(error.message)) throw new Error('OpenCode backend port is occupied by a differently authenticated service'); }
  const cwd = path.join(dir, 'chat-workspace'); fs.mkdirSync(cwd, { recursive: true });
  const executable = opencodeExecutable(), args = ['--pure', 'serve', '--hostname', '127.0.0.1', '--port', String(port)];
  const config = { permission: { '*': 'deny' }, tools: { '*': false }, autoupdate: false, snapshot: false,
    agent: { studentbuddy: OPENCODE_CHAT_AGENT }, default_agent: 'studentbuddy' };
  let child;
  const proxy = process.env.SB_OPENCODE_PROXY;
  if (proxy) {
    const url = new URL(proxy);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('SB_OPENCODE_PROXY must be an HTTP proxy URL without credentials');
  }
  const start = () => {
    child = spawn(executable, args, { cwd, env: { ...process.env, ...(proxy ? { HTTP_PROXY: proxy, HTTPS_PROXY: proxy, NO_PROXY: '127.0.0.1,localhost,::1' } : {}), OPENCODE_SERVER_USERNAME: username, OPENCODE_SERVER_PASSWORD: password, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.resume(); child.stderr.resume(); child.on('error', () => {});
    fs.writeFileSync(path.join(dir, 'backend-state.json'), JSON.stringify({ pid: child.pid, parentPid: process.pid, executable, args, port }));
  };
  const wait = async () => {
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error('OpenCode server exited during startup');
      try { if ((await get('/global/health')).healthy) return; } catch { /* Startup wait, not an inference retry. */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('OpenCode server startup timed out');
  };
  try {
    start(); await wait();
    const current = await get('/config'), mcp = Object.keys(current.mcp || {});
    if (mcp.length) {
      child.kill(); await new Promise(resolve => child.once('exit', resolve));
      config.mcp = Object.fromEntries(mcp.map(name => [name, { enabled: false }])); start(); await wait();
    }
    return { baseUrl, username, password, close() { if (!child.killed) child.kill(); } };
  } catch (error) { if (child && !child.killed) child.kill(); throw error; }
}

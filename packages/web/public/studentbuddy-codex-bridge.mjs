#!/usr/bin/env node
/** StudentBuddy Codex chat bridge. Node 22+, native Codex CLI, no npm dependencies. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CodexRpc } from './studentbuddy-codex-rpc.mjs';
import { createAgentBridge } from './studentbuddy-agent-chat-http.mjs';
export { validateMessages } from './studentbuddy-agent-chat-http.mjs';
export function createCodexBridge(options) {
  return createAgentBridge({ ...options, createRpc: options.createRpc ?? (input => new CodexRpc(input)), ownedBy: 'local-codex' });
}
function main() {
  const port = Number(process.env.SB_CODEX_BRIDGE_PORT || 4012);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SB_CODEX_BRIDGE_PORT must be 1024–65535');
  const dir = path.resolve(process.env.SB_CODEX_BRIDGE_DATA_DIR || path.join(os.homedir(), '.studentbuddy', 'codex-chat-bridge'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dir, 'pairing-key');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
  const token = fs.readFileSync(keyFile, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid pairing-key file');
  const cwd = path.join(dir, 'chat-workspace'); fs.mkdirSync(cwd, { recursive: true });
  const server = createCodexBridge({ token, cwd });
  server.on('error', error => { console.error('Codex chat bridge could not start:', error.code || 'error'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`StudentBuddy Codex chat bridge: http://127.0.0.1:${port}/v1`);
    console.log(`Pairing key file (paste its content only into StudentBuddy): ${keyFile}`);
    console.log('Text only; loopback only. StudentBuddy owns history; each request uses a new ephemeral Codex thread. No automatic retries.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.stopAgents(); server.close(() => process.exit(0)); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

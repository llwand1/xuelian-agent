#!/usr/bin/env node
/** OpenCode -> shared OpenAI-compatible StudentBuddy bridge. Node 22+, no npm dependencies. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAgentBridge } from './studentbuddy-agent-chat-http.mjs';
import { OpenCodeClient } from './studentbuddy-opencode-client.mjs';
import { ensureOpenCodeBackend } from './studentbuddy-opencode-backend.mjs';
export function createOpenCodeBridge(options) {
  return createAgentBridge({ ...options, createRpc: options.createRpc ?? (input => new OpenCodeClient({ ...options.backend, signal: input.signal })), ownedBy: 'local-opencode' });
}
async function main() {
  const port = Number(process.env.SB_OPENCODE_BRIDGE_PORT || 4013), backendPort = Number(process.env.SB_OPENCODE_BACKEND_PORT || 4014);
  if (![port, backendPort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535) || port === backendPort) throw new Error('OpenCode bridge/backend ports must be distinct integers, 1024–65535');
  const dir = path.resolve(process.env.SB_OPENCODE_BRIDGE_DATA_DIR || path.join(os.homedir(), '.studentbuddy', 'opencode-chat-bridge'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'pairing-key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
  const token = fs.readFileSync(file, 'utf8').trim();
  if (!/^[\w-]{32,128}$/.test(token)) throw new Error('Invalid OpenCode pairing-key file');
  const backend = await ensureOpenCodeBackend({ dir, port: backendPort });
  const server = createOpenCodeBridge({ token, cwd: dir, backend });
  server.on('error', error => { console.error('OpenCode bridge could not start:', error.code || 'error'); backend.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`StudentBuddy OpenCode chat bridge: http://127.0.0.1:${port}/v1`);
    console.log('Pairing key file (paste content only into StudentBuddy): ' + file);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.stopAgents(); server.close(() => { backend.close(); process.exit(0); }); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });

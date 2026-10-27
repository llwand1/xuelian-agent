#!/usr/bin/env node
/** Qoder and Qoder CN -> the same local OpenAI-compatible text API. Node.js 22+, zero npm dependencies. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAgentBridge } from './studentbuddy-agent-chat-http.mjs';
import { QoderClient } from './studentbuddy-qoder-client.mjs';
export function createQoderBridge(options) {
  return createAgentBridge({ ...options, createRpc: options.createRpc || (input => new QoderClient({ ...input, onChild: options.onChild, onClose: options.onClose })), ownedBy: 'local-qoder' });
}
async function main() {
  const port = Number(process.env.SB_QODER_BRIDGE_PORT || 4015);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Qoder bridge port must be an integer, 1024–65535');
  const dir = path.resolve(process.env.SB_QODER_BRIDGE_DATA_DIR || path.join(os.homedir(), '.studentbuddy', 'qoder-chat-bridge'));
  const cwd = path.join(dir, 'chat-workspace'); fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'pairing-key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
  const token = fs.readFileSync(file, 'utf8').trim();
  if (!/^[\w-]{32,128}$/.test(token)) throw new Error('Invalid Qoder pairing-key file');
  const children = new Map(), stateFile = path.join(dir, 'child-processes.json');
  const save = () => { fs.writeFileSync(stateFile + '.tmp', JSON.stringify({ bridgePid: process.pid, children: [...children.values()] })); fs.renameSync(stateFile + '.tmp', stateFile); };
  const server = createQoderBridge({ token, cwd, onChild: child => { children.set(child.pid, child); save(); }, onClose: pid => { children.delete(pid); save(); } });
  server.on('error', error => { console.error('Qoder bridge could not start:', error.code || 'error'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => { console.log(`StudentBuddy Qoder chat bridge: http://127.0.0.1:${port}/v1`); console.log('Pairing key file (paste content only into StudentBuddy): ' + file); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.stopAgents(); server.close(() => process.exit(0)); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });

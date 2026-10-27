/** Isolated local trial: no installed files, personal database, providers or public deployment changed. */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root = fileURLToPath(new URL('../..', import.meta.url));
const dir = path.join(root, '.runtime', 'external-agent-preview');
const selectionFile = path.join(dir, 'selected-agent');
const requestedAgent = process.argv.includes('--agent') ? process.argv[process.argv.indexOf('--agent') + 1] : '';
const agent = requestedAgent || (existsSync(selectionFile) ? readFileSync(selectionFile, 'utf8').trim() : 'codex');
if (!['codex', 'opencode', 'qoder'].includes(agent)) throw new Error('Agent must be codex, opencode or qoder');
const bridgeDir = path.join(os.homedir(), '.studentbuddy', agent + '-chat-bridge');
const bridgeBase = `http://127.0.0.1:${{ codex: 4012, opencode: 4013, qoder: 4015 }[agent]}/v1`;
const base = 'http://127.0.0.1:18991';
mkdirSync(dir, { recursive: true });
const children = [];
const stateFile = path.join(dir, 'state.json');
const state = { pid: process.pid, root, base, agent, ready: false, children: [] };
let registered = false;
const save = () => { writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2)); renameSync(stateFile + '.tmp', stateFile); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function child(name, args, env) {
  const p = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = createWriteStream(path.join(dir, name + '.log'), { flags: 'a' }); p.stdout.pipe(log); p.stderr.pipe(log);
  children.push(p); state.children.push({ pid: p.pid, args }); save();
  p.on('error', fail); p.on('exit', code => { if (!stopping) fail(new Error(`${name} exited (${code})`)); }); return p;
}
let stopping = false;
function fail(error) { console.error(error.message); state.error = error.message; if (registered) save(); shutdown(1); }
function shutdown(code = 0) {
  if (stopping) return; stopping = true;
  for (const p of children) if (!p.killed) p.kill();
  state.ready = false; if (registered) save(); process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown());
async function waitFor(url, options = {}) {
  let last;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(url, { ...options, signal: AbortSignal.timeout(2000) }); if (r.ok) return r; last = new Error('HTTP ' + r.status); } catch (e) { last = e; }
    await sleep(500);
  }
  throw new Error('Local trial startup timed out: ' + (last?.message || 'unavailable'));
}
try {
  if (!existsSync(path.join(root, 'packages/web/dist/index.html')) || !existsSync(path.join(root, 'packages/server/dist/index.js'))) throw new Error('Run npm run build first');
  // A running preview is reused only by the launcher after checking its recorded PID and path.
  try { await fetch(base + '/api/status', { signal: AbortSignal.timeout(1000) }); throw new Error('Port 18991 is already occupied; stop the previous trial first'); }
  catch (error) { if (error.message.includes('occupied')) throw error; }
  registered = true; save();
  let bridgeRunning = false;
  try {
    const key = readFileSync(path.join(bridgeDir, 'pairing-key'), 'utf8').trim();
    const response = await fetch(bridgeBase + '/models', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(25000) });
    bridgeRunning = response.ok || response.status === 502; await response.body?.cancel();
  } catch { /* Start the documented bridge below when it isn't running. */ }
  const bridgeEnv = { [`SB_${agent.toUpperCase()}_BRIDGE_DATA_DIR`]: bridgeDir };
  const localQoder = path.join(root, '.runtime/qoder-cli/node_modules/@qodercn-ai/qoderclicn/bundle/qoderclicn.js');
  if (agent === 'qoder' && !process.env.SB_QODER_CLI && !process.env.SB_QODER_BIN && existsSync(localQoder)) bridgeEnv.SB_QODER_CLI = localQoder;
  if (!bridgeRunning) child('bridge', [path.join(root, `packages/web/public/studentbuddy-${agent}-bridge.mjs`)], bridgeEnv);
  const keyFile = path.join(bridgeDir, 'pairing-key');
  for (let i = 0; i < 40 && !existsSync(keyFile); i++) await sleep(250);
  const token = readFileSync(keyFile, 'utf8').trim();
  child('server', [path.join(root, 'packages/server/dist/index.js')], {
    SB_PORT: '18991', SB_HOST: '127.0.0.1', SB_REQUIRE_AUTH: '0', SB_EXTERNAL_AGENT: '1', SB_DESKTOP: '0',
    SB_DATA_DIR: path.join(dir, 'data'), SB_WEB_DIST: path.join(root, 'packages/web/dist'),
  });
  await waitFor(base + '/api/status');
  const current = await (await fetch(base + '/api/settings/external-agent')).json();
  const configuredMarker = path.join(dir, 'configured-once');
  if (requestedAgent || (!existsSync(configuredMarker) && !current.settings.enabled && !current.tokenConfigured)) {
    const settings = current.settings.baseUrl === bridgeBase ? { ...current.settings, enabled: true } :
      { enabled: true, name: { codex: 'Codex', opencode: 'OpenCode', qoder: 'Qoder' }[agent] + ' 本地 Agent', baseUrl: bridgeBase, model: 'default', timeoutSeconds: 180, historyMessages: 40 };
    const configured = await fetch(base + '/api/settings/external-agent', { method: 'PUT', headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, token }) });
    if (!configured.ok) throw new Error('Could not configure the isolated trial');
  }
  writeFileSync(configuredMarker, 'Local trial initialized; do not overwrite user backend choices on restart.\n');
  writeFileSync(selectionFile, agent);
  state.ready = true; save(); console.log('StudentBuddy external agent trial: ' + base);
} catch (error) { fail(error); }

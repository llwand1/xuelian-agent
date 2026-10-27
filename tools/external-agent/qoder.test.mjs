import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { QoderClient, qoderCommand, parseQoderModels } from '../../packages/web/public/studentbuddy-qoder-client.mjs';
const flags = '--tools --setting-sources --settings --strict-mcp-config --mcp-config --no-session-persistence --permission-mode --max-model-request-retries';
const messages = [{ role: 'system', content: '简短作答' }, { role: 'user', content: '记住星河42' }, { role: 'assistant', content: '记住了' }, { role: 'user', content: '口令是什么' }];
function fixture(mode = 'ok') {
  const state = { calls: [], killed: 0, closed: 0, held: false };
  const controller = new AbortController();
  const rpc = new QoderClient({ cwd: '/isolated-chat', signal: controller.signal, command: { executable: 'fixture-node', args: ['fixture-cli.js'] },
    onChild: () => {}, onClose: () => { state.closed++; }, spawnProcess: (executable, args, options) => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null; child.pid = 100 + state.calls.length;
      const call = { executable, args, options, input: '' }; state.calls.push(call); let ended = false;
      const end = code => { if (ended) return; ended = true; child.exitCode = code; child.stdout.end(); child.emit('close', code); };
      child.kill = () => { state.killed++; child.killed = true; queueMicrotask(() => end(1)); return true; };
      const send = value => child.stdout.write(JSON.stringify(value) + '\n');
      child.stdin = new Writable({ write(bytes, _encoding, callback) { call.input += bytes.toString('utf8'); callback(); } });
      child.stdin.on('finish', () => queueMicrotask(() => {
        if (args.includes('--help')) { child.stdout.write(mode === 'legacy' ? '--print only' : flags); end(0); return; }
        if (args.includes('--list-models')) { child.stdout.write('MODEL\nAuto\nFast\nQwen3.8-Max\n'); end(0); return; }
        if (mode === 'auth') { child.stderr.write('Not logged in. private-token-NEVER-ECHO'); end(1); return; }
        if (mode === 'hold') { state.held = true; return; }
        send({ type: 'system', subtype: 'init', session_id: 'fresh-session', tools: mode === 'unsafe' ? ['Bash'] : [], mcp_servers: [], plugins: [] });
        if (ended || child.killed) return;
        send({ type: 'assistant', session_id: mode === 'foreign' ? 'other-session' : 'fresh-session', message: { content: [{ type: 'thinking', thinking: 'PRIVATE-REASONING' }] } });
        if (mode === 'tool') { send({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }); return; }
        if (mode === 'permission') { send({ type: 'control_request', request: { subtype: 'can_use_tool' } }); return; }
        const bytes = Buffer.from(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '星河42' }] } }) + '\n');
        const cut = bytes.indexOf(Buffer.from('星')) + 1; child.stdout.write(bytes.subarray(0, cut)); child.stdout.write(bytes.subarray(cut));
        if (mode !== 'cut') send({ type: 'result', subtype: 'success', is_error: mode === 'quota', result: mode === 'quota' ? 'quota exhausted private-token-NEVER-ECHO' : mode === 'mismatch' ? 'different' : '星河42', stop_reason: mode === 'length' ? 'max_tokens' : 'end_turn', permission_denials: [] });
        end(mode === 'exit' ? 1 : 0);
      }));
      return child;
    } });
  return { rpc, state, controller };
}
test('Qoder model catalog uses actual CLI names, not guessed aliases or account diagnostics', () => {
  assert.deepEqual(parseQoderModels('MODEL\r\nAuto\r\nFast\r\nQwen3.8-Max\r\n'), ['Auto', 'Fast', 'Qwen3.8-Max']);
  assert.deepEqual(parseQoderModels('{"models":[{"id":"Fast"},{"name":"Fast"}]}'), ['Fast']);
  for (const bad of ['Not logged in', 'MODEL\nuser@example.com', '{}', 'MODEL']) assert.throws(() => parseQoderModels(bad));
});
test('Qoder resolver accepts explicit native or Node CLI entries and rejects shell command files', () => {
  assert.equal(qoderCommand({ SB_QODER_BIN: process.execPath }).executable, process.execPath);
  const file = new URL(import.meta.url); const entry = decodeURIComponent(file.pathname).replace(/^\/(\w:)/, '$1');
  assert.deepEqual(qoderCommand({ SB_QODER_CLI: entry }).args, [entry]);
  for (const bad of ['qoder.cmd', 'relative.js', process.execPath + '.ps1']) assert.throws(() => qoderCommand({ SB_QODER_CLI: bad }));
});
test('Qoder isolates tools/hooks/MCP, replays SQL-visible history over stdin, filters reasoning and confirms completion', async () => {
  const { rpc, state } = fixture(); await rpc.initialize(); assert.deepEqual(await rpc.models(), ['Auto', 'Fast', 'Qwen3.8-Max']);
  const output = []; assert.equal(await rpc.chat(messages, 'Fast', null, text => output.push(text)), '星河42'); assert.equal(output.join(''), '星河42');
  const call = state.calls.at(-1), args = call.args, settings = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(JSON.parse(call.input).conversation, messages); assert.ok(!args.join(' ').includes('星河42'));
  assert.equal(args[args.indexOf('--tools') + 1], ''); assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dont_ask');
  assert.equal(args[args.indexOf('--max-model-request-retries') + 1], '0'); assert.ok(args.includes('--no-session-persistence'));
  assert.deepEqual(settings.permissions.deny, ['*']); assert.equal(settings.disableAllHooks, true); assert.equal(settings.general.enableAutoUpdate, false);
  assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true); assert.equal(call.options.cwd, '/isolated-chat');
  assert.ok(!args.includes('--resume') && !args.includes('--continue') && !args.includes('--yolo'));
  await rpc.stop(); assert.equal(state.closed, 3);
});
test('Qoder rejects unsafe init, tool/permission requests, other sessions, truncation, mismatch and missing completion', async () => {
  for (const mode of ['unsafe', 'tool', 'permission', 'foreign', 'length', 'mismatch', 'cut', 'exit']) {
    const { rpc, state } = fixture(mode); await rpc.initialize();
    await assert.rejects(rpc.chat(messages, 'default', null, () => {})); await rpc.stop();
    assert.equal(state.calls.filter(call => call.args.includes('--print')).length, 1);
  }
});
test('Qoder authentication/quota errors are actionable and never echo raw credentials or provider diagnostics', async () => {
  for (const mode of ['auth', 'quota']) {
    const { rpc } = fixture(mode); await rpc.initialize();
    await assert.rejects(rpc.chat(messages, 'default', null, () => {}), error => /authentication required|quota exhausted/.test(error.message) && !error.message.includes('NEVER-ECHO'));
    await rpc.stop();
  }
});
test('Qoder stop cancels its actual child instead of leaving a headless generation running', async () => {
  const { rpc, controller, state } = fixture('hold'); await rpc.initialize();
  const task = rpc.chat(messages, 'default', null, () => {}); await new Promise(resolve => setImmediate(resolve)); assert.equal(state.held, true);
  controller.abort(); await assert.rejects(task, /cancelled/); await rpc.stop(); assert.ok(state.killed >= 1); assert.equal(rpc.children.size, 0);
});
test('Qoder refuses an older CLI missing isolation flags and invalid model IDs before sending a prompt', async () => {
  const legacy = fixture('legacy'); await assert.rejects(legacy.rpc.initialize(), /isolation flags/); await legacy.rpc.stop();
  const { rpc, state } = fixture(); await assert.rejects(rpc.chat(messages, '--unsafe-option', null, () => {}), /Invalid Qoder model/); assert.equal(state.calls.length, 0);
});

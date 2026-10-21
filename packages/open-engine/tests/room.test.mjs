import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRoom, normalizeRoomCommand } from '../src/room-kernel.mjs';
import { AGENT_CAPABILITIES } from '../src/agent-kernel.mjs';
import { readFile } from 'node:fs/promises';
function adapter() { return { contentFingerprint: 'test-only', createPeer: () => ({ x: 0, answers: [] }), tick: (s, input, dt) => { assert.equal(dt, 1 / 60); if (input.right) s.x++; }, command: s => ({ ok: true, count: s.answers.push('private') }), worldSnapshot: () => ({ revision: 0 }), playerSnapshot: s => ({ x: s.x }), privateSnapshot: s => ({ answers: s.answers }) }; }
const command = (sequence, type = 'input', payload = {}) => ({ schema: 'studentbuddy.room.command', apiVersion: 1, sequence, type, payload });
test('room kernel is host and transport independent with private learner snapshots', () => {
  const r = new AuthorityRoom({ adapter: adapter() }), a = r.join('A').playerId, b = r.join('B').playerId;
  r.dispatch(a, command(1, 'answer', { encounterId: 'x', value: true })); assert.equal(r.snapshot(a).self.learning.answers.length, 1); assert.equal(r.snapshot(b).self.learning.answers.length, 0); assert.equal('answers' in r.snapshot(b).players[0], false);
  const s = r.snapshot(a); s.self.learning.answers.push('tamper'); assert.equal(r.snapshot(a).self.learning.answers.length, 1);
});
test('input expiry, sequence, idempotence and stale rejection are enforced in the kernel', () => {
  const r = new AuthorityRoom({ adapter: adapter() }), a = r.join('A').playerId, c = command(1, 'input', { right: true });
  r.dispatch(a, c); assert.equal(r.dispatch(a, c).duplicate, true); for (let i = 0; i < 30; i++) r.tick(); assert.equal(r.snapshot(a).players[0].x, 15);
  assert.throws(() => r.dispatch(a, command(3))); assert.throws(() => r.dispatch(a, command(1, 'recall'))); assert.throws(() => normalizeRoomCommand({ ...c, playerId: 'p2' }));
});
test('capacity and idle expiry reclaim peers without replaying actions', () => {
  const r = new AuthorityRoom({ adapter: adapter(), maxPlayers: 1, idleTicks: 60 }), a = r.join('A').playerId; assert.throws(() => r.join('B'));
  for (let i = 0; i < 61; i++) r.tick(); assert.equal(r.hasPlayer(a), false); assert.doesNotThrow(() => r.join('B')); assert.throws(() => r.snapshot(a));
});
test('distributed schemas track runtime protocol names and capability enum', async () => {
  const agent = JSON.parse(await readFile(new URL('../protocols/agent.schema.json', import.meta.url))), room = JSON.parse(await readFile(new URL('../protocols/room-command.schema.json', import.meta.url)));
  assert.deepEqual(agent.properties.capabilities.items.enum, [...AGENT_CAPABILITIES]); assert.equal(room.properties.schema.const, 'studentbuddy.room.command');
  for (const type of room.properties.type.enum) assert.doesNotThrow(() => normalizeRoomCommand(command(1, type, type === 'answer' ? { encounterId: 'x', value: true } : type === 'torch' ? { x: 1, y: 1 } : {})));
});

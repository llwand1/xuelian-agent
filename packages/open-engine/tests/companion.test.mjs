import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionSession, normalizeCompanionTurn } from '../src/companion-kernel.mjs';
import { AuthorityRoom } from '../src/room-kernel.mjs';
const turn = (sequence = 1, patch = {}) => ({ schema: 'studentbuddy.companion-turn', apiVersion: 1, sessionId: 'session-a', worldId: 'mining-137', sequence, input: { right: true }, ...patch });
test('companion intent uses the player input contract; positions, mining and grading are not accepted', () => {
  assert.equal(normalizeCompanionTurn(turn()).input.right, true);
  for (const patch of [{ apiVersion: 2 }, { input: { x: 999 } }, { input: { mine: true } }, { input: { right: 'yes' } }, { message: '' }, { message: 'x'.repeat(2001) }, { code: 'eval' }]) assert.throws(() => normalizeCompanionTurn(turn(1, patch)));
});
test('companion retries are idempotent and cannot inject a different response under the same sequence', () => {
  const s = new CompanionSession({ sessionId: 'session-a', worldId: 'mining-137' }); const input = turn(1, { message: '一起探索' });
  assert.equal(s.submit(input).message, '一起探索'); assert.equal(s.submit(input).duplicate, true);
  assert.throws(() => s.submit(turn(1, { message: 'changed' }))); assert.throws(() => s.submit(turn(3)));
});
test('companion control expires on wall clock, including when game simulation is paused', () => {
  let now = 1; const s = new CompanionSession({ sessionId: 'session-a', worldId: 'mining-137', clock: () => now });
  s.submit(turn(1, { input: { right: true, jumpPressed: true } })); assert.equal(s.consumeInput().jumpPressed, true); assert.equal(s.consumeInput().jumpPressed, false);
  now += .26; assert.deepEqual(s.consumeInput(), {}); assert.equal(s.getState().inputActive, false);
});
test('world/session changes reject stale AI output; outputs are independent copies', () => {
  const s = new CompanionSession({ sessionId: 'session-a', worldId: 'mining-137' });
  assert.throws(() => s.submit(turn(1, { worldId: 'mining-42' }))); assert.throws(() => s.submit(turn(1, { sessionId: 'session-b' })));
  s.submit(turn()); const controls = s.consumeInput(); controls.right = false; assert.equal(s.consumeInput().right, true); assert.equal(s.getState().lastSequence, 1);
});
test('human and agent room participants have identical physics/control paths and no added privileges', () => {
  const adapter = { createPeer: () => ({ x: 0 }), tick: (s, input) => { if (input.right) s.x++; }, command: () => ({ ok: true }), worldSnapshot: () => ({}), playerSnapshot: s => ({ x: s.x }), privateSnapshot: () => ({}) };
  const r = new AuthorityRoom({ adapter }), h = r.join('H').playerId, a = r.join('A', { controller: 'agent' }).playerId;
  for (const id of [h, a]) r.dispatch(id, { schema: 'studentbuddy.room.command', apiVersion: 1, sequence: 1, type: 'input', payload: { right: true } }); r.tick();
  const players = r.snapshot(h).players; assert.deepEqual(players.map(p => p.controller), ['human', 'agent']); assert.equal(players[0].x, players[1].x); assert.throws(() => r.join('bad', { controller: 'admin' }));
});

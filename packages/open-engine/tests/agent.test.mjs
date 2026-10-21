import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentKernel, defaultAgent, normalizeAgent, diffAgents } from '../src/agent-kernel.mjs';
const token = {};
function kernel() { return new AgentKernel({ approvalToken: token }); }
function proposal(k, patch = {}) { const current = k.getDefinition(); return k.propose({ baseRevision: current.revision, definition: { ...current, revision: current.revision + 1, name: '我的新向导', ...patch }, reason: '用户希望更适合自己' }); }
test('agent proposal is inert, isolated and diffable until host approval', () => {
  const k = kernel(), before = k.getDefinition(), p = proposal(k); p.definition.name = 'tamper';
  assert.deepEqual(k.getDefinition(), before); assert.equal(p.changes[0].field, 'name');
  assert.throws(() => k.apply(p.id), /宿主/); assert.throws(() => k.apply(p.id, {}), /宿主/);
  assert.equal(k.apply(p.id, token).name, '我的新向导'); assert.equal(k.getDefinition().revision, 2);
});
test('stale proposals and ID/version changes do not mutate configuration', () => {
  const k = kernel(), a = proposal(k), b = proposal(k, { name: '另一份' }); k.apply(a.id, token);
  assert.throws(() => k.apply(b.id, token), /不存在|过期/); assert.throws(() => k.propose({ baseRevision: 1, definition: defaultAgent(), reason: 'old' }), /版本/);
  assert.throws(() => proposal(k, { id: 'other.agent' }), /id/); assert.equal(k.getDefinition().revision, 2);
});
test('rollback adds a revision instead of deleting history', () => {
  const k = kernel(); k.apply(proposal(k).id, token); const d = k.rollback(1, token);
  assert.equal(d.revision, 3); assert.equal(d.name, defaultAgent().name); assert.equal(k.getHistory().length, 3); assert.equal(k.getHistory()[2].sourceRevision, 1);
  assert.throws(() => k.rollback(999, token)); assert.throws(() => k.rollback(3, token));
});
test('agent cannot grant host capabilities, load code or introduce unknown workflow actions', () => {
  for (const patch of [{ script: 'evil' }, { capabilities: ['shell.exec'] }, { capabilities: ['world.inspect'], workflow: { onQuestion: 'hint-first', reviewStyle: 'concise', steps: ['ability.recall'] } }]) assert.throws(() => normalizeAgent({ ...defaultAgent(), ...patch }));
  const k = new AgentKernel({ grants: ['world.inspect', 'content.inspect'], approvalToken: token }); assert.throws(() => proposal(k, { capabilities: ['ability.recall'] }), /宿主/);
});
test('capability broker is explicit and never runs instruction text', () => {
  const k = kernel(); let calls = 0;
  const broker = { 'world.inspect': value => { calls++; return value; } };
  assert.deepEqual(k.run('world.inspect', { a: 1 }, broker), { a: 1 }); assert.equal(calls, 1);
  assert.throws(() => k.run('ability.recall', {}, broker), /未启用/); assert.throws(() => k.run('world.inspect', {}, {}), /适配器/);
});
test('agent history roundtrips and rejects malformed chains', () => {
  const k = kernel(); k.apply(proposal(k).id, token); k.rollback(1, token); const s = k.exportState();
  assert.deepEqual(new AgentKernel({ state: s }).exportState(), s);
  for (const edit of [v => v.history[1].definition.revision = 9, v => v.history[1].definition.id = 'other.agent', v => v.history[0].kind = 'rollback', v => v.history[2].sourceRevision = 99, v => v.history[2].definition.name = 'tamper', v => v.history[1].definition.capabilities.push('shell.exec')]) { const bad = structuredClone(s); edit(bad); assert.throws(() => new AgentKernel({ state: bad })); }
});
test('proposal and history limits are explicit and non-evicting', () => {
  const k = kernel(); for (let i = 0; i < 16; i++) proposal(k); assert.throws(() => proposal(k), /16/); k.discard('proposal-1'); assert.doesNotThrow(() => proposal(k));
  const full = kernel(); for (let i = 1; i < 64; i++) full.apply(proposal(full, { name: `guide ${i}` }).id, token); assert.throws(() => full.rollback(1, token), /64/); assert.equal(full.getHistory().length, 64);
});
test('empty changes and invalid shape are rejected; outputs are owned copies', () => {
  const k = kernel(), d = k.getDefinition(); d.capabilities.push('bad'); assert.equal(k.getDefinition().capabilities.length, 2);
  assert.throws(() => proposal(k, { name: defaultAgent().name }), /实质/); assert.deepEqual(diffAgents(defaultAgent(), defaultAgent()), []);
  for (const v of [null, [], 'string', { ...defaultAgent(), instructions: '' }, { ...defaultAgent(), revision: NaN }]) assert.throws(() => normalizeAgent(v));
});

// Transport-independent authority. The host supplies a fixed-step simulation adapter.
function check(ok, message) { if (!ok) throw new Error(message); }
function keys(value, allowed) { check(value && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).every(k => allowed.includes(k)), '协议包含未知字段'); }
export function normalizeRoomCommand(input) {
  keys(input, ['schema', 'apiVersion', 'sequence', 'type', 'payload']);
  check(input.schema === 'studentbuddy.room.command' && input.apiVersion === 1, '房间协议版本不兼容');
  check(Number.isSafeInteger(input.sequence) && input.sequence > 0, 'sequence 无效');
  const p = input.payload;
  if (input.type === 'input') {
    keys(p, ['left', 'right', 'down', 'jump', 'jumpPressed', 'mine', 'target', 'paused']);
    for (const k of ['left', 'right', 'down', 'jump', 'jumpPressed', 'mine', 'paused']) check(p[k] === undefined || typeof p[k] === 'boolean', '输入必须是布尔值');
    if (p.target !== undefined && p.target !== null) { keys(p.target, ['x', 'y']); check(Number.isInteger(p.target.x) && Number.isInteger(p.target.y) && p.target.x >= 0 && p.target.x < 200 && p.target.y >= 0 && p.target.y < 150, '目标格无效'); }
  } else if (input.type === 'recall') { keys(p, []); }
  else if (input.type === 'torch') { keys(p, ['x', 'y']); check(Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 200 && p.y >= 0 && p.y < 150, '火把目标无效'); }
  else if (input.type === 'answer') { keys(p, ['encounterId', 'value']); check(typeof p.encounterId === 'string' && p.encounterId.length <= 160 && (typeof p.value === 'boolean' || Number.isInteger(p.value) || typeof p.value === 'string' && p.value.length <= 500), '作答参数无效'); }
  else throw new Error('房间不接受坐标、地形覆盖、内容加载或任意能力指令');
  return structuredClone(input);
}
export class AuthorityRoom {
  #adapter; #peers = new Map(); #counter = 0; #max; #ttl;
  constructor({ adapter, roomId = 'local-study', maxPlayers = 8, idleTicks = 1800 } = {}) {
    check(adapter && /^[a-z][a-z0-9-]{0,47}$/.test(roomId) && Number.isInteger(maxPlayers) && maxPlayers > 0 && maxPlayers <= 8 && Number.isInteger(idleTicks) && idleTicks >= 60, '房间配置无效');
    this.#adapter = adapter; this.roomId = roomId; this.#max = maxPlayers; this.#ttl = idleTicks; this.tickNumber = 0; this.revision = 0;
  }
  join(name, { controller = 'human' } = {}) {
    check(this.#peers.size < this.#max, '房间已满'); check(typeof name === 'string' && name.trim().length > 0 && name.length <= 32, '玩家名称无效');
    check(['human', 'agent'].includes(controller), '玩家控制器必须是 human 或 agent');
    const id = `p${++this.#counter}`;
    this.#peers.set(id, { id, name: name.trim(), controller, simulation: this.#adapter.createPeer(), sequence: 0, lastCommand: '', result: null, input: {}, inputAt: this.tickNumber, seenAt: this.tickNumber, budgetTick: this.tickNumber, budget: 0 });
    this.revision++; return { playerId: id, snapshot: this.snapshot(id) };
  }
  #peer(id) { const p = this.#peers.get(id); check(p, '玩家已离线或会话不存在'); return p; }
  hasPlayer(id) { return this.#peers.has(id); }
  leave(id) { check(this.#peers.delete(id), '玩家不存在'); this.revision++; return { ok: true }; }
  dispatch(playerId, input) {
    const p = this.#peer(playerId), command = normalizeRoomCommand(input), encoded = JSON.stringify(command);
    if (command.sequence === p.sequence) { check(encoded === p.lastCommand, '相同 sequence 不能发送不同指令'); return structuredClone({ ...p.result, duplicate: true }); }
    check(command.sequence === p.sequence + 1, 'sequence 过期或有缺口，请获取快照后重发');
    if (this.tickNumber - p.budgetTick >= 60) { p.budgetTick = this.tickNumber; p.budget = 0; }
    check(p.budget < 120, '指令过于频繁'); p.budget++;
    let result;
    if (command.type === 'input') { p.input = command.payload; p.inputAt = this.tickNumber; result = { ok: true }; }
    else result = this.#adapter.command(p.simulation, command);
    p.sequence = command.sequence; p.lastCommand = encoded; p.seenAt = this.tickNumber;
    p.result = { ...result, sequence: p.sequence, revision: ++this.revision }; return structuredClone(p.result);
  }
  tick() {
    this.tickNumber++; this.revision++;
    for (const p of this.#peers.values()) {
      if (this.tickNumber - p.seenAt > this.#ttl) { this.#peers.delete(p.id); continue; }
      // Input is a short lease, not an endless held key after a network drop.
      const input = this.tickNumber - p.inputAt <= 15 ? p.input : {};
      this.#adapter.tick(p.simulation, input, 1 / 60); p.input = { ...p.input, jumpPressed: false };
    }
    this.#adapter.afterTick?.(1 / 60);
  }
  snapshot(playerId, knownWorldRevision = -1) {
    const p = this.#peer(playerId); check(Number.isInteger(knownWorldRevision) && knownWorldRevision >= -1, '地图快照版本无效'); p.seenAt = this.tickNumber;
    return structuredClone({ schema: 'studentbuddy.room.snapshot', apiVersion: 1, roomId: this.roomId, revision: this.revision, tick: this.tickNumber, contentFingerprint: this.#adapter.contentFingerprint,
      world: this.#adapter.worldSnapshot(knownWorldRevision), players: [...this.#peers.values()].map(peer => ({ playerId: peer.id, name: peer.name, controller: peer.controller, ...this.#adapter.playerSnapshot(peer.simulation) })),
      self: { playerId, lastSequence: p.sequence, learning: this.#adapter.privateSnapshot(p.simulation) } });
  }
}

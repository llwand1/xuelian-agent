import { normalizeRoomCommand } from './room-kernel.mjs';
function check(ok, message) { if (!ok) throw new Error(message); }
function object(value, fields) { check(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).every(k => fields.includes(k)), '搭子指令含未知字段'); }
export function normalizeCompanionTurn(input) {
  object(input, ['schema', 'apiVersion', 'sessionId', 'worldId', 'sequence', 'input', 'message']);
  check(input.schema === 'studentbuddy.companion-turn' && input.apiVersion === 1, '搭子协议版本不兼容');
  check(typeof input.sessionId === 'string' && input.sessionId.length > 0 && input.sessionId.length <= 80 && typeof input.worldId === 'string' && input.worldId.length > 0 && input.worldId.length <= 100, '搭子会话或世界无效');
  check(Number.isSafeInteger(input.sequence) && input.sequence > 0 && (input.input !== undefined || input.message !== undefined), '搭子需要连续序号与动作或回复');
  if (input.input !== undefined) {
    object(input.input, ['left', 'right', 'down', 'jump', 'jumpPressed']);
    normalizeRoomCommand({ schema: 'studentbuddy.room.command', apiVersion: 1, sequence: input.sequence, type: 'input', payload: input.input });
  }
  if (input.message !== undefined) check(typeof input.message === 'string' && input.message.trim().length > 0 && input.message.length <= 2000, '搭子回复需要 1—2000 字');
  return structuredClone(input);
}
// Model/transport independent: AI supplies intent; host owns physics, identity and learning.
export class CompanionSession {
  #sessionId; #worldId; #sequence = 0; #encoded = ''; #input = {}; #until = 0; #clock;
  constructor({ sessionId, worldId, clock = () => performance.now() / 1000 }) { this.#sessionId = sessionId; this.#worldId = worldId; this.#clock = clock; }
  submit(input) {
    const turn = normalizeCompanionTurn(input), encoded = JSON.stringify(turn);
    check(turn.sessionId === this.#sessionId && turn.worldId === this.#worldId, '搭子会话或世界已变化，请重新连接');
    if (turn.sequence === this.#sequence) { check(encoded === this.#encoded, '相同搭子序号不能修改内容'); return { ok: true, duplicate: true, sequence: this.#sequence }; }
    check(turn.sequence === this.#sequence + 1, '搭子序号过期或有缺口');
    this.#sequence = turn.sequence; this.#encoded = encoded;
    this.#input = turn.input || {}; this.#until = this.#clock() + .25;
    return { ok: true, duplicate: false, sequence: this.#sequence, ...(turn.message === undefined ? {} : { message: turn.message.trim() }) };
  }
  consumeInput() { const result = this.#clock() <= this.#until ? { ...this.#input } : {}; this.#input.jumpPressed = false; return result; }
  getState() { return { sessionId: this.#sessionId, worldId: this.#worldId, lastSequence: this.#sequence, inputActive: this.#clock() <= this.#until }; }
}

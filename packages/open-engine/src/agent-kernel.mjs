// Host-independent configuration evolution. No model, file, network or code execution.
export const AGENT_CAPABILITIES = Object.freeze(['world.inspect', 'world.preview', 'content.inspect', 'ability.recall']);
function check(ok, message) { if (!ok) throw new Error(message); }
function object(value, keys) { check(value && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.keys(value).every(k => keys.includes(k)), 'Agent 包含未知字段或非普通对象'); }
function text(value, max) { check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `Agent 文本需要 1—${max} 字`); return value.trim(); }
const clone = value => structuredClone(value);
export function defaultAgent() {
  return { schema: 'studentbuddy.agent', apiVersion: 1, id: 'my.learning-guide', revision: 1, name: '我的学习向导', instructions: '以学习为主体。先给线索，再根据用户请求解释。不要把挖矿变成强制刷题。', capabilities: ['world.inspect', 'content.inspect'], workflow: { onQuestion: 'hint-first', reviewStyle: 'concise', steps: ['world.inspect', 'content.inspect'] } };
}
export function normalizeAgent(input, grants = AGENT_CAPABILITIES) {
  object(input, ['schema', 'apiVersion', 'id', 'revision', 'name', 'instructions', 'capabilities', 'workflow']);
  check(input.schema === 'studentbuddy.agent' && input.apiVersion === 1, '需要 studentbuddy.agent / apiVersion: 1');
  check(typeof input.id === 'string' && /^[a-z][a-z0-9.-]{2,63}$/.test(input.id), 'Agent id 无效');
  check(Number.isSafeInteger(input.revision) && input.revision > 0 && input.revision <= 1000000, 'Agent revision 无效');
  check(Array.isArray(input.capabilities) && input.capabilities.length <= AGENT_CAPABILITIES.length && new Set(input.capabilities).size === input.capabilities.length && input.capabilities.every(c => AGENT_CAPABILITIES.includes(c) && grants.includes(c)), 'Agent 不能获得宿主未授予的能力');
  object(input.workflow, ['onQuestion', 'reviewStyle', 'steps']);
  check(['hint-first', 'ask-first'].includes(input.workflow.onQuestion) && ['concise', 'socratic'].includes(input.workflow.reviewStyle), 'Agent 工作流选项无效');
  check(Array.isArray(input.workflow.steps) && input.workflow.steps.length <= 8 && input.workflow.steps.every(c => input.capabilities.includes(c)), '工作流只能引用已声明的能力');
  return { schema: input.schema, apiVersion: 1, id: input.id, revision: input.revision, name: text(input.name, 40), instructions: text(input.instructions, 8000), capabilities: [...input.capabilities], workflow: clone(input.workflow) };
}
export function diffAgents(before, after) {
  return ['name', 'instructions', 'capabilities', 'workflow'].filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(field => ({ field, before: clone(before[field]), after: clone(after[field]) }));
}
export class AgentKernel {
  #history; #pending = new Map(); #next = 0; #approval; #grants;
  constructor({ definition = defaultAgent(), state, grants = AGENT_CAPABILITIES, approvalToken } = {}) {
    this.#approval = approvalToken; this.#grants = [...grants];
    if (state !== undefined) {
      object(state, ['schema', 'apiVersion', 'history']);
      check(state.schema === 'studentbuddy.agent-history' && state.apiVersion === 1 && Array.isArray(state.history) && state.history.length >= 1 && state.history.length <= 64, 'Agent 历史无效');
      let id;
      this.#history = state.history.map((row, index) => {
        object(row, ['definition', 'kind', 'reason', 'at', 'sourceRevision']);
        const d = normalizeAgent(row.definition, this.#grants); id ||= d.id;
        check(d.id === id && d.revision === index + 1 && ['created', 'applied', 'rollback'].includes(row.kind) && (index === 0 ? row.kind === 'created' : row.kind !== 'created'), 'Agent 历史版本链无效');
        check(typeof row.at === 'string' && row.at.length <= 40 && Number.isFinite(Date.parse(row.at)), 'Agent 历史时间无效');
        check(row.kind !== 'rollback' ? row.sourceRevision === null : Number.isInteger(row.sourceRevision) && row.sourceRevision > 0 && row.sourceRevision <= index, 'Agent 回滚引用无效');
        return { definition: d, kind: row.kind, reason: text(row.reason, 500), at: row.at, sourceRevision: row.sourceRevision };
      });
      for (const row of this.#history) if (row.kind === 'rollback') check(diffAgents(this.#history[row.sourceRevision - 1].definition, row.definition).length === 0, 'Agent 回滚配置与引用的历史不一致');
    } else {
      const d = normalizeAgent(definition, this.#grants); check(d.revision === 1, '初始 Agent revision 必须为 1');
      this.#history = [{ definition: d, kind: 'created', reason: '用户初始配置', at: new Date().toISOString(), sourceRevision: null }];
    }
  }
  getDefinition() { return clone(this.#history.at(-1).definition); }
  getHistory() { return clone(this.#history); }
  exportState() { return { schema: 'studentbuddy.agent-history', apiVersion: 1, history: this.getHistory() }; }
  propose({ baseRevision, definition, reason }) {
    check(this.#pending.size < 16, '最多保留 16 份待确认提案');
    const current = this.getDefinition(), next = normalizeAgent(definition, this.#grants);
    check(baseRevision === current.revision && next.revision === current.revision + 1 && next.id === current.id, 'Agent 版本过期或 id 发生变化，请基于当前版本重新提案');
    const changes = diffAgents(current, next); check(changes.length > 0, 'Agent 没有实质改动');
    const proposal = { id: `proposal-${++this.#next}`, baseRevision, definition: next, reason: text(reason, 500), changes };
    this.#pending.set(proposal.id, proposal); return clone(proposal);
  }
  discard(id) { return this.#pending.delete(id); }
  #authorize(token) { check(this.#approval !== undefined && token === this.#approval, '只有宿主的用户确认流程可以应用或回滚 Agent'); check(this.#history.length < 64, 'Agent 历史已满 64 版，请先导出，不会静默删除历史'); }
  apply(id, token) {
    this.#authorize(token); const p = this.#pending.get(id); check(p, 'Agent 提案不存在');
    check(p.baseRevision === this.getDefinition().revision, 'Agent 提案过期，请重新预览');
    this.#history.push({ definition: clone(p.definition), kind: 'applied', reason: p.reason, at: new Date().toISOString(), sourceRevision: null }); this.#pending.clear();
    return this.getDefinition();
  }
  rollback(revision, token) {
    this.#authorize(token); const old = this.#history.find(h => h.definition.revision === revision), current = this.getDefinition();
    check(old && revision < current.revision, '只能回滚到已有的历史版本');
    const definition = { ...clone(old.definition), revision: current.revision + 1 };
    this.#history.push({ definition, kind: 'rollback', reason: `用户回滚到第 ${revision} 版配置`, at: new Date().toISOString(), sourceRevision: revision }); this.#pending.clear(); return this.getDefinition();
  }
  run(capability, input, broker) {
    check(this.getDefinition().capabilities.includes(capability) && this.#grants.includes(capability), 'Agent 未启用这个能力');
    check(broker && Object.hasOwn(broker, capability) && typeof broker[capability] === 'function', '宿主没有提供这个能力适配器');
    return broker[capability](clone(input));
  }
}

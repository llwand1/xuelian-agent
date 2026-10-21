/** Original application cases, grounded in the linked primary engineering docs.
 * These are preparation blueprints, not pre-verified finished model questions.
 */
const A = 'https://www.anthropic.com/engineering/building-effective-agents';
const T = 'https://www.anthropic.com/engineering/writing-tools-for-agents';
const E = 'https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents';
const F = 'https://developers.openai.com/api/docs/guides/function-calling';
const M = 'https://modelcontextprotocol.io/docs/draft/tutorials/security/security_best_practices';
// [concept, case, core fact, misconception, scoring criterion, evidence]
export const cases = [
  ['工作流与自主 Agent 的取舍', '日报助理固定读取三张表并按模板汇总，是否需要自由规划循环？', '步骤明确时先验证固定工作流，只有动态决策确有收益才增加自主性。', '所有自动化都必须多 Agent。', '说明固定流程更易验收，给出需要动态探索的反例。', A],
  ['任务路由', '客服将发票、物流、退货请求送往不同处理器，低置信度请求转人工。', '路由将输入分类并送往适合的后续路径，必须考虑分类失败。', '分类正确率达到八成就可以忽略剩余请求。', '指出路由依据、低置信度兜底和分类回归样本。', A],
  ['并行与依赖', '资料助理先拿客户编号，再同时查合同和工单，最后合并结论。', '只有彼此独立的步骤适合并行；依赖输入的步骤必须等待前置结果。', '并行越多一定越快且结论一致。', '画出先查询编号、分支读取、合并的依赖关系。', A],
  ['评估器与修订循环', '邮件草稿必须包含日期、附件和行动项，最多修订两次。', '明确的可评估标准可以支持生成、反馈、再生成循环；需要停止条件。', '循环次数越多越能保证绝对正确。', '用检查清单评估且限制次数，失败保留待人工状态。', A],
  ['工具命名与参数语义', 'CRM 工具同时接受 display_name 和 customer_id，同名客户导致错选。', '工具参数名称和说明应明确表达身份、单位、格式与输入约束。', '让模型猜测 user 参数指姓名还是内部编号。', '选择稳定编号并在缺少编号时查询确认，而非猜测。', T],
  ['上下文预算与分页', '工单搜索一次返回十万条，Agent 因上下文截断漏掉目标记录。', '分页、过滤与范围查询可减少工具结果占用，截断应明确告知。', '静默截断与完整查询结果具有同等证据强度。', '设计过滤条件、游标分页和完成/未完成标记。', T],
  ['可操作的工具错误', '日程工具返回 INVALID 参数，模型反复调用相同请求。', '错误信息应指出可修复的问题，而不是只给不透明代码。', '所有参数错误都应无限重试同一请求。', '在错误中说明时间格式和允许区间，区分不可重试错误。', T],
  ['工具粒度设计', '支持助理查找订单后读取配送状态，五次细碎调用才能给一句答复。', '应结合真实任务评估工具粒度，减少无价值往返，避免功能含混。', '工具越碎或越大都总是更好。', '提出有清晰输入输出的组合查询，并用成功率和调用数比较。', T],
  ['结构化调用与业务授权', '模型生成结构合法的退款参数，但订单属于另一个账号。', '函数调用的结构约束不能替代服务端业务校验和归属判定。', 'JSON Schema 合法就代表当前用户有权执行。', '区分形状、身份、归属和业务额度校验。', F],
  ['工具调用执行闭环', '模型请求查询天气，宿主尚未执行工具却直接显示已查到。', '工具调用由应用执行并把结果交回模型；请求调用不是已执行成功。', '生成函数名即可当作工具执行回执。', '区分请求、真实执行、回传结果、最终答复四个状态。', F],
  ['可选字段与严格模式', '创建任务的备注允许为空，但严格 Schema 要求所有属性都列入 required。', '在严格函数 Schema 中，可用包含 null 的类型表达可空字段。', '可空字段一定应从 required 中删除。', '识别 required 与 nullable 的不同语义，限制额外字段。', F],
  ['终态验收', '预约助理回复“已预约”，但数据库没有预约记录。', '验收应核查环境终态，而不是只看 Agent 自报完成。', '语气自信、回复漂亮就代表任务完成。', '检查真实记录、时间和用户身份，不接受仅文本承诺。', E],
  ['回归评测与能力评测', '新模型能处理更复杂需求，却把过去稳定的取消流程弄坏。', '能力评测探索新能力，回归评测保护已有行为，两者需要同时观察。', '新能力得分上升可自动抵消旧流程失效。', '分别报告两类结果，保留已有必过用例。', E],
  ['多次试验与失败分析', '同一助理在相同十个任务上，两轮分别通过九个和六个。', '随机输出需要多次试验，评测同时记录轨迹、结果和成本。', '只展示最好的一次试验就能代表稳定性。', '区分任务与试验，报告分布并定位失败工具链。', E],
  ['MCP Token 受众校验', 'MCP 服务收到为另一资源签发的 token，开发者打算直接透传。', '资源服务必须校验 token 是否为自身签发，不能把错误受众 token 直接透传。', 'token 有签名且未过期就能用于任何服务。', '明确受众边界，拒绝错误受众并使用合适的下游授权。', M],
  ['MCP 代理的授权确认', '共享代理为首次访问的客户端沿用已有授权，省掉用户同意步骤。', '共享代理应维护客户端授权边界，不能把既有授权当所有客户端的通行证。', '只要用户曾登录一次，后续任意客户端均可自动获准。', '指出客户端身份、用户同意与回调绑定需要分别核验。', M],
];
export function agentPracticePack(signature = 'all', now = new Date()) {
  const validUntil = new Date(now.getTime() + 180 * 86400000).toISOString();
  const seeds = cases.map(([name, scenario, fact, myth, rubric, url], i) => ({
    externalId: `agent-practical-v1-${String(i + 1).padStart(2, '0')}`,
    topic: `Agent应用·${name}`, domain: 'agent', tags: ['Agent应用', name],
    objective: `在实际产品情景中应用${name}，判断方案并解释取舍。`,
    facts: [fact, `原创案例设定：${scenario}`], misconceptions: [myth],
    rubric: [rubric, '题面给出足够条件；选择题只有符合题意的明确答案；解析区分事实与方案假设。'],
    variations: [`将案例变成单选：${scenario}`, `判断并解释“${myth}”是否成立。`, `多选识别两个以上必要步骤；填写关键概念；为案例给出可验收的简答方案。`],
    types: ['single', 'multiple', 'judge', 'fill', 'essay'], sourceUrls: [url], scopeSignature: signature, validUntil,
  }));
  const terms = cases.map(([name, , fact, , , url]) => ({
    term: name, definition: fact, domain: 'agent', importance: .8, aliases: [], sourceUrls: [url],
    sourceNote: '原创 Agent 实践学习材料；依据官方工程文档整理，不标为真题。',
  }));
  return { seeds, terms };
}

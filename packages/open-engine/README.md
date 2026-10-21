# @sb/open-engine · 不定式学习引擎内核

本地优先 ESM 包。学习域与游戏域同级；外部 AI 交付声明式提案，不接管物理、判分和权限。矿境已接入主体网页；Agent 内核仍未自动连接主体模型循环。

- `./mining`：`MiningRuntime` 与类型声明；原型地形/物理/像素画布、三种间隔生成怪物、实时 A/B 动作轮播（成功/失败双结果、独立攻击时钟）和实际 Tween.js + Kenney CC0 特效。只发遭遇请求，不生成/判分题目或写学习数据。第三方本地副本和许可随包提供。见 [知识矿境契约](../../docs/KNOWLEDGE-MINES-SPEC.md)。

- `./agent`：`AgentKernel / normalizeAgent / diffAgents / defaultAgent / AGENT_CAPABILITIES`。定义、提案、用户确认、版本回滚、显式能力 broker。
- `./room`：`AuthorityRoom / normalizeRoomCommand`。注入模拟适配器，固定 tick、指令顺序、幂等最近回执、输入租约、私有学习快照。
- `./companion`：`CompanionSession / normalizeCompanionTurn`。Agent 搭子会话、连续意图/回复、250ms 单调时钟输入租约；复用房间玩家输入校验，不接受坐标覆盖或代学习者判分。房间 join 可标注 controller: agent，与 human 使用同一模拟路径。
- `protocols/`：JSON Schema；结构之外仍需运行时语义校验。不要从 HTTP 参数接受宿主 approval token 或任意 broker。

```js
import { AgentKernel } from './src/agent-kernel.mjs';
const approval = {}; // 只交给用户确认回调，不交给模型工具。
const agent = new AgentKernel({ approvalToken: approval });
const current = agent.getDefinition();
const proposal = agent.propose({
  baseRevision: current.revision,
  definition: { ...current, revision: current.revision + 1, name: '我的概念向导' },
  reason: '我想更专注于概念理解'
});
// 在界面展示 proposal.changes，真实用户确认后：
agent.apply(proposal.id, approval);
agent.rollback(1, approval); // 新建第 3 版，不抹掉第 2 版。
```

房间 adapter 实现：`createPeer()`、`tick(sim,input,dt)`、`command(sim,command)`、`worldSnapshot(knownRevision)`、`playerSnapshot(sim)`、`privateSnapshot(sim)`、可选 `afterTick(dt)` 和 `contentFingerprint`。这些是受信任宿主函数，不从内容 JSON 动态加载。公开玩家快照不应混入学习/Token 数据。

根目录运行 `npm run test:open-engine`；也可 `node --test packages/open-engine/tests/*.test.mjs`。测试独立于 Vitest，已增加 CI 入口。完整阶段边界见 [架构决策](../../docs/OPEN-LEARNING-ENGINE.md)。

# 每日题量任务 × 悬浮球 × 知识矿境

## 为什么改

用户要求是「同一套理念换一个表现形式，以及加强功能与主线之间的联动性」。因此：

- 番茄钟定义此刻专注方向；每日任务定义每天的实际练习量，不要求一直开钟才能记进度。
- 矿境是原知识大陆的正式替代，不接入、不改动独立的 Knowledge Worlds 项目。
- 等待时刷词的常规/游戏模式、矿境中的选择/判断/拼写共用一套题目状态机和学习记录。
- 悬浮球不是另一个任务产品：它读取相同进度，提醒后直接回到矿境做下一题。

## 每日任务

番茄钟卡下始终显示任务设置（开钟/未开钟都可编辑）。默认关闭；启用后设置名称、每日 1–1000 题、提醒开关、5–180 分钟间隔、日间提醒时段和 IANA 时区。默认目标 20 题、09–22 时、30 分钟间隔、Asia/Shanghai。设置按账号保存，不写全局默认任务。

`GET|PUT /api/pomodoro/task` 读取/保存并返回真实进度。进度来自 `learning_event` 的 `quiz.answered`，不是本机游戏分数，也不另建每日答题账。正确和错误都计入实际提交；不认识、跳过、斩词、未作答不计。正式题组的主观题在服务端判分后入账。

每天按设定时区重算；UTC 服务器和中国用户的日界不同不能按服务器 `date()` 猜。目标中途调低可以立即完成，调高可以继续。关闭任务不删除学习记录。相同答题事件的 `attemptKey` 保证 HTTP 重试不再发奖励或重复计数；切换渲染模式保留同一张卡的身份。

刷词报告失败重试一次，沿用相同键；仍失败显示「每日任务进度未同步」，不冒充服务器已记账。未同步题量不计入服务端进度。

## 悬浮球督促

仅桌面本机 `/api/desktop/task/tick` 可调度，沿用 socket/Host/桌面启动标记与同源边界。只有球态、没有现成练习邀请/正在备题、处于允许时段且不是番茄休息段时提醒。不自动打开窗口、不自动答题。任务刚设置后至少等待一分钟；后续按个人间隔，冷却和待提醒内容落个人 KV，重启不会每两秒重发。

通过现有 AI 网关、本人督促模型（或讲解模型回退）生成短行动建议，15 秒上限；数字只由实际进度组装。`ai:false` 明确标为「计划提醒」，不把缺少模型/网络失败后的模板说成 AI 生成。完成目标、关闭任务或换日后旧提醒失效；生成中的旧任务也不得回填到新设置。

原生透明小球只有 64px，提醒使用独立、不抢焦点的像素风气泡，而非被裁掉的网页浮层。原有三字段练习邀请协议兼容；任务邀请额外带严格 `kind:task`，最多 120 个字素。任务按钮为「去做题」「十分钟后」，不复用「挑战一下」的出题动作。点击进入主界面并在挂载完成后导航到矿境；延后只修改提醒，不虚增进度。

## 数据升级

迁移 v64 为当前事件表建立答题幂等/时间索引。实际旧桌面分支占用了同名 `learning_event`（type/v/ts 布局），不等同当前的 kind/day 表：事务内完整重命名为 `learning_event_v46_legacy`，建立当前规范表。保留每个原始字段，不猜测旧类型含义、不把它伪装成答题记录。未知第三方布局不擅自重建。升级前另做本机冷备，旧对话、词条和复习表不被重建。

## 图标与 Agent 实践材料

番茄/休息图标统一使用原创 16×16 SVG 像素图形，覆盖开钟卡、工作/休息态、任务卡和督促胶囊，不再依赖系统 emoji。

`tools/content/agent-practice.mjs` 提供 16 个原创产品案例（工作流选择、路由、并行、工具粒度、参数语义、分页、错误恢复、工具执行闭环、Schema/授权区别、验收、回归和 MCP 授权）。`tools/import-agent-practice.mjs` 经现有专用 Bearer Agent API 读取范围/分页去重，再追加 16 个词条与 16 组题材蓝图。不会覆盖旧词条，不修改应试范围。专用密钥可撤销，导入后材料保留。

蓝图支持单选、多选、判断、填空和简答，**导入不等于已经出题成功**；成品继续由正式出题引擎生成、独立审题。依据来自 [Anthropic 工作流/Agent 设计](https://www.anthropic.com/engineering/building-effective-agents)、[工具设计](https://www.anthropic.com/engineering/writing-tools-for-agents)、[Agent 评测](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)、[OpenAI 函数调用](https://developers.openai.com/api/docs/guides/function-calling)、[MCP 安全实践](https://modelcontextprotocol.io/docs/draft/tutorials/security/security_best_practices)。案例、条件和评分量规为本项目原创，不标作官方考试真题。

## 验证入口

- `npm test`：隔离真实学习库的全量回归；不可用无隔离的 test:raw 跑会默认开库的整套测试。
- `npm run lint`、`npm run gates`、`npm run build`、`npm run test:open-engine`。
- `tools/probes/mining-cdp.mjs`：生产构建浏览器探针覆盖共享做题计数、像素图标、每日任务保存、矿境替换、复习写入、常规/游戏切换及手机窄屏。
- `tools/desktop/invite-smoke.ps1`：真实 WinForms 气泡，无焦点抢占、DPI/边界、任务进度与两个动作。

本机桌面构建号与现有公开 Web 发布线分开；本地安装不等于已发布网站或公共自动更新通道。

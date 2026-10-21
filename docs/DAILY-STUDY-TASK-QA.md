# 每日任务与本机更新验证 · 2026-10-20

## 交付状态

- 本机安装目录：`%LOCALAPPDATA%/Programs/StudentBuddy`，构建 **0.2.204**，不是仅修改源码。
- 最终安装器约 66 MB；安装后的服务端及网页主包 SHA-256 与最终隔离构建 stage 一致。
- 公开 Web 版本线仍为 0.2.186；没有推送公共 Release、自动更新通道或线上站点。
- 独立的 Knowledge Worlds 未被接入或改动。

## 数据保留

升级前停止本人安装服务并冷备程序和用户数据。原有 **166 个会话、1329 条消息、438 个词条、22 条复习记录**在升级后计数一致。迁移从 63 到 64；旧格式事件表完整归档。之后经授权 Agent 补给 API 追加 16 个词条，真实词库变为 **454** 条。

每日任务默认未开启，未替用户擅自决定每日题量。用户在「复习督促 → 专注番茄钟 → 每日做题任务」设置。启用后实际答案入同一本事件账，完成后自动停止督促。

## 自动化结果

- `npm test`：**475 个文件通过，4936 项通过、3 项按既有条件跳过**，最终耗时 97.30 秒；临时目录按隔离包装器回收。
- `npm run lint`：三组 TypeScript 与 ESLint 通过。
- `npm run gates`：475 个测试文件登记、工程红线、公开痕迹与 Web 版本一致性通过。
- `npm run build`：网页和服务端生产构建成功。既有大包体提示仍存在；生产依赖安装也有上游审计提示，不称作无警告构建。
- `npm run test:open-engine`：23 项通过。
- `tools/desktop/invite-smoke.ps1`：32 项原生断言通过，覆盖无焦点抢占、DPI 边界、字素、减少动态效果、真实进度和任务按钮；WinForms 帧截图已目视检查。

## 浏览器与实际安装版

`tools/probes/mining-cdp.mjs` 使用隔离数据库、真实生产包和 Edge 验证横版画面、怪物遭遇、选择/判断/拼写、复习入账、模式不换题、地形恢复、伙伴名册、320/390px 窄屏、等待时游戏窗口、许可与无运行时异常。新增真实任务设置后，服务端返回 **3/10 题，答对 3，剩余 7**，证明常规/游戏同一进度而非前端伪造计数；像素番茄图标与任务卡截图已检查。

另用已安装版本的实际本机服务打开「悬浮球设置 → 最近作答记录」，从正式历史读取 **8 道 Agent 应用混合题**；单选、判断、多选、填空、解答全部可渲染，探针没有替用户作答或交卷，无运行时异常。

## Agent 材料与质量复核

经专用 Bearer Agent 接口导入 **16 个实战词条 + 16 组多题型蓝图**，16 组均符合当前范围。一次性导入凭证随即撤销，并验证再次调用返回 401。无密钥进入公开文件。

真实模型出题试运行曾把 MCP token 的受众错误解释为客户端身份，并因共享大类标签选择到别的蓝图。复核后撤下了**本次新建、未作答的那组草稿**，没有删除用户旧记录；来源和拒收原因留在本机审计材料中。最终改用 `tools/content/agent-practice-quiz.json` 的 8 道原创复核题，通过正常题组接口保存为「Agent 应用实战 · 混合练习」。不把失败模型草稿或导入蓝图冒充合格成品题。

蓝图选择已补充相关性排序：明确主题精确匹配优先，之后才按使用次数轮换；回归测试锁定共享「Agent应用」标签不能挤掉具体 MCP 主题。原有一般主题轮换、应试范围、题型和过期闸门保留。

## 本机证据

证据在被忽略的 `.runtime` 下，不进产品用户数据或公开仓库：

- `daily-full-final.log`、`daily-lint-delivery.log`、`daily-gates-delivery.log`、`daily-build-last.log`。
- `daily-mining-browser-final/`、`daily-browser-final.log`、`daily-native-frames/`、`daily-native.log`。
- `daily-installed-final.json`、`daily-install-verified.log`、`installed-study-proof/`。
- `agent-practice-receipt.json`、`agent-practice-final.json`、`agent-rejected-model-draft.json`。
- `installed-backup-0.2.203-*` 为升级前完整冷备，`final-204-refine-*` 为后续数据快照。

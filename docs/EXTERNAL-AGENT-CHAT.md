# 外置 Agent 对话 v1

这是聊天后端，不是插件中心的 `delegate_task` 队列，也不是词条/出题预产物授权。用户在 StudentBuddy 的正常输入框发送文字，外置 Agent 的流式回答走原有 SSE、消息持久化、停止、重新生成和编辑重发链路。关闭该设置恢复原来的模型绑定，不更改服务商、额度或密钥。

## 接入与运行

本地版：设置 → 模型与服务商 → **外置 Agent 对话**。

1. 安装 Codex CLI，并在终端运行 `codex login`。需要已获授权的模型访问能力；模型列表成功不代表推理额度或权限已通过验证。
2. 设置页下载 **Codex 桥接包 ZIP**，全部解压到同一目录，Node.js 22+ 运行 `node studentbuddy-codex-bridge.mjs`。包内含共享 HTTP 核心、入口、原生 RPC 与说明；不要只下载一个入口文件。
3. 桥接器只监听 `127.0.0.1:4012`。启动信息只显示配对文件路径，不打印密钥。复制该文件内容到设置中的「配对密钥」，基础地址填 `http://127.0.0.1:4012/v1`。
4. 模型 `default` 表示使用 Codex 本机默认配置。测试连接读取真实模型列表，但不发送生成请求、不自动保存/启用。
5. 显式勾选启用并保存，回到聊天发文字。图片、联网与 GrillMe 先关闭；其他学习功能仍使用原模型，不自动路由到外置 Agent。

源码开发用 `SB_EXTERNAL_AGENT=1`，并只监听回环地址；桌面 `SB_DESKTOP=1` 自动提供该设置。没有改动线上网站/公开通道。公网服务器和伪造 Host/非回环 socket 不可配置本机 Agent。

可选桥接环境变量：`SB_CODEX_BRIDGE_PORT`、`SB_CODEX_BRIDGE_DATA_DIR`、`SB_CODEX_BIN`（本机 Codex 原生可执行文件绝对路径；不是 cmd/ps1 命令文本）。桥接器不读取请求中的命令、参数、cwd 或环境设置。它使用一个独立空目录，创建只读、无审批自动放行的 **ephemeral** Codex 会话，禁用 shell/unified_exec、多 Agent、网页搜索、应用与已配置 MCP，拒绝客户端工具及审批请求。模型和认证仍由用户安装的 Codex 管理，不导出或复制其登录凭据。

文字桥默认 `low` 推理强度，不改用户全局 Codex 设置。可设 `SB_CODEX_REASONING_EFFORT=medium/high/xhigh/inherit`；`inherit` 才沿用本机配置。首轮真实验收发现本机配置为 xhigh，小消息也耗时 141 秒，因此将独立文字桥的默认值与通用编程 Agent 分开。进一步排查发现用户已启用插件的 MCP 也会继承，现显式禁用所有插件，避免不必要的工具初始化和权限。选定模型须支持推理档位，否则显式报错，不自动重发。`SB_CODEX_BRIDGE_TRACE=1` 可记录 RPC 方法与耗时，不记录参数、正文、账户或凭据。

### 本任务一键试用

构建后运行仓库根目录「启动外置Agent试用.cmd」，会隐藏启动必要服务并打开 `http://127.0.0.1:18991/`。试用数据在 `.runtime/external-agent-preview/data`，不修改已安装应用或个人数据库；首次自动启用本机 Codex 桥。以后可在设置中关闭或换接其他 Agent。`tools/external-agent/stop-preview.ps1` 只停止记录中且命令路径核对成功的试用进程。若复用了之前独立启动的桥接器，不会把它当成试用进程关闭。

## 通用协议：其他 Agent 也能接

Qoder / Qoder CN 已新增原生 headless 适配、设置预设、下载包与一键试用。真实 UI 三轮、SQL 历史续聊、取消和模型探测已通过；详细配置与实跑记录见 [Qoder 接入说明](./QODER-AGENT-CHAT.md)。同一 HTTP 协议未改，Codex / OpenCode 的原接法继续保留。

### OpenCode 原生适配（2026-10-27）

设置页下载 **OpenCode 桥接包 ZIP**，全部解压后运行 `node studentbuddy-opencode-bridge.mjs`。需要已安装并登录的 OpenCode CLI；不通过自动化桌面输入框充当 API。

- 对外：`http://127.0.0.1:4013/v1`，独立 Bearer 配对文件 `~/.studentbuddy/opencode-chat-bridge/pairing-key`。设置页有 OpenCode 预设，**只填入，不自动保存或启用**。
- 内部：启动本机 OpenCode `--pure serve`，仅监听 `127.0.0.1:4014`，使用另一个随机 Basic 密码；不复用无认证服务、不影响用户打开的桌面客户端。
- 通过原生 `/session`、`/event`、`/session/:id/message` 调用。每次新建 `studentbuddy` 文字专用 Agent 会话，全部工具和权限拒绝，已配置 MCP 在该子进程内禁用；只取该会话 assistant 的 text，不转发 reasoning、用户回声或其他会话消息。
- 成功、失败、取消后归档自己创建的会话，不删除或续接用户已有会话。取消调用原生 abort。监听上游 retry 状态：额度/限流等原因进入自动重试时立即终止并报错，不等待数小时或自动换模型。
- 模型填 `default`（OpenCode 进程的默认配置）或「测试连接」返回的 `provider/model`。**目录可读不等于模型有可用额度**；401 要在 OpenCode 修复登录，quota exhausted 要选择自己已有的可用模型。不会代为购买套餐。
- 可选环境变量：`SB_OPENCODE_BIN`（原生可执行文件绝对路径）、`SB_OPENCODE_BRIDGE_PORT`、`SB_OPENCODE_BACKEND_PORT`、`SB_OPENCODE_BRIDGE_DATA_DIR`、`SB_OPENCODE_PROXY`（不含凭据的 HTTP 代理地址，仅传给子进程；不修改系统代理或全局配置）。默认继承已设置的 HTTP(S)_PROXY。
- 仓库可运行「启动OpenCode接入试用.cmd」，或 `start-preview.ps1 -Agent OpenCode` 显式切换独立试用。普通启动不重置已保存的后端选择；`-Agent Codex` 可显式切回。Windows 停止脚本只在记录的桥接父 PID、原生路径及参数全部匹配时停止其内部服务。

ZIP 在 web 的 predev/prebuild 从源文件生成，无外部 ZIP 依赖；源文件修改后构建不会继续分发旧副本。原生协议依据：[OpenCode Server](https://docs.opencode.ai/docs/server/)、[权限配置](https://opencode.ai/docs/permissions/)，并以本机服务 OpenAPI 和真实接口核对。

本机真实结果：CLI 1.18.30 的 Agnes/DeepSeek 返回 401；独立安装 1.19.2 进行兼容性复核（不改全局 CLI），模型探测成功读取 15 项。用户打开的桌面 OpenCode 1.19.2 用 DeepSeek V4.1 Flash Free 测试明确显示 `Free usage exceeded, subscribe to Go`，已停止其自动重试；GLM-5.3-Flash Free 的独立原生服务测试同样额度耗尽。新增 retry 收口后约 1.1 秒返回明确错误，不再等到 180 秒超时。**本机尚未拿到真实 OpenCode 正常回答，不能把模拟测试通过当成模型可用。** 现有已验证的 Codex 试用设置继续保留，不暗中切换。

StudentBuddy 原界面 → 生产 send/SSE → OpenCode 原生服务 → UI 已实测：最后一轮 466ms 明确显示「当前模型额度已用尽；已停止自动重试」，活动请求归零，历史仅保存用户测试问题，没有伪造 assistant 成功回复。模型目录探测 15 项，ZIP 经 Windows Expand-Archive 解压与逐文件哈希核对零差异，HTTP 下载与本地包一致；显式 OpenCode/Codex 一键启动切换实测通过，最后恢复原 Codex 配置。详见本机 `.runtime/opencode-integration/studentbuddy-result.json` 和 `studentbuddy-opencode-error.png`。错误仅翻译已知桥接类别，未知服务商诊断不原样回显。

StudentBuddy 只依赖下列接口，不依赖 Codex 专属协议。原生支持 OpenAI Chat Completions 的本地服务可以直接填写地址；不支持的 Agent 需要一个适配器，把自己的 CLI/SDK/任务协议翻译成它。

```http
GET /v1/models
Authorization: Bearer <可选配对密钥>
```

```json
{"object":"list","data":[{"id":"my-agent","object":"model"}]}
```

```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <可选配对密钥>
```

```json
{"model":"my-agent","stream":true,"messages":[{"role":"system","content":"学习助手约定"},{"role":"user","content":"我的问题"}]}
```

流式响应 `Content-Type: text/event-stream`：

```text
data: {"choices":[{"index":0,"delta":{"content":"回答片段"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

也接受忽略 `stream:true`、返回合法 JSON `choices[0].message.content` 的非流式 Agent。错误须返回非 2xx，或流中 `{"error":{"message":"..."}}` 后结束；不能伪造 stop。工具调用、空回答、截断流、length/content_filter 等非正常结束均显示错误，不当作成功。无重试、无重定向、无隐式换模型。

同一个 Codex 桥接器也可以供其他本地应用/Agent 当 API 客户端调用。它支持 `stream:false`，采用独立配对 Bearer 密钥；不支持浏览器直连、不开放跨源 CORS。最多同时运行 2 个请求，超出返回 429，不排队自动重放。

## 上下文和数据边界

- 会话历史以 StudentBuddy SQLite 为唯一事实源；最近 1–100 条可调，默认 40 条，总文字最多 120000 字符。只传当前会话的 user/assistant 可见文字及回答风格，不传其他会话、工具结果、数据库、图片或密钥。
- 每个请求新建 ephemeral Codex thread，避免重生成/编辑后仍藏着旧答案。历史不是 JSON-RPC 线程的不可见副本；不继承本 ChatGPT 窗口记忆。
- v1 不接入 StudentBuddy 工具循环、词条抽取/长期记忆压缩、自动出题或桌面文件操作。不声称执行了这些操作。正常完成仍发布 `chat_done`，保留现有活动统计。
- 配对密钥按用户隔离，以既有 AES-GCM/DPAPI 存储；GET 只返回是否配置。留空不修改同地址密钥，换地址不沿用旧密钥，明确清除需勾选。Codex 的账户凭据不进入 StudentBuddy 设置或接口。
- 本地纯文字接口仅允许显式 `127.0.0.1`/`[::1]` HTTP 地址，不接受域名、远程 URL、地址中凭据或查询参数。部署到公网不启用此能力。
- 中止真正取消 fetch；桥接器收到断连/超时后结束该请求的 Codex 原生进程。已有片段带「已停止/生成中断」原样持久化，失败也发 done，不让界面一直转圈。

## 验证

```powershell
npx vitest run packages/server/src/external-agent packages/server/src/routes/external-agent.test.ts packages/web/src/features/settings/ExternalAgentCard.test.tsx packages/web/src/features/settings/SettingsView.test.tsx
node --test tools/external-agent/bridge.test.mjs
npm run lint
npm run build
```

单元测试与桥接测试用隔离数据库/模拟 Agent，不冒充真实模型验证。真实 Codex 和浏览器验收记录写入本任务 `.runtime/external-agent-evidence`，不含配对密钥。

协议依据：[官方 Codex app-server 文档](https://learn.chatgpt.com/docs/app-server)。代码使用本机 Codex 0.163.0 生成的协议 schema 核对参数；该版本 `sandbox` 使用 `read-only`，不能盲抄其他版本文档的枚举名。

## 2026-10-26 本机验收结果

- 真实 UI → StudentBuddy 原聊天 REST/SSE → Codex CLI app-server → UI/SQLite，连续三轮验证成功；刷新后从历史继续追问，正确回答前轮测试口令；切换到设置期间后台回复仍完成。
- 真实设置页「测试连接」成功列出本机模型，未保存/切换配置，也未回显配对密钥。
- 真实 send/abort 取消测试在 1.882 秒结束，临时会话随后软删除；取消所启动的原生 Codex 子进程已退出，不影响另一条正在执行的会话。
- Codex 本机这次三轮小消息分别约 141 / 147 / 135 秒；功能已接通，但当前并非低延迟模型 API。桥保持超时可调、停止可用，不把慢回复伪装为快速完成。
- 全量 Vitest：497 文件通过，5067 passed、3 skipped、0 failed；另有桥接器 Node 测试 5/5。lint、工程门禁、公开痕迹和版本校验通过，前后端生产构建通过。
- 全量第一次执行发现现有构建词表误报新公开回环地址，及 Acorn 压缩标识符变更；已添加精确非凭据豁免并更新实际导出串，复跑通过。没有放宽通用 token 字面量扫描。
- 证据：本任务 `.runtime/external-agent-evidence/result.json`、`cancel.json`、`browser-success.png`、`settings.png`；不含真实配对密钥或 Codex 账户凭据。

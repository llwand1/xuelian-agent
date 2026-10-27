# Qoder / Qoder CN 外置文字 Agent

复用既有外置 Agent 协议，而不是控制 Qoder 桌面输入框。需要 Node.js 22+ 和官方 Qoder CLI / Qoder CN CLI。

## 登录与启动

1. 官方 CLI 登录：国内版 `qodercn login`，国际版 `qoder login`。桌面应用登录不代表 CLI 已登录；只通过官方流程认证，不读取或搬运桌面令牌。仓库提供「登录Qoder接入.cmd」。
2. StudentBuddy 设置 → 外置 Agent 对话 → 下载 Qoder 桥接包；全部解压到同一目录，运行 `node studentbuddy-qoder-bridge.mjs`。
3. 使用 Qoder 预设，基础地址 `http://127.0.0.1:4015/v1`；把桥打印的 **pairing-key 文件内容**填入配对密钥。此密钥只属于本地桥，不是 Qoder 账户令牌。
4. 模型填 `default`（CLI 默认，可能是 Qoder 的自动路由）或测试连接返回的精确名称。此次实测使用 `Fast`；不猜底层模型、不暗中换模型。
5. 测试连接后显式启用并保存；在 StudentBuddy 正常输入框发文字。关闭外置模式即可恢复原模型配置。

本仓库「启动Qoder接入试用.cmd」可打开独立试用 `http://127.0.0.1:18991/`。试用只使用 `.runtime/external-agent-preview/data`，不替换已安装 StudentBuddy、不改个人学习库或公网部署。同地址重启保留模型、等待与历史设置；显式换 Agent 时才使用对应默认配置。

## 边界与实现

- Qoder 以 `--print --output-format stream-json --no-session-persistence` 运行；每轮全新进程，不 resume 用户会话。不写可续接的 Qoder 会话，StudentBuddy SQL 是历史来源。
- 当前会话的 role/content JSON 经 stdin 传入，不放进命令行；独立空工作目录，客户端不能指定命令、路径、参数或环境。
- 空工具集 + deny-all，严格空 MCP，关闭 hooks、插件、外部设置来源和记忆加载；禁用自动升级、网络错误重试，模型请求重试上限 0。每轮核对 init 的 tools/MCP/plugins 均为空，否则停止。
- 只接收主会话 assistant 的 text，忽略 thinking 与无关进度。必须等到正常退出且成功 result/stop_reason 与文字一致才发完成；拒绝工具、委派、权限请求、跨会话、截断与不一致结果。
- 当前 CLI 的文字在完整 assistant 消息就绪后交付，不承诺逐 token 输出。HTTP 层仍支持 SSE 与 `stream:false` JSON。
- 停止/超时/客户端断开会终止本轮进程。Windows 停止脚本还核对记录的父 PID、可执行文件和 Node CLI 入口，避免遗留后台推理或误杀其他 Qoder 窗口。
- 模型列表来自真实 `--list-models`；认证、额度错误仅分类翻译，不回显未知诊断。没有自动重试或桥接器级模型降级。

可选环境变量：`SB_QODER_BRIDGE_PORT`、`SB_QODER_BRIDGE_DATA_DIR`、`SB_QODER_BIN`（原生程序绝对路径）、`SB_QODER_CLI`（官方 npm Node 入口绝对路径）。Windows 不执行 cmd/bat/ps1 作为桥接命令。仓库试用可检测本任务隔离安装的 CLI，不改全局 PATH 或 npm 安装。

协议核对：[官方脚本模式](https://docs.qoder.cn/cli/run-in-scripts)、[官方 CLI 参数](https://docs.qoder.cn/en/cli/cli-reference)。本机通过官方 npm 包 Qoder CN CLI 1.1.79 的 help 与实际输出复核；该版本 help 未公布 max-turns，因此没有盲用该参数。

## 本机真实验证

用户完成官方 CLI 登录后，目录列出 11 个真实模型名称。原生隔离测试 6.754 秒返回「Qoder 接入验证成功。」；通用 HTTP 桥 `stream:false` 实测 200，约 11.8 秒返回「StudentBuddy 与 Qoder 已接通。」。真实 init 确认 tools、MCP、plugins 均为空，没有复制账户凭据。后续 UI、历史与停止验收另记于本机结果文件。

最终生产链路实测（不是 fixture）：

- StudentBuddy 正常输入框连续三轮得到真实 Qoder 回答，UI 耗时约 11.4 / 10.4 / 54.8 秒。包括口令确认、刷新后从历史选回会话继续追问、正常浮力学习问答；本次速度有波动，不承诺低延迟。
- SQLite 可读历史为 user/assistant 交替 6 条，续聊正确返回「松塔73」；每轮仍是新的无持久化 Qoder 进程，没有靠原 Qoder 窗口记忆续答。
- 真实取消测试先观察到 `--print` 生成进程，再调用生产 abort；约 1.1 秒收口，活动请求归零且原生进程退出。临时取消测试会话随后软删除。
- 真实设置页模型探测成功，API 目录共 12 项（11 个原生名称 + default），不回显配对密钥；Qoder ZIP 的 HTTP 下载与本地包一致，Windows 解压后逐源文件哈希零差异。
- 显式 Qoder 一键重启后仍保留 Fast；验收结束保留 Qoder 本地 Agent / Fast，不恢复成其他后端。安装版和线上部署未动。
- 生产构建、lint、工程门禁通过；全量 Vitest 498 文件，5077 passed / 3 skipped；三个桥接器的 Node 测试合计 19 passed。

证据：本任务 `.runtime/qoder-integration/result.json`、`cancel.json`、`studentbuddy-success.jpg`、`studentbuddy-learning-answer.jpg`、`settings.jpg`。这些是本轮测试内容，不包含 Qoder 账户令牌；模拟回归与真实生成分别记录。

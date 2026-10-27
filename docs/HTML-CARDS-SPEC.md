# 对话内联 HTML 卡片

## 2026-10-25 HTML 可靠性专项（本机补丁）

- 生成提示补入静态最终结果优先、渐进增强、`const/let` 与语义变量名、DOM/观察器后备及闭包自检；不将提示词约束冒充实际运行验收。
- 运行前使用 parse5 + Acorn + eslint-scope **纯解析**，不将模型 HTML 插入宿主 DOM，也不在 Node/宿主执行其脚本。语法/截断错误阻止脚本执行；同作用域重复初始化与不可加载的脚本/样式给出具体提示。重复 `var` 是合法 JS，因此只提示风险，不以猜测自动改写源码。
- 运行异常与未处理异步异常回传真实报错及原始 HTML 行号；保留当前 iframe 的可读内容，不再因单个动画失败清空整张卡。CSP 仍阻止原有受限能力；超时、加载失败、导航仍停止运行。回报限额和源/runId 校验不放宽。
- 出错可选「仅看静态」：iframe 无 `allow-scripts`，CSP 同时禁脚本；保留 HTML/CSS，不能假装脚本生成的内容或交互也已恢复。
- 「让 AI 修复」必须由宿主按钮点击发起，复用当前会话正常发送/SSE/中止/落库链路，附上选中卡片原文和诊断并追加完整替换卡；不修改原历史、不因 iframe 报错自动消耗模型调用、不无限重试，忙碌/断线时禁发。
- 专项单测、真实生产浏览器链路与原生 WebView2 探针单独验收。静态检查不是完整运行证明；任意模型网页仍不可能保证百分之百成功，也不新增 CPU 硬抢占承诺。

实现依据：[Acorn API](https://github.com/acornjs/acorn/tree/master/acorn)、[ESLint 作用域接口](https://eslint.org/docs/latest/extend/scope-manager-interface)、[iframe 沙箱](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)。

本机专项验收：487 文件、5017 例通过、3 例原有跳过；生产浏览器 34 项、原生 WebView2 13 项通过，网络探针为 0。已应用本机并保存可回退备份，原 168 会话/1368 消息保持不变；没有发布线上，也未用在线模型测量生成成功率。

> 2026-10-22 · 正式发布：网站 v0.2.188、Windows 桌面 0.2.210（2026-10-24）；本机既有安装不自动覆盖。复用现有 HTML 围栏，不新增模型工具、SSE 事件或数据库表。

## 用户行为

Agent 用 `html`（兼容 `htm`）代码围栏交付单个自包含片段，CSS/JS 全部内联；已有完整 HTML 文档同样可运行。主对话新回复在整轮完成、真实围栏闭合、卡片进入可见区域后自动运行。流式期间即使围栏已经闭合、移入 stable 前缀，仍只有占位；展示层补出的闭合符永远不能授予执行许可。

卡片在当前消息中运行，不上传到 `/api/preview`，不打开侧栏、浏览器标签页或原生窗口。运行中可「停止」「展开」；停止后「重播」从初始状态开始；「源码」「复制」始终可用。展开只增加当前卡片高度，不更换 iframe，因而不丢当前操作。加载超时、运行异常和受限资源报错显示在卡片内，保留原文供核对。

HTML 源码随原有 assistant 正文落库、导出，刷新/切会话后默认点击运行。`StreamMessage.htmlAutoRun` 仅是本轮 `done` 收口时的客户端标记，不落库、不从历史恢复，也不是模型可控制的执行权限字段。内部控件、计数器、模拟进度不持久化；重播、离开视口、隐藏文档、会话切换可能重置它们。

## 能力与生命周期

- `Markdown` 默认 `htmlMode='disabled'`。主对话的 assistant 消息显式传 `manual` 或本轮完成时的 `auto`。用户文本不经可执行渲染；题干、题解等其它 Markdown 调用点不继承能力。
- 整篇 `streaming` 覆盖全部 stable/tail/嵌套卡片的 HTML 权限，不依赖某一个块的 `streaming=false`。未闭合围栏只保留源码，停止/错误的半截正文不执行。
- StrictMode 的弃用 effect 不消费单次自动运行机会。稳定源码、查看源码、复制和展开不重载 iframe；重播改变 runId，旧消息不得影响新实例。
- 单卡最多 **128 KiB UTF-8**。超量保留完整原文并拒绝执行，不截断脚本。自动高度 **180–720 px**，展开到最多 80vh/960px；过长内容在框内滚动。
- 同页最多 **2** 个运行实例；新启动淘汰最早运行的实例。离开视口/隐藏文档卸载 iframe，返回不静默重播。减少动态效果偏好下不自动启动，可由用户主动运行；文档壳收敛 CSS 动画，模型提示词要求 JS 同样尊重偏好。

## 隔离边界

模型原文只交给 iframe 的 `srcDoc`，不使用宿主 `innerHTML` 或宿主 DOMParser 解析模型网页。受控文档壳先放 CSP、默认样式、桥接脚本，再放模型原文；不把原文插进任何可信 JavaScript 字符串。额外 html/head/body 标签由 HTML 文档解析规则合并/忽略，支持旧完整文档。

1. iframe 只给 `sandbox="allow-scripts"`，不给 same-origin、表单提交、弹窗、顶层导航、下载等能力。`referrerPolicy=no-referrer`，另禁 camera/microphone/geolocation/clipboard/fullscreen/payment/usb/serial。
2. meta CSP 默认 `default-src 'none'`；只开放内联脚本/样式、data 图片/字体；`connect-src`、`frame-src`、`worker-src`、`object-src`、`base-uri`、`form-action` 均为 `'none'`。不开放 eval。**sandbox 不能靠 meta CSP 实现**，实际由 iframe 属性强制。
3. 父端只收 `sb-html-card` v1 的 `ready / resize / error`。同时核对 `event.source === frame.contentWindow`、opaque origin、runId 和字段形状；错误最多 240 字，高度钳制并节流。不接受工具执行、发消息、文件、设置或原生操作。`origin='null'` 本身不是身份认证，runId 也不把模型内容升级为可信指令。
4. 不给卡片会话数据、cookie、key 或宿主状态。原有 API `Origin: null` 拒绝规则保持不变。模型可伪造自己的 ready/resize/error，因此这些消息只能影响这张卡的呈现。
5. 桌面 `window.chrome.webview` 在 iframe 内可能存在，但主壳与恢复路径只订阅顶层 WebMessageReceived，**不得把 FrameCreated/WebMessageReceived 接到原生权限分派器**。本次实测子框架的直接原生消息不会进入顶层通道，且已安装版来源检查拒绝 `about:srcdoc`；不需要放宽或修改原生桥。

### 不作出的保证

这不是独立进程、CPU 限额或绝对零网络环境。任意 JS 的同步死循环仍可能卡住渲染线程，停止/超时不是硬抢占。CSP 限制资源和连接 API，不覆盖所有文档自身导航；常规链接/表单交互会拦截，额外 load 会停止卡片，但**不承诺导航请求从未发出**。不依赖覆盖 fetch 或模型自觉建立安全边界；要求严格网络/资源配额时应另设专用渲染进程与网络隔离，不在当前实现范围。

## 验证与复现

- `HtmlCard.test.tsx`：真实 Markdown/MessageRow、默认无权限、stable/半截不执行、历史手动与新回复自动、StrictMode、复制/展开不重启、停播/重播、窗口隐藏/视口、数量上限、陈旧回报/错误源/异常高度/超时。
- `html-sandbox.test.ts`：CSP 顺序、片段/完整文档、UTF-8 预算、可信脚本参数转义、只读消息协议、运行池。
- `useChatStream.activity.test.tsx`：done 归并标记、历史与 done 重叠时不重复插入，历史默认不自动运行。
- `system-prompt.test.ts`：输出协议、内联呈现、自包含与权限约束。
- `node tools/probes/html-card-cdp.mjs`：先 `npm run build`。隔离临时数据库、确定性的本机假模型，走真实生产 UI → send → SSE → 落库 → 历史回放；检验 CSS 真运动、Canvas、滑块、390px 布局，以及 parent DOM/存储/弹窗/fetch/外部脚本/图片/子框架边界。无真实模型调用。
- `node tools/probes/html-card-native.mjs`：Windows 已安装 StudentBuddy 时运行。编译独立 WebView2 测试宿主，使用生产文档生成器；反射检查已安装来源判定，不调用其截图/文件处理函数，不改变安装内容、个人配置或数据。测试专用 profile 与证据位于 `.runtime`。可用 `SB_LAUNCHER` 指定独立安装包解压后的 Launcher。

浏览器探针支持 `SB_PLAYWRIGHT_MODULE`（Playwright 入口绝对 file URL）、`SB_BROWSER`、`SB_HTML_EVIDENCE`；原生探针支持 `SB_HTML_NATIVE_EVIDENCE`。截图仅含隔离演示数据，不冒充真实模型生成质量评测。

### 本次源码验收（2026-10-22）

- `npm run build`、`npm run lint`、`npm run gates` 通过；`git diff --check` 无新增空白问题。
- Vitest 全量 **485 文件、4991 例通过、3 例跳过**（含手测后滚动修复新增的 2 例，未新增跳过项）；不是仅跑专项后声称全量通过。
- 生产浏览器探针 **23 项通过**，桌面/390px 截图人工复核；真实 send/SSE/落库/历史重播连通，攻击语料的连接/外链资源请求计数为 0。
- WebView2 **8 项断言通过**，另验证网络探针请求计数为 0。子框架确实能发一条自己的原生消息，但顶层接收数为 0、符合已安装来源谓词的子消息为 0；因此不新增原生授权或帧转发。
- 不更新版本号、不部署、不覆盖已安装版；原有其它功能的未提交改动保留。

### 正式发布隔离复验（2026-10-24）

- 从干净主线仅纳入 HTML 卡片；本机未发布的矿境运行代码保留、不纳入本版，因此与上述本机全工作区的测试例数不同。
- 全量 **485 文件 / 4991 例（4988 通过、3 跳过、0 失败）**；构建、lint、gates、指标对账与守门判别力审计通过。
- 浏览器 **24 项**、原生 WebView2 **8 项**通过，另验证探针网络请求为 0；展开时操作栏与内部暂停/振幅状态保持。
- open-engine **30 项**与桌面/指标工具 **23 项**通过。旧矿境测试只修正超过短答案长度的草稿夹具，不修改其运行逻辑。
- 网站版本 v0.2.188、桌面正式通道 0.2.210；生产部署建立回滚点并先在数据库副本演练，本机既有安装不覆盖。

### 人工交互复测

另在应用内浏览器用真实点击/调节滑块/刷新复测，不以自动化脚本代替手测：生成占位、暂停/继续、55→75 滑块、复制回执、源码、展开/收起、停止/重播、历史恢复、390px 窄屏及异常提示。内容来自隔离本机测试模型，不是在线模型生成质量评测，也未动原安装版数据。

手测修复：① 用户展开/查看源码/运行卡片时，先退出贴底跟随，再把卡片头部留在阅读区；后续高度稳定不能把操作条带走，自动生成仍保留原有跟随规则。② 修正演示数据中振幅滑块误改方块宽度的问题，改为调整真实位移幅度和波形高度；该修正不代表渲染器会判定任意模型生成模拟的科学正确性。

参考：[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[CSP connect-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src)、[CSP sandbox 不支持 meta](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)、[WebView2 安全边界](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security)。

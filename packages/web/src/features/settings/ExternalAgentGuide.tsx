export function ExternalAgentGuide() {
  return <details><summary>连接 Codex / OpenCode / Qoder / 其他 Agent</summary>
    <p className="settings-hint">桥接器复用同一协议，不需要把模型密钥复制给 StudentBuddy。先在对应 Agent 中完成模型配置，再下载桥接包，全部解压到同一文件夹。</p>
    <ol className="settings-hint">
      <li>Codex：<a href="/studentbuddy-codex-bridge.zip" download>下载 Codex 桥接包</a>，Node.js 22+ 运行 <code>node studentbuddy-codex-bridge.mjs</code>。基础地址 <code>http://127.0.0.1:4012/v1</code>；模型填 <code>default</code> 使用本机默认模型，文字桥默认 low 推理强度。</li>
      <li>OpenCode：<a href="/studentbuddy-opencode-bridge.zip" download>下载 OpenCode 桥接包</a>，运行 <code>node studentbuddy-opencode-bridge.mjs</code>。基础地址 <code>http://127.0.0.1:4013/v1</code>；模型填 <code>default</code> 或测试连接返回的 <code>provider/model</code>。</li>
      <li>Qoder / Qoder CN：<a href="/studentbuddy-qoder-bridge.zip" download>下载 Qoder 桥接包</a>，先完成官方 CLI 登录，再运行 <code>node studentbuddy-qoder-bridge.mjs</code>。基础地址 <code>http://127.0.0.1:4015/v1</code>；模型填 <code>default</code> 或模型目录中的名称。桌面登录不等于 CLI 已登录，原窗口记忆不会自动带入。</li>
      <li>启动信息会显示 pairing-key 文件路径。把该文件的内容填到配对密钥，先测试连接，再显式启用并保存。模型列表可读不代表上游模型认证有效；生成时报 401 时，需要在对应 Agent 中修复该模型的登录或密钥。</li>
    </ol>
    <p className="settings-hint">OpenCode 桥会启动有独立认证的本机服务，使用纯文字 Agent，禁用工具并拒绝会话权限，不改写你的全局配置；每轮新建会话，结束后归档。关闭 StudentBuddy 的外置模式即可恢复原模型。</p>
    <p className="settings-hint">Qoder 桥每轮使用新的无持久化 CLI 会话，禁用工具、MCP、插件与 hooks，只重放当前 StudentBuddy 会话的文字。当前 CLI 在一条完整回答就绪后交付文字，不保证逐 token 显示；停止会终止该轮进程。</p>
    <p className="settings-hint">其他 Agent 只要提供 GET /models 与 POST /chat/completions（OpenAI 兼容 SSE 或 JSON），就能填同一组设置。当前版本仅允许 127.0.0.1 / [::1] 接口。</p>
  </details>;
}

import { useEffect, useState } from 'react';
import { localAgentManifest } from '@sb/shared';
import { pluginApi } from './plugin-api';

export function LocalAgentConnect({ installed, onChange }: { installed: boolean; onChange: () => Promise<void> }) {
  const [supported, setSupported] = useState(false);
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:4011/mcp');
  const [name, setName] = useState('本地 Agent');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ack, setAck] = useState(false);
  useEffect(() => {
    let live = true;
    void pluginApi.localSupport().then(r => { if (live) setSupported(r.supported); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const connect = async () => {
    if (!supported || !ack || busy) return;
    setBusy(true); setError('');
    try { await pluginApi.import(localAgentManifest(endpoint.trim(), name.trim())); await onChange(); }
    catch (e) { setError(e instanceof Error ? e.message : '添加本地 Agent 失败'); }
    finally { setBusy(false); }
  };
  return <details className="plugin-card local-agent-connect"><summary>{installed ? '本地 Agent · 使用与桥接说明' : '＋ 连接本地 Agent'}</summary>
    <p className="settings-hint">让其他本地 Agent 与 StudentBuddy 交换指定资料、接收任务并回传结果。MCP 是连接协议，不会自动控制已安装的 Agent；对方需运行兼容桥接器或接入下面的任务接口。</p>
    <ol className="settings-hint"><li><a href="/studentbuddy-agent-bridge.mjs" download>下载零依赖 Node.js 桥接器</a>，Node.js 22+ 运行：<code>node studentbuddy-agent-bridge.mjs</code>。</li>
      <li>将终端显示的配对密钥保存到 Agent 插件，测试连接后启用。配对密钥不放进对话。</li>
      <li>让外部 Agent 按<a href="/plugin-development.md" target="_blank" rel="noreferrer">桥接指南</a>领取任务、读写共享资料和提交结果。</li></ol>
    {!supported && <p className="settings-hint">本地网络连接仅在桌面安装版提供；网页版不会访问服务器的本机端口。</p>}
    {supported && !installed && <>
      <label className="plugin-label">Agent 名称<input value={name} maxLength={64} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <label className="plugin-label">本机 MCP 地址<input value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)} placeholder="http://127.0.0.1:4011/mcp" /></label>
      <label className="plugin-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)} />我选择连接这个本机服务，只共享调用确认卡中列出的资料。</label>
      <button className="settings-add" disabled={busy || !ack || !name.trim()} onClick={() => void connect()}>{busy ? '添加中…' : '添加 Agent 连接（默认停用）'}</button>
    </>}
    {error && <p className="plugin-error" role="alert">{error}</p>}
  </details>;
}

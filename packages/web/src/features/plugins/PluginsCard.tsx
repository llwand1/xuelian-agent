import { useCallback, useEffect, useState } from 'react';
import type { PluginCallLog, PluginView } from '@sb/shared';
import { pluginApi } from './plugin-api';
import { PluginConnectionCard } from './PluginConnectionCard';
import { PluginImport } from './PluginImport';
import { GithubQuickConnect } from './GithubQuickConnect';
import { BilibiliLearningCard } from './BilibiliLearningCard';
import { LocalAgentConnect } from './LocalAgentConnect';
import './plugins.css';
const STATUS = {done:'成功',error:'失败',denied:'未批准',cancelled:'已停止'};
export function PluginsCard() {
  const [plugins,setPlugins] = useState<PluginView[]>([]), [calls,setCalls] = useState<PluginCallLog[]>([]);
  const [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const reload = useCallback(async()=>{
    const data = await pluginApi.list();setPlugins(data.plugins);
    const logs = await pluginApi.calls();setCalls(logs.calls);setError('');
  },[]);
  useEffect(()=>{
    const ctrl = new AbortController();
    void pluginApi.list(ctrl.signal).then(data=>{if (!ctrl.signal.aborted) setPlugins(data.plugins);})
      .catch((e:unknown)=>{if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : '无法读取插件');})
      .finally(()=>{if (!ctrl.signal.aborted) setLoading(false);});
    void pluginApi.calls().then(logs=>{if (!ctrl.signal.aborted) setCalls(logs.calls);}).catch(()=>{});
    return ()=>ctrl.abort();
  },[]);
  return <section className="settings-sec plugins-section" id="plugins">
    <h3>插件 <span className="settings-tag">统一接入规范 v2</span></h3>
    <p className="settings-hint">连接外部服务，让 AI 通过真实工具完成任务。Token 在 StudentBuddy 服务端加密保存，不会回显或放入模型上下文；查询结果会交给你配置的 AI。停用会中止请求，但不能撤回已发送的数据。</p>
    <p className="settings-hint">发现能力 → 明示权限 → 测试连接 → 显式启用 → 调用确认与审计。支持远程 MCP 与桌面本地 Agent；GitHub 写操作和内部子 Agent 插件授权仍未开放。</p>
    {loading && <p role="status">读取插件配置…</p>}
    {error && <p className="plugin-error" role="alert">{error}</p>}
    {plugins.map(p=>p.manifest.id==='bilibili'?<BilibiliLearningCard key={p.manifest.id} plugin={p} onChange={reload}/>:p.manifest.id === 'github' ? <GithubQuickConnect key={p.manifest.id} plugin={p} onChange={reload}/> : <PluginConnectionCard key={p.manifest.id} plugin={p} onChange={reload} />)}
    {!loading && <LocalAgentConnect installed={plugins.some(p=>p.manifest.id === 'local-agent')} onChange={reload} />}
    <details className="plugin-standard"><summary>开发者：统一接入标准与权限约定</summary>
      <p className="settings-hint">v2 声明发布者、版本、网络边界、认证方式及每个工具的权限。只执行发现且在白名单中的工具；发布者信息不是信任凭据。v1 声明保持兼容，不支持安装任意脚本。</p>
      <a href="/plugin-manifest-v2.schema.json" target="_blank" rel="noreferrer">JSON Schema</a> · <a href="/plugin-development.md" target="_blank" rel="noreferrer">插件与 Agent 桥接指南</a>
    </details>
    <details><summary>高级：导入自定义 MCP 服务</summary><PluginImport onChange={reload} /></details>
    <details className="plugin-history"><summary>最近插件调用（{calls.length}）</summary>
      <button className="settings-add" onClick={()=>void reload().catch((e:unknown)=>setError(e instanceof Error ? e.message : '刷新失败'))}>刷新调用记录</button>
      {!calls.length ? <p className="settings-hint">暂无调用；连接测试不会执行工具，因此不计入调用记录。</p> :
        <ol>{calls.map(c=><li key={c.id}><b>{c.pluginId} · {c.tool}</b><span>{STATUS[c.status]} · {(c.durationMs/1000).toFixed(1)}s · {new Date(c.createdAt).toLocaleString()}</span>
          {c.error && <p className="plugin-error">{c.error}</p>}</li>)}</ol>}
    </details>
  </section>;
}


import { useEffect, useState } from 'react';
import { PLUGIN_CAPABILITIES, type PluginView } from '@sb/shared';
import { pluginApi } from './plugin-api';
export function PluginConnectionCard({plugin:p,onChange}: {plugin:PluginView;onChange:()=>Promise<void>}) {
  const [token,setToken] = useState(''), [repos,setRepos] = useState(p.repositories.join('\n'));
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [disconnecting,setDisconnecting] = useState(false), [removing,setRemoving] = useState(false);
  const savedRepos = p.repositories.join('\n');
  const github = p.manifest.id === 'github';
  const needsKey = p.manifest.auth !== 'none';
  const keyName = p.manifest.auth === 'x-api-key' ? 'API Key' : 'Bearer Token';
  useEffect(()=>setRepos(savedRepos),[savedRepos]);
  const repoList = repos.split(/[\n,]/u).map(s=>s.trim().toLowerCase()).filter(Boolean);
  const dirty = !!token || JSON.stringify(repoList) !== JSON.stringify(p.repositories);
  const run = async(action:()=>Promise<unknown>,message:string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); await onChange(); }
    catch(e) {setError(e instanceof Error ? e.message : '插件操作失败'); await onChange().catch(()=>{});}
    finally {setBusy(false);}
  };
  const save = () => run(async()=>{
    await pluginApi.update(p.manifest.id,{...(token ? {token} : {}),...(github && JSON.stringify(repoList)!==JSON.stringify(p.repositories) ? {repositories:repoList} : {})});
    setToken('');
  },'配置已保存。请测试连接，再启用。');
  return <article className="plugin-card">
    <header className="plugin-head">
      <h4>{p.manifest.name}<span className="settings-tag">{github ? '内置 · 严格只读' : p.manifest.network === 'loopback' ? '本机桥接 · 逐次确认' : p.builtin ? '内置接入 · 逐次确认' : '自定义 · 逐次确认'}</span></h4>
      <span className="settings-state">{p.enabled ? '已启用' : p.testedAt ? '连接通过 · 未启用' : '未连接'}</span>
    </header>
    <p className="settings-hint">{p.manifest.description}</p>
    <p className="plugin-endpoint">v{p.manifest.version} · {p.manifest.endpoint}</p>
    {p.manifest.publisher && <p className="settings-hint">发布者声明：<a href={p.manifest.publisher.url} target="_blank" rel="noreferrer">{p.manifest.publisher.name}</a> · 接入规范 v{p.manifest.schemaVersion}{!p.builtin && '（声明不等于官方认证）'}</p>}
    {p.manifest.id === 'tinyfish' && <p className="settings-hint"><a href="https://agent.tinyfish.ai" target="_blank" rel="noreferrer">获取 TinyFish API Key</a> · 使用官方 X-API-Key 认证；自动化通过异步任务提交后查询结果，不自动重试。</p>}
    {needsKey && <label className="plugin-label">{keyName}{p.hasToken ? '（已保存；留空保留）' : p.manifest.auth || p.builtin ? '（必填）' : '（服务不需认证时可留空）'}
      <input type="password" value={token} autoComplete="new-password" spellCheck={false} disabled={busy}
        onChange={e=>setToken(e.target.value)} placeholder="只用于插件连接，不交给模型" aria-label={p.manifest.name+' Token'} />
    </label>}
    {github && <>
      <label className="plugin-label">允许访问的仓库（每行 owner/repo，最多 50 个）
        <textarea value={repos} rows={3} disabled={busy} onChange={e=>setRepos(e.target.value)} placeholder="owner/repository" aria-label="GitHub 仓库范围" />
      </label>
      <p className="settings-hint">使用所选仓库的细粒度只读 Token，按需开启 Contents、Issues、Pull requests、Actions 的 Read-only 权限。已有 GitHub 账号登录不会自动授权此插件。<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">创建 Token</a></p>
    </>}
    <div className="plugin-actions">
      <button className="settings-add" disabled={busy || !dirty} onClick={()=>void save()}>保存配置</button>
      <button className="settings-add" disabled={busy || dirty || (!!p.manifest.auth && needsKey && !p.hasToken)} onClick={()=>void run(()=>pluginApi.test(p.manifest.id),'连接测试通过；尚未启用。')}>测试连接</button>
      <button className="settings-add" disabled={busy || dirty || (!p.enabled && !p.testedAt)}
        onClick={()=>void run(()=>pluginApi.update(p.manifest.id,{enabled:!p.enabled}),p.enabled ? '插件已停用。' : '插件已启用，可在对话中调用。')}>{p.enabled ? '停用' : '启用'}</button>
      <button className="settings-del" disabled={busy} onClick={()=>setDisconnecting(true)}>断开授权</button>
      {!p.builtin && <button className="settings-del" disabled={busy} onClick={()=>setRemoving(true)}>删除插件</button>}
    </div>
    {disconnecting && <div className="plugin-confirm">
      <p>清除保存的密钥、停用插件，并中止正在执行的请求？这不会撤销服务端密钥，也不会取消远端已经接受的任务。</p>
      <button className="settings-del" disabled={busy} onClick={()=>void run(async()=>{await pluginApi.disconnect(p.manifest.id);setToken('');setDisconnecting(false);},'已清除授权。')}>确认断开</button>
      <button disabled={busy} onClick={()=>setDisconnecting(false)}>取消</button>
    </div>}
    {removing && <div className="plugin-confirm">
      <p>删除该插件配置和 Token？历史调用记录仍保留。</p>
      <button className="settings-del" disabled={busy} onClick={()=>void run(()=>pluginApi.remove(p.manifest.id),'已删除插件。')}>确认删除</button>
      <button disabled={busy} onClick={()=>setRemoving(false)}>取消</button>
    </div>}
    {busy && <p role="status">正在处理插件请求…</p>}
    {notice && <p className="settings-hint" role="status">{notice}</p>}
    {(error || p.error) && <p className="plugin-error" role="alert">{error || p.error}</p>}
    {dirty && <p className="settings-hint">存在未保存配置；保存后会停用插件并重新验证。</p>}
    <details className="plugin-tools"><summary>工具白名单（{p.tools.length} 个已发现 / {p.manifest.tools.length} 个声明）</summary>
      <ul>{p.manifest.tools.map(name=><li key={name}><code>{name}</code> · {p.tools.some(t=>t.name===name) ? '可用' : '尚未发现'}{p.manifest.permissions?.[name] && <small> · {PLUGIN_CAPABILITIES[p.manifest.permissions[name]!]}</small>}</li>)}</ul>
      {p.tools.map(t=><details key={t.name}><summary>{t.name} 参数定义</summary><pre>{JSON.stringify(t.inputSchema,null,2)}</pre></details>)}
    </details>
  </article>;
}


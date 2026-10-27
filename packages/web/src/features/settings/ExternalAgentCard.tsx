import { useEffect, useState } from 'react';
import { DEFAULT_EXTERNAL_AGENT, type ExternalAgentSettings, type ExternalAgentView } from '@sb/shared';
import { externalAgentApi } from './external-agent-api';
import './external-agent.css';
import { ExternalAgentGuide } from './ExternalAgentGuide';

export function ExternalAgentCard() {
  const [view, setView] = useState<ExternalAgentView | null>(null);
  const [settings, setSettings] = useState<ExternalAgentSettings>({ ...DEFAULT_EXTERNAL_AGENT });
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    externalAgentApi.get().then(value => { if (active) { setView(value); setSettings(value.settings); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : '设置读取失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const change = <K extends keyof ExternalAgentSettings>(key: K, value: ExternalAgentSettings[K]) => {
    setSettings(old => ({ ...old, [key]: value })); setNotice(''); setError(''); setModels([]);
  };
  const payload = () => ({ ...settings, ...(clearToken ? { token: '' } : token ? { token } : {}) });
  const run = async (kind: 'save' | 'probe') => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (kind === 'save') {
        const result = await externalAgentApi.save(payload());
        setView(result); setSettings(result.settings); setToken(''); setClearToken(false);
        window.dispatchEvent(new Event('sb:external-agent-changed'));
        setNotice(result.settings.enabled ? '外置 Agent 已启用，下一条文字消息由它回答；原模型配置保留。' : '外置 Agent 已关闭，下一条消息恢复原模型。');
      } else {
        const result = await externalAgentApi.probe(payload());
        setModels(result.models); setNotice(result.message + ' 此操作不会保存或启用设置。');
      }
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  };
  if (loading) return <p role="status">正在读取外置 Agent 设置…</p>;
  if (!view) return <div role="alert">{error || '设置读取失败，请重新进入本页。'}</div>;
  if (!view.supported) return <section className="settings-sec"><h3>外置 Agent 仅在本机连接</h3>
    <p className="settings-hint">请使用更新后的 Windows 本地版。源码开发可设置 SB_EXTERNAL_AGENT=1 并仅监听回环地址；公网网站不会连接服务器上的本地 Agent。</p></section>;
  return <section className="settings-sec external-agent-card" aria-label="外置 Agent 对话设置">
    <div className="external-agent-state"><strong>{view.settings.enabled ? `当前后端：${view.settings.name}` : '当前后端：原有模型'}</strong>
      <span>当前生效的是已保存配置</span></div>
    <p className="settings-hint">你在 StudentBuddy 发消息，由外置 Agent 回答。此入口与插件中心的「派发任务」独立；关闭即可恢复原模式。</p>
    <fieldset disabled={busy}>
      <div className="external-agent-presets" aria-label="Agent 接入预设">{[
        { name: 'Codex', baseUrl: DEFAULT_EXTERNAL_AGENT.baseUrl }, { name: 'OpenCode', baseUrl: 'http://127.0.0.1:4013/v1' }, { name: 'Qoder', baseUrl: 'http://127.0.0.1:4015/v1' },
      ].map(({ name, baseUrl }) => <button type="button" key={name} onClick={() => {
        setSettings(old => ({ ...old, name: name + ' 本地 Agent', baseUrl, model: 'default' }));
        setToken(''); setClearToken(false); setModels([]); setError(''); setNotice('仅填入预设，尚未保存；请填写对应配对密钥并测试连接。');
      }}>使用 {name} 预设</button>)}</div>
      <label className="external-agent-toggle"><input type="checkbox" checked={settings.enabled} onChange={e => change('enabled', e.target.checked)} />启用外置 Agent 作为聊天后端</label>
      <div className="external-agent-fields">
        <label>显示名称<input value={settings.name} maxLength={80} onChange={e => change('name', e.target.value)} /></label>
        <label>接口基础地址<input value={settings.baseUrl} placeholder="http://127.0.0.1:4012/v1" onChange={e => change('baseUrl', e.target.value)} /></label>
        <label>模型 ID<input value={settings.model} list="external-agent-models" onChange={e => change('model', e.target.value)} />
          <datalist id="external-agent-models">{models.map(id => <option key={id} value={id} />)}</datalist></label>
        <label>配对密钥<input type="password" autoComplete="new-password" value={token}
          placeholder={view.tokenConfigured ? '已保存；留空保留，换地址时不沿用' : '粘贴本地桥接器 pairing-key 文件的内容'}
          onChange={e => { setToken(e.target.value); setClearToken(false); setNotice(''); }} /></label>
        <label>最长等待（秒）<input type="number" min={10} max={600} value={settings.timeoutSeconds} onChange={e => change('timeoutSeconds', Number(e.target.value))} /></label>
        <label>最近消息数<input type="number" min={1} max={100} value={settings.historyMessages} onChange={e => change('historyMessages', Number(e.target.value))} /></label>
      </div>
      {view.tokenConfigured && <label className="external-agent-toggle"><input type="checkbox" checked={clearToken} onChange={e => setClearToken(e.target.checked)} />保存时清除原配对密钥</label>}
      <div className="external-agent-actions"><button className="settings-add" onClick={() => void run('probe')}>测试连接</button>
        <button className="settings-add" onClick={() => void run('save')}>保存设置</button>{busy && <span role="status">处理中…</span>}</div>
    </fieldset>
    {error && <p className="settings-msg err" role="alert">{error}</p>}
    {notice && <p className="settings-msg ok" role="status">{notice}</p>}
    {models.length > 0 && <p className="settings-hint">可用模型：{models.join('、')}</p>}
    <ExternalAgentGuide />
    <p className="settings-hint">v1 为纯文字对话：只发送当前会话最近消息和回答风格，最多 12 万字符。不继承 ChatGPT 原会话或跨会话记忆；不授予 StudentBuddy 工具、电脑文件、联网或自动学习写入权限。图片、联网和 GrillMe 请切回原模式。连接失败不会暗中切换模型或自动重试。</p>
  </section>;
}

/** Two-level settings navigation: only the selected leaf mounts or fetches. */
import { useEffect, useRef, useState } from 'react';
import { ModelSettings } from './ModelSettings';
import { SearchKeysCard } from './SearchKeysCard';
import { ExamModeCard } from './ExamModeCard';
import { QuizMixCard } from './QuizMixCard';
import { QuizImageCard } from './QuizImageCard';
import { QuizRealFirstCard } from './QuizRealFirstCard';
import { AnswerStyleCard } from './AnswerStyleCard';
import { ToolsCard } from './ToolsCard';
import { PluginsCard } from '../plugins/PluginsCard';
import { SpeechCard } from './SpeechCard';
import { AiHealthCard } from './AiHealthCard';
import { WaitDrillCard } from './WaitDrillCard';
import { ReadingSizeCard } from './ReadingSizeCard';
import { AgentTermsCard } from './AgentTermsCard';
import './settings.css';

const GROUPS = [
  { id: 'models', label: '模型与服务商', pages: [
    { id: 'providers', label: '供应商管理', hint: '添加、删除服务商，管理模型列表与回答形态' },
    { id: 'roles', label: '角色模型绑定', hint: '为每个学习环节选择服务商和模型' },
    { id: 'channel', label: '默认通道与额度', hint: '查看免费额度，恢复默认模型配置' },
  ] },
  { id: 'learning', label: '学习与出题', pages: [
    { id: 'exam', label: '考试范围', hint: '设置应试范围与学习目标' },
    { id: 'mix', label: '题型配比', hint: '调整 AI 出题与网络真题的比例' },
    { id: 'real', label: '真题优先', hint: '设置真题优先策略' },
    { id: 'images', label: '图片题', hint: '设置图片题与配图策略' },
  ] },
  { id: 'search', label: '联网搜索', pages: [
    { id: 'search-keys', label: '搜索服务与密钥', hint: '管理联网搜索服务与访问密钥' },
  ] },
  { id: 'experience', label: '阅读与交互', pages: [
    { id: 'answer', label: '回答风格', hint: '调整回答的组织与表达方式' },
    { id: 'speech', label: '词条朗读', hint: '设置朗读服务与语音' },
    { id: 'reading', label: '阅读字号', hint: '调整阅读文字大小' },
    { id: 'wait', label: '等待练习', hint: '设置等待 AI 回答时的词条练习' },
  ] },
  { id: 'plugins', label: '插件中心', pages: [
    { id: 'plugins', label: '插件管理与接入', hint: '管理 GitHub、B站、TinyFish 与本地 Agent' },
  ] },
  { id: 'agents', label: '外部 Agent 授权', pages: [
    { id: 'agents', label: '学习接口授权', hint: '管理词条与出题预产物的专用接口' },
  ] },
  { id: 'diagnostics', label: '工具与诊断', pages: [
    { id: 'tools', label: '工具权限与记录', hint: '管理工具权限和调用记录' },
    { id: 'health', label: 'AI 健康', hint: '检查 AI 服务的运行状态' },
  ] },
] as const;

type PageId = typeof GROUPS[number]['pages'][number]['id'];
const PAGE_KEY = 'sb:settings-page';
function savedPage(): PageId {
  try {
    const id = sessionStorage.getItem(PAGE_KEY);
    if (GROUPS.some(g => g.pages.some(p => p.id === id))) return id as PageId;
  } catch { /* Storage can be disabled; navigation still works. */ }
  return 'providers';
}

export function SettingsView() {
  const [selected, setSelected] = useState<PageId>(savedPage);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const lastPages = useRef<Partial<Record<typeof GROUPS[number]['id'], PageId>>>({});
  const group = GROUPS.find(g => g.pages.some(p => p.id === selected))!;
  const current = group.pages.find(p => p.id === selected)!;
  useEffect(() => {
    const active = Array.from(nav.current?.querySelectorAll('[aria-current="page"]') ?? []).find(el => el.getClientRects().length);
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    try { sessionStorage.setItem(PAGE_KEY, selected); } catch { /* Optional persistence. */ }
  }, [selected]);
  const select = (id: PageId) => {
    lastPages.current[group.id] = selected;
    setSelected(id);
    setNotice(null);
    if (panel.current) panel.current.scrollTop = 0;
  };
  const flash = (ok: boolean, text: string) => setNotice({ ok, text });

  return <div className="settings-view">
    <header className="settings-page-head"><div><h2>设置</h2><p className="settings-hint">先选分类，再选具体设置；每次只显示当前子页。</p></div>
      <button className="settings-add" onClick={() => select('plugins')}>管理插件</button></header>
    <div className="settings-layout">
      <nav className="settings-nav" ref={nav} aria-label="设置分区">
        <div className="settings-groups">
        {GROUPS.map((g, index) => <div className={'settings-nav-group' + (g.id === group.id ? ' active' : '')} key={g.id}>
          <button type="button" className="settings-nav-item" aria-label={g.label} aria-expanded={g.id === group.id}
            aria-controls={'settings-children-' + g.id} onClick={() => select(g.id === group.id ? selected : lastPages.current[g.id] ?? g.pages[0].id)}>
            <span className="settings-nav-mark">{String(index + 1).padStart(2, '0')}</span><strong>{g.label}</strong>
            <span className="settings-nav-chevron" aria-hidden="true">{g.id === group.id ? '⌄' : '›'}</span>
          </button>
          <div className="settings-subnav" id={'settings-children-' + g.id} hidden={g.id !== group.id}>
            {g.pages.map(p => <button type="button" key={p.id} className={'settings-subnav-item' + (p.id === selected ? ' active' : '')}
              aria-current={p.id === selected ? 'page' : undefined} aria-controls="settings-panel" onClick={() => select(p.id)}>{p.label}</button>)}
          </div>
        </div>)}
        </div>
        <div className="settings-mobile-nav">
          <select aria-label="设置分类" value={group.id} onChange={e => {
            const next = GROUPS.find(g => g.id === e.target.value)!;
            select(lastPages.current[next.id] ?? next.pages[0].id);
          }}>{GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          <div className="settings-mobile-pages">{group.pages.map(p => <button type="button" key={p.id}
            className={'settings-subnav-item' + (p.id === selected ? ' active' : '')} aria-current={p.id === selected ? 'page' : undefined}
            aria-controls="settings-panel" onClick={() => select(p.id)}>{p.label}</button>)}</div>
        </div>
      </nav>
      <div className="settings-panel" id="settings-panel" ref={panel} role="region" aria-label={current.label} key={selected}>
        <header className="settings-panel-head"><p className="settings-breadcrumb">设置 / {group.label} / {current.label}</p>
          <h3>{current.label}</h3><p className="settings-hint">{current.hint}</p></header>
        {notice && <div className={'settings-msg ' + (notice.ok ? 'ok' : 'err')} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
        {(selected === 'providers' || selected === 'roles' || selected === 'channel') && <ModelSettings page={selected} />}
        {selected === 'exam' && <ExamModeCard flash={flash} />}
        {selected === 'mix' && <QuizMixCard flash={flash} />}
        {selected === 'real' && <QuizRealFirstCard flash={flash} />}
        {selected === 'images' && <QuizImageCard flash={flash} />}
        {selected === 'search-keys' && <SearchKeysCard flash={flash} />}
        {selected === 'answer' && <AnswerStyleCard flash={flash} />}
        {selected === 'speech' && <SpeechCard flash={flash} />}
        {selected === 'reading' && <ReadingSizeCard />}
        {selected === 'wait' && <WaitDrillCard />}
        {selected === 'plugins' && <PluginsCard />}
        {selected === 'agents' && <AgentTermsCard flash={flash} />}
        {selected === 'tools' && <ToolsCard flash={flash} />}
        {selected === 'health' && <AiHealthCard flash={flash} />}
      </div>
    </div>
  </div>;
}

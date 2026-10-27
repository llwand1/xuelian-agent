import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QUOTE_QUESTION_MAX } from '@sb/shared';
import type { useQuoteBranches } from './useQuoteBranches';
import { Markdown } from './Markdown';
import './quote-branches.css';

export function QuoteBranchWindow({ state }: { state: ReturnType<typeof useQuoteBranches> }) {
  const panel = useRef<HTMLDivElement>(null), log = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (!state.open) return;
    follow.current = true;
    const previous = document.activeElement;
    input.current?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); state.close(); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [state.open]);
  useLayoutEffect(() => { if (log.current && follow.current) log.current.scrollTop = log.current.scrollHeight; }, [state.detail, state.open]);
  useEffect(() => {
    if (!state.open) return;
    const fit = () => {
      const el = panel.current; if (!el) return;
      if (innerWidth <= 600) { el.classList.remove('quote-branch-moved'); return; }
      if (!el.classList.contains('quote-branch-moved')) return;
      const box = el.getBoundingClientRect();
      el.style.setProperty('--qb-x', `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, box.left))}px`);
      el.style.setProperty('--qb-y', `${Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, box.top))}px`);
    };
    window.addEventListener('resize', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    if (panel.current) observer?.observe(panel.current);
    return () => { window.removeEventListener('resize', fit); observer?.disconnect(); };
  }, [state.open]);
  if (!state.open || !state.anchor) return null;
  return createPortal(<div ref={panel} className="quote-branch-window" role="dialog" aria-label="小窗分支追问" aria-modal="false">
    <header className="quote-branch-title" onPointerDown={e => {
      if ((e.target as HTMLElement).closest('button') || !panel.current || e.pointerType === 'touch') return;
      const el = panel.current, box = el.getBoundingClientRect(), dx = e.clientX - box.left, dy = e.clientY - box.top;
      e.currentTarget.setPointerCapture(e.pointerId);
      const move = (event: PointerEvent) => {
        el.style.setProperty('--qb-x', `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, event.clientX - dx))}px`);
        el.style.setProperty('--qb-y', `${Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, event.clientY - dy))}px`);
        el.classList.add('quote-branch-moved');
      };
      const end = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', end, { once: true });
    }}>
      <div><strong>↗ 小窗追问</strong><span>隐藏分支 · 不写入主线</span></div>
      <button type="button" aria-label="收起分支，保留历史" onClick={state.close}>×</button>
    </header>
    <blockquote className="quote-branch-quote">{state.anchor.quote}</blockquote>
    <div className="quote-branch-log" ref={log} role="log" aria-live="polite" aria-busy={state.busy}
      onScroll={() => { const el = log.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50; }}>
      {state.loading && <p className="quote-branch-hint" role="status">正在打开分支…</p>}
      {!state.loading && !state.detail?.messages.length && <p className="quote-branch-hint">围绕这段文字继续问，不打断主线。收起后，点击原文标记即可回来。</p>}
      {state.detail?.messages.map(m => <article key={m.id} className={`quote-branch-message ${m.role}`}>
        <small>{m.role === 'user' ? '你' : 'StudentBuddy'}{m.status === 'streaming' ? ' · 回复中' : ''}</small>
        {m.role === 'user' ? <p>{m.content}</p> : m.content ? <Markdown text={m.content} streaming={m.status === 'streaming'} /> : <p className="quote-branch-hint">{m.status === 'streaming' ? '正在思考…' : '未收到回答内容'}</p>}
        {m.error && <p className="quote-branch-error" role="status">{m.error}</p>}
      </article>)}
    </div>
    {state.error && <p className="quote-branch-error" role="alert">{state.error}</p>}
    <form className="quote-branch-composer" onSubmit={e => { e.preventDefault(); follow.current = true; void state.send(); }}>
      <textarea ref={input} value={state.draft} maxLength={QUOTE_QUESTION_MAX} aria-label="分支追问内容" placeholder="想追问什么？留空可直接解释这段"
        disabled={state.loading} onChange={e => state.setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!state.busy && !state.loading) { follow.current = true; void state.send(); } } }} />
      <div><span>仅保存在此分支</span>{state.busy ? <button type="button" onClick={() => void state.stop()}>停止回答</button>
        : <button type="submit" disabled={state.loading}>{state.draft.trim() ? '发送追问' : '解释这段'}</button>}</div>
    </form>
  </div>, document.body);
}

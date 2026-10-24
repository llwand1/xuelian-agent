/** Executable HTML only enters an opaque-origin sandbox, never the host DOM or a new window. */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { pickTitle } from '../../lib/preview-api';
import { HtmlSandboxFrame } from './HtmlSandboxFrame';
import { htmlSourceError, type HtmlMode } from './html-sandbox';
import { isHtmlRunning, startHtmlRun, stopHtmlRun, subscribeHtmlRuns } from './html-runs';
import { READ_MESSAGE } from './useScrollAnchor';
import './html-card.css';

export function HtmlCard({ code, closed, streaming, mode }: {
  code: string; closed: boolean; streaming: boolean; mode: HtmlMode;
}) {
  const id = useId().replace(/[^a-z0-9-]/gi, '');
  const root = useRef<HTMLElement>(null);
  const keepHeader = useRef(false);
  const autoSource = useRef<string | null>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [epoch, setEpoch] = useState(0);
  const [runSource, setRunSource] = useState('');
  const [error, setError] = useState('');
  const [showSrc, setShowSrc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const active = useSyncExternalStore(subscribeHtmlRuns, () => isHtmlRunning(id), () => false);
  const invalid = useMemo(() => htmlSourceError(code), [code]);
  const permitted = mode !== 'disabled' && !streaming && closed && !invalid;
  const running = permitted && active && runSource === code;
  const title = pickTitle(code, 'HTML 互动卡片');
  const readCard = (action: () => void) => {
    root.current?.dispatchEvent(new Event(READ_MESSAGE, { bubbles: true }));
    keepHeader.current = true;
    action();
  };
  useLayoutEffect(() => {
    if (!keepHeader.current) return;
    keepHeader.current = false;
    root.current?.querySelector<HTMLElement>('header')?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [epoch, running, expanded, showSrc]);
  const start = () => {
    setError(''); setRunSource(code); setEpoch(n => n + 1); startHtmlRun(id);
  };
  useEffect(() => () => stopHtmlRun(id), [code, id]);
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      const shown = !!entry?.isIntersecting;
      setVisible(shown);
      if (!shown) stopHtmlRun(id);
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [id]);
  useEffect(() => {
    if (!permitted) { stopHtmlRun(id); return; }
    let cancelled = false;
    // Deferral cancels StrictMode's discarded effect; cleanup must not consume the one-shot autoplay.
    queueMicrotask(() => {
      if (!cancelled && mode === 'auto' && visible && autoSource.current !== code && !document.hidden
        && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        autoSource.current = code;
        start();
      }
    });
    return () => { cancelled = true; };
  }, [code, mode, permitted, visible, id]);
  useEffect(() => {
    const hide = () => { if (document.hidden) stopHtmlRun(id); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stopHtmlRun(id); clearTimeout(copyTimer.current); };
  }, [id]);
  const fail = (message: string) => { setError(message); stopHtmlRun(id); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true); clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch { setError('无法复制，请展开源码手动选择。'); }
  };
  let status = '此处仅展示 HTML 源码，不运行脚本。';
  if (streaming) status = '正在生成 HTML 卡片，整轮完成后才运行…';
  else if (!closed) status = 'HTML 围栏尚未闭合，保留源码，不执行。';
  else if (invalid) status = invalid;
  else if (mode !== 'disabled') status = epoch ? '已停止。重播会从初始状态开始。' : '点击运行卡片；重播不恢复上次操作状态。';
  return <section ref={root} className={`html-card${expanded ? ' html-card-expanded' : ''}`} aria-label={title}>
    <header className="html-card-head">
      <span className="html-card-badge">HTML · 沙箱</span><strong className="html-card-title">{title}</strong>
      <span className="html-card-actions">
        {permitted && <button type="button" onClick={() => readCard(running ? () => stopHtmlRun(id) : start)}>{running ? '停止' : epoch ? '重播' : '运行卡片'}</button>}
        {running && <button type="button" aria-pressed={expanded} onClick={() => readCard(() => setExpanded(v => !v))}>{expanded ? '收起' : '展开'}</button>}
        <button type="button" onClick={() => void copy()}>{copied ? '已复制' : '复制'}</button>
        <button type="button" aria-expanded={showSrc} onClick={() => readCard(() => setShowSrc(v => !v))}>{showSrc ? '隐藏源码' : '源码'}</button>
      </span>
    </header>
    {error && <p className="html-card-error" role="alert">{error}</p>}
    {running ? <HtmlSandboxFrame key={`${id}-${epoch}`} code={code} title={title} runId={`${id}-${epoch}`} onError={fail} />
      : <p className="html-card-status" role="status">{status}</p>}
    {showSrc && <pre className="html-card-source"><code>{code}</code></pre>}
  </section>;
}

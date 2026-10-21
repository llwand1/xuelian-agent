import { useEffect, useRef, useState } from 'react';
import { captureVideoFrame, type VideoShot } from './video-capture';
import { CAPTURE_RESULT, receiveDesktopInput } from '../desktop/desktop-input';
import './video-player.css';
type Mode = 'inline' | 'floating' | 'wide';
export function VideoPlayer({ embed, title, onClose, route = false }: { embed: string; title: string; onClose: () => void; route?: boolean }) {
  const [mode, setMode] = useState<Mode>('inline'), [shot, setShot] = useState<VideoShot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const shell = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const position = useRef({ x: 24, y: 90 }), drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const capture = useRef<AbortController | null>(null);
  const fit = () => {
    const el = shell.current; if (!el) return;
    const width = Math.min(480, innerWidth - 24), height = Math.min(width * 9 / 16 + 48, innerHeight - 24);
    position.current = { x: Math.max(12, Math.min(position.current.x, innerWidth - width - 12)), y: Math.max(12, Math.min(position.current.y, innerHeight - height - 12)) };
    el.style.setProperty('--video-x', position.current.x + 'px'); el.style.setProperty('--video-y', position.current.y + 'px');
    el.style.setProperty('--video-width', width + 'px');
  };
  useEffect(() => { fit(); window.addEventListener('resize', fit); return () => { window.removeEventListener('resize', fit); capture.current?.abort(); }; }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && mode !== 'inline') { e.stopPropagation(); setMode('inline'); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [mode]);
  useEffect(() => { capture.current?.abort(); setShot(null); setError(''); setBusy(false); }, [embed]);
  const snapshot = async () => {
    if (busy || !frame.current) return;
    const controller = new AbortController(); capture.current?.abort(); capture.current = controller;
    setBusy(true); setError('');
    try { const next = await captureVideoFrame(frame.current, controller.signal); if (!controller.signal.aborted) setShot(next); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '视频截图失败'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className={`sb-video-slot${route ? ' is-route' : ''}${mode !== 'inline' ? ' is-detached' : ''}`}>
    <div ref={shell} className={`sb-video-shell is-${mode}`} role="region" aria-label="视频播放器">
      <header className="sb-video-controls" onPointerDown={e => {
        if (mode !== 'floating' || e.button !== 0 || (e.target as Element).closest('button,a')) return;
        drag.current = { id: e.pointerId, dx: e.clientX - position.current.x, dy: e.clientY - position.current.y };
        e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
      }} onPointerMove={e => { if (drag.current?.id === e.pointerId) { position.current = { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }; fit(); } }}
      onPointerUp={e => { if (drag.current?.id === e.pointerId) { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); } }}
      onPointerCancel={() => { drag.current = null; }}>
        <span title={title}>{title}</span>
        <button type="button" onClick={() => { fit(); setMode(mode === 'floating' ? 'inline' : 'floating'); }} aria-pressed={mode === 'floating'}>{mode === 'floating' ? '还原' : '悬浮播放'}</button>
        <button type="button" onClick={() => setMode(mode === 'wide' ? 'inline' : 'wide')} aria-pressed={mode === 'wide'}>{mode === 'wide' ? '退出放大' : '放大'}</button>
        <button type="button" onClick={() => void snapshot()} disabled={busy}>{busy ? '截图中…' : '截取当前画面'}</button>
        <button type="button" className="sb-video-x" onClick={onClose} aria-label="关闭视频" title="关闭视频">×</button>
      </header>
      <iframe ref={frame} className={`sb-browser-frame src-frame${route ? ' vr-player' : ''}`} src={embed} title={title}
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="fullscreen 'none'; picture-in-picture; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
      {error && <p className="sb-video-error" role="alert">{error}</p>}
      {shot && <div className="sb-video-shot" aria-label="当前视频截图"><img src={shot.dataUrl} alt={shot.scope === 'player' ? '刚截取的播放器实时画面' : '刚截取的授权共享画面'} />
        <span>{shot.scope === 'player' ? '当前播放器画面' : '共享画面截图（当前浏览器未提供视频区域裁剪）'}</span>
        <a href={shot.dataUrl} download={shot.name}>保存截图</a><button type="button" onClick={() => { setMode('inline'); receiveDesktopInput(CAPTURE_RESULT + JSON.stringify(shot)); }}>附到 AI 输入框</button>
        <button type="button" aria-label="收起截图" onClick={() => setShot(null)}>×</button>
      </div>}
    </div>
    {mode !== 'inline' && <button type="button" className="sb-video-return" onClick={() => setMode('inline')}>视频正在{mode === 'floating' ? '悬浮' : '放大'}播放 · 还原到这里</button>}
  </div>;
}

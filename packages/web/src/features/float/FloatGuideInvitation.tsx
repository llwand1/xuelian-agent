import { useEffect, useRef, useState } from 'react';
import type { FloatGuideNudge } from '@sb/shared';
import { floatGuideApi } from '../guide/float-guide-api';
import { hasHost, onHostMessage, postToHost } from './float-view';
import { HOST_INVITE } from './CompanionInvitation';
export function FloatGuideInvitation({ eligible, onOpen, visible = false, onPending, onClose }: { eligible: boolean; onOpen: (guide: FloatGuideNudge) => void; visible?: boolean; onPending?: (pending: boolean) => void; onClose?: () => void }) {
  const [guide, setGuide] = useState<FloatGuideNudge | null>(null), [error, setError] = useState('');
  const enabled = useRef(eligible); enabled.current = eligible;
  const version = useRef(0);
  useEffect(() => {
    let live = true, polling = false;
    const tick = () => {
      if (polling) return; polling = true; const v = version.current;
      void floatGuideApi.tick(enabled.current).then(r => { if (live && v === version.current) { setGuide(r.guide); setError(''); } })
        .catch(() => { if (live) setError('引路灯提醒暂时断开，正在重连'); }).finally(() => { polling = false; });
    };
    tick(); const off = onHostMessage(m => { if (m === 'sb-float:tick') tick(); });
    const timer = hasHost() ? null : window.setInterval(tick, 5000);
    return () => { live = false; off(); if (timer !== null) window.clearInterval(timer); };
  }, []);
  const caption = guide ? `引路灯：${guide.headline} ${guide.label} · ${guide.hint}`.slice(0, 120) : '';
  useEffect(() => { onPending?.(eligible && !!guide); }, [eligible, guide, onPending]);
  useEffect(() => {
    if (!visible || !eligible || !guide || !hasHost()) return;
    postToHost(HOST_INVITE + JSON.stringify({ id: guide.id, topic: caption, kind: 'guide', manual: true, reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }));
  }, [visible, eligible, guide, caption]);
  useEffect(() => { if (visible && eligible && guide) return () => { if (hasHost()) postToHost(HOST_INVITE + 'off:' + guide.id); }; }, [visible, eligible, guide?.id]);
  const dismiss = async (action: 'open' | 'snooze') => {
    if (!guide) return; version.current++;
    try {
      const result = await floatGuideApi.dismiss(guide.id, action); setGuide(null); setError(''); onClose?.();
      if (action === 'open' && result.guide) onOpen(result.guide);
    } catch (e) { setError(e instanceof Error ? e.message : '引路灯操作失败'); postToHost(HOST_INVITE + 'reset'); }
  };
  useEffect(() => onHostMessage(m => {
    if (!visible || !eligible || !guide) return;
    if (m === 'sb-float:guide-open:' + guide.id) void dismiss('open');
    if (m === 'sb-float:guide-snooze:' + guide.id) void dismiss('snooze');
  }));
  if (!visible || !eligible || !guide || hasHost()) return null;
  return <aside className="sb-companion-invitation" aria-label="悬浮球引路灯提醒"><button className="sb-mail-close" aria-label="收起学习来信" onClick={onClose}>×</button><small>引路灯 · {guide.source === 'ai' ? 'AI 建议' : '学习建议'}</small><p>{caption}</p>{error && <p role="alert">{error}</p>}<div><button onClick={() => void dismiss('open')}>打开引路灯</button><button onClick={() => void dismiss('snooze')}>十分钟后</button></div></aside>;
}

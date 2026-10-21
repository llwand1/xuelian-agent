import { useEffect, useRef, useState } from 'react';
import type { DailyStudyNudge } from '@sb/shared';
import { dailyTaskApi } from '../pomodoro/daily-task-api';
import { hasHost, onHostMessage, postToHost } from './float-view';
import { HOST_INVITE } from './CompanionInvitation';

export function DailyTaskInvitation({ eligible, onOpen, onPending, visible = false, onClose }: { eligible: boolean; onOpen: () => void; onPending?: (pending: boolean) => void; visible?: boolean; onClose?: () => void }) {
  const [nudge, setNudge] = useState<DailyStudyNudge | null>(null), [error, setError] = useState('');
  const enabled = useRef(eligible); enabled.current = eligible;
  const version = useRef(0);
  useEffect(() => {
    let live = true, polling = false;
    const tick = () => {
      if (polling) return;
      polling = true; const v = version.current;
      void dailyTaskApi.tick(enabled.current).then(r => { if (live && v === version.current) { setNudge(r.nudge); setError(''); } })
        .catch(() => { if (live) setError('任务提醒暂时断开，正在重连'); }).finally(() => { polling = false; });
    };
    tick(); const off = onHostMessage(message => { if (message === 'sb-float:tick') tick(); });
    const timer = hasHost() ? null : window.setInterval(tick, 5000);
    return () => { live = false; off(); if (timer !== null) window.clearInterval(timer); };
  }, []);
  useEffect(() => { onPending?.(eligible && !!nudge); }, [eligible, nudge, onPending]);
  const p = nudge?.progress;
  const caption = nudge && p ? `${nudge.ai ? 'AI' : '计划'}提醒：今日 ${p.answered}/${p.task.target} 题，还差 ${p.remaining} 题。${nudge.text}` : '';
  useEffect(() => {
    if (!visible || !eligible || !nudge || !hasHost()) return;
    postToHost(HOST_INVITE + JSON.stringify({ id: nudge.id, topic: caption, reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, kind: 'task', manual: true }));
  }, [visible, eligible, nudge, caption]);
  useEffect(() => {
    if (!visible || !eligible || !nudge) return;
    return () => { if (hasHost()) postToHost(HOST_INVITE + 'off:' + nudge.id); };
  }, [visible, eligible, nudge?.id]);
  const dismiss = async (action: 'open' | 'snooze') => {
    if (!nudge) return;
    version.current++;
    try {
      await dailyTaskApi.dismiss(nudge.id, action); setNudge(null); setError(''); onClose?.();
      if (action === 'open') onOpen();
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); postToHost(HOST_INVITE + 'reset'); }
  };
  useEffect(() => onHostMessage(message => {
    if (!visible || !eligible || !nudge) return;
    if (message === 'sb-float:task-open:' + nudge.id) void dismiss('open');
    if (message === 'sb-float:task-snooze:' + nudge.id) void dismiss('snooze');
  }));
  if (!visible || !eligible || !nudge || hasHost()) return null;
  return <aside className="sb-companion-invitation" aria-label="每日任务提醒"><button className="sb-mail-close" aria-label="收起学习来信" onClick={onClose}>×</button><small>学习任务</small><p aria-live="polite">{caption}</p>{error && <p role="alert">{error}</p>}<div><button onClick={() => void dismiss('open')}>去做题</button><button onClick={() => void dismiss('snooze')}>十分钟后</button></div></aside>;
}

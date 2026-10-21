import { useEffect, useState } from 'react';
import { DEFAULT_DAILY_STUDY_TASK, type DailyStudyTask, type DailyStudyProgress } from '@sb/shared';
import { dailyTaskApi, STUDY_TASK_OPEN, STUDY_TASK_UPDATED } from './daily-task-api';
import { PixelPomodoroIcon } from './PixelPomodoroIcon';
export function DailyTaskCard() {
  const [progress, setProgress] = useState<DailyStudyProgress | null>(null);
  const [task, setTask] = useState<DailyStudyTask>({ ...DEFAULT_DAILY_STUDY_TASK });
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () => { void dailyTaskApi.get().then(p => { if (live) setProgress(p); }).catch(() => undefined); };
    void dailyTaskApi.get().then(p => { if (live) { setProgress(p); setTask(p.task); setLoaded(true); } })
      .catch((e: unknown) => { if (live) { setLoaded(true); setError(e instanceof Error ? e.message : '任务读取失败'); } });
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener(STUDY_TASK_UPDATED, refresh);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener(STUDY_TASK_UPDATED, refresh); };
  }, []);
  const change = (value: Partial<DailyStudyTask>) => { setTask(t => ({ ...t, ...value })); setSaved(false); };
  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    try { const p = await dailyTaskApi.save(task); setProgress(p); setTask(p.task); setSaved(true); window.dispatchEvent(new Event(STUDY_TASK_UPDATED)); }
    catch (e) { setError(e instanceof Error ? e.message : '任务保存失败'); }
    finally { setBusy(false); }
  };
  return <section className="pomo-card pomo-task" aria-label="每日做题任务" data-testid="daily-task-card">
    <div className="pomo-head"><b><PixelPomodoroIcon /> 每日做题任务</b><span className="pomo-hint">同一套学习主线 · 常规练习与矿境共用进度</span></div>
    <fieldset disabled={!loaded || busy}>
      <label className="pomo-task-toggle"><input type="checkbox" checked={task.enabled} onChange={e => change({ enabled: e.target.checked })} /> 启用每日任务</label>
      <div className="pomo-row"><label className="pomo-label" htmlFor="daily-task-title">任务名称</label><input id="daily-task-title" className="pomo-input pomo-subject" maxLength={60} value={task.title} onChange={e => change({ title: e.target.value })} /></div>
      <div className="pomo-row"><label className="pomo-label" htmlFor="daily-task-target">每天做题</label><input id="daily-task-target" className="pomo-input" type="number" min={1} max={1000} value={task.target} onChange={e => change({ target: Number(e.target.value) })} /><span>道</span>{[10,20,30,50].map(n => <button type="button" className={`pomo-chip${task.target === n ? ' on' : ''}`} key={n} onClick={() => change({ target: n })}>{n}</button>)}</div>
      <label className="pomo-task-toggle"><input type="checkbox" checked={task.remind} onChange={e => change({ remind: e.target.checked })} /> 悬浮球 AI 督促（未配置模型时使用计划提醒）</label>
      <div className="pomo-row"><label className="pomo-label" htmlFor="daily-task-interval">提醒间隔</label><input id="daily-task-interval" className="pomo-input" type="number" min={5} max={180} value={task.intervalMinutes} onChange={e => change({ intervalMinutes: Number(e.target.value) })} /><span>分钟</span></div>
      <div className="pomo-row"><span className="pomo-label">提醒时段</span><input aria-label="提醒开始小时" className="pomo-input" type="number" min={0} max={23} value={task.startHour} onChange={e => change({ startHour: Number(e.target.value) })} /><span>至</span><input aria-label="提醒结束小时" className="pomo-input" type="number" min={1} max={24} value={task.endHour} onChange={e => change({ endHour: Number(e.target.value) })} /><span>时</span></div>
      <div className="pomo-row"><label className="pomo-label" htmlFor="daily-task-zone">日界时区</label><input id="daily-task-zone" className="pomo-input pomo-subject" value={task.timeZone} onChange={e => change({ timeZone: e.target.value })} /></div>
      <div className="pomo-row"><button className="pomo-btn ok" onClick={() => void save()}>保存每日任务</button>{saved && <span role="status">已保存</span>}</div>
    </fieldset>
    {progress?.task.enabled && <div className="pomo-task-progress" aria-live="polite"><strong>{progress.completed ? '今日任务完成！' : '今日进度'} {progress.answered} / {progress.task.target} 题</strong><progress max={progress.task.target} value={Math.min(progress.answered, progress.task.target)} /><span>{progress.day} · 答对 {progress.correct} 题{progress.remaining > 0 ? ` · 还差 ${progress.remaining} 题` : ''}</span><button className="pomo-btn" onClick={() => window.dispatchEvent(new Event(STUDY_TASK_OPEN))}>去矿境做题</button></div>}
    <p className="pomo-tip">提交答案就记一题，答错也算；跳过、不认识和直接斩词不计。完成后停止督促，休息段不打扰；悬浮球需保持运行。</p>
    {error && <p className="pomo-error" role="alert">{error}</p>}
  </section>;
}

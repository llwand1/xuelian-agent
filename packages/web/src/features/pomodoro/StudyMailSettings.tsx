import { useEffect, useState } from 'react';
import { DEFAULT_STUDY_SNOOZE_MINUTES, type DesktopStudySettings, type DesktopStudyState } from '@sb/shared';
import { desktopApi, isLocalDesktopAddress, STUDY_SETTINGS_UPDATED } from '../desktop/desktop-api';
import { hasHost } from '../float/float-view';

/** Same persisted desktop timer in the Pomodoro panel and companion settings. */
export function StudyMailSettings({ always = false }: { always?: boolean }) {
  const [settings, setSettings] = useState<DesktopStudySettings | null>(null);
  const [interval, setInterval] = useState(''), [snooze, setSnooze] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!always && !hasHost() && !isLocalDesktopAddress()) return;
    let live = true;
    const apply = (next: DesktopStudyState) => {
      if (!live) return;
      setSettings(next.settings); setInterval(String(next.settings.intervalMinutes));
      setSnooze(String(next.settings.snoozeMinutes ?? DEFAULT_STUDY_SNOOZE_MINUTES));
    };
    void desktopApi.state().then(apply).catch(() => { if (live && always) setError('学习来信设置读取失败，请重新打开重试'); });
    const update = (event: Event) => { apply((event as CustomEvent<DesktopStudyState>).detail); setSaved(false); };
    window.addEventListener(STUDY_SETTINGS_UPDATED, update);
    return () => { live = false; window.removeEventListener(STUDY_SETTINGS_UPDATED, update); };
  }, [always]);
  const save = async () => {
    if (!settings || busy) return;
    const minutes = [Number(interval), Number(snooze)];
    if (minutes.some(n => !Number.isInteger(n) || n < 1 || n > 60)) { setError('请输入 1–60 的整数分钟'); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      const next = await desktopApi.settings({ ...settings, intervalMinutes: minutes[0]!, snoozeMinutes: minutes[1]! });
      window.dispatchEvent(new CustomEvent(STUDY_SETTINGS_UPDATED, { detail: next })); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };
  if (!settings && !always) return null;
  return <section className="pomo-card pomo-mail" aria-label="学习来信设置">
    <div className="pomo-head"><b>学习来信</b><span className="pomo-hint">安静备题 · 主动查看</span></div>
    <p className="pomo-tip">题目备好后只用吉祥物动作提示，不自动弹窗。鼠标停在悬浮球上，点击「学习来信」查看。</p>
    {settings ? <fieldset disabled={busy} onChange={() => setSaved(false)}>
      <label className="pomo-task-toggle"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} /> 开启自动出题</label>
      <label className="pomo-row"><span className="pomo-label">出题间隔（分钟）</span><input className="pomo-input" type="number" min={1} max={60} step={1} value={interval} onChange={e => setInterval(e.target.value)} /></label>
      <label className="pomo-row"><span className="pomo-label">来信延后时间（分钟）</span><input className="pomo-input" type="number" min={1} max={60} step={1} value={snooze} onChange={e => setSnooze(e.target.value)} /></label>
      <p className="pomo-tip">点击来信里的「稍后提醒」或收起题卡后，按这个时间重新提醒；关闭来信不重置计时。</p>
      <label className="pomo-row"><span className="pomo-label">练习范围</span><select className="pomo-input pomo-mail-scope" value={settings.scope} onChange={e => setSettings({ ...settings, scope: e.target.value as DesktopStudySettings['scope'] })}>
        <option value="learning">当前学习方向／应试范围</option><option value="browser">正在共读的网页</option><option value="bilibili">B站学习视频</option>
      </select></label>
      <button type="button" className="pomo-btn primary" onClick={() => void save()}>{busy ? '保存中…' : '保存来信设置'}</button>
    </fieldset> : <p className="pomo-tip">正在连接本机服务…</p>}
    {error && <p role="alert" className="pomo-error">{error}</p>}{saved && <p role="status" className="pomo-tip">已保存，下次按新时间提醒</p>}
  </section>;
}

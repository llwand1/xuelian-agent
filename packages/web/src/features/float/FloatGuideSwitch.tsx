import { useEffect, useState } from 'react';
import { floatGuideApi } from '../guide/float-guide-api';
export function FloatGuideSwitch({ onOpen }: { onOpen: () => void }) {
  const [enabled, setEnabled] = useState(true), [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void floatGuideApi.settings().then(s => { if (live) setEnabled(s.enabled); }).catch(() => { if (live) setError('引路灯设置没有读取成功'); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);
  return <section className="desktop-timer-settings" aria-label="悬浮球引路灯设置"><h2>引路灯</h2>
    <label className="desktop-toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => {
      setBusy(true); setError(''); void floatGuideApi.configure(e.target.checked).then(s => setEnabled(s.enabled)).catch(() => setError('引路灯设置保存失败，请重试')).finally(() => setBusy(false));
    }} />悬浮球引路灯提醒</label>
    <p>沿用当前学习现场的引路灯建议，只用吉祥物动作提示。通过悬浮球菜单「学习来信」查看，不自动弹窗；休息时不打扰。</p>
    <button type="button" className="quiz-gen-btn" onClick={onOpen}>打开引路灯 · 下一步学什么</button>
    {error && <p role="alert" className="desktop-error">{error}</p>}
  </section>;
}

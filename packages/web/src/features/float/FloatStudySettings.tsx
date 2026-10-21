import { FloatGuideSwitch } from './FloatGuideSwitch';
import { useState } from 'react';
import type { DesktopStudyState } from '@sb/shared';
import { BrowserControls } from '../desktop/BrowserControls';
import { QuizRoundHistoryPanel } from '../quiz/QuizRoundHistory';
import { QuizCard } from '../quiz/QuizCard';
import { StudyMailSettings } from '../pomodoro/StudyMailSettings';
export function FloatStudySettings({ state, onGuide }: { state: DesktopStudyState | null; onGuide?: () => void }) {
  const [history, setHistory] = useState(false);
  return <div className="desktop-settings-scroll"><section className="desktop-timer-settings" aria-label="定时出题设置">
    {onGuide && <FloatGuideSwitch onOpen={onGuide} />}
    <StudyMailSettings always />
    {state && <p className="desktop-timer-status" aria-live="polite">{state.awaiting ? '有一道待做题，可从学习来信打开' : !state.settings.enabled ? '自动出题已关闭' : state.error || (state.nextAt ? `下次约 ${new Date(state.nextAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '正在备题')}{state.preparing ? ' · 正在提前备题' : ''}</p>}
    <button type="button" className="quiz-gen-btn" onClick={() => setHistory(true)}>最近作答记录</button>
  </section><BrowserControls />{history && <QuizRoundHistoryPanel onClose={() => setHistory(false)} renderRound={id => <QuizCard key={id} recordId={id} title="历史作答" questions={[]} compact />} />}</div>;
}

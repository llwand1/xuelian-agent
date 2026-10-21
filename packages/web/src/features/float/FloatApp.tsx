/**
 * Desktop companion, full app, independent quiz and settings share one host window.
 * The 32px sprite and particle frame also define the native transparent clip region.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_STUDY_SNOOZE_MINUTES, type FloatGuideNudge } from '@sb/shared';
import { EmptyStudyMail } from './EmptyStudyMail';
import { FLOAT_GUIDE_OPEN } from '../guide/float-guide-api';
import { FloatGuideInvitation } from './FloatGuideInvitation';
import { STUDY_TASK_OPEN } from '../pomodoro/daily-task-api';
import { DailyTaskInvitation } from './DailyTaskInvitation';
import { App } from '../../app/App';
import { HOST_COLLAPSE, HOST_DRAG, HOST_EXPAND, onHostMessage, postToHost } from './float-view';
import './float.css';
import { useFloatStudy } from './useFloatStudy';
import { FloatQuiz } from './FloatQuiz';
import { FloatStudySettings } from './FloatStudySettings';
import { FloatCompanion } from './FloatCompanion';
import { companionMood, type CompanionMood } from './companion-view';
import '../desktop/desktop-study.css';
import { watchDesktopInput } from '../desktop/desktop-input';
import { RESTORE_LATEST } from '../chat/useScrollAnchor';
import { CompanionInvitation, HOST_CHALLENGE, HOST_SNOOZE, HOST_INVITE, HOST_MAIL_OPEN, HOST_MAIL_CLOSE } from './CompanionInvitation';

export function FloatApp() {
  const [mode, setMode] = useState<'ball' | 'screen' | 'quiz' | 'settings'>(() => {
    const saved = new URLSearchParams(location.hash.split('?')[1]).get('mode');
    return saved === 'screen' || saved === 'settings' ? saved : 'ball';
  });
  const [taskRequest, setTaskRequest] = useState(0), [taskPending, setTaskPending] = useState(false);
  const [guidePending, setGuidePending] = useState(false), [mailOpen, setMailOpen] = useState(false);
  const closeMail = useCallback(() => setMailOpen(false), []);
  const [guideRequest, setGuideRequest] = useState<{ seq: number; guide?: FloatGuideNudge }>({ seq: 0 });
  const [screenOpened, setScreenOpened] = useState(mode === 'screen');
  const [actionError, setActionError] = useState('');
  const [reaction, setReaction] = useState<CompanionMood | null>(null);
  const verdict = useRef<boolean | null>(null);
  const study = useFloatStudy(mode === 'ball');
  const snoozeMinutes = study.state?.settings.snoozeMinutes ?? DEFAULT_STUDY_SNOOZE_MINUTES;
  const hasMail = !!study.state?.awaiting || taskPending || guidePending;
  useEffect(() => {
    document.documentElement.dataset.float = mode;
    return () => { delete document.documentElement.dataset.float; };
  }, [mode]);
  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 4000);
    return () => window.clearTimeout(timer);
  }, [reaction]);
  const expand = useCallback(() => { setMailOpen(false); postToHost(HOST_EXPAND); setScreenOpened(true); setMode('screen'); }, []);
  const collapse = useCallback(() => { setMailOpen(false); postToHost(HOST_COLLAPSE); setMode('ball'); }, []);
  const settings = useCallback(() => { setMailOpen(false); postToHost('sb-float:settings'); setMode('settings'); }, []);
  useEffect(() => onHostMessage(message => {
    if (message === HOST_MAIL_OPEN && mode === 'ball') setMailOpen(true);
    if (message === HOST_MAIL_CLOSE) setMailOpen(false);
  }), [mode]);
  useEffect(() => watchDesktopInput(value => { if (value.focus || value.capture || value.error) expand(); }), [expand]);
  useEffect(() => onHostMessage(message => { if (message === 'sb-float:open-settings') settings(); }), [settings]);
  const challenge = useCallback(() => {
    if (mode !== 'ball' || !study.state?.awaiting || !study.state.question) return;
    setMailOpen(false); postToHost('sb-float:quiz'); setMode('quiz');
  }, [mode,study.state?.awaiting,study.state?.question]);
  const finish = async (action: 'done' | 'skip' | 'snooze') => {
    setActionError(''); await study.dismiss(action);
    if (action === 'done' && verdict.current !== null) setReaction(verdict.current ? 'celebrate' : 'encourage');
    verdict.current = null; collapse();
  };
  const snooze = () => {void finish('snooze').catch(e=>{
    setActionError(e instanceof Error?e.message:'延后失败，请重试');postToHost(HOST_INVITE+'reset');
  });};
  useEffect(()=>onHostMessage(message=>{
    if (mode !== 'ball' || !mailOpen || !study.state?.awaiting || !study.state.question) return;
    if (message===HOST_CHALLENGE+study.state.question.id) challenge();
    else if (message===HOST_SNOOZE+study.state.question.id) snooze();
  }));
  return <>
    <DailyTaskInvitation visible={mailOpen && taskPending} onClose={closeMail} eligible={mode === 'ball' && !study.state?.awaiting && !study.state?.preparing} onPending={setTaskPending} onOpen={() => { expand(); setTaskRequest(n => n + 1); }} />
    <FloatGuideInvitation visible={mailOpen && guidePending && !taskPending} onClose={closeMail} onPending={setGuidePending} eligible={mode === 'ball' && !study.state?.awaiting && !study.state?.preparing && !taskPending} onOpen={guide => { expand(); setGuideRequest(r => ({ seq: r.seq + 1, guide })); }} />
    {screenOpened && <FloatScreen hidden={mode !== 'screen'} onCollapse={collapse} taskRequest={taskRequest} guideRequest={guideRequest} />}
    {(mode === 'settings' || mode === 'quiz') && <div className="sb-float-screen desktop-float">
    <div className="sb-float-bar" onPointerDown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('button')) postToHost(HOST_DRAG); }}>
      <span className="sb-float-bar-name">{mode === 'quiz' ? 'StudentBuddy · 定时练习' : 'StudentBuddy · 桌面学习'}</span>
      <button type="button" className="sb-float-collapse" aria-label={mode === 'quiz' ? `${snoozeMinutes} 分钟后再练` : '收成吉祥物'} onClick={() => {
        if (mode === 'quiz') void finish('snooze').catch(e => setActionError(e instanceof Error ? e.message : '收起失败，请重试')); else collapse();
      }}>—</button>
    </div>
    {(study.error || actionError) && <p role="alert" className="desktop-error">{study.error || actionError}</p>}
    {mode === 'settings' ? <FloatStudySettings state={study.state} onGuide={() => { expand(); setGuideRequest(r => ({ seq: r.seq + 1 })); }} />
      : study.state?.question && <FloatQuiz key={study.state.question.id} opener={study.state.question} onFinish={finish} onVerdict={correct => { verdict.current = correct; }} />}
    </div>}
    {mode === 'ball' && <><FloatCompanion mood={reaction ?? (hasMail ? 'question' : companionMood(study.state, study.browser, study.error))} onOpen={expand} onSettings={settings} onMail={() => setMailOpen(true)} hasMail={hasMail} />
      {study.state?.awaiting&&study.state.question&&<CompanionInvitation visible={mailOpen} snoozeMinutes={snoozeMinutes} onClose={closeMail} opener={study.state.question} onChallenge={challenge} onSnooze={snooze}/>}
      {mailOpen && !hasMail && <EmptyStudyMail preparing={!!study.state?.preparing} onClose={closeMail} />}</>}
  </>;
}

/** Expanded app uses the existing responsive interface and preserves native dragging. */
function FloatScreen({ hidden, onCollapse, taskRequest, guideRequest }: { hidden: boolean; onCollapse: () => void; taskRequest: number; guideRequest: { seq: number; guide?: FloatGuideNudge } }) {
  useEffect(() => { if (guideRequest.seq) window.dispatchEvent(new CustomEvent(FLOAT_GUIDE_OPEN, { detail: guideRequest.guide })); }, [guideRequest]);
  useEffect(() => { if (taskRequest) window.dispatchEvent(new Event(STUDY_TASK_OPEN)); }, [taskRequest]);
  useEffect(() => { if (!hidden) window.dispatchEvent(new Event(RESTORE_LATEST)); }, [hidden]);
  const onDragDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    postToHost(HOST_DRAG);
  };
  return <div className="sb-float-screen" hidden={hidden}>
    <div className="sb-float-bar" onPointerDown={onDragDown}>
      <span className="sb-float-drag-grip" aria-hidden="true" />
      <button type="button" className="sb-float-collapse" title="收成吉祥物" aria-label="收成吉祥物" onClick={onCollapse}>—</button>
    </div><div className="sb-float-app"><App desktopFloat /></div>
  </div>;
}

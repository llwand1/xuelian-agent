import { useEffect, useMemo, useState } from 'react';
import { localDayKey } from '@sb/shared';
import { DrillOverlay } from '../drill/DrillOverlay';
import { DrillAudio } from '../drill/drill-audio';
import { useDrillSession } from '../drill/useDrillSession';
import { useDrillKeys } from '../drill/useDrillKeys';
import { DRILL_PREFS_EVENT, loadDrillPrefs, saveDrillPrefs } from '../drill/drill-prefs';
import { requestHunt, takeHunt } from '../continent/continent-hunt-store';
import { MiningCompanions } from './MiningCompanions';

/** Replaces the old continent view; Knowledge Worlds is not imported or embedded. */
type Props = {
  sessionId: string | null;
  identity: string;
  onOpenTerms: (term: string) => void;
  onFollowUp: (term: string, question?: string) => Promise<void>;
};
export function MiningPage(props: Props) {
  const [revision, setRevision] = useState(0), [partners, setPartners] = useState(false);
  return <>
    <MiningLearningSession key={`${props.identity}:${revision}`} {...props} />
    <div className="mining-page mining-links"><button type="button" aria-expanded={partners} onClick={() => setPartners(v => !v)}>学习伙伴 · 名册与对话</button></div>
    {partners && <MiningCompanions onHunt={termId => { requestHunt([termId]); setRevision(r => r + 1); }} />}
  </>;
}
function MiningLearningSession({ sessionId, identity, onOpenTerms, onFollowUp }: Props) {
  const [prefs, setPrefs] = useState(loadDrillPrefs);
  const [mode, setMode] = useState<'normal' | 'game'>('game');
  const [priorityIds] = useState(() => takeHunt() ?? []);
  const [followError, setFollowError] = useState('');
  const dayKey = useMemo(() => localDayKey(new Date()), []);
  const audio = useMemo(() => new DrillAudio(undefined, !loadDrillPrefs().sound), []);
  useEffect(() => {
    const sync = () => setPrefs(loadDrillPrefs());
    window.addEventListener(DRILL_PREFS_EVENT, sync);
    audio.start();
    return () => { window.removeEventListener(DRILL_PREFS_EVENT, sync); audio.dispose(); };
  }, [audio]);
  useEffect(() => { audio.setMuted(!prefs.sound); }, [audio, prefs.sound]);
  const s = useDrillSession({ open: true, sessionId, dayKey, audio, priorityIds, manualAdvance: mode === 'game' });
  const enter = () => {
    if (s.phase === 'learn') s.learned();
    else if (s.phase === 'reveal') { if (s.entry?.origin === 'new') s.keep(); else s.next(); }
  };
  useDrillKeys(mode !== 'game', { onDigit: s.answer, onEnter: enter, onDontKnow: s.dontKnow, onSlay: s.slay, onDismiss: s.dismiss, onClose: () => undefined });
  return <section className="mining-page">
    <h1>知识矿境</h1>
    <p>同一套学习理念，换一种表现形式。对话沉淀词条 → 探索挖矿与怪物遭遇 → 选择、判断、拼写 → 复习与追问回到主线。</p>
    {priorityIds.length > 0 && <p>本次优先遭遇刚聊到的话题词条；仍遵守复习范围与番茄钟方向。</p>}
    {followError && <p role="alert">{followError}</p>}
    <DrillOverlay inline mode={mode} onMode={setMode} storageKey={`sb:mining:${identity}:v1`}
      busy={false} replyReady={false} practice readyCountdown={0} muted={!prefs.sound}
      phase={s.phase} card={s.card} entry={s.entry} result={s.result} fx={s.fx} stats={s.stats}
      queueLeft={s.queueLeft} notice={s.notice} newNote={s.newNote} draft={s.draft} onDraft={s.setDraft} keepState={s.keepState}
      onToggleSound={() => { audio.resume(); setPrefs(saveDrillPrefs({ sound: !prefs.sound })); }}
      onClose={() => undefined} onLeaveNow={() => undefined} onStay={() => undefined}
      onAnswer={a => { audio.resume(); s.answer(a); }} onDontKnow={s.dontKnow} onNext={s.next} onLearned={s.learned}
      onSlay={mode === 'game' ? s.pass : s.slay} onKeep={s.keep} onDismiss={s.dismiss} windowPos={null} onWindowMoved={() => undefined}
      onOpenTerm={onOpenTerms} onAsk={sessionId ? term => {
        void onFollowUp(term, `我在知识矿境复习「${term}」，请结合原对话解释容易混淆的地方，并给一个检验理解的小例子。`)
          .catch((e: unknown) => setFollowError(e instanceof Error ? e.message : '追问没有发出，请重试'));
      } : undefined} />
  </section>;
}

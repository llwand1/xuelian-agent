/** Public demo of the actual mining runtime. No user data or review writes. */
import { useMemo, useState } from 'react';
import { buildDrillCard, drillKindAt, gradeDrill } from '@sb/shared';
import { useLandingLang } from '../landing-lang';
import { MiningBattle } from '../../features/mining/MiningBattle';
import { fxKindFor, type DrillFxState } from '../../features/drill/DrillFx';
import { type DrillResult } from '../../features/drill/useDrillSession';
import { Chapter } from './Chapter';
import '../../features/drill/drill.css';
import '../../features/drill/drill-fx.css';

export function ChapterContinent() {
  const { lang } = useLandingLang();
  const [round, setRound] = useState(0), [draft, setDraft] = useState('');
  const [result, setResult] = useState<DrillResult | null>(null), [fx, setFx] = useState<DrillFxState | null>(null);
  const term = useMemo(() => ({ id: 'demo:retrieval', domain: lang === 'zh' ? '学习法' : 'Learning',
    term: lang === 'zh' ? '提取练习' : 'Retrieval practice',
    definition: lang === 'zh' ? '不看答案，主动从记忆中回想学过的内容。' : 'Actively recalling learned material without looking at the answer.' }), [lang]);
  const card = useMemo(() => buildDrillCard(drillKindAt(round, 'landing'), term, [term], 'library', `demo:${round}`), [round, term]);
  const next = () => { setRound(r => r + 1); setResult(null); setFx(null); setDraft(''); };
  const answer = (a: number | string | null) => {
    if (result) return;
    const correct = a !== null && gradeDrill(card, a);
    setResult({ correct, answer: a }); setFx({ kind: correct ? fxKindFor(round + 1) : 'wrong', key: round + 1 });
  };
  return <Chapter id="continent" title={lang === 'zh' ? '知识矿境，' : 'Knowledge Mines: '}
    accent={lang === 'zh' ? '同一理念，横版探索' : 'one learning core, a new world'}
    lead={lang === 'zh' ? '不再铺俯视地砖。像横版挖矿游戏一样移动、跳跃、挖掘与遭遇怪物；选择、判断、拼写和常规刷词共用题面、手感与复习口径。地图宽度隐喻探索广度，地下深度隐喻理解深度，不把挖掘距离冒充掌握程度。' : 'Move, jump, mine and meet monsters in a side-view world. Multiple choice, true/false and typing share the regular drill core. Exploration is a metaphor, not a mastery score.'}>
    <p className="wf-note">{lang === 'zh' ? '一题一步，编排平A与防御轮播；作答时世界继续。' : 'One answer, one action: arrange attacks and defenses while the world keeps moving.'}</p>
    <MiningBattle inline mode="game" storageKey="sb:mining:landing-demo:v1" busy={false} replyReady={false} practice readyCountdown={0} muted
      phase={result ? 'reveal' : 'question'} card={card} entry={{term,origin:'library'}} result={result} fx={fx}
      stats={{correct:0,wrong:0,combo:0,bestCombo:0,slain:0,reviewed:0}} queueLeft={1} notice="" newNote="" keepState={null}
      draft={draft} onDraft={setDraft} onAnswer={answer} onDontKnow={() => answer(null)} onNext={next}
      onSlay={() => setResult({correct:false,answer:null,slain:true})} onLearned={() => undefined} onKeep={() => undefined} onDismiss={next}
      onToggleSound={() => undefined} onClose={() => undefined} onLeaveNow={() => undefined} onStay={() => undefined} windowPos={null} onWindowMoved={() => undefined} />
    <p className="wf-note">{lang === 'zh' ? '示例词条演示 · 不写入你的词库和复习记录；正式矿境使用你的词条。' : 'Sample terms only; no library or review writes. The signed-in mines use your terms.'}</p>
  </Chapter>;
}

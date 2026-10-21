import { useCallback, useEffect, useRef, useState } from 'react';
import { COMBAT_ACTIONS, type CombatState, type CombatSettings as Settings, type MiningRuntime } from '@sb/open-engine/mining';
import type { DrillOverlayProps } from '../drill/DrillOverlay';
import { DrillCardPane } from '../drill/DrillCardPane';
import { useDrillKeys } from '../drill/useDrillKeys';
import { MiningStage } from './MiningStage';
import { CombatSettings } from './CombatSettings';
import { loadCombatPrefs, saveCombatPrefs } from './combat-prefs';
import { readNarrow } from '../../lib/use-narrow';

/** Learning owns grading/records; the live world owns action slots and slow combat clocks. */
export function MiningBattle(p: DrillOverlayProps) {
  const storageKey = p.storageKey ?? 'sb:mining:local:v1';
  const controller = useRef<MiningRuntime | null>(null);
  const [settings, setSettings] = useState(() => loadCombatPrefs(storageKey));
  const [state, setState] = useState<CombatState | null>(null), [running, setRunning] = useState(false);
  const [encounter, setEncounter] = useState(false), [resting, setResting] = useState(false), [note, setNote] = useState('');
  const serial = useRef({ card: p.card, index: 0 });
  if (serial.current.card !== p.card) serial.current = { card: p.card, index: serial.current.index + 1 };
  const key = `${serial.current.index}:${p.card?.termId ?? ''}`;
  const resolved = useRef(''), advanced = useRef('');
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => { setSettings(loadCombatPrefs(storageKey)); setRunning(false); setEncounter(false); setResting(false); }, [storageKey]);
  const open = useCallback(() => { setEncounter(true); setRunning(true); }, []);
  const live = () => controller.current?.state();
  const ready = () => { const s = live(); return !!s && !s.paused && s.cooldown <= .001 && !s.pending; };
  useEffect(() => { setEncounter(false); advanced.current = ''; }, [p.card]);
  useEffect(() => {
    if (!p.result || resolved.current === key || !controller.current) return;
    controller.current.resolve(p.result.slain ? 'slay' : p.result.correct ? 'slash' : 'wrong', key);
    resolved.current = key; setState(controller.current.state());
  }, [p.result, key]);
  useEffect(() => {
    const s = controller.current?.state();
    if (!running || resting || !s || s.hp <= 0 || s.cooldown > .001 || s.pending) return;
    if (p.phase === 'reveal') {
      if (p.entry?.origin === 'new' && !p.result?.slain && p.keepState !== 'saved' || advanced.current === key) return;
      advanced.current = key; p.onNext();
    } else if (p.card && (p.phase === 'question' || p.phase === 'learn') && s.monster) controller.current?.encounter();
  }, [running, resting, state, p, key]);
  const show = encounter || p.phase === 'reveal' || p.phase === 'loading' || p.phase === 'empty';
  useEffect(() => {
    const target = show ? pane.current?.querySelector<HTMLElement>('.mining-encounter') : null;
    if (!target) return;
    if (!target.contains(document.activeElement)) target.focus({ preventScroll: true });
    if (readNarrow()) target.scrollIntoView?.({block:'nearest',behavior:'auto'});
  }, [show, key]);
  const canAnswer = () => !!live()?.pending && !live()?.paused && encounter;
  const answer = (a: number | string) => { if (canAnswer()) p.onAnswer(a); };
  const next = () => { if (ready()) { advanced.current = key; p.onNext(); } };
  const pass = () => { if (canAnswer()) p.onSlay(); };
  const unknown = () => { if (canAnswer()) p.onDontKnow(); };
  const learned = () => { if (canAnswer()) p.onLearned(); };
  const start = () => {
    if (resting || !p.card || live()?.hp === 0) return;
    setRunning(true);
    if (p.phase === 'reveal') return; // Advance the resolved card first; never attach a second action to it.
    if (live()?.pending) setEncounter(true); else controller.current?.encounter();
  };
  const enter = () => {
    if (live()?.paused) return;
    if (p.phase === 'learn') learned();
    else if (p.phase === 'reveal') { if (p.entry?.origin === 'new' && !p.result?.slain && p.keepState !== 'saved') p.onKeep(); else next(); }
  };
  useDrillKeys(true, { onDigit: answer, onEnter: enter, onDontKnow: unknown, onSlay: pass,
    onDismiss: () => { if (ready()) p.onDismiss(); }, onClose: () => { if (!p.inline) p.onClose(); else { setRunning(false); setEncounter(false); } } });
  const save = (value: Settings) => {
    setSettings(value);
    try { saveCombatPrefs(storageKey, value); setNote('节奏与轮播已保存。'); }
    catch { setNote('本次设置已生效，但本机保存失败，重新进入后需再次设置。'); }
  };
  const current = state?.pending ?? state?.action ?? settings.sequence[0]!;
  return <div className={`mining-battle${show ? ' has-question' : ''}`} ref={pane}>
    <div className="mining-battle-top">
      <div className="mining-vitals" aria-label="战斗状态">
        <label>生命 {state?.hp ?? 100}/100<progress max={100} value={state?.hp ?? 100} /></label>
        <span>护盾 {state?.guard ?? 0}/2</span>
        <span>{state?.monster ? `怪物 ${state.monster.hp}/${state.monster.maxHp} · ${state.monster.windup ? '正在蓄力' : `${Math.ceil(state.monster.attackIn)}秒后攻击`}` : `下一只怪物：${Math.ceil(state?.spawnIn ?? settings.spawnSeconds)}秒`}</span>
      </div>
      <div className="mining-deck" aria-label="动作轮播">{settings.sequence.map((a, i) => <span key={i} aria-current={i === (state?.index ?? 0) ? 'step' : undefined}>{COMBAT_ACTIONS[a].code} · {COMBAT_ACTIONS[a].label}</span>)}</div>
      <p className="mining-round-status">{state?.hp === 0 ? '回营恢复中' : state?.cooldown ? `轮间休息 ${Math.ceil(state.cooldown)} 秒` : state?.pending ? `本题动作：${COMBAT_ACTIONS[current].label} · 答对${COMBAT_ACTIONS[current].success} / 答错${COMBAT_ACTIONS[current].failure}` : running ? '等待怪物与下一轮 · 没有答题倒计时' : '自由探索 · 点击开始轮播，每题结算一步'}</p>
      <div className="mining-battle-buttons">
        <button type="button" disabled={!p.card || resting || state?.hp === 0} onClick={() => {
          if (running) { setRunning(false); return; }
          start();
        }}>{running ? '暂停轮播 · 留住解析' : '开始动作轮播 E'}</button>
        <button type="button" aria-pressed={resting} onClick={() => setResting(v => !v)}>{resting ? '继续世界' : '休整 · 暂停世界'}</button>
        {state?.hp === 0 && <button type="button" onClick={() => controller.current?.recover()}>恢复出发</button>}
        {encounter && p.phase !== 'reveal' && <button type="button" onClick={() => { setRunning(false); setEncounter(false); }}>收起题卡 · 保留本轮</button>}
      </div>
      <CombatSettings value={settings} onSave={save} />
      {note && <p role="status">{note}</p>}
      <p className="mining-combat-event" role="status">{state?.log[0]?.text ?? '安静探索，怪物会按间隔出现。'}</p>
      <details className="mining-battle-log"><summary>最近战斗反馈</summary><ol>{state?.log.map(e => <li key={e.id}>{e.text}</li>)}</ol></details>
    </div>
    <MiningStage card={p.card} cardKey={key} answered={p.phase === 'reveal'} onStart={start} paused={resting} onEncounter={open} storageKey={storageKey} settings={settings} onState={setState} controller={controller} status={state} />
    {show && <fieldset className="mining-question-gate" disabled={resting}>
      <DrillCardPane {...p} gameActions advanceDisabled={!ready()} onAnswer={answer} onDontKnow={unknown} onSlay={pass} onLearned={learned} onNext={next}
        onKeep={() => p.onKeep()} onDismiss={() => { if (ready()) p.onDismiss(); }} />
    </fieldset>}
  </div>;
}

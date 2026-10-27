import { useCallback, useEffect, useRef, useState } from 'react';
import { COMBAT_ACTIONS, type CombatState, type CombatSettings as Settings, type MiningRuntime } from '@sb/open-engine/mining';
import type { DrillOverlayProps } from '../drill/DrillOverlay';
import { DrillCardPane } from '../drill/DrillCardPane';
import { useDrillKeys } from '../drill/useDrillKeys';
import { MiningStage } from './MiningStage';
import { MiningCast, MiningGlyph, MiningVitals } from './MiningHud';
import { CombatSettings } from './CombatSettings';
import { loadCombatPrefs, saveCombatPrefs } from './combat-prefs';

/** A fixed cast button owns opening; grading and world clocks stay in their existing domains. */
export function MiningBattle(p: DrillOverlayProps) {
  const storageKey = p.storageKey ?? 'sb:mining:local:v1';
  const controller = useRef<MiningRuntime | null>(null);
  const [settings, setSettings] = useState(() => loadCombatPrefs(storageKey));
  const [state, setState] = useState<CombatState | null>(null), [running, setRunning] = useState(false);
  const [encounter, setEncounter] = useState(false), [resting, setResting] = useState(false), [note, setNote] = useState('');
  const [menu, setMenu] = useState(false);
  const serial = useRef({ card: p.card, index: 0 });
  if (serial.current.card !== p.card) serial.current = { card: p.card, index: serial.current.index + 1 };
  const key = `${serial.current.index}:${p.card?.termId ?? ''}`;
  const resolved = useRef(''), advanced = useRef(''), castQueued = useRef(false);
  const resolvedAction = useRef(settings.sequence[0]!);
  const pane = useRef<HTMLDivElement>(null), cast = useRef<HTMLDivElement>(null), menuPanel = useRef<HTMLDivElement>(null);
  const paused = resting || menu;
  const live = () => controller.current?.state();
  const ready = () => { const s = live(); return !!s && !s.paused && s.hp > 0 && s.cooldown <= .001 && !s.pending; };
  const close = () => { castQueued.current = false; setRunning(false); setEncounter(false); cast.current?.querySelector('button')?.focus({ preventScroll: true }); };
  const open = useCallback(() => setEncounter(true), []);
  useEffect(() => { setSettings(loadCombatPrefs(storageKey)); setRunning(false); setEncounter(false); setResting(false); }, [storageKey]);
  useEffect(() => { setEncounter(false); advanced.current = ''; }, [p.card]);
  useEffect(() => {
    if (!p.result || resolved.current === key || !controller.current) return;
    resolvedAction.current = controller.current.state().pending ?? controller.current.state().action;
    controller.current.resolve(p.result.slain ? 'slay' : p.result.correct ? 'slash' : 'wrong', key);
    resolved.current = key; setState(controller.current.state());
  }, [p.result, key]);
  useEffect(() => {
    if (paused || !ready()) return;
    if (p.phase === 'reveal') {
      if (!running && !castQueued.current || p.entry?.origin === 'new' && !p.result?.slain && p.keepState !== 'saved' || advanced.current === key) return;
      advanced.current = key; p.onNext();
    } else if ((running || castQueued.current) && p.card && (p.phase === 'question' || p.phase === 'learn') && live()?.monster) {
      castQueued.current = false; controller.current?.encounter();
    }
  }, [running, paused, state, p, key]);
  useEffect(() => { if (encounter) pane.current?.focus({ preventScroll: true }); }, [encounter, key]);
  useEffect(() => { if (menu) menuPanel.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }, [menu]);
  useEffect(() => { if (!note) return; const timer = setTimeout(() => setNote(''), 3500); return () => clearTimeout(timer); }, [note]);
  const canAnswer = () => !!live()?.pending && !live()?.paused && encounter;
  const answer = (a: number | string) => { if (canAnswer()) p.onAnswer(a); };
  const next = () => { if (ready()) { advanced.current = key; p.onNext(); } };
  const pass = () => { if (canAnswer()) p.onSlay(); };
  const unknown = () => { if (canAnswer()) p.onDontKnow(); };
  const learned = () => { if (canAnswer()) p.onLearned(); };
  const start = () => {
    const s = live(); if (paused || !s || s.hp <= 0) return;
    if (!p.card || s.pending) { setEncounter(true); return; }
    if (s.cooldown > .001) { if (p.phase === 'reveal') setEncounter(true); return; }
    if (p.phase === 'reveal') {
      if (p.entry?.origin === 'new' && !p.result?.slain && p.keepState !== 'saved') { setEncounter(true); return; }
      castQueued.current = true; next(); return;
    }
    if (!controller.current?.encounter()) setNote(s.monster ? '本轮尚未就绪' : `怪物将在 ${Math.ceil(s.spawnIn)} 秒后出现，先探索吧。`);
  };
  const enter = () => {
    if (!encounter || paused) return;
    if (p.phase === 'learn') learned();
    else if (p.phase === 'reveal') { if (p.entry?.origin === 'new' && !p.result?.slain && p.keepState !== 'saved') p.onKeep(); else next(); }
  };
  useDrillKeys(!menu, { onDigit: answer, onEnter: enter, onDontKnow: unknown, onSlay: pass,
    onDismiss: () => { if (encounter && ready()) p.onDismiss(); }, onClose: () => { if (!p.inline) p.onClose(); else close(); } });
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && menu) { e.preventDefault(); setMenu(false); return; }
      if (e.key.toLowerCase() !== 'e' || menu || (e.target as Element | null)?.closest?.('input,textarea,select,[contenteditable="true"],canvas')) return;
      e.preventDefault(); start();
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  const save = (value: Settings) => {
    setSettings(value);
    try { saveCombatPrefs(storageKey, value); setNote('节奏与轮播已保存。'); }
    catch { setNote('本次设置已生效，但本机保存失败，重新进入后需再次设置。'); }
  };
  const current = state?.pending ?? state?.action ?? settings.sequence[0]!;
  const event = state?.log[0];
  return <div className={`mining-battle${encounter ? ' has-question' : ''}`}>
    <div className="mining-world-shell">
      <MiningStage card={p.card} cardKey={key} answered={p.phase === 'reveal'} onStart={start} paused={paused} onEncounter={open} storageKey={storageKey} settings={settings} onState={setState} controller={controller} />
      <div className="mining-hotbar" aria-label="矿境工具">
        <span title="按住画面挖掘" className="mining-tool"><MiningGlyph kind="pick" /><small>挖掘</small></span>
        <button type="button" title="归途 R" aria-label="归途 R" onClick={() => controller.current?.recall()}><MiningGlyph kind="camp" /></button>
        <button type="button" title="节奏、操作与战斗反馈" aria-label="矿境设置" aria-expanded={menu} onClick={() => setMenu(v => !v)}><MiningGlyph kind="settings" /></button>
      </div>
      <MiningVitals state={state} />
      <p className="mining-round-status" role="status">{state?.hp === 0 ? '已回营 · 学习进度保留' : paused ? '休整中' : state?.monster?.windup ? '！怪物蓄力' : note || (state?.monster ? '' : `下只怪物 ${Math.ceil(state?.spawnIn ?? settings.spawnSeconds)}s`)}</p>
      {event && event.kind !== 'quiet' && <p key={event.id} className="mining-combat-event" role="status">{event.text}</p>}
      <div className="mining-action-dock">
        <button type="button" className="mining-mini-action" aria-pressed={running} onClick={() => { castQueued.current = false; setRunning(v => !v); }}>连放 {running ? '开' : '关'}</button>
        <button type="button" className="mining-mini-action" aria-pressed={resting} onClick={() => setResting(v => !v)}>{resting ? '继续世界' : '休整'}</button>
        {state?.hp === 0 ? <button type="button" className="mining-recover" onClick={() => controller.current?.recover()}>恢复出发</button>
          : <div ref={cast}><MiningCast state={state} action={current} disabled={paused || (state?.cooldown ?? 0) > .001 && p.phase !== 'reveal'} onCast={start} /></div>}
      </div>
      {menu && <div className="mining-menu" role="dialog" aria-modal="true" aria-label="矿境设置" ref={menuPanel} onKeyDown={e => {
        if (e.key !== 'Tab') return;
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary,input'));
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
        <button type="button" className="mining-menu-close" onClick={() => setMenu(false)}>返回矿境 ×</button>
        <CombatSettings value={settings} onSave={save} />
        <p>本局答对 {p.stats.correct} · 连击 {p.stats.combo} · 最佳 {p.stats.bestCombo} · 复习打卡 {p.stats.reviewed}</p>
        {note && <p role="status">{note}</p>}
        <details><summary>操作与战斗反馈</summary><p>A/D 或方向键移动，空格跳跃；按住矿块挖掘，右键放火把，R 归途。E 或右下施法键准备当前动作；答对才结算。连放沿用动作编排，关闭题卡会停止连放。继续探索保留本轮，跳过不计作答和伤害。</p><ol>{state?.log.map(e => <li key={e.id}>{e.text}</li>)}</ol></details>
      </div>}
    </div>
    {encounter && <div className="mining-question-dock" ref={pane} tabIndex={-1}>
      <header><small>{COMBAT_ACTIONS[p.phase === 'reveal' ? resolvedAction.current : current].label} · {p.phase === 'reveal' ? '本轮结算' : '答题施法'}</small><button type="button" onClick={close}>继续探索 <kbd>Esc</kbd></button></header>
      <fieldset className="mining-question-gate" disabled={paused}>
        <DrillCardPane {...p} gameActions advanceDisabled={!ready()} onAnswer={answer} onDontKnow={unknown} onSlay={pass} onLearned={learned} onNext={next}
          onKeep={() => p.onKeep()} onDismiss={() => { if (ready()) p.onDismiss(); }} />
      </fieldset>
    </div>}
  </div>;
}

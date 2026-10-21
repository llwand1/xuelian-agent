import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { MiningRuntime, type MiningInput, type CombatSettings, type CombatState } from '@sb/open-engine/mining';
import type { DrillCard } from '@sb/shared';
import './mining.css';

/** Native canvas adapter: the world requests a reveal, never supplies an answer. */
export function MiningStage({ card, cardKey, paused, onEncounter, storageKey, settings, onState, controller, status, answered, onStart }: {
  card: DrillCard | null;
  cardKey: string;
  settings: CombatSettings;
  onState: (state: CombatState) => void;
  controller: MutableRefObject<MiningRuntime | null>;
  status?: CombatState | null;
  answered: boolean;
  onStart: () => void;
  paused: boolean;
  onEncounter: () => void;
  storageKey: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<MiningRuntime | null>(null);
  const reveal = useRef(onEncounter); reveal.current = onEncounter;
  const request = useRef(onStart); request.current = onStart;
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!canvas.current) return;
    try {
      engine.current = new MiningRuntime(canvas.current, { onEncounter: () => reveal.current(), onRequestRound: () => request.current(), onNotice: setNotice, onState, settings, storageKey });
      controller.current = engine.current; onState(engine.current.state());
    } catch (e) { setNotice(`像素画面暂不可用，可切换「常规模式」继续答题：${e instanceof Error ? e.message : '画布初始化失败'}`); }
    return () => { engine.current?.dispose(); engine.current = null; controller.current = null; };
  // Constructor owns one runtime; settings and callbacks are synchronized below.
  }, [storageKey]);
  useEffect(() => { engine.current?.setCard(card ? cardKey : null, card?.origin, answered); }, [cardKey, card, answered, storageKey]);
  useEffect(() => { engine.current?.setPaused(paused); }, [paused, storageKey]);
  useEffect(() => { engine.current?.configure(settings); }, [settings]);
  const input = (key: MiningInput, down: boolean) => engine.current?.setInput(key, down);
  return <section className="mining-stage" aria-label="横版知识矿境">
    {status && <div className="mining-live-strip">生命 {status.hp}/100 · 护盾 {status.guard} · {status.monster ? `怪物 ${status.monster.hp}/${status.monster.maxHp} · ${status.monster.windup ? '蓄力中' : `${Math.ceil(status.monster.attackIn)}秒后攻击`}` : `下只怪物 ${Math.ceil(status.spawnIn)}秒`}</div>}
    <canvas ref={canvas} className="mining-canvas" tabIndex={0}
      aria-label="矿境：方向键移动，空格跳跃，点击挖矿，R 回城，E 开始动作轮播" />
    <div className="mining-hud" aria-hidden="true"><b>STUDENTBUDDY · 知识矿境</b><span>探索广度 · 挖掘深度</span></div>
    <div className="mining-controls">
      {([['left', '←'], ['right', '→'], ['jump', '跳跃'], ['mine', '挖掘']] as const).map(([key, label]) =>
        <button key={key} type="button" aria-label={label} disabled={paused}
          onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); input(key, true); }}
          onPointerUp={() => input(key, false)} onPointerCancel={() => input(key, false)} onLostPointerCapture={() => input(key, false)}>{label}</button>)}
      <button type="button" onClick={() => engine.current?.recall()} disabled={paused}>归途 R</button>

    </div>
    <p className="mining-hint">点击画面后可用 A/D、空格移动；按住矿块挖掘，右键放火把。答题时世界继续，碰怪或挖矿不会自动出手；只有平A答对才伤害怪物。可主动休整暂停世界。</p>
    {notice && <p className="mining-save-notice" role="status">{notice}</p>}
  </section>;
}

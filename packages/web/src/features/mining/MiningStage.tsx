import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { MiningRuntime, type CombatSettings, type CombatState } from '@sb/open-engine/mining';
import type { DrillCard } from '@sb/shared';
import './mining.css';

/** Native canvas adapter: the world requests a reveal, never supplies an answer. */
export function MiningStage({ card, cardKey, paused, onEncounter, storageKey, settings, onState, controller, answered, onStart }: {
  card: DrillCard | null;
  cardKey: string;
  settings: CombatSettings;
  onState: (state: CombatState) => void;
  controller: MutableRefObject<MiningRuntime | null>;
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
  return <section className="mining-stage" aria-label="横版知识矿境">
    <canvas ref={canvas} className="mining-canvas" tabIndex={0}
      aria-label="矿境：方向键移动，空格跳跃，点击挖矿，R 归途，E 施法" />
    <div className="mining-touch-controls" aria-label="触屏移动">
      {([['left', '向左'], ['right', '向右'], ['jump', '跳跃']] as const).map(([key, label]) => <button type="button" key={key} aria-label={label} disabled={paused}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); engine.current?.setInput(key, true); }}
        onPointerUp={() => engine.current?.setInput(key, false)} onPointerCancel={() => engine.current?.setInput(key, false)} onLostPointerCapture={() => engine.current?.setInput(key, false)}>{key === 'left' ? '‹' : key === 'right' ? '›' : '↑'}</button>)}
    </div>
    {notice && <p className="mining-save-notice" role="status">{notice}</p>}
  </section>;
}

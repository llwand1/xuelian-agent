import { DrillQuestion } from './DrillQuestion';
import { DrillFx } from './DrillFx';
import type { DrillOverlayProps } from './DrillOverlay';
export function DrillCardPane(p: DrillOverlayProps & { gameActions?: boolean; advanceDisabled?: boolean }) {
  return <div className={p.gameActions ? 'mining-encounter' : 'drill-question-wrap'} tabIndex={-1}>
    <DrillQuestion {...p} />
    <DrillFx fx={p.gameActions ? null : p.fx} />
    {p.phase === 'reveal' && p.card && (p.onOpenTerm || p.onAsk) && <div className="mining-links">
      {p.onOpenTerm && p.entry?.origin !== 'new' && <button type="button" onClick={() => p.onOpenTerm?.(p.card!.term)}>在词条库查看</button>}
      {p.onAsk && <button type="button" onClick={() => p.onAsk?.(p.card!.term)}>带着词条向 AI 追问</button>}
    </div>}
  </div>;
}

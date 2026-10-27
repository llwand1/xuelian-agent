import { useId } from 'react';
import { COMBAT_ACTIONS, type CombatAction, type CombatState } from '@sb/open-engine/mining';
export function MiningGlyph({ kind }: { kind: 'heart' | 'shield' | 'attack' | 'pick' | 'camp' | 'settings' }) {
  const paths = {
    heart: 'M1 2h2V1h3v1h2V1h3v1h1v4h-1v1h-1v1H9v1H8v1H6V9H5V8H4V7H3V6H2V5H1Z',
    shield: 'M2 1h10v6h-1v2h-2v2H5V9H3V7H2Z',
    attack: 'M10 0h3v3h-1v1h-1v1h-1v1H9v1H8v1H7v1h1v1h1v2H7v-1H6v-1H5v1H4v1H2v-2h1V9h1V8H3V6h2v1h1V6h1V5h1V4h1V3h1Z',
    pick: 'M3 1h7v1h2v2h1v2h-2V4H9v1H8v1H7v1H6v1H5v1H4v2H2V9h1V8h1V7h1V6h1V5h1V3H3v1H1V2h2Z',
    camp: 'M6 1h2v1h1v1h1v2h1v2h1v3H8V6H6v4H2V7h1V5h1V3h1V2h1Z',
    settings: 'M5 0h4v2h2v1h2v4h-2v2H9v2H5V9H3V7H1V3h2V2h2Zm1 3v4h2V3Z',
  };
  return <svg viewBox="0 0 14 12" aria-hidden="true" className={`mining-glyph is-${kind}`} shapeRendering="crispEdges"><path d={paths[kind]} fill="currentColor" /></svg>;
}
function Heart({ fraction }: { fraction: number }) {
  const id = useId();
  return <svg viewBox="0 0 14 12" aria-hidden="true" className="mining-heart" shapeRendering="crispEdges">
    <defs><clipPath id={id}><rect width={Math.ceil(14 * fraction)} height="12" /></clipPath></defs>
    <path d="M1 2h2V1h3v1h2V1h3v1h2v4h-1v1h-1v1H9v1H8v1H6V9H5V8H3V7H2V6H1Z" fill="#402935" stroke="#241b30" strokeWidth="1" />
    <g clipPath={`url(#${id})`}><path d="M2 3h2V2h2v1h2V2h3v1h1v3h-1v1H9v1H8v1H6V8H5V7H4V6H3V5H2Z" fill="#e65d72" /><path d="M3 3h2v1H3Zm5 0h2v1H8Z" fill="#ffb4ab" /></g>
  </svg>;
}
export function MiningVitals({ state }: { state: CombatState | null }) {
  const hp = state?.hp ?? 100;
  return <div className={`mining-vitals${hp <= 24 ? ' is-critical' : ''}`} aria-label="战斗状态">
    <div role="meter" aria-label="生命" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={100}>
      <small>生命 {hp}/100</small><div className="mining-hearts">{Array.from({ length: 10 }, (_, i) => <Heart key={i} fraction={Math.max(0, Math.min(1, (hp - i * 10) / 10))} />)}</div>
    </div>
    <div className="mining-guards" aria-label={`护盾 ${state?.guard ?? 0}/2`}>{[0, 1].map(i => <span key={i} className={i < (state?.guard ?? 0) ? 'is-filled' : ''}><MiningGlyph kind="shield" /></span>)}</div>
  </div>;
}
export function MiningCast({ state, action, disabled, onCast }: { state: CombatState | null; action: CombatAction; disabled: boolean; onCast: () => void }) {
  const cooldown = state?.cooldown ?? 0;
  return <button type="button" className={`mining-cast${state?.pending ? ' is-pending' : ''}`} onClick={onCast} disabled={disabled}
    aria-label="施法 E" title={`E · ${COMBAT_ACTIONS[action].label}：答对${COMBAT_ACTIONS[action].success}，答错${COMBAT_ACTIONS[action].failure}`}>
    <MiningGlyph kind={action === 'attack' ? 'attack' : 'shield'} /><kbd>E</kbd>
    <span>{cooldown > .001 ? `${Math.ceil(cooldown)}s` : state?.pending ? '回到本轮' : `施法 · ${COMBAT_ACTIONS[action].label}`}</span>
  </button>;
}

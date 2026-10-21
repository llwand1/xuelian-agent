import { useEffect, useState } from 'react';
import { useContinentPartners } from '../continent/continent-partners';
import { NpcDialog } from '../continent/NpcDialog';
import '../continent/continent.css';

/** Keep the real companion service, history and tokens, without restoring the old map. */
export function MiningCompanions({ onHunt }: { onHunt: (termId: string) => void }) {
  const [notice, setNotice] = useState(''), [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [spot, setSpot] = useState('');
  const p = useContinentPartners(setNotice);
  const refresh = p.refresh;
  useEffect(() => { void refresh().catch((e: unknown) => setNotice(e instanceof Error ? e.message : '伙伴名册没有取到')); }, [refresh]);
  const npc = p.partners?.npcs.find(n => n.id === openId);
  const spots = p.partners?.spots ?? [];
  return <section className="mining-companions" aria-label="矿境学习伙伴">
    <p>沿用正式学习伙伴、对话历史与卡牌信物；在这里选择守护词条，不再回到俯视地图选格。</p>
    <div className="mining-links">{p.partners?.npcs.map(n => <button type="button" key={n.id} onClick={() => setOpenId(n.id)}>{n.name} · {n.term}{n.distressed ? ' · 请求复习' : ''}</button>)}</div>
    {p.partners && <div className="mining-links">
      <label>守护词条 <select aria-label="伙伴守护词条" value={spot} onChange={e => setSpot(e.target.value)}>
        <option value="">请选择已熟悉的词条</option>
        {spots.map(s => <option key={`${s.row}:${s.col}`} value={`${s.row}:${s.col}`}>{p.partners?.cells.find(c => c.row === s.row && c.col === s.col)?.term ?? '可绑定词条'}</option>)}
      </select></label>
      <button type="button" disabled={busy || !spot || !p.partners.quota.canCreate} onClick={() => {
        const selected = spots.find(s => `${s.row}:${s.col}` === spot); if (!selected) return;
        setBusy(true);
        void p.create(selected.row, selected.col).then(made => {
          setNotice(`${made.name} 已加入${made.source === 'fallback' ? '（本地起名；未伪装成模型生成）' : ''}`); setSpot('');
        }).catch((e: unknown) => setNotice(e instanceof Error ? e.message : '创建失败')).finally(() => setBusy(false));
      }}>{busy ? '正在创建…' : '创建学习伙伴'}</button>
      {!p.partners.quota.canCreate && <span>{p.partners.quota.blockedBy}</span>}
    </div>}
    {notice && <p role="status">{notice}</p>}
    {npc && <NpcDialog npc={npc} tokens={p.tokens} tradesLeft={p.partners?.tradesLeft ?? 0}
      onRename={async name => { await p.rename(npc.id, name); }}
      onRemove={async () => { await p.remove(npc.id); setOpenId(null); }} onClose={() => setOpenId(null)}
      onRescue={termId => { setOpenId(null); onHunt(termId); }}
      onLibraryChanged={() => { void refresh().catch((e: unknown) => setNotice(e instanceof Error ? e.message : '刷新失败')); }} />}
  </section>;
}

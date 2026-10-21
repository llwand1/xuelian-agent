import { useEffect, useState } from 'react';
import { COMBAT_ACTIONS, parseCombatSettings, type CombatAction, type CombatSettings as Settings } from '@sb/open-engine/mining';
export function CombatSettings({ value, onSave }: { value: Settings; onSave: (settings: Settings) => void }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  useEffect(() => { setDraft(value); setError(''); }, [value]);
  const code = draft.sequence.map(a => COMBAT_ACTIONS[a].code).join('');
  const move = (i: number, dir: number) => {
    const sequence = [...draft.sequence], at = i + dir;
    if (at < 0 || at >= sequence.length) return;
    [sequence[i], sequence[at]] = [sequence[at]!, sequence[i]!]; setDraft({ ...draft, sequence });
  };
  return <details className="mining-combat-settings"><summary>节奏与动作编排 · {value.sequence.map(a => COMBAT_ACTIONS[a].code).join('')}</summary>
    <p>一题结算一个动作；没有作答倒计时。刷怪 5–120 秒、轮间隔 2–30 秒、怪物攻击 8–60 秒；轮间隔从结算后开始，改慢就是更轻松的难度。</p>
    {([
      ['spawnSeconds', '刷怪间隔（秒）', 5, 120], ['roundSeconds', '动作轮间隔（秒）', 2, 30], ['attackSeconds', '怪物攻击间隔（秒）', 8, 60],
    ] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} step={1} value={Number.isNaN(draft[key]) ? '' : draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>)}
    <label>动作序列（A=平A，B=防御）<input aria-label="动作序列" maxLength={16} value={code} onChange={e => {
      const text = e.target.value.toUpperCase();
      if (/^[AB]*$/.test(text)) setDraft({ ...draft, sequence: [...text].map(c => c === 'A' ? 'attack' : 'defend') });
    }} /></label>
    <ol className="mining-deck-editor" aria-label="轮播编排">{draft.sequence.map((a, i) => <li key={i}>
      <b>{i + 1} · {COMBAT_ACTIONS[a].label}</b>
      <button type="button" aria-label={`第${i + 1}步前移`} disabled={!i} onClick={() => move(i, -1)}>←</button>
      <button type="button" aria-label={`第${i + 1}步后移`} disabled={i === draft.sequence.length - 1} onClick={() => move(i, 1)}>→</button>
      <button type="button" aria-label={`删除第${i + 1}步`} onClick={() => setDraft({ ...draft, sequence: draft.sequence.filter((_, n) => n !== i) })}>×</button>
    </li>)}</ol>
    <div className="mining-setting-buttons">{(Object.keys(COMBAT_ACTIONS) as CombatAction[]).map(a => <button type="button" key={a} disabled={draft.sequence.length >= 16} onClick={() => setDraft({ ...draft, sequence: [...draft.sequence, a] })}>加入 {COMBAT_ACTIONS[a].code} · {COMBAT_ACTIONS[a].label}</button>)}</div>
    <p>{Object.values(COMBAT_ACTIONS).map(a => `${a.label}：答对${a.success}，答错${a.failure}`).join('；')}。斩只跳过本轮，不消灭怪物、不记掌握。</p>
    <button type="button" onClick={() => {
      const parsed = parseCombatSettings(draft);
      if (!parsed) { setError('请填写范围内的整数秒，并编排 1–16 个动作。'); return; }
      setError(''); onSave(parsed);
    }}>保存节奏与轮播</button>{error && <p role="alert">{error}</p>}
    <small>修改后从下一轮选取新序列，已在作答的动作保持不变；不会立刻补刷怪物或提前出手。</small>
  </details>;
}

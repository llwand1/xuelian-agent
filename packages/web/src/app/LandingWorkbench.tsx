import { useRef, useState } from 'react';
import { CURRENT as C, DEMO_MODES, PRACTICE_CHOICES } from './landing-current-copy';
import { useLandingLang } from './landing-lang';

/** Illustrative, interactive UI. No model calls, user records, timers or claimed live output. */
export function LandingWorkbench() {
  const { lang } = useLandingLang();
  const [mode, setMode] = useState<typeof DEMO_MODES[number]['id']>('read');
  const [quote, setQuote] = useState(false), [volume, setVolume] = useState(60);
  const [choice, setChoice] = useState<number | null>(null), [checked, setChecked] = useState(false);
  const [thought, setThought] = useState(''), [revealed, setRevealed] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const label = DEMO_MODES.find(value => value.id === mode)!.label[lang];
  return <div className="landing-workbench-demo" aria-label={C.demoBadge[lang]}>
    <div className="lw-windowbar"><span className="lw-window-dots" aria-hidden="true">▪ ▪ ▪</span><span>studentbuddy / {lang === 'zh' ? '学习工作台' : 'study workspace'}</span><span className="lw-window-status">{lang === 'zh' ? '示例' : 'DEMO'}</span></div>
    <div className="lw-tabs" role="tablist" aria-label={C.navLearn[lang]}>{DEMO_MODES.map((item, index) => <button type="button" role="tab"
      key={item.id} id={'lw-tab-' + item.id} aria-selected={mode === item.id} aria-controls="lw-panel" tabIndex={mode === item.id ? 0 : -1}
      ref={node => { tabs.current[index] = node; }} onClick={() => setMode(item.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % DEMO_MODES.length : event.key === 'ArrowLeft' ? (index + DEMO_MODES.length - 1) % DEMO_MODES.length : event.key === 'Home' ? 0 : event.key === 'End' ? DEMO_MODES.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); setMode(DEMO_MODES[next]!.id); tabs.current[next]?.focus(); }
      }}>{item.label[lang]}</button>)}</div>
    <div className="lw-panel" id="lw-panel" role="tabpanel" aria-labelledby={'lw-tab-' + mode} tabIndex={0}>
      <p className="lw-topic">{C.demoTopic[lang]}</p>
      {mode === 'read' && <div className="lw-reading">
        <div className="lw-source"><span className="lw-kicker">{C.demoSource[lang]} / 01</span><p>{C.demoSourceBody[lang]}</p><mark>{C.demoSentence[lang]}</mark><i aria-hidden="true" /><i aria-hidden="true" /></div>
        <div className="lw-conversation"><div className="lw-user">{C.demoQuestion[lang]}</div><div className="lw-assistant"><span className="lw-kicker">STUDENTBUDDY</span><p>{C.demoAnswer[lang]}</p>
          <button type="button" className="lw-quote-trigger" onClick={() => setQuote(true)}>{C.quoteButton[lang]}</button></div></div>
        {quote && <aside className="lw-quote" aria-label={C.quoteLabel[lang]}><div><span>{C.quoteLabel[lang]}</span><button type="button" onClick={() => setQuote(false)} aria-label={C.close[lang]}>×</button></div>
          <blockquote>{C.demoSentence[lang]}</blockquote><strong>{C.quoteAsk[lang]}</strong><p>{C.quoteReply[lang]}</p></aside>}
      </div>}
      {mode === 'diagram' && <div className="lw-diagram"><p>{C.diagramHint[lang]}</p>
        <svg viewBox="0 0 420 180" role="img" aria-label={`${C.volume[lang]} ${volume}%, ${C.force[lang]} ${volume / 100}`}>
          <defs><pattern id="lw-water" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 6h6m6 0h6" stroke="#8cc5d8" strokeWidth="1" opacity=".45" /></pattern></defs>
          <path d="M70 18v145h275V18" fill="#181c25" stroke="#d5e2da" strokeWidth="3" />
          <path d="M72 93h271v68H72z" fill="#214550" /><path d="M72 93h271v68H72z" fill="url(#lw-water)" />
          <rect x="158" y={29 + volume * .64} width="88" height="64" fill="#bb8f57" stroke="#f5cf89" strokeWidth="2" />
          <path d={`M202 ${140 - volume * .4}v-${15 + volume * .3}m-7 8 7-8 7 8`} stroke="#a7d794" strokeWidth="3" fill="none" />
          <text x="280" y="55" fill="#a7d794" fontSize="14">Fᵦ = {(volume / 100).toFixed(2)}</text><text x="280" y="77" fill="#c5c5b5" fontSize="12">V = {volume}%</text>
        </svg>
        <label className="lw-slider">{C.volume[lang]} <output>{volume}%</output><input type="range" min={10} max={90} step={10} value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>
        <small>{C.diagramNote[lang]}</small></div>}
      {mode === 'practice' && <div className="lw-practice"><span className="lw-kicker">01 / 01 · {label}</span><h3>{C.practiceAsk[lang]}</h3>
        <div className="lw-options">{PRACTICE_CHOICES.map((value, index) => <button type="button" aria-pressed={choice === index} key={index} onClick={() => { setChoice(index); setChecked(false); }}><b>{String.fromCharCode(65 + index)}</b>{value[lang]}</button>)}</div>
        <label className="lw-thought">{C.thought[lang]}<textarea value={thought} placeholder={C.thoughtHint[lang]} onChange={event => setThought(event.target.value)} /></label>
        <button type="button" className="lw-check" onClick={() => setChecked(true)}>{C.check[lang]}</button>
        {checked && <p className={'lw-feedback' + (choice === 0 ? ' correct' : '')} role="status">{(choice === null ? C.choose : choice === 0 ? C.right : C.wrong)[lang]}</p>}</div>}
      {mode === 'review' && <div className="lw-review"><span className="lw-kicker">WAIT → REVIEW</span><p>{C.reviewHint[lang]}</p>
        <div className="lw-term-card"><span>01 / 05</span><h3>{C.term[lang]}</h3>{revealed ? <p>{C.termDefinition[lang]}</p> : <div className="lw-recall-lines" aria-hidden="true"><i /><i /><i /></div>}</div>
        <button type="button" className="lw-check" onClick={() => setRevealed(value => !value)}>{(revealed ? C.hide : C.reveal)[lang]}</button></div>}
    </div>
    <div className="lw-footer"><span className="lw-signal" aria-hidden="true" />{C.demoBadge[lang]}</div>
  </div>;
}

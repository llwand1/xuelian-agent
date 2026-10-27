import { useState } from 'react';
import { CURRENT as C, MINE_CHOICES } from './landing-current-copy';
import { useLandingLang } from './landing-lang';

/** New side-view mining, deliberately labelled as an illustration rather than a live save. */
export function LandingMines() {
  const { lang } = useLandingLang();
  const [player, setPlayer] = useState(160), [casting, setCasting] = useState(false), [answer, setAnswer] = useState<number | null>(null);
  return <div className="landing-mines-demo">
    <div className="lm-hud"><span>{C.mineHud[lang]}</span><span aria-hidden="true">♥ ♥ ♥</span></div>
    <svg viewBox="0 0 900 310" className="lm-scene" role="img" aria-label={C.navMine[lang]}>
      <defs><pattern id="lm-stone" width="38" height="30" patternUnits="userSpaceOnUse"><rect width="38" height="30" fill="#211b22" /><path d="M0 0h38v30H0zM2 28h33M35 3v23" fill="none" stroke="#382b34" strokeWidth="2" /></pattern></defs>
      <path d="M0 0H900V310H0z" fill="#0d0a13" /><path d="M0 0h900v24l-28 8v32h-25V32h-38v28h-24V26h-60v35h-30V29h-45v52h-20V38h-80v18h-27V26h-60v43h-18V37h-65v27h-25V32h-65v53h-26V44h-35v18h-25V24H78v60H56V42H0z" fill="#211923" />
      <path d="M0 202h360v-22h132v22h408v108H0z" fill="url(#lm-stone)" /><path d="M0 201h360v-22h132v22h408" stroke="#715542" strokeWidth="4" fill="none" />
      {[55, 290, 540, 745, 840].map((x, index) => <g key={x} fill={index % 2 ? '#65aaa4' : '#bd9860'}><rect x={x} y={235 + index % 2 * 20} width="9" height="12" /><rect x={x + 13} y={242 + index % 2 * 20} width="8" height="9" /><rect x={x - 7} y={249 + index % 2 * 20} width="6" height="6" /></g>)}
      <g className="lm-torch"><path d="M108 180v-42h8v42" fill="#614330" /><path d="M105 135v-15h6v-12h7v17h6v16h-19z" fill="#e8a44d" /><rect x="111" y="126" width="7" height="15" fill="#ffe1a0" /></g>
      <g transform={`translate(${player} 153)`}><path d="M0 44V18h7V4h23v14h7v26H26v8h-9V42h-8v10H0z" fill="#b89868" /><path d="M6 18h25v23H6z" fill="#8f3f4c" /><path d="M8 3h22v15H8z" fill="#d9b78b" /><path d="M5 0h28v8H5z" fill="#6e5d73" /><rect x="25" y="10" width="4" height="4" fill="#21131c" /><path d="M34 31h20v6H34zM50 22h6v16h-6z" fill="#aaa08c" /></g>
      <g transform="translate(655 165)"><path d="M0 35V14h9V5h31v9h9v21H0z" fill={answer === 0 ? '#73a880' : '#86719f'} /><rect x="11" y="15" width="6" height="6" fill="#ffe0ad" /><rect x="32" y="15" width="6" height="6" fill="#ffe0ad" /></g>
      <g transform="translate(398 120)"><path d="M0 25V10L17 0l17 10v15L17 36z" fill="#34514d" stroke="#84b3a0" strokeWidth="2" /><path d="m9 17 7 7 11-14" stroke="#c3e2b4" strokeWidth="3" fill="none" /></g>
      {answer === 0 && <path d={`M${player + 45} 172H650m-20-10 20 10-20 10`} className="lm-spell" stroke="#c5dfa3" strokeWidth="4" fill="none" />}
      <text x="24" y="290" fill="#978e89" fontSize="13">LEARN · EXPLORE · REVIEW</text>
    </svg>
    <div className="lm-controls"><div><button type="button" aria-label={C.left[lang]} onClick={() => setPlayer(value => Math.max(30, value - 45))}>←</button><button type="button" aria-label={C.rightMove[lang]} onClick={() => setPlayer(value => Math.min(560, value + 45))}>→</button></div>
      <button type="button" onClick={() => { setCasting(true); setAnswer(null); }}>{C.ready[lang]} <kbd>E</kbd></button></div>
    {casting && <div className="lm-question"><p>{C.miningPrompt[lang]}</p><div>{MINE_CHOICES.map((choice, index) => <button type="button" key={index} onClick={() => setAnswer(index)}>{choice[lang]}</button>)}</div>
      {answer !== null && <strong role="status">{(answer === 0 ? C.miningSuccess : C.miningRetry)[lang]}</strong>}</div>}
    <small className="lm-caption">{C.miningCaption[lang]}</small>
  </div>;
}

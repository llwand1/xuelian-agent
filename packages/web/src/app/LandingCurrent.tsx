import { CURRENT as C, CURRENT_STEPS, EDITIONS } from './landing-current-copy';
import { useLandingLang } from './landing-lang';
import { LandingMines } from './LandingMines';
import { LandingPv } from './LandingPv';
export function LandingCurrent({ onStart }: { onStart: () => void }) {
  const { lang } = useLandingLang();
  return <>
    <section className="landing-current-section lc-learning" id="landing-learning" aria-label={C.navLearn[lang]}>
      <div className="lc-section-label">01 / {C.navLearn[lang]}</div><h2>{C.learningTitle[lang]}</h2><p className="lc-section-lead">{C.learningLead[lang]}</p>
      <ol className="lc-learning-route">{CURRENT_STEPS.map((step, index) => <li key={index}><span>0{index + 1}</span><h3>{step.title[lang]}</h3><p>{step.text[lang]}</p></li>)}</ol>
      <div className="lc-closeups"><article><span className="lc-availability">{C.newLabel[lang]}</span><h3>{C.quoteTitle[lang]}</h3><p>{C.quoteText[lang]}</p><div className="lc-branch-diagram" aria-hidden="true"><span>{lang === 'zh' ? '原来的讲解' : 'MAIN EXPLANATION'}</span><i /><span>{lang === 'zh' ? '这一步，为什么？' : 'WHY THIS STEP?'}</span><i /><span>{lang === 'zh' ? '回到主线' : 'BACK TO THE THREAD'}</span></div></article>
        <article><span className="lc-availability">{C.newLabel[lang]}</span><h3>{C.htmlTitle[lang]}</h3><p>{C.htmlText[lang]}</p><div className="lc-capability-strip" aria-hidden="true"><span>HTML / SVG / CANVAS</span><span>{lang === 'zh' ? '运行 · 停止 · 重播 · 源码' : 'RUN · STOP · REPLAY · SOURCE'}</span></div></article></div>
    </section>
    <section className="landing-current-section lc-mining" id="landing-mining" aria-label={C.navMine[lang]}><div className="lc-section-label">02 / {C.navMine[lang]}</div>
      <div className="lc-section-heading"><h2>{C.miningTitle[lang]}</h2><p className="lc-section-lead">{C.miningLead[lang]}</p></div><LandingMines />
    </section>
    <section className="landing-current-section lc-local" id="landing-local" aria-label={C.navLocal[lang]}><div className="lc-section-label">03 / {C.navLocal[lang]}</div>
      <div className="lc-local-grid"><div><h2>{C.localTitle[lang]}</h2><p className="lc-section-lead">{C.localLead[lang]}</p>
        <div className="lc-desktop-sketch" aria-hidden="true"><div className="lc-mini-window"><span>STUDENTBUDDY</span><i /><i /><i /><b>▣ → ? → ✓</b></div><div className="lc-companion-pixels"><i /><b>?</b></div></div></div>
        <article className="lc-agent-panel"><span className="lc-availability">{C.trial[lang]}</span><h3>{C.agentTitle[lang]}</h3><p>{C.agentLead[lang]}</p>
          <div className="lc-agent-protocol"><div><span>Codex</span><span>OpenCode</span><span>Qoder</span><span>{lang === 'zh' ? '兼容 Agent' : 'Compatible agent'}</span></div><b aria-hidden="true">↓</b><strong>StudentBuddy</strong><small>{lang === 'zh' ? '你的对话 · 你的学习记录' : 'YOUR CONVERSATIONS · YOUR LEARNING RECORDS'}</small></div>
          <p className="lc-trial-note">{C.trialDetail[lang]}</p></article></div>
    </section>
    <section className="landing-current-section lc-editions" aria-label={C.versionsTitle[lang]}><div className="lc-section-label">04 / {lang === 'zh' ? '开始方式' : 'YOUR STARTING POINT'}</div><h2>{C.versionsTitle[lang]}</h2>
      <div className="lc-edition-list">{EDITIONS.map(edition => <article key={edition.id}><span>{edition.tag[lang]}</span><h3>{edition.title[lang]}</h3><p>{edition.text[lang]}</p></article>)}</div>
      <details className="lc-prototype"><summary>{C.prototypeTitle[lang]}</summary><p>{C.prototypeText[lang]}</p></details>
    </section>
    <section className="landing-current-section lc-finale"><div className="lc-final-rune" aria-hidden="true">✦</div><h2>{C.finaleTitle[lang]}</h2><button type="button" className="landing-cta" onClick={onStart}>{C.finaleButton[lang]}</button>
      <a href="https://github.com/llwand1/xuelian-agent/releases/tag/desktop-stable" target="_blank" rel="noreferrer noopener">{C.download[lang]} ↗</a>
      <details className="lc-archive"><summary>{C.archive[lang]}</summary><LandingPv /></details>
    </section>
  </>;
}

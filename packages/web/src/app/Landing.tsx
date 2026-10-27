/**
 * app/Landing — 当前学习工作台门面（2026-10-26 更新）。
 * 资料共读、段落追问、互动图解、练习/复习与横版矿境；区分线上、本地、试用和原型。
 * 所有首屏交互均为明确标注的静态示例，不调用模型、不写学习记录。
 * 已登录用户默认进入应用；#/welcome 可主动查看门面，不改变原认证判断。
 * ★ 注册/登录表单复用侧栏的 `AccountBox`（standalone 模式），不在本页复制一份表单逻辑。
 * ★ 视觉纪律：禁 emoji；动效只用 steps()；禁内联 style（数据驱动处带 gates:style-ok）。
 */
import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '@sb/shared';
import { api } from '../lib/api';
import { AccountBox } from '../components/AccountBox';
import { DemoLoginButton } from '../components/DemoLoginButton';
import { GithubLoginButton } from '../components/GithubLoginButton';
import { LandingBrand } from './LandingBrand';
import { LandingWorkbench } from './LandingWorkbench';
import { LandingCurrent } from './LandingCurrent';
import { CURRENT } from './landing-current-copy';
import { AUTH, FOOT, FOOT_CHANGELOG, FOOT_TERMS, HERO, HERO_TAGS, TOP } from './landing-copy';
import { LangToggle, useLandingLang } from './landing-lang';
import { CATALOG_PATH, CHANGELOG_PATH } from '../seo/paths';
import { useLandingAtmos } from './useLandingAtmos';
import './landing.css';
import './landing-dark.css';
import './world/world.css';
import './landing-current.css';

type AuthCard = 'closed' | 'register' | 'login';

/** 语言状态不自带 Provider：根上那一层（`main.tsx`）罩着本页与应用壳，两边共用同一份（见 landing-lang 头注）。 */
export function Landing({ onAuthed, onEnterLocal }: { onAuthed: (u: AuthUser) => void; onEnterLocal?: () => void }) {
  const { lang } = useLandingLang();
  const [card, setCard] = useState<AuthCard>('closed');
  const rootRef = useRef<HTMLDivElement>(null);
  useLandingAtmos(rootRef);
  // GitHub 登录入口是否可用（契约 AUTH-SPEC §2.8）：服务端没配凭据就不画按钮，
  // 请求失败（非 2xx / 网络）按「不可用」处理——宁少一个入口，不给用户一个点了报错的按钮。
  // ★ `demo`（§2.10 公用体验账号）同口径：开关在上游。两者共用**一次** providers 请求，
  //   不各拉一遍——两个独立请求会让两个入口的可用性在短暂的时间窗里不一致，
  //   表现出来就是「GitHub 按钮先出现、体验按钮后弹出」这种没人能复现的抖动。
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [local, setLocal] = useState(false);
  useEffect(() => {
    // ★ 走 `api` 而不是裸 `fetch`：这条请求正是服务端 `app_open` 的采集点（GROWTH-SPEC §2.1），
    //   而归因头 `X-SB-Ref` 由 `lib/api-request.ts` 那一层统一注入。裸 fetch 绕过那层
    //   ＝**全站最关键的一个计数拿不到来源**（2026-09-24 就是为它而开）。
    api.auth
      .surface()
      .then((d) => {
        setGithubEnabled(Boolean(d.providers.github));
        setDemoEnabled(Boolean(d.providers.demo));
        setLocal(d.form === 'local');
      })
      .catch(() => {
        setGithubEnabled(false);
        setDemoEnabled(false);
      });
  }, []);
  const start = () => {
    if (local && onEnterLocal) { onEnterLocal(); return; }
    setCard(card === 'register' ? 'closed' : 'register');
  };
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  return (
    <div className="landing landing-current" ref={rootRef} lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <header className="landing-top">
        <LandingBrand />
        <nav className="landing-product-nav" aria-label={lang === 'zh' ? '产品导航' : 'Product navigation'}>
          <button type="button" onClick={() => scrollTo('landing-learning')}>{CURRENT.navLearn[lang]}</button>
          <button type="button" onClick={() => scrollTo('landing-mining')}>{CURRENT.navMine[lang]}</button>
          <button type="button" onClick={() => scrollTo('landing-local')}>{CURRENT.navLocal[lang]}</button>
        </nav>
        <div className="landing-top-right">
          <LangToggle />
          <a className="landing-ghost" href="https://github.com/llwand1/xuelian-agent/releases/tag/desktop-stable" target="_blank" rel="noreferrer noopener">{CURRENT.download[lang]}</a>
          <a className="landing-ghost landing-gh" href="https://github.com/llwand1/xuelian-agent" target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          {githubEnabled && <GithubLoginButton className="landing-ghost" label={TOP.ghLogin[lang]} />}
          <button type="button" className="landing-ghost" onClick={() => setCard(card === 'login' ? 'closed' : 'login')}>
            {TOP.login[lang]}
          </button>
        </div>
      </header>

      <main className="landing-body">
        {/* 首屏学习工作台：交互示例与真实进入应用的 CTA 分离。 */}
        <section className="landing-current-hero" aria-labelledby="landing-current-title">
          <div className="landing-hero-copy">
            <p className="lc-hero-eyebrow">{CURRENT.eyebrow[lang]}</p>
            <h1 className="landing-title" id="landing-current-title">
              {HERO.titlePre[lang]}
              <span className="landing-accent">{HERO.titleAccent[lang]}</span>
            </h1>
            <p className="lc-release-note">{CURRENT.release[lang]}</p><p className="landing-sub">{HERO.sub[lang]}</p>
            <div className="landing-cta-row">
              <button type="button" className="landing-cta" onClick={start}>
                {(local && onEnterLocal ? CURRENT.openLocal : HERO.cta)[lang]}
              </button>
              <button type="button" className="lc-explore" onClick={() => scrollTo('landing-learning')}>{CURRENT.explore[lang]}</button>
            </div>
            <span className="landing-cta-note">{CURRENT.heroHint[lang]}</span>
            {/* 公用体验入口（§2.10）：与上面的注册 CTA 并列，警示语必须读得到——
                公用池里所有访客的数据互相可见，不明示等于默许隐私事故 */}
            {demoEnabled && (
              <div className="landing-demo-row">
                <DemoLoginButton onAuthed={onAuthed} />
              </div>
            )}
            <div className="landing-stats" aria-label={HERO.statsAria[lang]}>
              {HERO_TAGS.map((s) => (
                <span key={s.en}>
                  {s[lang]}
                </span>
              ))}
            </div>
          </div>
          <LandingWorkbench />
        </section>

        {/* ② 注册/登录卡：贴着 CTA 展开（它是 hero 的延伸，不占内容序列的位置） */}
        {card !== 'closed' && (
          <div className="landing-auth-card">
            <AccountBox key={card} standalone initialMode={card} onAuthChange={(u) => u && onAuthed(u)} />
            {githubEnabled && (
              <div className="landing-auth-github">
                <span className="landing-auth-github-or">{AUTH.or[lang]}</span>
                <GithubLoginButton className="landing-github-btn" label={AUTH.ghBtn[lang]} />
                {/* ★ 2026-09-21（独立建号）文案改写：原文案描述的正是**已废弃的归并口径**，
                    与新行为正好相反。不改就是明着误导用户 */}
                <span className="landing-github-hint">{AUTH.ghHint[lang]}</span>
              </div>
            )}
          </div>
        )}

        {/* 当前能力、横版矿境、版本可用性与历史视频。 */}
        <LandingCurrent
          onStart={() => {
            if (local && onEnterLocal) { onEnterLocal(); return; }
            setCard('register');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </main>

      <footer className="landing-foot">
        {FOOT[lang]} ·{' '}
        {/* ★ 站内链接、同标签页：这是爬虫从首页走到词条页的那条路，新开标签等于把它掐掉 */}
        <a href={CATALOG_PATH}>{FOOT_TERMS[lang]}</a> ·{' '}
        {/* ★ 更新页是从公开字节里长出来的静态页，同一条爬虫路径规矩 */}
        <a href={CHANGELOG_PATH}>{FOOT_CHANGELOG[lang]}</a>
      </footer>
    </div>
  );
}

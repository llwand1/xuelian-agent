// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clickCorrect, flush, mapMock, markMock, newTermsMock, keepMock, dismissMock, prompt, resetDrillMocks, options } from '../drill/WaitDrill.testkit';
import { requestHunt, resetHuntStore } from '../continent/continent-hunt-store';

vi.mock('../../lib/api-terms-continent', () => ({ termsContinentApi: { map: mapMock } }));
vi.mock('../../lib/api-terms-review', () => ({ termsReviewApi: { mark: markMock } }));
vi.mock('../../lib/api-drill', () => ({ drillApi: { newTerms: newTermsMock, keep: keepMock, dismiss: dismissMock } }));
vi.mock('@sb/open-engine/mining', async () => ({ ...(await vi.importActual('@sb/open-engine/mining')), MiningRuntime: (await import('./mining-runtime.testkit')).FakeMiningRuntime }));
import { battleProbe } from './mining-runtime.testkit';
const { MiningPage } = await import('./MiningPage');
const { WaitDrill } = await import('../drill/WaitDrill');
const { requestDrillOpen } = await import('../drill/drill-prefs');

describe('知识矿境：一套内核、两种表现形式', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); resetHuntStore(); resetDrillMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const advance = async () => { await act(async () => { vi.advanceTimersByTime(800); }); await flush(); };
  it('正式页先探索，遭遇后直接使用刷词卡；答对才打卡，四秒后轮播下一动作', async () => {
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()} />);
    await flush();
    expect(document.querySelector('.mining-canvas')).toBeTruthy();
    expect(document.querySelector('.drill-card')).toBeNull();
    expect(markMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('连放 关')); clickCorrect(); await flush();
    expect(markMock).toHaveBeenCalledTimes(1); expect(markMock).toHaveBeenCalledWith('d1', true);
    expect(battleProbe.runtime?.state().monster?.hp).toBe(2);
    expect(document.querySelector('.drill-fx-slash')).toBeNull(); // Defense never masquerades as a card slash; world feedback owns combat.
    await advance(); expect(document.querySelector('.drill-detail.ok')).toBeTruthy();
    await act(async()=>{vi.advanceTimersByTime(3300);});await flush();expect(document.querySelector('.drill-detail.ok')).toBeNull();
    expect(battleProbe.runtime?.resolutions).toEqual(['slash']);expect(battleProbe.runtime?.state().pending).toBe('defend');
    expect(mapMock).toHaveBeenCalledTimes(1);
  });
  it('同一轮有选择、判断和拼写；模式切换保留题目、输入草稿和已取词库', async () => {
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()} />);
    await flush(); fireEvent.click(screen.getByText('常规模式'));
    expect(options()).toHaveLength(4); clickCorrect(); await advance();
    expect(options()).toHaveLength(4); clickCorrect(); await advance();
    expect(options()).toHaveLength(2); expect(screen.getByText('判断题')).toBeTruthy();
    const wrong = options()[0]!.textContent?.includes('正确') ? 0 : 1;
    // Keys 3/4 must be ignored on a two-option judgement question.
    fireEvent.keyDown(window, { key: '3' }); expect(markMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.drill-detail')).toBeNull();
    expect(wrong).toBe(0); clickCorrect(); await advance();
    const input = screen.getByLabelText('拼写作答'); fireEvent.change(input, { target: { value: '半' } });
    const asked = prompt(); fireEvent.click(screen.getByText('游戏模式'));
    fireEvent.click(screen.getByRole('button', { name: '施法 E' }));
    expect(prompt()).toBe(asked); expect((screen.getByLabelText('拼写作答') as HTMLInputElement).value).toBe('半');
    fireEvent.click(screen.getByText('常规模式'));
    expect((screen.getByLabelText('拼写作答') as HTMLInputElement).value).toBe('半');
    expect(mapMock).toHaveBeenCalledTimes(1);
  });
  it('话题提醒交给矿境优先出题；链接回正式词条和带原会话的追问', async () => {
    requestHunt(['u2']); const open = vi.fn(), ask = vi.fn().mockResolvedValue(undefined);
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={open} onFollowUp={ask} />);
    await flush(); fireEvent.click(screen.getByRole('button', { name: '施法 E' }));
    expect(document.querySelector('.drill-chip.due')).toBeTruthy();
    clickCorrect(); await flush(); expect(markMock).toHaveBeenCalledWith('u2', true);
    fireEvent.click(screen.getByText('在词条库查看')); expect(open).toHaveBeenCalledWith('原型链');
    fireEvent.click(screen.getByText('带着词条向 AI 追问')); expect(ask).toHaveBeenCalledWith('原型链', expect.stringContaining('知识矿境'));
  });
  it('等待时刷词也能切游戏模式，切回后不重开局；收起仍能唤回', async () => {
    render(<WaitDrill busySessionId={null} active />);
    act(() => requestDrillOpen()); await flush(); const asked = prompt();
    fireEvent.click(screen.getByText('游戏模式')); fireEvent.click(screen.getByRole('button', { name: '施法 E' }));
    expect(prompt()).toBe(asked); fireEvent.click(screen.getByText('常规模式')); expect(prompt()).toBe(asked);
    expect(mapMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull();
    act(() => requestDrillOpen()); await flush(); expect(prompt()).toBe(asked); expect(mapMock).toHaveBeenCalledTimes(1);
  });
  it('输入锁避免双击同帧重复打卡；重复巩固不再把已打卡词条当到期怪', async () => {
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()} />);
    await flush(); fireEvent.click(screen.getByText('常规模式'));
    act(() => { clickCorrect(); clickCorrect(); }); await flush();
    expect(markMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 9; i++) {
      await advance();
      if (document.querySelector('.drill-spell')) fireEvent.click(screen.getByRole('button', { name: /不认识/ }));
      else clickCorrect();
      if (document.querySelector('.drill-detail.bad')) fireEvent.click(screen.getByRole('button', { name: /下一张/ }));
    }
    await flush(); expect(markMock).toHaveBeenCalledTimes(1);
  });
  it('游戏斩只跳过动作，不打卡、不把词条永久或当天排除，四秒内不能抢跑',async()=>{
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()}/>);await flush();
    fireEvent.keyDown(window,{key:'1'});expect(markMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('连放 关'));fireEvent.click(screen.getByRole('button',{name:/跳过本轮/}));await flush();
    expect(screen.getByText('斩：本轮不做动作')).toBeTruthy();expect(markMock).not.toHaveBeenCalled();
    expect(battleProbe.runtime?.resolutions).toEqual(['slay']);expect(battleProbe.runtime?.state().monster?.hp).toBe(3);
    const next=screen.getByRole('button',{name:/下一张/}) as HTMLButtonElement;expect(next.disabled).toBe(true);
    await act(async()=>{vi.advanceTimersByTime(3900);});expect(document.querySelector('.drill-detail.cut')).toBeTruthy();
    await act(async()=>{vi.advanceTimersByTime(200);});await flush();expect(battleProbe.runtime?.state().pending).toBe('defend');
    const day=JSON.parse(localStorage.getItem('sb:drill:stats')!);expect(day.slain).toEqual([]);
  });
  it('答题与读解析不暂停怪物；主动休整才停世界，并保留当前题目',async()=>{
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()}/>);await flush();
    fireEvent.click(screen.getByText('连放 关'));const question=prompt();
    await act(async()=>{vi.advanceTimersByTime(12100);});await flush();expect(prompt()).toBe(question);
    expect(battleProbe.runtime?.state().hp).toBe(92);expect(battleProbe.runtime?.state().paused).toBe(false);
    fireEvent.click(screen.getByText('休整'));await act(async()=>{vi.advanceTimersByTime(13000);});
    expect(battleProbe.runtime?.state().hp).toBe(92);expect(battleProbe.runtime?.state().paused).toBe(true);
    fireEvent.click(screen.getByText('继续世界'));fireEvent.click(screen.getByText('连放 开'));
    clickCorrect();await act(async()=>{vi.advanceTimersByTime(5000);});await flush();
    expect(document.querySelector('.drill-detail.ok')).toBeTruthy();expect(battleProbe.runtime?.state().paused).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '施法 E' }));await flush();
    expect(document.querySelector('.drill-detail.ok')).toBeNull();expect(battleProbe.runtime?.state().pending).toBe('defend');
    expect(battleProbe.runtime?.resolutions).toEqual(['slash']);
  });
  it('轮播配置自填 BAA 与时长后保存，重进保持；不会修改学习题库',async()=>{
    const view=render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()}/>);await flush();
    fireEvent.click(screen.getByRole('button',{name:'矿境设置'}));fireEvent.click(screen.getByText(/节奏与动作编排/));
    fireEvent.change(screen.getByLabelText('动作序列'),{target:{value:'BAA'}});
    fireEvent.change(screen.getByLabelText('动作轮间隔（秒）'),{target:{value:'9'}});
    fireEvent.click(screen.getByText('保存节奏与轮播'));expect(screen.getByText('节奏与轮播已保存。')).toBeTruthy();
    expect(battleProbe.runtime?.state().action).toBe('defend');expect(mapMock).toHaveBeenCalledTimes(1);
    view.unmount();render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()}/>);await flush();
    fireEvent.click(screen.getByRole('button',{name:'矿境设置'}));expect((screen.getByLabelText('动作序列') as HTMLInputElement).value).toBe('BAA');
    expect((screen.getByLabelText('动作轮间隔（秒）') as HTMLInputElement).value).toBe('9');
  });
  it('收起尚未作答的题卡后，E 请求可唤回同一动作，不重复开牌',async()=>{
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()}/>);await flush();
    fireEvent.click(screen.getByRole('button', { name: '施法 E' }));const asked=prompt();
    fireEvent.click(screen.getByRole('button', { name: /继续探索/ }));expect(document.querySelector('.drill-card')).toBeNull();
    act(()=>battleProbe.runtime?.requestRound());await flush();expect(prompt()).toBe(asked);
    expect(battleProbe.runtime?.state().pending).toBe('attack');expect(battleProbe.runtime?.resolutions).toEqual([]);
    clickCorrect();await flush();expect(battleProbe.runtime?.resolutions).toEqual(['slash']);
  });
  it('常规已交卷题切入游戏后先翻过，不会给同一张已答题挂上第二个动作锁',async()=>{
    render(<MiningPage identity="u1" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()}/>);await flush();
    fireEvent.click(screen.getByText('常规模式'));clickCorrect();await flush();
    fireEvent.click(screen.getByText('游戏模式'));expect(battleProbe.runtime?.state().pending).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '施法 E' }));await flush();
    expect(document.querySelector('.drill-detail.ok')).toBeNull();expect(battleProbe.runtime?.state().pending).toBe('attack');
    expect(battleProbe.runtime?.resolutions).toEqual([]);expect(markMock).toHaveBeenCalledTimes(1);
  });

});

it('继续探索 closes unanswered AND revealed cards immediately, preserves a pending action, and never silently resumes autoplay', async () => {
  vi.useFakeTimers(); localStorage.clear(); resetDrillMocks();
  render(<MiningPage identity="close" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()} />); await flush();
  const cast = () => fireEvent.click(screen.getByRole('button', { name: '施法 E' }));
  cast(); const asked = prompt(); fireEvent.click(screen.getByRole('button', { name: /继续探索/ }));
  expect(document.querySelector('.mining-question-dock')).toBeNull(); expect(battleProbe.runtime?.resolutions).toEqual([]);
  cast(); expect(prompt()).toBe(asked); clickCorrect(); await flush();
  expect(document.querySelector('.drill-detail.ok')).toBeTruthy();
  const back = screen.getByRole('button', { name: /继续探索/ });
  const nativeKey = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); back.dispatchEvent(nativeKey);
  expect(nativeKey.defaultPrevented).toBe(false); fireEvent.click(back);
  expect(document.querySelector('.mining-question-dock')).toBeNull();
  await act(async () => { vi.advanceTimersByTime(6000); }); await flush();
  expect(document.querySelector('.mining-question-dock')).toBeNull(); expect(battleProbe.runtime?.resolutions).toEqual(['slash']);
  cast(); await flush(); expect(battleProbe.runtime?.state().pending).toBe('defend');
  cleanup(); vi.useRealTimers();
});

it('new-word learning can be skipped without a grading, keep, rejection, or permanent-exclusion side effect', async () => {
  vi.useFakeTimers(); localStorage.clear(); resetDrillMocks({ mode: 'ai', items: [{ candidateId: 'new1', term: '尾调用优化', definition: '复用尾位置的调用栈帧', domain: 'js', source: 'ai' }] });
  render(<MiningPage identity="skip" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()} />); await flush();
  fireEvent.click(screen.getByRole('button', { name: '施法 E' })); clickCorrect(); await flush();
  await act(async () => { vi.advanceTimersByTime(4100); });
  fireEvent.click(screen.getByRole('button', { name: '施法 E' })); await flush();
  expect(document.querySelector('.drill-card.learn')).toBeTruthy();
  const hp = battleProbe.runtime?.state().monster?.hp, marks = markMock.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /跳过本轮/ })); await flush();
  expect(battleProbe.runtime?.resolutions).toEqual(['slash', 'slay']); expect(battleProbe.runtime?.state().monster?.hp).toBe(hp);
  expect(markMock).toHaveBeenCalledTimes(marks); expect(keepMock).not.toHaveBeenCalled(); expect(dismissMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /继续探索/ })); expect(document.querySelector('.mining-question-dock')).toBeNull();
  cleanup(); vi.useRealTimers();
});

it('compact heart HUD has real values, settings are opt-in and pause only while open, and the default cast is manual', async () => {
  vi.useFakeTimers(); localStorage.clear(); resetDrillMocks();
  render(<MiningPage identity="hud" sessionId="s1" onOpenTerms={vi.fn()} onFollowUp={vi.fn()} />); await flush();
  expect(screen.getByRole('meter', { name: '生命' }).getAttribute('aria-valuenow')).toBe('100');
  expect(document.querySelector('.mining-battle-top,.mining-live-strip,.mining-hud')).toBeNull();
  expect(screen.queryByText(/节奏与动作编排/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '施法 E' })); clickCorrect(); await flush();
  await act(async () => { vi.advanceTimersByTime(4100); }); await flush();
  expect(battleProbe.runtime?.state().pending).toBeNull(); expect(document.querySelector('.drill-detail.ok')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '矿境设置' })); expect(battleProbe.runtime?.state().paused).toBe(true);
  fireEvent.keyDown(window, { key: 'Escape' }); expect(battleProbe.runtime?.state().paused).toBe(false);
  expect(screen.queryByRole('dialog', { name: '矿境设置' })).toBeNull();
  cleanup(); vi.useRealTimers();
});

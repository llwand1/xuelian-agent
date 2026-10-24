// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlCard } from './HtmlCard';
import { Markdown } from './Markdown';
import { MessageRow } from './MessageRow';
import { READ_MESSAGE } from './useScrollAnchor';

const code = '<title>摆动实验</title><style>b{animation:swing 1s infinite}</style><b id="demo">摆动</b>';
const markdown = '```html\n' + code + '\n```';
const frames = (container: HTMLElement) => container.querySelectorAll('iframe');
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const card = (mode: 'auto' | 'manual' | 'disabled' = 'manual') => <HtmlCard code={code} closed streaming={false} mode={mode} />;
function message(frame: HTMLIFrameElement, event: string, extra: Record<string, unknown> = {}, source: MessageEventSource | null = frame.contentWindow, origin = 'null') {
  const runId = JSON.parse(/const runId=("[^"]+")/.exec(frame.srcdoc)![1]!);
  act(() => window.dispatchEvent(new MessageEvent('message', { origin, source, data: { type: 'sb-html-card', v: 1, runId, event, ...extra } })));
}

describe('HTML card capability and lifecycle', () => {
  it('user resize/source/run actions preserve the header without remounting a live frame', () => {
    const r = render(card()), shell = r.container.querySelector('section')!, head = r.container.querySelector('header')!;
    head.scrollIntoView = vi.fn(); const read = vi.fn(); r.container.addEventListener(READ_MESSAGE, read);
    fireEvent.click(r.getByRole('button', { name: '运行卡片' })); const first = frames(r.container)[0];
    fireEvent.click(r.getByRole('button', { name: '展开' }));
    fireEvent.click(r.getByRole('button', { name: '源码' }));
    expect(head.scrollIntoView).toHaveBeenCalledTimes(3); expect(read).toHaveBeenCalledTimes(3);
    expect(frames(r.container)[0]).toBe(first); expect(shell).toBe(r.container.querySelector('section'));
    r.container.removeEventListener(READ_MESSAGE, read);
  });
  it('history needs a click; script stays in srcdoc; stop/replay resets the frame without upload/window.open', () => {
    const open = vi.spyOn(window, 'open'), fetch = vi.spyOn(globalThis, 'fetch');
    const r = render(card()); expect(frames(r.container)).toHaveLength(0);
    fireEvent.click(r.getByRole('button', { name: '运行卡片' }));
    const first = frames(r.container)[0]!;
    expect(first.getAttribute('sandbox')).toBe('allow-scripts');
    expect(first.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(first.srcdoc).toContain(code);
    expect(first.getAttribute('allow')).toContain("camera 'none'");
    expect(r.container.querySelector('#demo')).toBeNull();
    fireEvent.click(r.getByRole('button', { name: '展开' }));
    expect(r.container.querySelector('.html-card-expanded')).not.toBeNull();
    expect(frames(r.container)[0]).toBe(first);
    fireEvent.click(r.getByRole('button', { name: '停止' })); expect(frames(r.container)).toHaveLength(0);
    fireEvent.click(r.getByRole('button', { name: '重播' }));
    expect(frames(r.container)[0]).not.toBe(first);
    expect(frames(r.container)[0]!.srcdoc).not.toBe(first.srcdoc);
    expect(open).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('fresh completions autoplay once under StrictMode; rerenders and source/copy actions do not restart', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const r = render(<StrictMode>{card('auto')}</StrictMode>);
    await vi.waitFor(() => expect(frames(r.container)).toHaveLength(1));
    const first = frames(r.container)[0]!;
    r.rerender(<StrictMode>{card('auto')}</StrictMode>);
    fireEvent.click(r.getByRole('button', { name: '源码' }));
    expect(r.container.querySelector('pre')?.textContent).toBe(code);
    expect(r.container.querySelector('#demo')).toBeNull();
    fireEvent.click(r.getByRole('button', { name: '复制' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(code));
    expect(frames(r.container)[0]).toBe(first);
    fireEvent.click(r.getByRole('button', { name: '停止' }));
    r.rerender(<StrictMode>{card('auto')}</StrictMode>); await act(async () => {});
    expect(frames(r.container)).toHaveLength(0);
  });
  it('stable prefix and synthetic closing fence cannot execute before the entire round completes', async () => {
    const stable = markdown + '\n\n后续文字';
    const r = render(<Markdown text={stable} streaming htmlMode="auto" />);
    await act(async () => {}); expect(frames(r.container)).toHaveLength(0);
    expect(r.queryByRole('button', { name: '运行卡片' })).toBeNull();
    expect(r.container.textContent).toContain('整轮完成后才运行');
    r.rerender(<Markdown text={stable} htmlMode="auto" />);
    await vi.waitFor(() => expect(frames(r.container)).toHaveLength(1));
    r.rerender(<Markdown text={'```html\n' + code} streaming htmlMode="auto" />);
    expect(frames(r.container)).toHaveLength(0);
    r.rerender(<Markdown text={'```html\n' + code} htmlMode="auto" />); await act(async () => {});
    expect(frames(r.container)).toHaveLength(0); expect(r.container.textContent).toContain('尚未闭合');
  });
  it('default Markdown stays inert; assistant history is manual and user messages never become cards', async () => {
    const r = render(<Markdown text={markdown} />);
    expect(r.queryByRole('button', { name: '运行卡片' })).toBeNull();
    const props = { canRegen: false, regenDisabled: false, onRegen: () => {} };
    r.rerender(<MessageRow {...props} m={{ role: 'user', content: markdown }} />);
    expect(r.container.querySelector('.html-card')).toBeNull();
    r.rerender(<MessageRow {...props} m={{ role: 'assistant', content: markdown }} />);
    expect(frames(r.container)).toHaveLength(0); expect(r.getByRole('button', { name: '运行卡片' })).not.toBeNull();
    r.rerender(<MessageRow {...props} m={{ role: 'assistant', content: markdown, htmlAutoRun: true }} />);
    await vi.waitFor(() => expect(frames(r.container)).toHaveLength(1));
  });
  it('nested learning cards inherit the same explicit non-streaming permission', async () => {
    const nested = '> [!EXAMPLE] 试一试\n> ```html\n> <b>例子</b>\n> ```\n\n结尾';
    const r = render(<Markdown text={nested} htmlMode="auto" streaming />);
    await act(async () => {}); expect(frames(r.container)).toHaveLength(0);
    r.rerender(<Markdown text={nested} htmlMode="manual" />);
    fireEvent.click(r.getByRole('button', { name: '运行卡片' })); expect(frames(r.container)).toHaveLength(1);
  });
  it('UTF-8 budget, disabled capability and reduced-motion preference prevent autoplay', async () => {
    const r = render(<HtmlCard code={'你'.repeat(44000)} closed streaming={false} mode="auto" />);
    await act(async () => {}); expect(frames(r.container)).toHaveLength(0); expect(r.container.textContent).toContain('128 KiB');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    r.rerender(card('auto')); await act(async () => {}); expect(frames(r.container)).toHaveLength(0);
    fireEvent.click(r.getByRole('button', { name: '运行卡片' })); expect(frames(r.container)).toHaveLength(1);
    r.rerender(card('disabled')); expect(frames(r.container)).toHaveLength(0);
  });
  it('third card evicts oldest without restarting the other card; unmount releases the slot', () => {
    const r = render(<>{[0, 1, 2].map(i => <div key={i} data-testid={`card-${i}`}>{card()}</div>)}</>);
    for (let i = 0; i < 3; i++) fireEvent.click(within(r.getByTestId(`card-${i}`)).getByRole('button', { name: '运行卡片' }));
    expect(frames(r.container)).toHaveLength(2);
    expect(frames(r.getByTestId('card-0'))).toHaveLength(0); expect(frames(r.getByTestId('card-1'))).toHaveLength(1);
    r.unmount(); const next = render(card());
    fireEvent.click(next.getByRole('button', { name: '运行卡片' })); expect(frames(next.container)).toHaveLength(1);
  });
  it('rejects wrong sources, stale runs and wrong origins; only presentation reports affect this frame', () => {
    const r = render(card()); fireEvent.click(r.getByRole('button', { name: '运行卡片' })); const frame = frames(r.container)[0]!;
    message(frame, 'error', { message: 'fake' }, window);
    message(frame, 'error', { message: 'fake' }, frame.contentWindow, 'https://evil.example');
    message(frame, 'error', { runId: 'old', message: 'fake' }); expect(frames(r.container)).toHaveLength(1);
    message(frame, 'ready'); expect(r.container.textContent).not.toContain('正在启动沙箱');
    message(frame, 'resize', { height: 99999 }); expect(frame.style.getPropertyValue('--sb-html-height')).toBe('720px');
    message(frame, 'error', { message: '<img src=x onerror=evil()>受限' });
    expect(frames(r.container)).toHaveLength(0); expect(r.container.querySelector('[role="alert"]')?.textContent).toContain('<img');
    expect(r.container.querySelector('img')).toBeNull();
  });
  it('timeouts, repeated navigation loads and hidden documents stop the frame', () => {
    vi.useFakeTimers(); const r = render(card()); fireEvent.click(r.getByRole('button', { name: '运行卡片' }));
    act(() => vi.advanceTimersByTime(8000)); expect(frames(r.container)).toHaveLength(0);
    expect(r.getByRole('alert').textContent).toContain('初始化');
    fireEvent.click(r.getByRole('button', { name: '重播' })); let frame = frames(r.container)[0]!;
    fireEvent.load(frame); fireEvent.load(frame); expect(frames(r.container)).toHaveLength(0);
    fireEvent.click(r.getByRole('button', { name: '重播' })); frame = frames(r.container)[0]!; message(frame, 'ready');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); fireEvent(document, new Event('visibilitychange'));
    expect(frames(r.container)).toHaveLength(0);
  });
  it('leaving the viewport unloads a running frame and does not silently replay on reentry', async () => {
    let intersection: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersection = callback; }
      observe() {} disconnect = disconnect;
    });
    const r = render(card('auto'));
    const intersect = (shown: boolean) => act(() => intersection([{ isIntersecting: shown } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => {}); expect(frames(r.container)).toHaveLength(0);
    intersect(true); await vi.waitFor(() => expect(frames(r.container)).toHaveLength(1));
    intersect(false); expect(frames(r.container)).toHaveLength(0);
    intersect(true); await act(async () => {}); expect(frames(r.container)).toHaveLength(0);
    r.unmount(); expect(disconnect).toHaveBeenCalled();
  });
  it('source replacement destroys the old run and cannot consume another card slot until explicitly replayed', () => {
    const r = render(card()); fireEvent.click(r.getByRole('button', { name: '运行卡片' }));
    const old = frames(r.container)[0]!;
    r.rerender(<HtmlCard code="<h2>替换的内容</h2>" closed streaming={false} mode="manual" />);
    expect(frames(r.container)).toHaveLength(0);
    message(old, 'error', { message: '迟到回报' });
    expect(r.queryByRole('alert')).toBeNull();
    fireEvent.click(r.getByRole('button', { name: '重播' }));
    expect(frames(r.container)[0]!.srcdoc).toContain('替换的内容');
  });
});

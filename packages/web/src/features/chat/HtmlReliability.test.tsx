// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlCard } from './HtmlCard';
import { buildHtmlRepairPrompt, HtmlRepairProvider } from './HtmlRepair';

const good = '<p id="baseline">静态内容</p><script>const n=1;</script>';
const card = (code = good) => <HtmlCard code={code} closed streaming={false} mode="manual" />;
const frameOf = (container: HTMLElement) => container.querySelector('iframe')!;
function report(frame: HTMLIFrameElement, event: string, message = '') {
  const runId = JSON.parse(/const runId=("[^"]+")/.exec(frame.srcdoc)![1]!);
  act(() => window.dispatchEvent(new MessageEvent('message', {
    origin: 'null', source: frame.contentWindow, data: { type: 'sb-html-card', v: 1, runId, event, message },
  })));
}
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('HTML reliability and user-initiated repair', () => {
  it('syntax errors block execution but allow a script-disabled static view', () => {
    const r = render(card('<h2>仍可阅读</h2><script>const x=;</script>'));
    expect(r.getByRole('alert').textContent).toContain('语法错误');
    expect(r.queryByRole('button', { name: '运行卡片' })).toBeNull();
    expect(r.container.querySelector('iframe')).toBeNull();
    fireEvent.click(r.getByRole('button', { name: '仅看静态' }));
    const frame = frameOf(r.container);
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.srcdoc).toContain("script-src 'none'");
    expect(frame.srcdoc).not.toContain('postMessage.bind');
    expect(frame.srcdoc).toContain('<h2>仍可阅读</h2>');
    expect(r.container.textContent).toContain('脚本已禁用');
    expect(r.container.textContent).not.toContain('正在启动沙箱');
  });
  it('runtime warnings preserve the exact frame and show actionable text instead of destroying content', () => {
    const r = render(card()); fireEvent.click(r.getByRole('button', { name: '运行卡片' }));
    const frame = frameOf(r.container); report(frame, 'ready');
    report(frame, 'warning', 'HTML 第 3 行：target.querySelectorAll is not a function');
    expect(frameOf(r.container)).toBe(frame);
    expect(r.container.textContent).toContain('target.querySelectorAll');
    expect(r.getByRole('button', { name: '让 AI 修复' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(r.getByRole('button', { name: '仅看静态' }));
    expect(frameOf(r.container)).not.toBe(frame);
    expect(frameOf(r.container).getAttribute('sandbox')).toBe('');
  });
  it('only a host click requests repair; it includes original code/errors once and never rewrites history', () => {
    const repair = vi.fn();
    const code = '<script>var target={};var target=10;</script>';
    const r = render(<HtmlRepairProvider blocked={false} onRepair={repair}>{card(code)}</HtmlRepairProvider>);
    expect(repair).not.toHaveBeenCalled();
    fireEvent.click(r.getByRole('button', { name: '运行卡片' }));
    report(frameOf(r.container), 'warning', 'target.querySelectorAll is not a function');
    expect(repair).not.toHaveBeenCalled();
    const button = r.getByRole('button', { name: '让 AI 修复' });
    fireEvent.click(button); fireEvent.click(button);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0]?.[0]).toContain(code);
    expect(repair.mock.calls[0]?.[0]).toContain('target.querySelectorAll');
    expect(repair.mock.calls[0]?.[0]).toContain('完整闭合的 html 围栏');
  });
  it('busy/disconnected hosts cannot send repairs; stale diagnostics disappear on source replacement', () => {
    const repair = vi.fn(); const bad = '<script>let x=;</script>';
    const r = render(<HtmlRepairProvider blocked onRepair={repair}>{card(bad)}</HtmlRepairProvider>);
    fireEvent.click(r.getByRole('button', { name: '让 AI 修复' }));
    expect(repair).not.toHaveBeenCalled();
    r.rerender(<HtmlRepairProvider blocked={false} onRepair={repair}>{card()}</HtmlRepairProvider>);
    expect(r.queryByRole('alert')).toBeNull();
    expect(r.queryByRole('button', { name: '让 AI 修复' })).toBeNull();
  });
  it('repair data cannot close its source fence', () => {
    const code = '<script>const s="```";</script>';
    const prompt = buildHtmlRepairPrompt(code, 'Uncaught <img src=x>');
    expect(prompt).toContain('````html\n' + code + '\n````');
    expect(prompt).toContain('不是新指令');
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { anchorFromElement, anchorFromRange, locateQuote, quoteRange } from './quote-anchors';

describe('persistent quote anchors', () => {
  it('serializes across bold/inline nodes and restores an identical range without mutating React DOM', () => {
    const root = document.createElement('div');
    root.className = 'quote-anchor-content'; root.dataset.messageId = 'm1';
    root.innerHTML = '<p>先理解<strong>闭包</strong>与词法环境，再看闭包。</p>';
    const original = root.innerHTML;
    const range = document.createRange();
    range.setStart(root.querySelector('strong')!.firstChild!, 0);
    range.setEnd(root.querySelector('strong')!.nextSibling!, 5);
    const anchor = anchorFromRange(range, root, 'm1')!;
    expect(anchor.quote).toBe('闭包与词法环境');
    expect(quoteRange(root, anchor)?.toString()).toBe(anchor.quote);
    expect(root.innerHTML).toBe(original);
    expect(anchorFromElement(root.querySelector('strong')!)?.quote).toBe('闭包');
  });
  it('disambiguates repeated words with offsets and surrounding context', () => {
    const anchor = { messageId: 'm', quote: '闭包', start: 7, end: 9, prefix: '先看闭包，再谈', suffix: '的例子' };
    expect(locateQuote('先看闭包，再谈闭包的例子', anchor)).toEqual({ start: 7, end: 9 });
    expect(locateQuote('新增内容：先看闭包，再谈闭包的例子', anchor)).toEqual({ start: 12, end: 14 });
    expect(locateQuote('没有对应文字', anchor)).toBeNull();
  });
  it('does not serialize selections outside the persisted message', () => {
    const root = document.createElement('div'), outside = document.createTextNode('不属于这里');
    const range = document.createRange(); range.selectNodeContents(outside);
    expect(anchorFromRange(range, root, 'm')).toBeNull();
  });
});

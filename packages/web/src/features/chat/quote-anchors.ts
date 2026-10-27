import type { QuoteAnchor } from '@sb/shared';

export function anchorFromRange(range: Range, content: HTMLElement, messageId: string): QuoteAnchor | null {
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return null;
  const before = range.cloneRange(); before.selectNodeContents(content); before.setEnd(range.startContainer, range.startOffset);
  const quote = range.toString(), start = before.toString().length, end = start + quote.length;
  if (!quote.trim()) return null;
  const text = content.textContent ?? '';
  return { messageId, quote, start, end, prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48) };
}
export function anchorFromElement(element: HTMLElement): QuoteAnchor | null {
  const content = element.closest<HTMLElement>('.quote-anchor-content');
  const messageId = content?.dataset.messageId;
  if (!content || !messageId) return null;
  const range = document.createRange(); range.selectNodeContents(element);
  return anchorFromRange(range, content, messageId);
}
/** Exact offsets first; surrounding text distinguishes repeated words after renderer changes. */
export function locateQuote(text: string, anchor: QuoteAnchor): { start: number; end: number } | null {
  if (!anchor.quote) return null;
  const contextMatches = (at: number) => (!anchor.prefix || text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix)
    && (!anchor.suffix || text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length) === anchor.suffix);
  if (text.slice(anchor.start, anchor.end) === anchor.quote && contextMatches(anchor.start)) return { start: anchor.start, end: anchor.end };
  let at = -1, best = -1, score = -Infinity;
  while ((at = text.indexOf(anchor.quote, at + 1)) !== -1) {
    const candidate = (anchor.prefix && text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix ? text.length + 1 : 0)
      + (anchor.suffix && text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length) === anchor.suffix ? text.length + 1 : 0) - Math.abs(at - anchor.start);
    if (candidate > score) { score = candidate; best = at; }
  }
  return best < 0 ? null : { start: best, end: best + anchor.quote.length };
}
export function quoteRange(content: HTMLElement, anchor: QuoteAnchor): Range | null {
  const match = locateQuote(content.textContent ?? '', anchor);
  if (!match) return null;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let offset = 0, node: Node | null, started = false;
  const range = document.createRange();
  while ((node = walker.nextNode())) {
    const next = offset + (node.textContent?.length ?? 0);
    if (!started && match.start < next) { range.setStart(node, match.start - offset); started = true; }
    if (started && match.end <= next) { range.setEnd(node, match.end - offset); return range; }
    offset = next;
  }
  return null;
}

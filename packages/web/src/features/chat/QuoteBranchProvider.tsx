import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useQuoteBranches } from './useQuoteBranches';
import { QuoteBranchWindow } from './QuoteBranchWindow';
import { QuoteAsk } from './QuoteAsk';
import { quoteRange } from './quote-anchors';
import { QuoteBranchContext as Context, useQuoteBranch } from './quote-branch-context';
import { READ_MESSAGE } from './useScrollAnchor';

/** Custom highlights do not mutate React-owned text nodes. Chips provide a keyboard/legacy-browser entry. */
export function QuoteBranchProvider({ sessionId, rootRef, revision, children }: {
  sessionId: string | null; rootRef: RefObject<HTMLElement | null>; revision: string; children: ReactNode;
}) {
  const state = useQuoteBranches(sessionId, revision);
  const openRef = useRef(state.openBranch); openRef.current = state.openBranch;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let ranges: Array<{ id: string; messageId: string; range: Range }> = [], timer: ReturnType<typeof setTimeout> | undefined;
    type Registry = { set: (key: string, value: unknown) => void; delete: (key: string) => void };
    const css = globalThis.CSS as typeof CSS & { highlights?: Registry };
    const HighlightClass = (globalThis as typeof globalThis & { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const rebuild = () => {
      ranges = [];
      const contents = new Map([...root.querySelectorAll<HTMLElement>('.quote-anchor-content')].map(el => [el.dataset.messageId, el]));
      for (const branch of state.branches) {
        const content = contents.get(branch.messageId);
        if (!content) continue;
        const range = quoteRange(content, branch);
        if (range) ranges.push({ id: branch.id, messageId: branch.messageId, range });
      }
      if (HighlightClass && css?.highlights) css.highlights.set('sb-quote-branch', new HighlightClass(...ranges.map(r => r.range)));
    };
    const hit = (e: MouseEvent) => {
      const messageId = (e.target instanceof Element ? e.target.closest<HTMLElement>('.quote-anchor-content') : null)?.dataset.messageId;
      return messageId ? ranges.find(item => item.messageId === messageId && [...item.range.getClientRects()].some(rect => e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom)) : undefined;
    };
    const click = (e: MouseEvent) => {
      if (document.getSelection()?.toString()) return;
      const found = hit(e);
      if (found) { e.preventDefault(); e.stopPropagation(); root.dispatchEvent(new Event(READ_MESSAGE, { bubbles: true })); void openRef.current(found.id); }
    };
    const hover = (e: PointerEvent) => root.classList.toggle('quote-branch-hover', !!hit(e));
    rebuild();
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { if (!timer) timer = setTimeout(() => { timer = undefined; rebuild(); }, 100); });
    observer?.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener('click', click, true); root.addEventListener('pointermove', hover);
    return () => { observer?.disconnect(); clearTimeout(timer); css?.highlights?.delete('sb-quote-branch'); root.classList.remove('quote-branch-hover'); root.removeEventListener('click', click, true); root.removeEventListener('pointermove', hover); };
  }, [state.branches, rootRef, revision]);
  const reading = () => rootRef.current?.dispatchEvent(new Event(READ_MESSAGE, { bubbles: true }));
  return <Context.Provider value={{ available: !!sessionId, branches: state.branches, ask: (anchor, question) => { reading(); return state.openAnchor(anchor, question); }, open: id => { reading(); void state.openBranch(id); } }}>
    {children}
    <QuoteAsk rootRef={rootRef} onQuote={anchor => { reading(); void state.openAnchor(anchor); }} />
    <QuoteBranchWindow state={state} />
  </Context.Provider>;
}

export function QuoteBranchLinks({ messageId }: { messageId?: string }) {
  const context = useQuoteBranch();
  const branches = context.branches.filter(b => b.messageId === messageId);
  if (!branches.length) return null;
  return <nav className="quote-branch-links" aria-label="此回答的隐藏追问分支">{branches.map(branch =>
    <button type="button" key={branch.id} onClick={() => context.open(branch.id)} title={branch.quote}>↗ {branch.quote.length > 24 ? branch.quote.slice(0, 24) + '…' : branch.quote}</button>)}</nav>;
}

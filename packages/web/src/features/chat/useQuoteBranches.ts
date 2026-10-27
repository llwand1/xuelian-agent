import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuoteAnchor, QuoteBranch, QuoteBranchDetail } from '@sb/shared';
import { quoteBranchesApi as api } from '../../lib/api-quote-branches';

export function useQuoteBranches(sessionId: string | null, revision: string) {
  const [branches, setBranches] = useState<QuoteBranch[]>([]);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<QuoteAnchor | null>(null);
  const [detail, setDetail] = useState<QuoteBranchDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const currentSession = useRef(sessionId); currentSession.current = sessionId;
  const currentId = useRef<string | null>(null);
  const generation = useRef(0);
  const sessionEpoch = useRef(0);
  const streams = useRef(new Map<string, AbortController>());
  const sending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const list = await api.list(sessionId);
    if (currentSession.current === sessionId) setBranches(list);
  }, [sessionId]);
  useEffect(() => {
    let alive = true;
    if (!sessionId) { setBranches([]); return; }
    void api.list(sessionId).then(list => { if (alive) setBranches(list); }).catch(() => {});
    return () => { alive = false; };
  }, [sessionId, revision]);
  useEffect(() => {
    sessionEpoch.current++;
    generation.current++; currentId.current = null; setOpen(false); setDetail(null); setAnchor(null); setError(''); setDraft(''); setLoading(false);
    sending.current = false; setSubmitting(false);
    return () => { for (const stream of streams.current.values()) stream.abort(); streams.current.clear(); };
  }, [sessionId]);
  const load = async (id: string) => {
    if (currentId.current === id && streams.current.has(id)) { setOpen(true); return; }
    const same = currentId.current === id;
    const serial = ++generation.current;
    currentId.current = id; setDetail(null); setAnchor(branches.find(b => b.id === id) ?? null); if (!same) setDraft(''); setLoading(true); setError(''); setOpen(true);
    try {
      const data = await api.detail(id);
      if (serial === generation.current) { setDetail(data); setAnchor(data.branch); }
    } catch (err) { if (serial === generation.current) setError(err instanceof Error ? err.message : '分支加载失败'); }
    finally { if (serial === generation.current) setLoading(false); }
  };
  const sendFor = async (selection: QuoteAnchor, text: string) => {
    if (!sessionId || sending.current) return;
    const sid = sessionId, serial = generation.current, epoch = sessionEpoch.current;
    sending.current = true; setSubmitting(true); setError('');
    let id: string | undefined;
    try {
      const branch = await api.create(sid, selection);
      if (currentSession.current !== sid || sessionEpoch.current !== epoch) return;
      id = branch.id;
      if (streams.current.has(id)) return;
      if (serial === generation.current) { currentId.current = id; setDetail(previous => ({ branch, messages: previous && previous.branch.id === id ? previous.messages : [], busy: true })); }
      const controller = new AbortController(); streams.current.set(id, controller);
      void refresh().catch(() => {});
      await api.send(id, text, event => {
        if (currentSession.current !== sid || sessionEpoch.current !== epoch || currentId.current !== id) return;
        if (event.type === 'snapshot' || event.type === 'done') {
          setDetail(event.detail);
          if (event.type === 'snapshot') setDraft(previous => previous.trim() === text.trim() ? '' : previous);
        }
        else setDetail(previous => {
          if (!previous || previous.branch.id !== id) return previous;
          const messages = [...previous.messages], last = messages[messages.length - 1];
          if (last?.role === 'assistant') messages[messages.length - 1] = { ...last, content: last.content + event.content };
          return { ...previous, messages };
        });
      }, controller.signal);
    } catch (err) {
      if (currentSession.current === sid && sessionEpoch.current === epoch && (id ? currentId.current === id : serial === generation.current) && !(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : '追问发送失败');
        if (id) void api.detail(id).then(data => { if (currentId.current === id) setDetail(data); }).catch(() => {});
      }
    } finally {
      if (id) streams.current.delete(id);
      if (currentSession.current === sid && sessionEpoch.current === epoch) { sending.current = false; setSubmitting(false); void refresh().catch(() => {}); }
    }
  };
  const openAnchor = async (selection: QuoteAnchor, question?: string) => {
    if (!sessionId) return;
    ++generation.current; setAnchor(selection); setDetail(null); setDraft(question ?? ''); setError(''); setLoading(false); setOpen(true); currentId.current = null;
    const existing = branches.find(b => b.messageId === selection.messageId && b.start === selection.start && b.end === selection.end && b.quote === selection.quote);
    if (existing && !question) await load(existing.id);
    else if (question) await sendFor(selection, question);
  };
  // Restores partial/background answers after transport loss, reload or reopening the popup.
  useEffect(() => {
    if (!open || !detail?.busy || streams.current.has(detail.branch.id)) return;
    const id = detail.branch.id;
    const timer = setInterval(() => { void api.detail(id).then(data => { if (currentId.current === id) setDetail(data); }).catch(() => {}); }, 1000);
    return () => clearInterval(timer);
  }, [open, detail?.busy, detail?.branch.id]);
  return { branches, open, anchor, detail, draft, setDraft, error, loading, busy: submitting || !!detail?.busy,
    openAnchor, openBranch: load, close: () => setOpen(false),
    send: () => anchor ? sendFor(anchor, draft.trim() || '请结合原回答上下文解释这段内容，举一个容易理解的例子。') : Promise.resolve(),
    stop: async () => { if (currentId.current) { try { await api.stop(currentId.current); } catch (err) { setError(err instanceof Error ? err.message : '停止失败'); } } },
  };
}

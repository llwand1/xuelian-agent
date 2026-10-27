import type { QuoteAnchor, QuoteBranch, QuoteBranchDetail, QuoteBranchEvent } from '@sb/shared';
import { request } from './api-request';

const path = (id: string) => '/api/quote-branches/' + encodeURIComponent(id);
export const quoteBranchesApi = {
  list: (sessionId: string) => request<QuoteBranch[]>('/api/quote-branches?sessionId=' + encodeURIComponent(sessionId)),
  create: (sessionId: string, anchor: QuoteAnchor) => request<QuoteBranch>('/api/quote-branches', { method: 'POST', body: JSON.stringify({ sessionId, anchor }) }),
  detail: (id: string) => request<QuoteBranchDetail>(path(id)),
  stop: (id: string) => request<{ ok: boolean }>(path(id) + '/abort', { method: 'POST' }),
  async send(id: string, text: string, onEvent: (event: QuoteBranchEvent) => void, signal?: AbortSignal) {
    const response = await fetch(path(id) + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal });
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || '分支发送失败'); }
    if (!response.body) throw new Error('分支流不可用，请重新打开查看');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '', completed = false;
    const line = (raw: string) => {
      if (!raw.trim()) return;
      const event = JSON.parse(raw) as QuoteBranchEvent;
      if (event.type === 'snapshot' || event.type === 'token' || event.type === 'done') onEvent(event);
      if (event.type === 'done') completed = true;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        let end: number;
        while ((end = pending.indexOf('\n')) !== -1) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
        if (pending.length > 2_000_000) throw new Error('分支返回内容过大');
        if (done) { line(pending); break; }
      }
      if (!completed) throw new Error('连接中断；回答可能仍在生成，重新打开此分支可恢复');
    } finally { reader.releaseLock(); }
  },
};

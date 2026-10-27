// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteAnchor, QuoteBranch, QuoteBranchDetail } from '@sb/shared';
import { quoteBranchesApi } from '../../lib/api-quote-branches';
import { useQuoteBranches } from './useQuoteBranches';

vi.mock('../../lib/api-quote-branches', () => ({ quoteBranchesApi: { list: vi.fn(), create: vi.fn(), detail: vi.fn(), send: vi.fn(), stop: vi.fn() } }));
const anchor: QuoteAnchor = { messageId: 'm', quote: '闭包', start: 0, end: 2, prefix: '', suffix: '' };
const branch: QuoteBranch = { ...anchor, id: 'b', sessionId: 's', createdAt: 'now', updatedAt: 'now' };
const detail: QuoteBranchDetail = { branch, messages: [{ id: 'q', role: 'user', content: '以前的问题', status: 'complete', createdAt: 'now' }, { id: 'a', role: 'assistant', content: '以前的回答', status: 'complete', createdAt: 'now' }], busy: false };
beforeEach(() => {
  vi.mocked(quoteBranchesApi.list).mockResolvedValue([]);
  vi.mocked(quoteBranchesApi.create).mockResolvedValue(branch);
  vi.mocked(quoteBranchesApi.detail).mockResolvedValue(detail);
  vi.mocked(quoteBranchesApi.send).mockImplementation(async (_id, _text, emit) => { emit({ type: 'snapshot', detail: { ...detail, busy: true } }); emit({ type: 'token', content: '新增' }); emit({ type: 'done', detail }); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('branch popup state is independent of the main chat', () => {
  it('opening a selection costs no model call; sending double-clicks only once and close/reopen restores history', async () => {
    const r = renderHook(() => useQuoteBranches('s', 'm'));
    await act(() => r.result.current.openAnchor(anchor));
    expect(r.result.current.open).toBe(true); expect(quoteBranchesApi.send).not.toHaveBeenCalled();
    await act(async () => { await Promise.all([r.result.current.send(), r.result.current.send()]); });
    expect(quoteBranchesApi.send).toHaveBeenCalledTimes(1);
    act(() => r.result.current.close()); expect(r.result.current.open).toBe(false);
    await act(() => r.result.current.openBranch('b'));
    expect(r.result.current.detail?.messages[1]?.content).toBe('以前的回答');
  });
  it('reselecting an existing marked quote restores its branch without creating a new one', async () => {
    vi.mocked(quoteBranchesApi.list).mockResolvedValue([branch]);
    const r = renderHook(() => useQuoteBranches('s', 'm'));
    await waitFor(() => expect(r.result.current.branches).toHaveLength(1));
    await act(() => r.result.current.openAnchor(anchor));
    expect(quoteBranchesApi.detail).toHaveBeenCalledWith('b');
    expect(quoteBranchesApi.create).not.toHaveBeenCalled(); expect(quoteBranchesApi.send).not.toHaveBeenCalled();
  });
  it('a late creation response cannot send in a session that was left and re-entered', async () => {
    let resolve!: (b: QuoteBranch) => void;
    vi.mocked(quoteBranchesApi.create).mockImplementation(() => new Promise(done => { resolve = done; }));
    const r = renderHook(({ sid }) => useQuoteBranches(sid, 'm'), { initialProps: { sid: 's' } });
    await act(() => r.result.current.openAnchor(anchor));
    let pending!: Promise<void>; act(() => { pending = r.result.current.send(); });
    r.rerender({ sid: 'other' }); r.rerender({ sid: 's' });
    await act(async () => { resolve(branch); await pending; });
    expect(quoteBranchesApi.send).not.toHaveBeenCalled(); expect(r.result.current.open).toBe(false);
  });
  it('creation errors are visible and do not erase the current question', async () => {
    vi.mocked(quoteBranchesApi.create).mockRejectedValue(new Error('原回答不存在'));
    const r = renderHook(() => useQuoteBranches('s', 'm'));
    await act(() => r.result.current.openAnchor(anchor)); act(() => r.result.current.setDraft('为什么？'));
    await act(() => r.result.current.send());
    expect(r.result.current.error).toBe('原回答不存在'); expect(r.result.current.draft).toBe('为什么？');
  });
  it('a main-thread revision while the branch is generating cannot swallow its answer or leave it busy', async () => {
    let finish!: () => void;
    vi.mocked(quoteBranchesApi.send).mockImplementation(async (_id, _text, emit) => {
      emit({ type: 'snapshot', detail: { ...detail, busy: true } });
      await new Promise<void>(done => { finish = done; });
      emit({ type: 'done', detail });
    });
    const r = renderHook(({ revision }) => useQuoteBranches('s', revision), { initialProps: { revision: 'm1' } });
    await act(() => r.result.current.openAnchor(anchor));
    let pending!: Promise<void>; await act(async () => { pending = r.result.current.send(); await Promise.resolve(); });
    r.rerender({ revision: 'm1|m2' });
    await act(async () => { finish(); await pending; });
    expect(r.result.current.busy).toBe(false); expect(r.result.current.detail?.messages[1]?.content).toBe('以前的回答');
  });
  it('a rejected send cannot erase a question that was never accepted by the server', async () => {
    vi.mocked(quoteBranchesApi.send).mockRejectedValue(new Error('请先配置模型'));
    const r = renderHook(() => useQuoteBranches('s', 'm'));
    await act(() => r.result.current.openAnchor(anchor)); act(() => r.result.current.setDraft('别丢掉这个问题'));
    await act(() => r.result.current.send());
    expect(r.result.current.draft).toBe('别丢掉这个问题'); expect(r.result.current.error).toBe('请先配置模型');
  });
});

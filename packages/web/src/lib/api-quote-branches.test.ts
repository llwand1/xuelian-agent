import { afterEach, expect, it, vi } from 'vitest';
import { quoteBranchesApi } from './api-quote-branches';
afterEach(() => vi.unstubAllGlobals());
it('decodes chunk-split NDJSON and split UTF-8 characters, with a required final snapshot', async () => {
  const bytes = new TextEncoder().encode('{"type":"token","content":"闭包"}\n{"type":"done","detail":{"busy":false}}\n');
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2)); controller.close(); } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
  const emit = vi.fn(); await quoteBranchesApi.send('b', '为什么', emit);
  expect(emit.mock.calls[0]?.[0]).toEqual({ type: 'token', content: '闭包' }); expect(emit).toHaveBeenCalledTimes(2);
});
it('does not mistake an interrupted HTTP stream for a successful completed answer', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"type":"token","content":"半截"}\n')));
  await expect(quoteBranchesApi.send('b', '问', () => {})).rejects.toThrow('连接中断');
});
it('surfaces authorization/model failures rather than parsing them as tokens', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"分支不存在"}', { status: 404 })));
  await expect(quoteBranchesApi.send('other', '问', () => {})).rejects.toThrow('分支不存在');
});

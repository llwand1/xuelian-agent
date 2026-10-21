// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureVideoFrame } from './video-capture';
const host = { sent: [] as string[], handlers: [] as Array<(e: { data: string }) => void> };
afterEach(() => { delete (window as unknown as { chrome?: unknown }).chrome; host.sent = []; host.handlers = []; vi.useRealTimers(); });
function setup() {
  (window as unknown as { chrome: unknown }).chrome = { webview: { postMessage: (s: string) => host.sent.push(s), addEventListener: (_: string, f: (e: { data: string }) => void) => host.handlers.push(f), removeEventListener: (_: string, f: (e: { data: string }) => void) => { host.handlers = host.handlers.filter(h => h !== f); } } };
  const frame = document.createElement('iframe'); frame.getBoundingClientRect = () => new DOMRect(10,20,320,180); return frame;
}
it('correlates native current-frame responses, cleans listeners, and never accepts an unrelated screenshot', async () => {
  const frame = setup(), p = captureVideoFrame(frame);
  const req = JSON.parse(host.sent[0]!.slice('sb-video:capture:'.length)); expect(frame.dataset.sbVideoCapture).toBe(req.id);
  host.handlers.forEach(f => f({ data: 'sb-video:frame-result:' + JSON.stringify({ id: 'another', error: 'old' }) }));
  host.handlers.forEach(f => f({ data: 'sb-video:frame-result:' + JSON.stringify({ id: req.id, dataUrl: 'data:image/png;base64,YQ==', name: 'frame.png', width: 320, height: 180 }) }));
  expect(await p).toMatchObject({ scope: 'player', width: 320 }); expect(host.handlers).toHaveLength(0); expect(frame.dataset.sbVideoCapture).toBeUndefined();
});
it('times out or cancels without keeping native listeners', async () => {
  vi.useFakeTimers(); const frame = setup(), c = new AbortController(), p = captureVideoFrame(frame, c.signal);
  const rejected = expect(p).rejects.toThrow('取消'); c.abort(); await rejected; expect(host.handlers).toHaveLength(0);
  const next = captureVideoFrame(frame); const timeout = expect(next).rejects.toThrow('超时'); vi.advanceTimersByTime(12_001); await timeout; expect(host.handlers).toHaveLength(0);
});

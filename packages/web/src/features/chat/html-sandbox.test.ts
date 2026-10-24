import { describe, expect, it } from 'vitest';
import { buildHtmlSandbox, HTML_CSP, HTML_MAX_BYTES, htmlSourceError, readHtmlReport } from './html-sandbox';
import { isHtmlRunning, MAX_HTML_RUNS, startHtmlRun, stopHtmlRun, subscribeHtmlRuns } from './html-runs';

describe('HTML document boundary', () => {
  it('places trusted CSP/bootstrap before unmodified fragments and full documents', () => {
    for (const code of ['<style>b{color:red}</style><b>片段</b><script>let x=1</script>', '<!doctype html><html><head><title>完整页</title></head><body>全文</body></html>']) {
      const doc = buildHtmlSandbox(code, 'run-1', 'https://study.example');
      expect(doc).toContain(`<body>${code}</body>`);
      expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf(code));
      expect(doc.indexOf('const runId=')).toBeLessThan(doc.indexOf(code));
      for (const directive of ['default-src', 'connect-src', 'frame-src', 'worker-src', 'form-action', 'base-uri']) expect(doc).toContain(`${directive} 'none'`);
      expect(HTML_CSP).not.toMatch(/https?:|unsafe-eval|allow-same-origin/);
      expect(doc).toContain('prefers-reduced-motion');
    }
  });
  it('escapes script literals, limits UTF-8 bytes rather than characters, and never truncates executable HTML', () => {
    const doc = buildHtmlSandbox('<p>ok</p>', '</script><img>', 'https://x.example/</script>');
    expect(doc.match(/<\/script>/g)).toHaveLength(1);
    expect(doc).toContain('\\u003c/script>');
    expect(htmlSourceError('a'.repeat(HTML_MAX_BYTES))).toBe('');
    expect(htmlSourceError('你'.repeat(Math.floor(HTML_MAX_BYTES / 3) + 1))).toContain('128 KiB');
    expect(() => buildHtmlSandbox('x'.repeat(HTML_MAX_BYTES + 1), 'run', 'https://x')).toThrow('128 KiB');
    expect(htmlSourceError(' \n')).toContain('为空');
  });
  it('accepts only versioned per-run presentation messages and clamps sizes/errors', () => {
    const good = { type: 'sb-html-card', v: 1, runId: 'r', event: 'resize', height: 999999 };
    expect(readHtmlReport(good, 'r')).toEqual({ event: 'resize', height: 720 });
    expect(readHtmlReport({ ...good, height: 1 }, 'r')).toEqual({ event: 'resize', height: 180 });
    for (const value of [null, 'text', {}, { ...good, type: 'sb-desktop:capture' }, { ...good, v: 2 },
      { ...good, runId: 'old' }, { ...good, event: 'tool' }, { ...good, height: Infinity }, { ...good, height: -1 }, { ...good, height: '20' }]) expect(readHtmlReport(value, 'r')).toBeNull();
    expect(readHtmlReport({ ...good, event: 'ready' }, 'r')).toEqual({ event: 'ready' });
    expect(readHtmlReport({ ...good, event: 'error', message: 'x'.repeat(500) }, 'r')).toEqual({ event: 'error', message: 'x'.repeat(240) });
  });
});

describe('page-wide running frame budget', () => {
  it('evicts oldest, refreshes order on replay, and releases/unsubscribes without affecting other cards', () => {
    const ids = ['budget-a', 'budget-b', 'budget-c'];
    let notifications = 0;
    const off = subscribeHtmlRuns(() => notifications++);
    try {
      expect(MAX_HTML_RUNS).toBe(2);
      startHtmlRun(ids[0]!); startHtmlRun(ids[1]!); startHtmlRun(ids[0]!); startHtmlRun(ids[2]!);
      expect(ids.map(isHtmlRunning)).toEqual([true, false, true]);
      expect(notifications).toBe(4);
      off(); stopHtmlRun(ids[0]!);
      expect(isHtmlRunning(ids[2]!)).toBe(true); expect(notifications).toBe(4);
    } finally { off(); ids.forEach(stopHtmlRun); }
  });
});

import { describe, expect, it } from 'vitest';
import { inspectHtml } from './html-preflight';

describe('HTML preflight uses parsers, not execution or host DOM', () => {
  it('catches the real repeated-var closure regression and gives original HTML lines', () => {
    const code = '<div id="bars"></div>\n<script>\n(function(){\nvar target=document.getElementById("bars");\nfunction animate(){target.querySelectorAll("i");}\nsetTimeout(animate,0);\nvar target=10;\n})();\n</script>';
    const issues = inspectHtml(code);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('target');
    expect(issues[0]?.message).toContain('4、7');
    expect(inspectHtml(code.replace('var target=10;', 'const targetValue=10;'))).toEqual([]);
  });
  it.each([
    '<script>const a = ;</script>', '<script>let x=1;let x=2;</script>',
    '<script>function broken( {</script>', '<script>const f=()=>{</script>',
    '<script>const bad="unterminated</script>', '<script>const x=1;',
  ])('rejects syntax/truncation without running: %s', code => {
    expect(inspectHtml(code).some(i => i.severity === 'error')).toBe(true);
  });
  it.each([
    '<p>纯静态</p>', '<script>const f=()=>1; f();</script>',
    '<script>const x=1;{const x=2;}</script>',
    '<script>(function(){const x=1;})();(function(){const x=2;})();</script>',
    '<script>for(var i=0;i<3;i++){} var label="ok";</script>',
    '<script type="application/json">{bad json, not executable}</script>',
    '<template><script>this is an inert template</script></template>',
    '<script type="module">const x=await Promise.resolve(1);</script>',
    '<!doctype html><html><head><title>完整文档</title></head><body><script>const n=1;</script></body></html>',
    '<!-- <script>not code</script> --><textarea><script>not code</script></textarea>',
  ])('accepts static, modern, scoped or inert content: %s', code => expect(inspectHtml(code)).toEqual([]));
  it('does not confuse strings/comments/regexp or an uninitialized redeclaration with a second initialized binding', () => {
    expect(inspectHtml('<script>var x=1;var x; const s="var x=3";const re=/var x=4/;/*var x=5;*/</script>')).toEqual([]);
  });
  it('warns about unavailable dependencies without pretending static analysis is execution', () => {
    const issues = inspectHtml('<link rel="stylesheet" href="https://example.invalid/x.css">\n<script src="https://example.invalid/x.js"></script>');
    expect(issues).toHaveLength(2);
    expect(issues.every(i => i.severity === 'warning')).toBe(true);
  });
  it('does not evaluate arbitrary code and bounds diagnostics', () => {
    expect(inspectHtml('<script>throw Error("must never execute");globalThis.secret=1;</script>')).toEqual([]);
    const many = inspectHtml('<script>const x=;</script>'.repeat(100));
    expect(many.length).toBeLessThanOrEqual(8);
  });
  it('checks inline handler syntax without rejecting return statements', () => {
    expect(inspectHtml('<button onclick="return false">OK</button>')).toEqual([]);
    expect(inspectHtml('<button onclick="if (">bad</button>')[0]?.message).toContain('事件 onclick 语法错误');
  });
  it('detects classic-script lexical conflicts but keeps module/IIFE scopes separate', () => {
    expect(inspectHtml('<script>const x=1;</script>\n<script>const x=2;</script>')[0]?.severity).toBe('error');
    expect(inspectHtml('<script>let x=1;</script><script>var x=2;</script>')[0]?.message).toContain('冲突');
    expect(inspectHtml('<script type="module">const x=1;</script><script type="module">const x=2;</script>')).toEqual([]);
    expect(inspectHtml('<script>(()=>{const x=1;})();</script><script>(()=>{const x=2;})();</script>')).toEqual([]);
  });
});

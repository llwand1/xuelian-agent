/** Pure parsers only: never attach model HTML to the host DOM or execute its JS. */
import { parse as parseHtml, type DefaultTreeAdapterMap } from 'parse5';
import { parse as parseJs } from 'acorn';
import { analyze } from 'eslint-scope';
import type { Program } from 'estree';

export interface HtmlIssue { severity: 'error' | 'warning'; message: string }
const SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript', 'module']);

export function inspectHtml(code: string): HtmlIssue[] {
  const issues: HtmlIssue[] = [];
  const add = (severity: HtmlIssue['severity'], message: string) => {
    if (issues.length < 8 && !issues.some(i => i.message === message)) issues.push({ severity, message });
  };
  try {
    const tree = parseHtml(code, { sourceCodeLocationInfo: true });
    const pending: DefaultTreeAdapterMap['node'][] = [tree];
    const globals = new Map<string, { lexical: boolean; line: number }>();
    let scriptCount = 0, handlerCount = 0;
    while (pending.length) {
      const node = pending.pop()!;
      if ('childNodes' in node) pending.push(...node.childNodes.slice().reverse());
      // Template content is deliberately not traversed: its scripts are inert until inserted.
      if (!('tagName' in node)) continue;
      const attr = (name: string) => node.attrs.find(a => a.name === name)?.value ?? '';
      const location = node.sourceCodeLocation;
      const line = location?.startLine ?? 1;
      for (const attribute of node.attrs) {
        if (!/^on[a-z]+$/.test(attribute.name) || !attribute.value || ++handlerCount > 64) continue;
        try { parseJs(attribute.value, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }); }
        catch (err) {
          if (err instanceof SyntaxError) add('error', `事件 ${attribute.name} 语法错误（HTML 第 ${location?.attrs?.[attribute.name]?.startLine ?? line} 行）：${err.message.slice(0, 120)}`);
        }
      }
      if ((node.tagName === 'script' && attr('src')) || (node.tagName === 'link' && /\bstylesheet\b/i.test(attr('rel')) && attr('href'))) {
        add('warning', `HTML 第 ${line} 行依赖外部脚本或样式；沙箱会阻止加载，请改成全部内联的自包含卡片。`);
      }
      if (node.tagName !== 'script' || attr('src') || !SCRIPT_TYPES.has(attr('type').trim().toLowerCase())) continue;
      if (++scriptCount > 32) { add('error', '脚本过多，请合并为不超过 32 个内联脚本。'); break; }
      const start = location?.startTag?.endOffset;
      const end = location?.endTag?.startOffset;
      if (start === undefined || end === undefined) { add('error', `HTML 第 ${line} 行的 script 标签未闭合。`); continue; }
      const script = code.slice(start, end);
      const offset = code.slice(0, start).split('\n').length - 1;
      try {
        const sourceType = attr('type').trim().toLowerCase() === 'module' ? 'module' : 'script';
        const ast = parseJs(script, { ecmaVersion: 'latest', sourceType, locations: true, ranges: true });
        const scopes = analyze(ast as unknown as Program, { ecmaVersion: 2022, sourceType, optimistic: true, ignoreEval: true });
        if (sourceType === 'script') for (const variable of scopes.globalScope?.variables ?? []) {
          if (!variable.defs.length) continue;
          const lexical = variable.defs.some(d => d.type === 'ClassName' || (d.type === 'Variable' && d.parent?.type === 'VariableDeclaration' && d.parent.kind !== 'var'));
          const currentLine = offset + (variable.defs[0]?.name.loc?.start.line ?? 1);
          const prior = globals.get(variable.name);
          if (prior && (prior.lexical || lexical)) add('error', `全局变量 ${variable.name.slice(0, 50)} 在多个脚本中冲突（HTML 第 ${prior.line}、${currentLine} 行），请用各自的局部 IIFE 隔离。`);
          globals.set(variable.name, { lexical, line: currentLine });
        }
        for (const scope of scopes.scopes) for (const variable of scope.variables) {
          const declarations = variable.defs.filter(d => d.type === 'Variable' && d.node.type === 'VariableDeclarator' && d.node.init);
          if (declarations.length > 1) {
            const lines = declarations.map(d => offset + (d.name.loc?.start.line ?? 1));
            add('warning', `变量 ${variable.name.slice(0, 50)} 在同一作用域重复初始化（HTML 第 ${lines.join('、')} 行），异步回调可能读到被覆盖的值；建议改用不同名称的 const/let。`);
          }
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          const loc = (err as SyntaxError & { loc?: { line: number; column: number } }).loc;
          add('error', `脚本语法错误（HTML 第 ${offset + (loc?.line ?? 1)} 行）：${err.message.replace(/\s*\(\d+:\d+\)$/, '').slice(0, 140)}`);
        } else add('warning', '静态检查未能完成；运行时仍由隔离沙箱检查，请勿将此视为验证通过。');
      }
    }
  } catch { add('warning', 'HTML 静态检查未能完成，请简化卡片。'); }
  return issues;
}

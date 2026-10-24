/** Inline HTML is untrusted code. Only the iframe receives it; never parse it in the host DOM. */
export type HtmlMode = 'disabled' | 'manual' | 'auto';
export const HTML_MAX_BYTES = 128 * 1024;
export const HTML_MIN_HEIGHT = 180;
export const HTML_MAX_HEIGHT = 720;
export const HTML_MESSAGE_TYPE = 'sb-html-card';
export const HTML_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
  'img-src data:', 'font-src data:', "connect-src 'none'", "frame-src 'none'",
  "worker-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

/** JSON literals go into a trusted script, never interpolate the model's HTML into JavaScript. */
const literal = (s: string) => JSON.stringify(s).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function htmlSourceError(code: string): string {
  if (!code.trim()) return 'HTML 内容为空。';
  if (code.length > HTML_MAX_BYTES || new TextEncoder().encode(code).length > HTML_MAX_BYTES) return 'HTML 超出 128 KiB 上限，请生成更精简的卡片。';
  return '';
}

/** The first policy belongs to the trusted head. Full document html/head/body tags are
 * merged/ignored by the browser when used as input inside this wrapper.
 * CSP sandbox is NOT supported in meta: isolation comes from the iframe attribute.
 * CSP restricts resource/connection APIs, not all self-navigation or CPU consumption.
 */
export function buildHtmlSandbox(code: string, runId: string, parentOrigin: string): string {
  const error = htmlSourceError(code);
  if (error) throw new Error(error);
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}">
<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html{color-scheme:light;background:#fff}body{margin:0;padding:16px;font:16px/1.5 system-ui,sans-serif;color:#18202e;overflow-wrap:anywhere}*,*::before,*::after{box-sizing:border-box}img,svg,canvas{max-width:100%}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}</style>
<script>(()=>{
  const runId=${literal(runId)},host=${literal(parentOrigin)},send=parent.postMessage.bind(parent);
  const report=(event,extra={})=>send({type:'sb-html-card',v:1,runId,event,...extra},host);
  let timer=0;
  const measure=()=>{if(timer)return;timer=setTimeout(()=>{timer=0;
    const b=document.body;if(!b)return;
    report('resize',{height:Math.max(b.scrollHeight,b.getBoundingClientRect().height)});
  },100);};
  addEventListener('error',()=>report('error',{message:'卡片脚本或资源运行失败，请查看源码后重播。'}));
  addEventListener('unhandledrejection',()=>report('error',{message:'卡片脚本发生未处理的错误。'}));
  addEventListener('securitypolicyviolation',()=>report('error',{message:'已阻止卡片加载外部资源或使用受限能力。'}));
  document.addEventListener('click',e=>{
    const a=e.target instanceof Element?e.target.closest('a[href]'):null;if(!a)return;
    e.preventDefault();const href=a.getAttribute('href')||'';
    if(href.startsWith('#')){try{document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();}catch{}return;}
    report('error',{message:'卡片内不支持外部链接或页面跳转。'});
  },true);
  document.addEventListener('submit',e=>e.preventDefault(),true);
  addEventListener('DOMContentLoaded',()=>{
    report('ready');measure();
    new ResizeObserver(measure).observe(document.body);
    new MutationObserver(measure).observe(document.body,{childList:true,subtree:true,characterData:true});
  },{once:true});
  addEventListener('resize',measure);
})();</script></head><body>${code}</body></html>`;
}

export type HtmlReport = { event: 'ready' } | { event: 'resize'; height: number } | { event: 'error'; message: string };

/** Origin null is NOT identity. The caller must also match event.source to its exact frame. */
export function readHtmlReport(value: unknown, runId: string): HtmlReport | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  if (d.type !== HTML_MESSAGE_TYPE || d.v !== 1 || d.runId !== runId) return null;
  if (d.event === 'ready') return { event: 'ready' };
  if (d.event === 'resize' && typeof d.height === 'number' && Number.isFinite(d.height) && d.height >= 0) {
    return { event: 'resize', height: Math.max(HTML_MIN_HEIGHT, Math.min(HTML_MAX_HEIGHT, Math.ceil(d.height))) };
  }
  if (d.event === 'error' && typeof d.message === 'string') return { event: 'error', message: d.message.slice(0, 240) || '卡片运行失败。' };
  return null;
}

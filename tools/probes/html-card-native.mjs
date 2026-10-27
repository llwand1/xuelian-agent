/** Real WebView2 test using the exact production document builder, not a copied sandbox template. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { demoHtml, attackHtml, clashHtml, repairedHtml } from './html-card-fixtures.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const evidence = resolve(process.env.SB_HTML_NATIVE_EVIDENCE ?? join(root, '.runtime', `html-card-native-${Date.now()}`));
mkdirSync(evidence, { recursive: true });
const builder = join(evidence, 'document-builder.mjs');
buildSync({ entryPoints: [join(root, 'packages/web/src/features/chat/html-sandbox.ts')], outfile: builder, bundle: true, platform: 'node', format: 'esm' });
const { buildHtmlSandbox } = await import(pathToFileURL(builder).href);
let base; const requests = [];
const server = createServer((req, res) => {
  if (req.url.includes('/__html_probe/')) { requests.push(req.url); res.writeHead(204).end(); return; }
  const staticOnly = req.url === '/static';
  const code = staticOnly ? '<h2>静态后备</h2><script>window.staticScriptRan=true;</script>' : req.url === '/runtime' ? clashHtml : req.url === '/repaired' ? repairedHtml : req.url === '/attack' ? attackHtml(base) : demoHtml;
  const doc = buildHtmlSandbox(code, 'native-1', base, staticOnly);
  const attr = doc.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body style="margin:0;background:#eaf1f7"><h1 style="font:20px system-ui;padding:12px">StudentBuddy · WebView2 内联沙箱验证</h1>
<script>window.fixtureReady=false;window.fixtureLoaded=false;addEventListener('message',e=>{if(e.source!==document.querySelector('iframe')?.contentWindow)return;if(e.data?.type==='sb-html-card'&&e.data.event==='ready')window.fixtureReady=true;if(e.data?.type==='sb-html-card'&&e.data.event==='warning')window.fixtureWarning=e.data.message;if(e.data?.type==='html-fixture-result')window.fixtureResult=e.data.result;});</script>
<iframe title="HTML test" sandbox="${staticOnly ? '' : 'allow-scripts'}" onload="window.fixtureLoaded=true" referrerpolicy="no-referrer" style="width:100%;height:520px;border:0" srcdoc="${attr}"></iframe></body></html>`);
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const launcher = process.env.SB_LAUNCHER ?? join(process.env.LOCALAPPDATA, 'Programs/StudentBuddy/StudentBuddy.exe');
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'tools/desktop/html-card-smoke.ps1'), '-Launcher', launcher, '-Url', base, '-Evidence', evidence], { windowsHide: true, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  if (code || requests.length) throw Error(`Native sandbox failed: exit=${code}, requests=${JSON.stringify(requests)}`);
  console.log('PASS Native CSP prevented all probe network requests');
} catch (e) { console.error(e); process.exitCode = 1; }
finally { writeFileSync(join(evidence, 'requests.json'), JSON.stringify(requests)); console.log(`Evidence: ${evidence}`); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

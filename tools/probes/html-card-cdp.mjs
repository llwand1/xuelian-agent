/** Real production chat/SSE/persistence/browser test, isolated DB and deterministic local model.
 * npm run build; SB_PLAYWRIGHT_MODULE=file:///.../playwright/index.mjs node tools/probes/html-card-cdp.mjs
 * No personal DB, actual model keys, installed application changes, or deployment.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoHtml, attackHtml } from './html-card-fixtures.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const evidence = resolve(process.env.SB_HTML_EVIDENCE ?? join(root, '.runtime', `html-card-${Date.now()}`));
mkdirSync(evidence, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [], requests = [];
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) throw Error(`${name}: ${JSON.stringify(detail)}`); };
let base, fixture = 'demo', release, server, browser, page;
const model = createServer((req, res) => {
  let body = ''; req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    if (!parsed.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] })); return; }
    const code = fixture === 'attack' ? attackHtml(base) : fixture === 'error' ? '<title>错误卡片</title><script>throw Error("fixture")</script>' : demoHtml;
    const answer = `下面是一个可直接操作的实验。\n\n\`\`\`html\n${code}\n\`\`\`\n\n`;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const token = content => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
    token(answer);
    release = () => {
      token('试着调节滑块，观察变化。');
      res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
      release = null;
    };
  });
});
try {
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  const port = 19500 + Math.floor(Math.random() * 400); base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, 'packages/server/dist/index.js')], { cwd: root, windowsHide: true, stdio: 'ignore', env: {
    ...process.env, SB_PORT: String(port), SB_HOST: '127.0.0.1', SB_DATA_DIR: join(evidence, `data-${Date.now()}`),
    SB_REQUIRE_AUTH: '0', SB_WEB_DIST: join(root, 'packages/web/dist'), SB_PLATFORM_API_KEY: '',
  } });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(200); }
  check('isolated production server ready', ready);
  const json = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: base }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw Error(`${method} ${path}: ${r.status} ${await r.text()}`); return r.json();
  };
  const provider = await json('POST', '/api/providers', { name: 'HTML local fixture', type: 'openai', baseUrl: `http://127.0.0.1:${model.address().port}/v1`, apiKey: 'synthetic-not-real', streamMode: 'stream' });
  await json('PUT', '/api/providers/roles/explain', { providerId: provider.id, model: 'html-fixture' });
  const { chromium } = await import(process.env.SB_PLAYWRIGHT_MODULE ?? 'playwright');
  const executablePath = process.env.SB_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] });
  page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (req.url().includes('/__html_probe/')) requests.push(req.url()); });
  await page.addInitScript(() => { window.addEventListener('message', e => { if (e.data?.type === 'html-fixture-result') window.htmlFixtureResult = e.data.result; }); });
  await page.goto(base);
  const input = page.locator('.chat-composer textarea');
  await input.waitFor({ timeout: 15000 });
  const send = async text => {
    await input.fill(text); await input.press('Enter');
    await page.locator('.streaming .html-card').waitFor({ timeout: 20000 });
    check('closed stable HTML still does not run during streaming', await page.locator('.streaming iframe').count() === 0);
    check('local deterministic upstream is held before done', typeof release === 'function');
    release();
    // Manual card reading intentionally suspends follow-latest; scroll the next card into view.
    await page.locator('.html-card').last().scrollIntoViewIfNeeded();
  };
  await send('演示弹簧振子');
  const frameElement = page.locator('.html-card-frame').last();
  await frameElement.waitFor({ timeout: 15000 });
  const frame = await (await frameElement.elementHandle()).contentFrame();
  await frame.getByRole('button', { name: '暂停实验' }).waitFor();
  await page.waitForTimeout(300);
  check('full-document fixture runs inline with canvas', await frame.locator('canvas').count() === 1 && await frame.evaluate(() => window.fixtureStarted) === 1);
  const x1 = await frame.locator('.bob').evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(250);
  check('CSS animation actually moves', x1 !== await frame.locator('.bob').evaluate(el => getComputedStyle(el).transform));
  await frame.getByRole('button', { name: '暂停实验' }).click();
  check('local interactive controls work', await frame.locator('#state').textContent() === '已暂停');
  await frame.locator('#amplitude').fill('70');
  check('range changes amplitude, not object size', await frame.locator('#value').textContent() === '70'
    && await frame.locator('.bob').evaluate(el => getComputedStyle(el).getPropertyValue('--amplitude').trim() === '70px' && getComputedStyle(el).width === '36px'));
  await page.locator('.html-card').last().getByRole('button', { name: '展开', exact: true }).click();
  const header = await page.locator('.html-card-head').last().boundingBox();
  check('manual expand keeps header readable and state intact', header.y >= 0 && header.y + header.height <= 1000 && await frame.locator('#state').textContent() === '已暂停' && await frame.locator('#value').textContent() === '70', header);
  await page.locator('.html-card').last().getByRole('button', { name: '收起', exact: true }).click();
  const bounds = await frameElement.boundingBox(); check('auto height is bounded and usable', bounds.height >= 250 && bounds.height <= 720, bounds);
  if (await page.locator('.guide-pop').isVisible()) await page.locator('.guide-pop').press('Escape');
  await page.screenshot({ path: join(evidence, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(350);
  if (await page.locator('.guide-pop').isVisible()) await page.locator('.guide-pop').press('Escape');
  await page.locator('.html-card').last().scrollIntoViewIfNeeded();
  check('390px viewport has no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('card fits mobile viewport', (await page.locator('.html-card').last().boundingBox()).width <= 390);
  await page.screenshot({ path: join(evidence, 'mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1200, height: 1000 });
  const sessions = await json('GET', '/api/sessions');
  const session = sessions.find(s => s.title.includes('弹簧')) ?? sessions[0];
  const messages = await json('GET', `/api/sessions/${session.id}/messages`);
  check('HTML source persisted via unchanged message storage', messages.some(m => m.role === 'assistant' && m.content.includes(demoHtml)));
  await page.reload();
  await page.locator('.sb-session').filter({ hasText: session.title }).first().click();
  await page.getByRole('button', { name: '运行卡片', exact: true }).waitFor();
  check('restored history never autoplays', await page.locator('.html-card-frame').count() === 0);
  await page.getByRole('button', { name: '运行卡片', exact: true }).click();
  await page.frameLocator('.html-card-frame').getByRole('button', { name: '暂停实验' }).waitFor();
  check('history replay starts from initial state', await page.frameLocator('.html-card-frame').locator('#state').textContent() === '运行中');
  await page.locator('.html-card').getByRole('button', { name: '停止', exact: true }).click();
  fixture = 'attack'; await send('验证隔离边界');
  await page.waitForFunction(() => window.htmlFixtureResult);
  const result = await page.evaluate(() => window.htmlFixtureResult);
  check('real opaque sandbox blocks parent DOM/storage/popup/fetch', result.parent && result.storage && result.popup && result.fetch, result);
  await page.waitForTimeout(500);
  check('CSP prevents actual connection/subresource/frame requests', requests.length === 0, requests);
  check('no new browser windows', browser.contexts().every(c => c.pages().length === 1));
  check('forged desktop message did not mutate host', await page.evaluate(() => !document.body.dataset.leaked));
  fixture = 'error'; await send('验证运行错误');
  await page.locator('.html-card-error').last().waitFor();
  check('runtime exception becomes local readable fallback', (await page.locator('.html-card-error').last().textContent()).includes('运行失败'));
  check('normal flow has no unexpected host errors', errors.every(e => e.includes('fixture')), errors);
} catch (error) {
  errors.push(error.stack); console.error(error);
  if (page) await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ checks, errors, requests }, null, 2));
  console.log(`Evidence: ${evidence}`);
  await browser?.close(); server?.kill();
  model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
}

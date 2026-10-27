/** Production UI + real local SSE model + isolated DB; never contacts configured personal models. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const evidence = resolve(process.env.SB_QUOTE_EVIDENCE ?? join(root, '.runtime', `quote-branches-${Date.now()}`));
mkdirSync(evidence, { recursive: true });
const checks = [], requests = [], errors = [], mainCalls = [], branchCalls = [];
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) throw Error(name + ': ' + JSON.stringify(detail)); };
const sleep = ms => new Promise(done => setTimeout(done, ms));
let base, server, browser, page, release, hold = true, serverLog = '';
const mainAnswer = '闭包让函数保留创建时的词法环境。可以把它看成一个背包。\n\n第二处**闭包**用于解释变量生命周期。';
const branchAnswer = 'BRANCH-PRIVATE-MARKER：因为内部函数保留了对词法环境的引用。\n\n**例子**：计数器函数能记住上一次的数值。';
const model = createServer((req, res) => {
  let raw = ''; req.on('data', x => { raw += x; }); req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] })); return; }
    const branch = body.messages.some(m => m.role === 'system' && String(m.content).includes('小窗追问助手'));
    const main = body.messages.some(m => m.role === 'system' && String(m.content).includes('你是 studentbuddy'));
    if (branch) branchCalls.push(body); else if (main) mainCalls.push(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const token = content => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
    const answer = branch ? branchAnswer : main ? mainAnswer : '{}';
    token(answer.slice(0, 32));
    const finish = () => { token(answer.slice(32)); res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); if (release === finish) release = undefined; };
    if (branch && hold) release = finish; else finish();
  });
});
try {
  await new Promise(done => model.listen(0, '127.0.0.1', done));
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port; await new Promise(done => reservation.close(done)); base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, 'packages/server/dist/index.js')], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    SB_PORT: String(port), SB_HOST: '127.0.0.1', SB_DATA_DIR: join(evidence, 'data-' + Date.now()), SB_REQUIRE_AUTH: '0', SB_PLATFORM_API_KEY: '', SB_WEB_DIST: join(root, 'packages/web/dist'),
  } });
  server.stdout.on('data', chunk => { serverLog += chunk; }); server.stderr.on('data', chunk => { serverLog += chunk; });
  let ready = false;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await sleep(200); }
  if (!ready) throw Error('Isolated server failed to start: ' + serverLog.slice(-6000));
  const json = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw Error(`${method} ${path}: ${r.status} ${await r.text()}`); return r.json();
  };
  const provider = await json('POST', '/api/providers', { name: 'Quote fixture', type: 'openai', baseUrl: `http://127.0.0.1:${model.address().port}/v1`, apiKey: 'synthetic-not-real', streamMode: 'stream' });
  await json('PUT', '/api/providers/roles/explain', { providerId: provider.id, model: 'quote-fixture' });
  const { chromium } = await import(process.env.SB_PLAYWRIGHT_MODULE ?? 'playwright');
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.route('**/stats/count.js', route => route.abort());
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (req.url().includes('/api/chat/send') || req.url().includes('/api/quote-branches')) requests.push({ method: req.method(), url: req.url().replace(base, '') }); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const mainInput = page.locator('.chat-composer textarea'); await mainInput.waitFor();
  await mainInput.fill('解释闭包'); await mainInput.press('Enter');
  const source = page.locator('.quote-anchor-content[data-message-id]').first(); await source.waitFor({ timeout: 30000 });
  const messageId = await source.getAttribute('data-message-id');
  check('fresh done event exposes the stable saved answer ID', !!messageId);
  const sessionsBefore = await json('GET', '/api/sessions'), sid = sessionsBefore[0].id;
  const mainBefore = await json('GET', `/api/sessions/${sid}/messages`);
  const mainBytes = JSON.stringify(mainBefore);
  const selectQuote = async (occurrence = 0) => {
    if (await page.locator('.guide-pop').isVisible()) await page.keyboard.press('Escape');
    await source.scrollIntoViewIfNeeded();
    await source.evaluate((element, occurrence) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), nodes = []; let node;
      while ((node = walker.nextNode())) nodes.push(node);
      const text = nodes.map(n => n.textContent).join(''); let at = -1;
      for (let i = 0; i <= occurrence; i++) at = text.indexOf('闭包', at + 1);
      const range = document.createRange(); let offset = 0;
      for (const node of nodes) { const next = offset + node.textContent.length; if (at >= offset && at < next) range.setStart(node, at - offset); if (at + 2 > offset && at + 2 <= next) { range.setEnd(node, at + 2 - offset); break; } offset = next; }
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    }, occurrence);
    await page.locator('.chat-quote-btn').click();
    await page.getByRole('dialog', { name: '小窗分支追问' }).waitFor();
  };
  await mainInput.fill('主线草稿必须保留');
  await selectQuote();
  const popup = page.getByRole('dialog', { name: '小窗分支追问' });
  check('selection opens a popup without modifying the main draft', await mainInput.inputValue() === '主线草稿必须保留');
  check('opening a popup alone makes no model request or empty branch', branchCalls.length === 0 && (await json('GET', `/api/quote-branches?sessionId=${sid}`)).length === 0);
  await popup.getByRole('textbox', { name: '分支追问内容' }).fill('它为什么能够保留变量？');
  await popup.getByRole('button', { name: '发送追问' }).click();
  await popup.getByText('BRANCH-PRIVATE-MARKER', { exact: false }).waitFor();
  check('streaming answer stays inside its own popup', await page.locator('.chat-scroll').getByText('BRANCH-PRIVATE-MARKER', { exact: false }).count() === 0);
  await popup.getByRole('button', { name: '收起分支，保留历史' }).click();
  check('closing does not interrupt the main thread or erase its draft', await popup.count() === 0 && await mainInput.inputValue() === '主线草稿必须保留');
  check('branch model received source context without tools', branchCalls[0].messages.some(m => String(m.content).includes('词法环境')) && !branchCalls[0].tools);
  check('close keeps the in-flight request alive', typeof release === 'function'); release();
  let branch = (await json('GET', `/api/quote-branches?sessionId=${sid}`))[0];
  for (let i = 0; i < 60; i++) { if (!(await json('GET', `/api/quote-branches/${branch.id}`)).busy) break; await sleep(100); }
  check('main messages remain byte-for-byte unchanged', JSON.stringify(await json('GET', `/api/sessions/${sid}/messages`)) === mainBytes);
  const sessionsAfter = await json('GET', '/api/sessions');
  check('no branch appears in session history or bumps the parent recency', JSON.stringify(sessionsAfter) === JSON.stringify(sessionsBefore));
  await page.waitForFunction(() => CSS.highlights?.get('sb-quote-branch')?.size === 1);
  const mark = await page.evaluate(() => { const range = [...CSS.highlights.get('sb-quote-branch')][0], rect = range.getClientRects()[0]; return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: range.toString() }; });
  check('queried original text receives a persistent exact-range highlight', mark.text === '闭包');
  await page.mouse.click(mark.x, mark.y); await popup.waitFor();
  await popup.getByText('BRANCH-PRIVATE-MARKER', { exact: false }).waitFor();
  check('clicking the marked original word reopens its saved conversation', (await popup.textContent()).includes(branchAnswer.split('\n')[0]));
  await page.screenshot({ path: join(evidence, 'desktop.png'), fullPage: true });
  hold = false;
  await popup.getByRole('textbox', { name: '分支追问内容' }).fill('再给一个例子'); await popup.getByRole('button', { name: '发送追问' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.quote-branch-message.assistant').length === 2 && !document.querySelector('.quote-branch-window [aria-busy="true"]'));
  check('follow-ups retain this branch history only', branchCalls[1].messages.some(m => m.role === 'user' && m.content === '它为什么能够保留变量？') && branchCalls[1].messages.some(m => m.role === 'assistant' && m.content.includes('BRANCH-PRIVATE-MARKER')));
  await popup.getByRole('button', { name: '收起分支，保留历史' }).click();
  await selectQuote(1);
  await popup.getByRole('textbox', { name: '分支追问内容' }).fill('这一处有什么不同？'); await popup.getByRole('button', { name: '发送追问' }).click();
  await popup.getByText('BRANCH-PRIVATE-MARKER', { exact: false }).waitFor();
  const branches = await json('GET', `/api/quote-branches?sessionId=${sid}`);
  check('identical words at different positions have distinct hidden branches', branches.length === 2 && branches[0].start !== branches[1].start && branches[0].id !== branches[1].id);
  check('a new branch cannot inherit another branch conversation', !branchCalls[2].messages.some(m => String(m.content).includes('再给一个例子')));
  await popup.getByRole('button', { name: '收起分支，保留历史' }).click();
  await mainInput.fill('继续主线'); await mainInput.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.quote-anchor-content[data-message-id]').length === 2);
  check('subsequent main answers cannot see hidden branch history', !JSON.stringify(mainCalls.at(-1).messages).includes('BRANCH-PRIVATE-MARKER'));
  await page.reload(); await page.locator('.sb-session').filter({ hasText: '解释闭包' }).first().click();
  await page.locator('.quote-branch-links button').first().waitFor();
  check('refresh restores markers without adding session-history entries', await page.locator('.quote-branch-links button').count() === 2 && (await json('GET', '/api/sessions')).length === 1);
  await page.locator('.quote-branch-links button').first().focus(); await page.keyboard.press('Enter'); await popup.waitFor();
  await popup.locator('.quote-branch-message.assistant').nth(1).waitFor();
  check('keyboard-accessible marker restores old answers after reload', await popup.locator('.quote-branch-message.assistant').count() === 2);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  const bounds = await popup.boundingBox(); check('popup fits a 390px mobile viewport', bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, bounds);
  await page.screenshot({ path: join(evidence, 'mobile.png'), fullPage: true });
  hold = true;
  await popup.getByRole('textbox', { name: '分支追问内容' }).fill('刷新后还能保留这次追问吗？'); await popup.getByRole('button', { name: '发送追问' }).click();
  await popup.locator('.quote-branch-message.assistant').nth(2).getByText('BRANCH-PRIVATE-MARKER', { exact: false }).waitFor();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('transport disconnection does not cancel a submitted branch answer', typeof release === 'function'); release();
  for (let i = 0; i < 60; i++) { if (!(await json('GET', `/api/quote-branches/${branch.id}`)).busy) break; await sleep(100); }
  const recovered = await json('GET', `/api/quote-branches/${branch.id}`);
  check('answer completes in branch storage after browser reload', recovered.messages.filter(m => m.role === 'assistant').length === 3 && recovered.messages.at(-1).status === 'complete');
  await page.locator('.sb-session').filter({ hasText: '解释闭包' }).first().click();
  await page.locator('.quote-branch-links button').first().click(); await popup.locator('.quote-branch-message.assistant').nth(2).waitFor();
  await popup.getByRole('textbox', { name: '分支追问内容' }).fill('停止测试'); await popup.getByRole('button', { name: '发送追问' }).click();
  await popup.locator('.quote-branch-message.assistant').nth(3).getByText('BRANCH-PRIVATE-MARKER', { exact: false }).waitFor();
  await popup.getByRole('button', { name: '停止回答' }).click();
  await page.waitForFunction(() => !document.querySelector('.quote-branch-window [aria-busy="true"]'));
  const stopped = await json('GET', `/api/quote-branches/${branch.id}`);
  check('stop affects only this branch and retains partial output', stopped.messages.at(-1).status === 'stopped' && stopped.messages.at(-1).content.includes('BRANCH-PRIVATE-MARKER'));
  check('no unexpected browser runtime errors', errors.length === 0, errors);
} catch (err) {
  errors.push(err.stack); console.error(err);
  if (page) await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(join(evidence, 'server.log'), serverLog);
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ checks, errors, requests, mainRequests: mainCalls.length, branchRequests: branchCalls.length }, null, 2));
  console.log('Evidence: ' + evidence);
  await browser?.close(); server?.kill(); model.closeAllConnections(); await new Promise(done => model.close(done));
}

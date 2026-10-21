/** Production browser regression. Isolated local DB, no user data/model calls.
 * npm run build; SB_PLAYWRIGHT_MODULE=file:///.../playwright/index.mjs node tools/probes/mining-cdp.mjs
 * Optional SB_BROWSER and SB_MINING_SHOTS. Keeps evidence/data, stops only its own processes.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const root = fileURLToPath(new URL('../..', import.meta.url));
const evidence = resolve(process.env.SB_MINING_SHOTS ?? join(root, '.runtime', `mining-check-${Date.now()}`));
mkdirSync(evidence, { recursive: true });
const data = join(evidence, 'data'); mkdirSync(data, { recursive: true });
const port = 19000 + Math.floor(Math.random() * 500), base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [], errors = [];
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`); if (!pass) throw new Error(name); };
let browser, page;
const server = spawn(process.execPath, [join(root, 'packages/server/dist/index.js')], { cwd: root, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, SB_PORT: String(port), SB_HOST: '127.0.0.1', SB_DATA_DIR: data, SB_REQUIRE_AUTH: '0', SB_WEB_DIST: join(root, 'packages/web/dist'), SB_PLATFORM_API_KEY: '' } });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(200); }
  check('isolated production server', ready);
  const lib = [
    ['闭包', '函数与它引用的词法环境的组合'], ['事件循环', '处理异步任务的调度机制'],
    ['原型链', '对象逐级向上查找属性的机制'], ['递归', '函数调用自身解决子问题'],
    ['哈希表', '用哈希函数把键映射到桶'], ['幂等', '重复执行与执行一次具有相同效果'],
    ['互斥锁', '同一时刻只允许一个线程访问共享资源'], ['事务', '作为一个整体提交或回滚的操作集合'],
  ].map(([term, definition]) => ({ term, definition, domain: '计算机' }));
  for (const term of lib) {
    const r = await fetch(`${base}/api/terms`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(term) });
    if (!r.ok) throw new Error(`seed: ${r.status}`);
  }
  // Only our fresh isolated database; never use an inherited data directory.
  const db = new Database(join(data, 'studentbuddy.db'));
  db.prepare("UPDATE term_library SET created_at='2026-09-01T00:00:00.000Z', review_enabled=1").run(); db.close();
  const { chromium } = await import(process.env.SB_PLAYWRIGHT_MODULE ?? 'playwright');
  const executablePath = process.env.SB_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  // Suppress new-term generation for deterministic existing-term regression, no upstream.
  await page.route('**/api/drill/new-terms', route => route.fulfill({ json: { mode: 'empty', items: [] } }));
  await page.goto(base); await page.getByRole('button', { name: '知识矿境', exact: true }).click();
  await page.locator('.mining-canvas').waitFor();
  await page.getByRole('button', { name: '开始动作轮播 E' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.drill-card'));
  await page.locator('.mining-combat-settings > summary').click();
  await page.getByLabel('刷怪间隔（秒）').fill('5');
  await page.getByLabel('动作序列', {exact:true}).fill('ABB');
  await page.getByRole('button',{name:'保存节奏与轮播',exact:true}).click();
  await page.getByText('节奏与轮播已保存。',{exact:true}).waitFor();
  await page.locator('.mining-combat-settings > summary').click();
  check('old continent replaced in real application', await page.locator('.ct-map, .continent-map, .ct-layout').count() === 0 && await page.locator('.mining-canvas').count() === 1);
  const palette = await page.locator('.mining-canvas').evaluate(c => {
    const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, colors = new Set();
    for (let i = 0; i < p.length; i += 4) colors.add(`${p[i]},${p[i + 1]},${p[i + 2]}`); return colors.size;
  });
  check('actual pixel scene rendered', palette > 40, palette);
  await page.waitForTimeout(1100); // let the existing shell's pixel transition finish
  await page.screenshot({ path: join(evidence, 'desktop-world.png'), fullPage: true });
  const canvas = page.locator('.mining-canvas'); await canvas.focus();
  await page.keyboard.down('a'); await page.waitForTimeout(450); await page.keyboard.up('a');
  await page.getByRole('button', { name: '开始动作轮播 E' }).click();
  await page.locator('.drill-opts').waitFor();
  const termFor = async () => {
    const text = await page.locator('.drill-term, .drill-prompt').first().textContent();
    const found = lib.find(t => text === t.term || text === t.definition || text.includes(`${t.term} ——`));
    if (!found) throw new Error(`unknown prompt: ${text}`); return { text, term: found };
  };
  const solve = async () => {
    const { text, term } = await termFor(), opts = page.locator('.drill-opt'), n = await opts.count();
    if (n === 2) await opts.nth(text.includes(term.definition) ? 0 : 1).click();
    else if (n === 4) await opts.filter({ hasText: text === term.term ? term.definition : term.term }).click();
    else { await page.getByLabel('拼写作答').fill(term.term); await page.getByRole('button', { name: /提交/ }).click(); }
    return term;
  };
  const first = await solve(); await page.locator('.drill-detail.ok').waitFor();
  await page.screenshot({ path: join(evidence, 'desktop-hit.png'), fullPage: true });
  await page.waitForFunction(() => !document.querySelector('.drill-detail'));
  check('game advances after a four-second break without spawning another monster', (await page.locator('.mining-live-strip').textContent()).includes('怪物 2/3'));
  const after = await (await fetch(`${base}/api/terms/review/map`)).json();
  check('correct game answer updates actual review ledger', !!after.terms.find(t => t.term === first.term)?.last_reviewed_at);
  await page.getByRole('button', { name: '常规模式', exact: true }).click();
  await solve(); await page.waitForTimeout(850);
  check('judgement reached in shared cadence', await page.locator('.drill-opt').count() === 2);
  await page.screenshot({ path: join(evidence, 'desktop-judge.png'), fullPage: true });
  await solve(); await page.getByLabel('拼写作答').waitFor(); await page.getByLabel('拼写作答').fill('半个草稿');
  const before = (await termFor()).text, draftBefore = await page.getByLabel('拼写作答').inputValue();
  await page.getByRole('button', { name: '游戏模式', exact: true }).click(); await page.getByRole('button', { name: '开始动作轮播 E' }).click();
  const afterSwitch = { prompt: (await termFor()).text, draft: await page.getByLabel('拼写作答').inputValue() };
  check('switch keeps card and spelling draft', afterSwitch.prompt === before && afterSwitch.draft === draftBefore, { before, draftBefore, afterSwitch });
  const markBefore = after.terms.find(t => t.term === first.term)?.last_reviewed_at;
  await page.getByRole('button', { name: /收起题卡/ }).click();
  await page.getByRole('button', { name: '学习伙伴 · 名册与对话' }).click();
  await page.locator('.mining-companions').waitFor();
  await page.getByLabel('伙伴守护词条').waitFor();
  check('real companion roster available without old map', await page.getByLabel('伙伴守护词条').count() === 1);
  await page.getByRole('button', { name: '词条', exact: true }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sb:mining:local:v1')));
  check('movement persisted as terrain state, not learning facts', saved?.player?.x < 46 * 24 && saved.version === 1 && !('answers' in saved));
  await page.getByRole('button', { name: '知识矿境', exact: true }).click(); await page.locator('.mining-canvas').waitFor();
  const afterRestore = await (await fetch(`${base}/api/terms/review/map`)).json();
  check('restoring world does not replay review writes', afterRestore.terms.find(t => t.term === first.term)?.last_reviewed_at === markBefore);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(250); await page.getByRole('button', { name: '开始动作轮播 E' }).click();
    await page.locator('.mining-encounter').waitFor(); await page.waitForTimeout(100);
    const bounds = await page.locator('.mining-encounter').boundingBox();
    check(`${width}px readable encounter visible in viewport`, bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 845, bounds);
    await page.screenshot({ path: join(evidence, `mobile-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /收起题卡/ }).click();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload(); await page.getByRole('button', { name: '知识矿境', exact: true }).click();
  await page.locator('.mining-canvas').waitFor();
  check('reduced motion still playable', await page.getByRole('button', { name: '开始动作轮播 E' }).count() === 1);
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb:drill-open')));
  const waiting = page.getByRole('dialog', { name: '等待时刷词' }); await waiting.waitFor();
  await waiting.locator('.drill-opt').first().waitFor();
  const waitingPrompt = await waiting.locator('.drill-term, .drill-prompt').textContent();
  await waiting.getByRole('button', { name: '游戏模式', exact: true }).click();
  await waiting.getByRole('button', { name: '开始动作轮播 E' }).click();
  await waiting.locator('.mining-encounter').waitFor();
  check('actual waiting window shares unchanged card in game mode', await waiting.locator('.drill-term, .drill-prompt').textContent() === waitingPrompt);
  const windowBox = await waiting.locator('.drill-stage').boundingBox();
  check('mode switch refits game window to viewport', windowBox.x >= 0 && windowBox.x + windowBox.width <= 1281, windowBox);
  await page.screenshot({ path: join(evidence, 'waiting-game.png'), fullPage: true });
  await page.keyboard.press('Escape'); await waiting.waitFor({ state: 'hidden' });
  await page.evaluate(() => window.dispatchEvent(new Event('sb:pomodoro-open')));
  const taskCard = page.getByTestId('daily-task-card'); await taskCard.waitFor();
  await taskCard.getByLabel('启用每日任务').check();
  await taskCard.getByLabel('每天做题').fill('10');
  await taskCard.getByRole('button', { name: '保存每日任务' }).click();
  await taskCard.getByText('已保存', { exact: true }).waitFor();
  const taskProgress = await (await fetch(`${base}/api/pomodoro/task`)).json();
  check('real game and normal answers share daily task progress', taskProgress.answered === 3 && taskProgress.correct === 3 && taskProgress.task.target === 10, taskProgress);
  check('pixel pomodoro icons replace emoji', await page.getByTestId('pixel-pomodoro-icon').count() >= 2 && !(await page.locator('.pomo-card').allTextContents()).join('').includes('🍅'));
  await taskCard.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(evidence, 'daily-task.png'), fullPage: true });
  check('licenses shipped', (await fetch(`${base}/licenses/mining-kenney-CC0.txt`)).ok && (await fetch(`${base}/licenses/mining-tween-MIT.txt`)).ok);
  check('no runtime exceptions', errors.length === 0, errors);
} catch (e) { await page?.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {}); errors.push(e.stack ?? String(e)); console.error(e); process.exitCode = 1; }
finally {
  writeFileSync(join(evidence, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`Evidence: ${evidence}`); await browser?.close(); server.kill();
}

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
  await page.goto(base); await page.getByRole('button', {name:'知识矿境',exact:true}).click();
  const canvas=page.locator('.mining-canvas'),cast=page.getByRole('button',{name:'施法 E',exact:true});await canvas.waitFor();
  await page.getByRole('button',{name:'矿境设置',exact:true}).click();await page.locator('.mining-combat-settings>summary').click();
  await page.getByLabel('刷怪间隔（秒）').fill('5');await page.getByRole('button',{name:'保存节奏与轮播'}).click();await page.getByRole('button',{name:'返回矿境 ×'}).click();
  const coverage=async()=>{
    const c=await canvas.boundingBox();let area=0;
    for(const selector of ['.mining-hotbar','.mining-vitals','.mining-action-dock']){const b=await page.locator(selector).boundingBox();area+=b.width*b.height;}
    return {fraction:area/(c.width*c.height),canvas:c};
  };
  check('no permanent battle panel, duplicate status strip or instruction wall',await page.locator('.mining-battle-top,.mining-live-strip,.mining-hud,.mining-hint').count()===0);
  let metrics=await coverage();check('desktop HUD occupies less than twelve percent of the scene',metrics.fraction<.12,metrics);
  check('real health uses ten original pixel hearts rather than browser progress bars',await page.locator('.mining-heart').count()===10&&await page.locator('.mining-vitals progress').count()===0);
  await page.waitForTimeout(5500);await page.screenshot({path:join(evidence,'desktop-world.png'),fullPage:true});
  await canvas.focus();await page.keyboard.down('a');await page.waitForTimeout(350);await page.keyboard.up('a');
  await cast.click();await page.locator('.drill-opts').waitFor();
  const termFor=async()=>{const text=await page.locator('.drill-term,.drill-prompt').first().textContent();const term=lib.find(t=>text===t.term||text===t.definition||text.includes(`${t.term} ——`));if(!term)throw Error('unknown synthetic prompt');return {term,text};};
  const solve=async()=>{const {term,text}=await termFor(),opts=page.locator('.drill-opt'),n=await opts.count();if(n===2)await opts.nth(text.includes(term.definition)?0:1).click();else if(n===4)await opts.filter({hasText:text===term.term?term.definition:term.term}).click();else{await page.getByLabel('拼写作答').fill(term.term);await page.getByRole('button',{name:/提交/}).click();}return term;};
  let box=await canvas.boundingBox(),dock=await page.locator('.mining-question-dock').boundingBox();
  check('question is below, not over, the live scene',dock.y>=box.y+box.height-1&&box.height>=280,{box,dock});
  const original=(await termFor()).text;
  await page.getByRole('button',{name:/继续探索/}).click();await page.waitForTimeout(300);
  check('continue exploring actually closes an unanswered card',await page.locator('.mining-question-dock').count()===0);
  await cast.focus();await page.keyboard.press('Enter');await page.locator('.drill-opts').waitFor();
  check('native Enter on the fixed cast button reopens the same locked question',(await termFor()).text===original);
  const first=await solve();await page.locator('.drill-detail.ok').waitFor();await page.waitForTimeout(80);await page.screenshot({path:join(evidence,'desktop-hit.png'),fullPage:true});
  const after=await(await fetch(base+'/api/terms/review/map')).json();check('correct action records a real review',!!after.terms.find(t=>t.term===first.term)?.last_reviewed_at);
  const counts=await(await fetch(base+'/api/pomodoro/task')).json();
  const back=page.getByRole('button',{name:/继续探索/});await back.focus();await page.keyboard.press('Enter');
  await page.waitForTimeout(4300);check('continue exploring closes reveal during cooldown and stays closed',await page.locator('.mining-question-dock').count()===0);
  await cast.click();await page.locator('.drill-card').waitFor();await page.getByRole('button',{name:/跳过本轮/}).click();await page.locator('.drill-detail.cut').waitFor();
  const skipped=await(await fetch(base+'/api/pomodoro/task')).json();check('skipping does not fabricate a daily answer',counts.answered===skipped.answered);
  await page.getByRole('button',{name:/继续探索/}).click();await page.waitForTimeout(4300);await cast.click();await page.locator('.drill-card').waitFor();
  check('shared judgement question remains available',await page.locator('.drill-opt').count()===2);await solve();
  await page.getByRole('button',{name:/继续探索/}).click();await page.waitForTimeout(4300);await cast.click();await page.getByLabel('拼写作答').waitFor();
  await page.getByLabel('拼写作答').fill('半');const spelling=(await termFor()).text;
  await page.getByRole('button',{name:/继续探索/}).click();await cast.click();
  check('closing the dock retains the spelling draft',await page.getByLabel('拼写作答').inputValue()==='半'&&(await termFor()).text===spelling);
  await page.getByRole('button',{name:'常规模式',exact:true}).click();check('normal mode still uses the same card and draft',await page.getByLabel('拼写作答').inputValue()==='半'&&(await termFor()).text===spelling);
  await page.getByRole('button',{name:'游戏模式',exact:true}).click();await page.waitForTimeout(5400);await cast.click();await page.getByLabel('拼写作答').waitFor();
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.waitForTimeout(200);
    metrics=await coverage();box=await canvas.boundingBox();dock=await page.locator('.mining-question-dock').boundingBox();
    check(`${width}px scene stays at least 280px and questions do not cover it`,box.height>=280&&dock.y>=box.y+box.height-1,{box,dock});
    check(`${width}px HUD stays under twenty percent`,metrics.fraction<.20,metrics.fraction);
    const b=await cast.boundingBox();check(`${width}px fixed cast stays within the viewport`,b.x>=0&&b.x+b.width<=width+1,b);
    await page.getByRole('button',{name:/继续探索/}).click();await cast.click();await page.getByLabel('拼写作答').waitFor();
    check(`${width}px continue and resume retains draft`,await page.getByLabel('拼写作答').inputValue()==='半');
    await page.waitForTimeout(180);
    check(`${width}px question has visible content rather than an empty/faded card`,await page.locator('.mining-encounter .drill-card').evaluate(el=>Number(getComputedStyle(el).opacity)>.95&&el.getBoundingClientRect().height<400));
    await page.screenshot({path:join(evidence,`mobile-${width}.png`),fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:/继续探索/}).click();
  await page.getByRole('button',{name:'矿境设置',exact:true}).click();await page.keyboard.press('Escape');check('settings closes with Escape and reduced motion remains playable',await page.locator('.mining-menu').count()===0&&await cast.isEnabled());
  await page.screenshot({path:join(evidence,'reduced-world.png'),fullPage:true});
  await page.getByRole('button',{name:'新对话',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sb:drill-open')));
  const waiting=page.getByRole('dialog',{name:'等待时刷词'});await waiting.waitFor();
  await waiting.getByRole('button',{name:'游戏模式',exact:true}).click();
  await waiting.getByRole('button',{name:'矿境设置',exact:true}).click();await waiting.locator('.mining-combat-settings>summary').click();
  await waiting.getByLabel('刷怪间隔（秒）').fill('5');await waiting.getByRole('button',{name:'保存节奏与轮播'}).click();await waiting.getByRole('button',{name:'返回矿境 ×'}).click();
  await page.waitForTimeout(5300);await waiting.getByRole('button',{name:'施法 E',exact:true}).click();await waiting.locator('.drill-card').waitFor();
  box=await waiting.locator('.mining-canvas').boundingBox();dock=await waiting.locator('.mining-question-dock').boundingBox();
  check('waiting game also docks questions outside the world',dock.y>=box.y+box.height-1);
  await waiting.getByRole('button',{name:/继续探索/}).click();check('waiting game continue closes only the question, not the whole session',await waiting.isVisible()&&await waiting.locator('.mining-question-dock').count()===0);
  await page.waitForFunction(()=>{const c=document.querySelector('.drill-overlay .mining-canvas'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let colors=new Set();for(let i=0;i<p.length;i+=16)colors.add(`${p[i]},${p[i+1]},${p[i+2]}`);return colors.size>40;});
  check('waiting world is actually repainted after closing and resizing the dock',true);
  await page.screenshot({path:join(evidence,'waiting-game.png'),fullPage:true});await page.keyboard.press('Escape');
  check('licenses remain shipped',(await fetch(base+'/licenses/mining-kenney-CC0.txt')).ok&&(await fetch(base+'/licenses/mining-tween-MIT.txt')).ok);
  check('no runtime exceptions',errors.length===0,errors);
}catch(e){await page?.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});errors.push(e.stack??String(e));console.error(e);process.exitCode=1;}
finally{writeFileSync(join(evidence,'results.json'),JSON.stringify({checks,errors},null,2));console.log('Evidence: '+evidence);await browser?.close();server.kill();}

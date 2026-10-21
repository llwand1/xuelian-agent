/**
 * Settings end-to-end regression on production assets, with an isolated database and fake /models upstream.
 * Covers default-channel confirmation, real model dropdowns, seven groups / sixteen independent pages,
 * local-provider deletion + cancellation + binding fallback, default-provider protection, 390/320px layout.
 * Requires: npm run build; Node 22; local Chrome or Edge. Never touches user data or calls a real model.
 * Run: node tools/probes/settings-platform-cdp.mjs
 * Optional SB_SETTINGS_APP_ROOT points at a desktop stage or installed app (web/ + packages/server/dist/).
 * Optional SB_SHOT_DIR controls screenshot and results.json output; SB_CDP_PORT overrides the CDP port.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_ROOT = process.env.SB_SETTINGS_APP_ROOT ?? ROOT;
const WEB_DIST = process.env.SB_SETTINGS_APP_ROOT ? join(APP_ROOT, 'web') : join(ROOT, 'packages/web/dist');
const SHOTS = process.env.SB_SHOT_DIR ?? join(tmpdir(), 'cdp-shots');
const PROFILE = join(tmpdir(), `cdp-settings-${Date.now()}`);
const DATA_DIR = mkdtempSync(join(tmpdir(), 'sb-settings-probe-'));
mkdirSync(SHOTS, { recursive: true });

const pick = (base) => base + Math.floor(Math.random() * 200);
const API_PORT = pick(18820);
const STUB_PORT = pick(19900);
const CDP_PORT = Number(process.env.SB_CDP_PORT ?? pick(9300));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const killed = [];
const killTree = (child) => {
  if (!child?.pid) return;
  killed.push(child.pid);
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
};
const cleanup = () => {
  for (const pid of killed) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(pid, 'SIGKILL');
    } catch {}
  }
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
};

// ── 浏览器（Chrome 优先，回落 Edge；都没有就直接说清楚，不假装跑过）────────────
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const BROWSER = BROWSERS.find((p) => existsSync(p));
if (!BROWSER) {
  console.error('✗ 没找到 Chrome/Edge —— 本探针需要真浏览器，拒绝假装跑过');
  process.exit(2);
}

const checks = [];
const skips = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const skip = (name, why) => {
  skips.push({ name, why });
  console.log(`SKIP  ${name}  （${why}）`);
};

/** 假上游：只实现 `GET /v1/models`（`listModels` 打的就是这个路径）。★ 不实现 chat ⇒ 探针零模型调用。 */
const STUB_MODELS = ['agnes-2.5-flash', 'agnes-2.5-pro', 'gpt-4o-mini'];
const stub = createServer((req, res) => {
  if (req.url?.includes('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: STUB_MODELS.map((id) => ({ id, object: 'model' })) }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"probe stub: only /models is implemented"}');
});

// ── 起三件套：假上游 → 隔离生产后端与同源静态资源 ────────────────────────────────────────
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r));
console.log(`stub upstream  http://127.0.0.1:${STUB_PORT}/v1/models  ->  ${STUB_MODELS.join(', ')}`);

const api = spawn(process.execPath, [join(APP_ROOT, 'packages/server/dist/index.js')], {
  cwd: APP_ROOT,
  stdio: 'ignore',
  env: { ...process.env, SB_PORT: String(API_PORT), SB_DATA_DIR: DATA_DIR, SB_HOST: '127.0.0.1',
    SB_WEB_DIST: WEB_DIST, SB_PLATFORM_API_KEY: '', SB_REQUIRE_AUTH: '0' },
});
killed.push(api.pid);

const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `${API}/`;
const up = async (url, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await sleep(300);
  }
  return false;
};
if (!(await up(`${API}/api/health`))) { console.error('✗ 隔离后端没起来'); cleanup(); process.exit(1); }
console.log(`backend        ${API}  (SB_DATA_DIR=${DATA_DIR})`);
if (!(await up(WEB))) { console.error('✗ 生产前端没起来'); cleanup(); process.exit(1); }
console.log(`web            ${WEB}`);

// ── 造数据（全部走 HTTP，等价于用户在界面上做的事）────────────────────────────
// ★ 写操作必须带 `Origin`（`security.ts#originCheck`：**无 Origin 的写请求一律 403**，SEC-09）。
//   探针是 Node fetch、默认不带 Origin ⇒ 不加这一行会得到「Forbidden: missing or disallowed origin」，
//   而那看起来像"后端没实现这个接口"，其实是我们没按浏览器的方式发请求。
const j = async (path, init) => {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Origin: API,
      ...(init?.headers ?? {}),
    },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const created = await j('/api/providers', {
  method: 'POST',
  body: JSON.stringify({ name: '探针假上游', baseUrl: `http://127.0.0.1:${STUB_PORT}/v1`, apiKey: 'sk-probe', type: 'openai' }),
});
const stubId = created.body?.id;
const roleCount = (await j('/api/providers/roles')).body.roles.length;
if (!stubId) { console.error('✗ 建 provider 失败', created); cleanup(); process.exit(1); }
const listed = await j(`/api/providers/${stubId}/models`);
console.log(`假上游候选    ${JSON.stringify(listed.body)}`);

// 把 explain 绑到假上游 + 指定一个模型：① 让那一行**有候选**（A5）；② 给 A10 的"覆盖"造出可观察的旧值
await j('/api/providers/roles/explain', {
  method: 'PUT',
  body: JSON.stringify({ providerId: stubId, model: 'agnes-2.5-pro' }),
});

// ── CDP ──────────────────────────────────────────────────────────────────────
const stale = await (async () => { try { return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok; } catch { return false; } })();
if (stale) { console.error(`端口 ${CDP_PORT} 已有 CDP 实例，拒绝继续（换 SB_CDP_PORT）`); cleanup(); process.exit(2); }

const chrome = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });
killed.push(chrome.pid);

let version = null;
for (let i = 0; i < 60; i += 1) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
  await sleep(250);
}
if (!version) { console.error('✗ CDP 未就绪'); cleanup(); process.exit(1); }

const created2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(WEB)}`, { method: 'PUT' })).json();
const ws = new WebSocket(created2.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => {
  const myId = ++id; pending.set(myId, (m) => res(m.result ?? m.error));
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const evalJs = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
const waitFor = async (expr, timeoutMs, intervalMs = 200) => {
  const end = Date.now() + timeoutMs; let last = null;
  while (Date.now() < end) { last = await evalJs(expr); if (last) return last; await sleep(intervalMs); }
  return last;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const f = join(SHOTS, `${name}.png`);
  writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('shot ->', f);
};

await send('Page.enable'); await send('Runtime.enable');

// ── A1 应用壳（不是落地页）────────────────────────────────────────────────────
// ★ 别用「固定 sleep N 秒再断言」：首屏挂载时间不定，早一步就会把「还没挂载」误判成「没渲染」。
//   实测踩过：固定 3 秒后 `innerText` 还是空、A1/A2 双红，而截图里应用壳明明好好的。
const shellUp = await waitFor(
  `document.body.innerText.includes('词条') && document.body.innerText.includes('设置')`,
  30_000,
  300,
);
check('A1 应用壳渲染（本地形态免登录直进）', !!shellUp, '侧栏含「词条」「设置」');

// 进设置页：按**文案**定位（不写死 nth-child —— 侧栏项顺序会变）。
// ★ 只在 button/a/li 里找：找到外层 div 点下去不会触发 React 的 onClick（看着像"点了没反应"）
await evalJs(`(() => {
  const el = [...document.querySelectorAll('button,a,li')].find((n) => n.textContent.trim() === '设置');
  if (el) el.click();
  return !!el;
})()`);
const clickBtn = (text) => evalJs(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.getClientRects().length && (x.textContent.trim() === ${JSON.stringify(text)} || x.getAttribute('aria-label') === ${JSON.stringify(text)}));
  b?.click(); return !!b;
})()`);
await waitFor(`!!document.querySelector('.settings-nav')`, 15_000);
await clickBtn('默认通道与额度');
const cardUp = await waitFor(`!!document.querySelector('h3') && /免费通道/.test(document.body.innerText)`, 15_000);
check('A2 「免费通道 · 一键默认设置」卡在场', !!cardUp);
if (!cardUp) { await shot('settings-nocard'); cleanup(); ws.close(); process.exit(1); }

// ── A3 按钮 ──────────────────────────────────────────────────────────────────
const btn = await evalJs(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '一键默认设置');
  return b ? JSON.stringify({ t: b.textContent.trim(), d: !!b.disabled }) : null;
})()`);
check('A3 一键默认设置按钮在场且可点', !!btn && JSON.parse(btn).d === false, btn ?? '未找到');

// ── A4 额度行 ────────────────────────────────────────────────────────────────
const stateText = await evalJs(`(() => {
  const s = document.querySelector('.settings-state');
  return s ? s.textContent.trim() : null;
})()`);
check('A4 额度行已读到（本地模式：不计入免费额度）', stateText === '本地模式：不计入免费额度', stateText ?? '未找到');
await clickBtn('角色模型绑定');
await waitFor(`document.querySelectorAll('select.settings-model-select').length > 0`, 15_000);

// ── A5/A6 有候选的那一行：真下拉 + 候选 + 「（用默认模型）」──────────────────────
const selInfo = await evalJs(`(() => {
  const s = document.querySelector('select.settings-model-select');
  if (!s) return null;
  return JSON.stringify({ n: document.querySelectorAll('select.settings-model-select').length,
    opts: [...s.options].map((o) => o.textContent), value: s.value });
})()`);
const sel = selInfo ? JSON.parse(selInfo) : null;
check('A5 ★ 有候选的服务商那一行渲染真 <select>', !!sel, sel ? `${sel.n} 个下拉` : '一个都没有');
check('A5b 候选里有假上游返回的模型名', !!sel && STUB_MODELS.every((m) => sel.opts.includes(m)),
  sel ? sel.opts.join(' | ') : '—');
check('A6 「（用默认模型）」选项在场', !!sel && sel.opts.includes('（用默认模型）'), sel ? sel.value : '—');

// ── A7 平台通道那几行：没有下拉（现状事实，见文件头）───────────────────────────
const inputs = await evalJs(`document.querySelectorAll('input[placeholder="模型名（没拉到候选列表，可手填）"]').length`);
check('A7 ★★ 绑平台通道的行是输入框（未配 key ⇒ 平台拉不到候选）', inputs === roleCount - 1, `${inputs} 个输入框（期望 ${roleCount - 1}）`);

// ── A8 反向：不许出现手填框（空模型 ≠ 自定义）─────────────────────────────────
const customInputs = await evalJs(`document.querySelectorAll('.settings-model-input').length`);
check('A8 ★ 反向：没有任何「自定义…」手填框', customInputs === 0, `${customInputs} 个`);
const customSelected = await evalJs(`[...document.querySelectorAll('select.settings-model-select')].filter((s) => s.value === '__custom__').length`);
check('A8b ★ 反向：下拉没有显示成「自定义…」', customSelected === 0, `${customSelected} 个`);

await shot('settings-before');

// ── A9 点一键默认设置（★ 2026-09-21 起是**两段式**：首屏那枚只进确认态，确认键才真动手）──
// ★★ 探针必须跟着改：本次改动给按钮加了二次确认 ⇒ 「一键默认设置」**单击不再触发配置**。
//   若探针还按单击写，A9b/A9d 会红——那是**探针过时**，不是产品坏了（同型先例见文件头：
//   「探针的错要自己认，不能记到产品头上」）。故本段改成完整走一遍真机确认流程：
//   首屏 → 确认态 → **取消（不许配）** → 再进确认态 → 确认（才配）。
await clickBtn('默认通道与额度');
await waitFor(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === '一键默认设置' && !b.disabled)`, 10_000);

const readCard = () =>
  evalJs(`(() => {
    const idle = [...document.querySelectorAll('button')].some((x) => x.textContent.trim() === '一键默认设置');
    const ok = [...document.querySelectorAll('button')].some((x) => x.textContent.trim() === '确认覆盖');
    const cancel = [...document.querySelectorAll('button')].some((x) => x.textContent.trim() === '取消');
    return JSON.stringify({ idle, ok, cancel,
      warn: document.querySelector('.settings-hint.warn')?.textContent?.trim() ?? '',
      flash: document.querySelector('.settings-msg')?.textContent?.trim() ?? '' });
  })()`);

/** 轮询直到 `pred(read)` 为真（或超时），返回最后那次读数。 */
const until = async (pred, ms = 5_000) => {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    last = JSON.parse((await readCard()) ?? '{}');
    if (pred(last)) return last;
    await sleep(60);
  }
  return last;
};

await clickBtn('一键默认设置');
const confirmState = await until((o) => o.ok === true);
check('A9-0 ★★ 首屏点一下只进确认态：出现「确认覆盖」+「取消」，且**没有**发出配置（无成功提示）',
  !!confirmState && confirmState.cancel === true && !/已一键配好/.test(confirmState.flash ?? ''),
  confirmState ? `确认键=${confirmState.ok} 取消键=${confirmState.cancel} flash="${confirmState.flash}"` : '确认态未出现');
check('A9-0b ★ 代价说明点名后果（覆盖 / 模型名 / 全部学习角色）',
  !!confirmState && /覆盖/.test(confirmState.warn) && /模型名/.test(confirmState.warn) && /全部学习角色/.test(confirmState.warn),
  confirmState?.warn || '未找到 .settings-hint.warn');

// ★★ A9-0c：**取消必须真的什么都不做**。这是二次确认存在的全部意义——
//    若取消也会配（或取消后残留确认态），用户会以为"点了取消但还是改了"，比不加确认更糟。
await clickBtn('取消');
const afterCancel = await until((o) => o.idle === true && o.ok === false);
check('A9-0c ★★ 取消干净回退：回「一键默认设置」、确认键与代价说明消失、**没有任何成功提示**',
  !!afterCancel && afterCancel.ok === false && !/已一键配好/.test(afterCancel.flash ?? '') && afterCancel.warn === '',
  JSON.stringify(afterCancel));

await clickBtn('一键默认设置');
const reConfirm = await until((o) => o.ok === true);
check('A9-0d 取消之后还能再进确认态（不是一次性状态）', !!reConfirm && reConfirm.ok === true, JSON.stringify(reConfirm));

await clickBtn('确认覆盖');
// 「进行中态」：操作可能比采样还快 ⇒ 同时看"结果出没出"，采不到就 SKIP 而不是判 FAIL
let busySeen = null;
const done = await (async () => {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    const o = JSON.parse(await evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /一键默认设置|配置中/.test(x.textContent));
      return JSON.stringify({ t: b ? b.textContent.trim() : null, d: b ? !!b.disabled : null,
        flash: document.querySelector('.settings-msg')?.textContent?.trim() ?? '' });
    })()`) ?? '{}');
    if (o.t && o.t.includes('配置中')) { busySeen = o; await sleep(60); continue; }
    if (/已一键配好/.test(o.flash ?? '')) return o;
    await sleep(80);
  }
  return null;
})();
if (busySeen) check('A9a 进行中态：按钮转「配置中…」且禁用', busySeen.d === true, busySeen.t);
else skip('A9a 进行中态：按钮转「配置中…」且禁用', '操作在首次采样前已完成，进行中态无从观测');
check('A9b 提示文案报出配好的角色数', !!done && (done.flash ?? '').includes(`已一键配好 ${roleCount} 个角色`), done?.flash ?? '未捕获到提示');

const after = await evalJs(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '一键默认设置');
  return JSON.stringify({ t: b ? b.textContent.trim() : null, d: b ? !!b.disabled : null,
    confirmLeft: [...document.querySelectorAll('button')].some((x) => x.textContent.trim() === '确认覆盖'),
    warn: document.querySelector('.settings-hint.warn')?.textContent?.trim() ?? '',
    selects: document.querySelectorAll('select.settings-model-select').length,
    inputs: document.querySelectorAll('input[placeholder="模型名（没拉到候选列表，可手填）"]').length });
})()`);
const a = after ? JSON.parse(after) : null;
check('A9c ★ 按钮复位解禁（不是只能点一次）', !!a && a.t === '一键默认设置' && a.d === false, JSON.stringify(a));
// ★ 成功之后确认态必须收干净：留着「确认覆盖」或那句代价说明，用户会以为"还没配完"
check('A9c-b ★ 成功后确认态收干净（确认键与代价说明都消失）',
  !!a && a.confirmLeft === false && a.warn === '', JSON.stringify({ confirmLeft: a?.confirmLeft, warn: a?.warn }));

// ── A10 覆盖语义实证 + 真落库 ────────────────────────────────────────────────
// ★ 读取形状：`GET /roles` 回的是 `{ roles, bindings }`，**不是数组**（`roles` 是 8 个角色的
//   定义，`bindings` 才是落库的绑定）。字段是 **snake_case**（`provider_id`）。
//   首轮探针按数组读 ⇒ 恒得 `null` / `? 行`，是**探针自己的形状错**，不是产品缺陷。
const roles = await j('/api/providers/roles');
const bindings = roles.body?.bindings;
const explain = Array.isArray(bindings) ? bindings.find((r) => r.role === 'explain') : null;
const allPlatform =
  Array.isArray(bindings) && bindings.length === roleCount && bindings.every((r) => r.model === '');
check('A10 ★ 覆盖语义：explain 从「假上游 + agnes-2.5-pro」被重置为「平台 + 留空」',
  !!explain && explain.provider_id !== stubId && explain.model === '', JSON.stringify(explain));
check('A10b 真落库：全部 model 为空串', allPlatform, `${Array.isArray(bindings) ? bindings.length : '?'} 行`);

// ── A11 反向：卡上没有任何"看/复制密钥"入口 ──────────────────────────────────
const keyEntry = await evalJs(`(() => {
  const sec = [...document.querySelectorAll('section.settings-sec')].find((s) => /一键默认设置/.test(s.textContent));
  if (!sec) return 'no-section';
  return [...sec.querySelectorAll('button,a')].map((n) => n.textContent.trim()).join(' | ');
})()`);
check('A11 ★ 反向：卡上没有任何「显示/复制密钥」入口', keyEntry === '一键默认设置', keyEntry);
await clickBtn('角色模型绑定');
check('A9d 全部改绑平台通道（切回独立绑定页显示最新值）', await waitFor(`document.querySelectorAll('input[placeholder="模型名（没拉到候选列表，可手填）"]').length === ${roleCount}`, 15_000));

await shot('settings-after');

// Real two-level navigation, provider deletion, and viewport regression on the packaged application.
const groups = [
  ['模型与服务商', ['供应商管理', '角色模型绑定', '默认通道与额度']],
  ['学习与出题', ['考试范围', '题型配比', '真题优先', '图片题']],
  ['联网搜索', ['搜索服务与密钥']],
  ['阅读与交互', ['回答风格', '词条朗读', '阅读字号', '等待练习']],
  ['插件中心', ['插件管理与接入']], ['外部 Agent 授权', ['学习接口授权']],
  ['工具与诊断', ['工具权限与记录', 'AI 健康']],
];
for (const [group, pages] of groups) {
  await clickBtn(group);
  for (const page of pages) {
    await clickBtn(page);
    check('B1 独立子页 ' + page, await waitFor(`document.querySelectorAll('.settings-panel').length === 1 && document.querySelector('.settings-panel')?.getAttribute('aria-label') === ${JSON.stringify(page)}`, 5000));
  }
}
await clickBtn('模型与服务商');
await clickBtn('供应商管理');
await waitFor(`!!document.querySelector('[aria-label="删除服务商 探针假上游"]')`, 5000);
check('B2 本机 NULL 归属供应商删除按钮可用', await evalJs(`document.querySelector('[aria-label="删除服务商 探针假上游"]')?.disabled === false`));
check('B3 管理页没有混入角色绑定表或默认通道', await evalJs(`!document.querySelector('.settings-panel table') && !document.querySelector('.settings-panel')?.innerText.includes('一键默认设置')`));
await shot('settings-providers-desktop');
for (const width of [390, 320]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  check('B4 窄屏分类导航与删除入口可见 ' + width, await evalJs(`(() => {
    const nav = document.querySelector('.settings-mobile-nav');
    const button = document.querySelector('[aria-label="删除服务商 探针假上游"]');
    const r = button?.getBoundingClientRect();
    return !!nav?.getClientRects().length && !!r?.width && r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
  })()`));
  await shot('settings-providers-mobile-' + width);
}
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await clickBtn('删除服务商 探针假上游');
check('B5 删除必须明确确认且取消不删除', (await j('/api/providers')).body.some(p => p.id === stubId));
await clickBtn('取消');
check('B5b 取消后供应商仍在', await evalJs(`!!document.querySelector('[aria-label="删除服务商 探针假上游"]') && !document.querySelector('.settings-delete-confirm')`));
await j('/api/providers/roles/explain', { method: 'PUT', body: JSON.stringify({ providerId: stubId, model: 'agnes-2.5-pro' }) });
await clickBtn('删除服务商 探针假上游');
await clickBtn('确认删除');
check('B6 确认删除后列表移除', await waitFor(`!document.querySelector('[aria-label="删除服务商 探针假上游"]') && document.querySelector('.settings-panel [role="status"]')?.textContent.includes('已删除服务商')`, 5000));
check('B7 真实后端删除与角色回落生效', !(await j('/api/providers')).body.some(p => p.id === stubId)
  && (await j('/api/providers/roles')).body.bindings.some(b => b.role === 'explain' && b.provider_id !== stubId && b.model === ''));
check('B8 系统默认通道不可删除', (await j('/api/providers/openai-default', { method: 'DELETE' })).status === 403);
await clickBtn('角色模型绑定');
check('B9 切回绑定页不会残留被删服务商', await waitFor(`!!document.querySelector('.settings-panel table') && ![...document.querySelectorAll('.settings-panel option')].some(o => o.value === ${JSON.stringify(stubId)})`, 5000));
writeFileSync(join(SHOTS, 'results.json'), JSON.stringify({ appRoot: APP_ROOT, checks, skips }, null, 2));

// ── 收尾 ─────────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.pass);
console.log(`\n${failed.length ? `FAILED ${failed.length}/${checks.length}` : `DONE ${checks.length}/${checks.length} 全过`}` +
  (skips.length ? `（${skips.length} 条无从观测）` : ''));
ws.close(); cleanup(); await sleep(600);
process.exit(failed.length ? 1 : 0);

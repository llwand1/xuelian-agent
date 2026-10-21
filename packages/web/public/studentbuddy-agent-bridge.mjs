#!/usr/bin/env node
/** StudentBuddy Agent Bridge v1 — Node 22+, no dependencies, no shell execution. */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const port = Number(process.env.SB_AGENT_PORT || 4011);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SB_AGENT_PORT must be 1024–65535');
const dir = path.resolve(process.env.SB_AGENT_DATA_DIR || path.join(os.homedir(), '.studentbuddy', 'agent-bridge'));
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const keyFile = path.join(dir, 'pairing-key');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
const token = fs.readFileSync(keyFile, 'utf8').trim();
if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid bridge pairing-key file');
const file = path.join(dir, 'shared-data.json');
let state = { contexts: [], tasks: [] };
if (fs.existsSync(file)) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw.contexts) || !Array.isArray(raw.tasks) || raw.contexts.length > 200 || raw.tasks.length > 200) throw new Error('Invalid shared-data.json; restore a valid backup');
  state = raw;
}
let lastSeen = 0;
let contextClock = Math.max(0, ...state.contexts.map(x => Number(x.updatedAt) || 0));
function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function object(v) { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Expected an object'); return v; }
function fields(v, allowed) { object(v); if (Object.keys(v).some(k => !allowed.includes(k))) throw new Error('Unknown field'); }
function text(v, label, limit) { if (typeof v !== 'string' || !v.trim() || v.length > limit) throw new Error(`${label} must be 1–${limit} characters`); return v.trim(); }
function id(v) { const s = text(v, 'id', 100); if (!/^[a-zA-Z0-9_.-]+$/.test(s)) throw new Error('Invalid id'); return s; }
function schema(properties = {}, required = []) { return { type: 'object', properties, required, additionalProperties: false }; }
const str = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const tools = [
  { name: 'agent_status', description: 'Get bridge status and whether an external worker has checked in within 60 seconds.', inputSchema: schema() },
  { name: 'share_context', description: 'Share only explicitly selected text. Same key updates the existing shared item.', inputSchema: schema({ key: str(100), title: str(120), text: str(3000) }, ['key','title','text']) },
  { name: 'list_context', description: 'Read shared context from both StudentBuddy and the external agent; not the full StudentBuddy database.', inputSchema: schema({ after: { type: 'number', minimum: 0 } }) },
  { name: 'delegate_task', description: 'Queue a task for an external worker. Queued is not completed. Use a unique requestId; never resubmit blindly.', inputSchema: schema({ requestId: str(100), prompt: str(3000), contextIds: { type: 'array', items: str(100), maxItems: 10 } }, ['requestId','prompt']) },
  { name: 'get_task', description: 'Read queued/claimed/done/error state and the actual result. Does not run or retry a task.', inputSchema: schema({ taskId: str(100) }, ['taskId']) },
];
function context(args, source) {
  fields(args, ['key','title','text']); const key = id(args.key), title = text(args.title,'title',120), body = text(args.text,'text',3000);
  const existing = state.contexts.find(x => x.key === key && x.source === source);
  if (!existing && state.contexts.length >= 200) throw new Error('Shared context limit reached (200); delete old items first');
  const item = { id: existing?.id || randomUUID(), key, title, text: body, source, updatedAt: (contextClock = Math.max(Date.now(), contextClock + 1)) };
  if (existing) Object.assign(existing, item); else state.contexts.push(item);
  save(); return item;
}
function task(args) {
  fields(args, ['requestId','prompt','contextIds']); const requestId = id(args.requestId), prompt = text(args.prompt,'prompt',3000);
  if (args.contextIds !== undefined && (!Array.isArray(args.contextIds) || args.contextIds.length > 10)) throw new Error('contextIds must be an array of up to 10 IDs');
  const contextIds = [...new Set((args.contextIds || []).map(id))];
  if (contextIds.some(v => !state.contexts.some(x => x.id === v))) throw new Error('Unknown shared context ID');
  const old = state.tasks.find(x => x.requestId === requestId);
  if (old) { if (old.prompt !== prompt || JSON.stringify(old.contextIds) !== JSON.stringify(contextIds)) throw new Error('requestId already used with different arguments'); return taskView(old); }
  if (state.tasks.length >= 200) throw new Error('Task limit reached (200); delete completed tasks first');
  const item = { id: randomUUID(), requestId, prompt, contextIds, contextData: contextIds.map(v => ({...state.contexts.find(x => x.id === v)})), status: 'queued', createdAt: Date.now(), result: '', workerId: '' };
  state.tasks.push(item); save(); return taskView(item);
}
function taskView(item) { const {contextData: _contextData, ...view} = item; return view; }
function call(name, args) {
  object(args);
  if (name === 'agent_status') { fields(args, []); return { name: 'StudentBuddy Agent Bridge', version: '1.0.0', workerOnline: lastSeen > Date.now() - 60000, lastSeen: lastSeen || null, queued: state.tasks.filter(x => x.status === 'queued').length, contexts: state.contexts.length }; }
  if (name === 'share_context') return context(args, 'studentbuddy');
  if (name === 'list_context') {
    fields(args,['after']); if (args.after !== undefined && (typeof args.after !== 'number' || !Number.isFinite(args.after) || args.after < 0)) throw new Error('Invalid after');
    const all = state.contexts.filter(x => x.updatedAt > (args.after || 0)).sort((a,b) => a.updatedAt - b.updatedAt);
    const items = []; let size = 0;
    for (const item of all) { const n = JSON.stringify(item).length; if (size + n > 10000) break; items.push(item); size += n; }
    // Return a timestamp watermark only when every item at it is included.
    const watermark = items.at(-1)?.updatedAt;
    if (items.length < all.length && watermark === all[items.length]?.updatedAt) {
      while (items.at(-1)?.updatedAt === watermark) items.pop();
    }
    return { items, nextAfter: items.length < all.length ? (items.at(-1)?.updatedAt ?? args.after ?? 0) : null, hasMore: items.length < all.length };
  }
  if (name === 'delegate_task') return task(args);
  if (name === 'get_task') { fields(args,['taskId']); const found = state.tasks.find(x => x.id === id(args.taskId)); if (!found) throw new Error('Task not found'); return taskView(found); }
  throw new Error('Unknown tool');
}
function reply(res, code, data) { const body = data === undefined ? '' : JSON.stringify(data); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Request too large'); chunks.push(chunk); }
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
function authorized(req) {
  const key = Buffer.from(String(req.headers.authorization || '')), expected = Buffer.from('Bearer ' + token);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
async function worker(req, res, url) {
  lastSeen = Date.now();
  if (url.pathname === '/worker/context' && req.method === 'GET') return reply(res,200,{items:state.contexts});
  if (url.pathname === '/worker/context' && req.method === 'POST') return reply(res,201,context(await body(req),'agent'));
  if (url.pathname === '/worker/tasks' && req.method === 'GET') return reply(res,200,{tasks:state.tasks.filter(x => x.status === 'queued' || x.status === 'claimed').map(taskView)});
  const match = /^\/worker\/tasks\/([a-zA-Z0-9-]+)\/(claim|result)$/.exec(url.pathname);
  if (match && req.method === 'POST') {
    const input = await body(req), found = state.tasks.find(x => x.id === match[1]);
    if (!found) return reply(res,404,{error:'Task not found'});
    const workerId = id(input.workerId);
    if (match[2] === 'claim') {
      fields(input,['workerId']); if (found.status !== 'queued') return reply(res,409,{error:'Task already claimed or completed; no automatic retry'});
      found.status = 'claimed'; found.workerId = workerId; found.claimedAt = Date.now(); save(); return reply(res,200,found);
    }
    fields(input,['workerId','status','result']);
    if (found.status !== 'claimed' || found.workerId !== workerId) return reply(res,409,{error:'Only the claiming worker can complete a task'});
    if (!['done','error'].includes(input.status)) throw new Error('status must be done or error');
    const result = text(input.result,'result',6000);
    found.result = result; found.status = input.status; found.completedAt = Date.now(); save(); return reply(res,200,found);
  }
  const deletion = /^\/worker\/(context|tasks)\/([a-zA-Z0-9-]+)$/.exec(url.pathname);
  if (deletion && req.method === 'DELETE') {
    const list = deletion[1] === 'context' ? 'contexts' : 'tasks';
    const item = state[list].find(x => x.id === deletion[2]);
    if (!item) return reply(res,404,{error:'Item not found'});
    if (list === 'tasks' && !['done','error'].includes(item.status)) return reply(res,409,{error:'Cannot delete a pending task'});
    state[list] = state[list].filter(x => x !== item); save(); return reply(res,200,{ok:true});
  }
  reply(res,404,{error:'Worker endpoint not found'});
}
const server = http.createServer(async (req,res) => {
  try {
    // Reject browser origins, rebinding Hosts, and non-loopback peers. No CORS grant.
    if (req.headers.host !== `127.0.0.1:${port}` || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers.origin) return reply(res,403,{error:'Local non-browser clients only'});
    if (!authorized(req)) return reply(res,401,{error:'Pairing key required'});
    const url = new URL(req.url,'http://127.0.0.1');
    if (url.search) return reply(res,400,{error:'Query parameters are not supported'});
    if (url.pathname.startsWith('/worker/')) return await worker(req,res,url);
    if (url.pathname !== '/mcp' || req.method !== 'POST') return reply(res,404,{error:'Endpoint not found'});
    const input = await body(req);
    const rpcId = input.id ?? null;
    if (input.jsonrpc !== '2.0' || (rpcId !== null && typeof rpcId !== 'string' && typeof rpcId !== 'number')) throw new Error('Invalid JSON-RPC');
    try {
      let result;
      if (input.method === 'initialize') result = { protocolVersion:'2025-06-18', capabilities:{tools:{}}, serverInfo:{name:'StudentBuddy Agent Bridge',version:'1.0.0'} };
      else if (input.method === 'notifications/initialized') return reply(res,202);
      else if (input.method === 'tools/list') result = { tools };
      else if (input.method === 'tools/call') {
        const params = object(input.params), data = call(params.name, params.arguments);
        result = {content:[{type:'text',text:JSON.stringify(data)}]};
      } else return reply(res,200,{jsonrpc:'2.0',id:rpcId,error:{code:-32601,message:'Method not supported'}});
      reply(res,200,{jsonrpc:'2.0',id:rpcId,result});
    } catch (e) { reply(res,200,{jsonrpc:'2.0',id:rpcId,error:{code:-32602,message:e.message}}); }
  } catch (e) { if (!res.headersSent) reply(res,400,{error:e instanceof SyntaxError ? 'Invalid JSON' : e.message}); else res.destroy(); }
});
server.requestTimeout = 10000; server.headersTimeout = 10000;
server.on('error', e => { console.error('Agent bridge could not start:',e.code || 'error'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`StudentBuddy Agent Bridge: http://127.0.0.1:${port}/mcp`);
  console.log(`Pairing key (paste only in plugin settings / worker environment): ${token}`);
  console.log('No worker attached yet. Connect an external agent via /worker/tasks. Queued tasks are never executed by this bridge itself.');
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));

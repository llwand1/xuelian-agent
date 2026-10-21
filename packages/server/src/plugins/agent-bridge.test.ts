import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localAgentManifest } from '@sb/shared';
import { McpHttpClient } from './mcp-http.js';
let child: ChildProcess, dir = '', base = '', token = '', client: McpHttpClient;
beforeEach(async()=>{
  vi.stubEnv('SB_DESKTOP','1'); vi.stubEnv('SB_HOST','127.0.0.1');
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'sb-agent-bridge-'));
  const listener=net.createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=(listener.address() as net.AddressInfo).port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
  base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[fileURLToPath(new URL('../../../web/public/studentbuddy-agent-bridge.mjs',import.meta.url))],{
    env:{...process.env,SB_AGENT_PORT:String(port),SB_AGENT_DATA_DIR:dir},windowsHide:true,stdio:['ignore','pipe','pipe'],
  });
  await new Promise<void>((resolve,reject)=>{
    let output=''; const timer=setTimeout(()=>reject(new Error('Bridge startup timed out')),5000);
    child.stdout!.on('data',chunk=>{output+=String(chunk);if(output.includes('No worker attached')){clearTimeout(timer);resolve();}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Bridge exited: '+code));});
  });
  token=fs.readFileSync(path.join(dir,'pairing-key'),'utf8').trim();
  client=new McpHttpClient(localAgentManifest(base+'/mcp'),token,AbortSignal.timeout(8000));await client.initialize();
});
afterEach(async()=>{
  await client?.close();
  if(child && child.exitCode===null) await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});
  vi.unstubAllEnvs();if(dir)fs.rmSync(dir,{recursive:true,force:true});
});
async function worker(endpoint:string,method='GET',data?:unknown) {
  return fetch(base+endpoint,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
}
async function call(tool:string,args:Record<string,unknown>={}) {return JSON.parse((await client.call(tool,args)).text) as Record<string,unknown>;}
it('does real HTTP discovery and bidirectional sharing; delegates, claims and returns an actual external result',async()=>{
  expect((await client.tools()).map(t=>t.name)).toEqual(['agent_status','share_context','list_context','delegate_task','get_task']);
  expect(await call('agent_status')).toMatchObject({workerOnline:false,queued:0});
  const item=await call('share_context',{key:'lesson',title:'学习资料',text:'需要学习二分查找。'});
  const queued=await call('delegate_task',{requestId:'request-1',prompt:'给出学习建议',contextIds:[item.id]});
  expect(queued.status).toBe('queued');
  expect((await call('delegate_task',{requestId:'request-1',prompt:'给出学习建议',contextIds:[item.id]})).id).toBe(queued.id);
  await expect(call('delegate_task',{requestId:'request-1',prompt:'不同任务'})).rejects.toThrow();
  expect((await worker('/worker/tasks')).status).toBe(200);
  const claimed=await worker(`/worker/tasks/${queued.id}/claim`,'POST',{workerId:'external-agent'});
  expect(claimed.status).toBe(200);expect((await claimed.json()).contextData[0].text).toContain('二分查找');
  expect((await worker(`/worker/tasks/${queued.id}/claim`,'POST',{workerId:'another'})).status).toBe(409);
  expect((await worker(`/worker/tasks/${queued.id}/result`,'POST',{workerId:'another',status:'done',result:'fake'})).status).toBe(409);
  expect((await worker(`/worker/tasks/${queued.id}/result`,'POST',{workerId:'external-agent',status:'done',result:'先掌握有序区间与循环不变量。'})).status).toBe(200);
  expect(await call('get_task',{taskId:queued.id})).toMatchObject({status:'done',result:'先掌握有序区间与循环不变量。'});
  await worker('/worker/context','POST',{key:'return-notes',title:'Agent 整理',text:'左闭右开区间让边界更清晰。'});
  const contexts=await call('list_context');expect(JSON.stringify(contexts)).toContain('左闭右开');expect(JSON.stringify(contexts)).not.toContain(token);
  expect(await call('agent_status')).toMatchObject({workerOnline:true,queued:0});
  expect(fs.readFileSync(path.join(dir,'shared-data.json'),'utf8')).toContain('循环不变量');
});
it('requires pairing, blocks browser origins / rebinding and bounds input without running commands',async()=>{
  expect((await fetch(base+'/worker/tasks')).status).toBe(401);
  expect((await fetch(base+'/worker/tasks',{headers:{Authorization:'Bearer '+token,Origin:'https://evil.example'}})).status).toBe(403);
  const hostStatus=await new Promise<number|undefined>((resolve,reject)=>{
    const req=http.request(base+'/worker/tasks',{headers:{Authorization:'Bearer '+token,Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();
  });
  expect(hostStatus).toBe(403);
  await expect(call('share_context',{key:'x',title:'x',text:'x'.repeat(3001)})).rejects.toThrow();
  await expect(call('share_context',{key:'x',title:'x',text:'text',command:'whoami'})).rejects.toThrow();
  expect((await worker('/worker/context','POST',{key:'x',title:'x',text:'x'.repeat(70000)})).status).toBe(400);
  expect(await call('agent_status')).toMatchObject({contexts:0,queued:0});
});
it.each([200,500])('reference worker uses only the chosen local API and submits real status for HTTP %i without replay',async status=>{
  const received:Record<string,unknown>[]=[];
  const model=http.createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>);
    res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'本地接口真实返回的学习建议'}}]}));
  });
  await new Promise<void>(resolve=>model.listen(0,'127.0.0.1',resolve));
  try {
    const port=(model.address() as net.AddressInfo).port;
    const context=await call('share_context',{key:'selected',title:'明确选择',text:'只共享这一段测试材料。'});
    const task=await call('delegate_task',{requestId:'worker-once',prompt:'请整理建议',contextIds:[context.id]});
    const worker=spawn(process.execPath,[fileURLToPath(new URL('../../../web/public/studentbuddy-agent-worker.mjs',import.meta.url)),'--once'],{
      env:{...process.env,SB_AGENT_BRIDGE:base,SB_AGENT_TOKEN:token,SB_AGENT_MODEL:'fixture-local-agent',SB_AGENT_ENDPOINT:`http://127.0.0.1:${port}/v1/chat/completions`},windowsHide:true,stdio:'ignore',
    });
    expect(await new Promise(resolve=>worker.once('exit',resolve))).toBe(0);
    const result=await call('get_task',{taskId:task.id});
    expect(result.status).toBe(status===200?'done':'error');
    expect(result.result).toBe(status===200?'本地接口真实返回的学习建议':'Local agent request failed or timed out. The worker did not retry. Check the local agent before creating a new task.');
    expect(received).toHaveLength(1);expect(JSON.stringify(received)).toContain('只共享这一段');expect(JSON.stringify(received)).not.toContain(token);
  } finally {await new Promise<void>(resolve=>model.close(()=>resolve()));}
});

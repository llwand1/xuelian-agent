/** Production UI probe, isolated DB and synthetic cross-origin video, no real models/user files. */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
const root = fileURLToPath(new URL('../..', import.meta.url));
const evidence = resolve(process.env.SB_GUIDE_VIDEO_SHOTS ?? join(root,'.runtime',`guide-video-${Date.now()}`)); mkdirSync(evidence,{recursive:true});
const data = join(evidence,'data'); mkdirSync(data,{recursive:true});
const clock = join(evidence,'clock.txt'); writeFileSync(clock,'0');
const wrapper = join(evidence,'server.mjs');
writeFileSync(wrapper, `import{readFileSync}from'node:fs';const real=Date.now.bind(Date);Date.now=()=>real()+Number(readFileSync(${JSON.stringify(clock)},'utf8'));process.argv[1]=${JSON.stringify(join(root,'packages/server/dist/index.js'))};await import(${JSON.stringify(pathToFileURL(join(root,'packages/server/dist/index.js')).href)});`);
const port = 19600 + Math.floor(Math.random()*300), base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[wrapper],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,SB_PORT:String(port),SB_HOST:'127.0.0.1',SB_DESKTOP:'1',SB_REQUIRE_AUTH:'0',SB_DATA_DIR:data,SB_WEB_DIST:join(root,'packages/web/dist'),SB_PLATFORM_API_KEY:'',SB_DESKTOP_USER_DESKTOP:join(evidence,'desktop'),SB_DESKTOP_USER_DOCUMENTS:join(evidence,'documents')}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],errors=[];
const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}${detail?' '+JSON.stringify(detail):''}`);if(!pass)throw new Error(name);};
let browser,page,float;
try {
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/status')).ok)break;}catch{}await sleep(150);}
  const session=await(await fetch(base+'/api/sessions',{method:'POST',headers:{Origin:base}})).json();
  const db=new Database(join(data,'studentbuddy.db'));db.prepare("UPDATE sessions SET title='视频与引路灯验证' WHERE id=?").run(session.id);
  const insert=db.prepare('INSERT INTO messages(id,session_id,role,content)VALUES(?,?,?,?)');insert.run('probe-user',session.id,'user','解释闭包');insert.run('probe-answer',session.id,'assistant','## 闭包\n函数可以保留其词法环境。这里用一个具体例子理解它。');db.close();
  const {chromium}=await import(process.env.SB_PLAYWRIGHT_MODULE??'playwright');
  browser=await chromium.launch({executablePath:process.env.SB_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    localStorage.setItem('sb_guide_seen','1');
    window.__nativeSent=[];const listeners=new Set();window.__nativeEmit=value=>listeners.forEach(f=>f({data:value}));
    window.chrome={...window.chrome,webview:{postMessage:m=>window.__nativeSent.push(m),addEventListener:(_,f)=>listeners.add(f),removeEventListener:(_,f)=>listeners.delete(f)}};
  });
  await context.route('**/api/guide/next',r=>r.fulfill({json:{mode:'ai',stage:'chatted',headline:'验证建议：从刚才的知识接着学',items:[{kind:'nav.terms',label:'翻翻词条库',hint:'查看刚学的概念'}]}}));
  const hit={route:'bilibili',url:'https://www.bilibili.com/video/BV1nR4y1y751',title:'实时视频验证',author:'测试素材',duration:'01:00'};
  await context.route('**/api/sources/videos?*',r=>r.fulfill({json:{route:'bilibili',query:'闭包',hits:[hit],via:'api',siteSearchUrl:'https://search.bilibili.com/all?keyword=test'}}));
  await context.route('https://player.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0;background:#123544"><canvas width="640" height="360" hidden></canvas><video muted autoplay playsinline style="width:100vw;height:100vh;object-fit:fill"></video><script>const c=document.querySelector('canvas'),g=c.getContext('2d'),v=document.querySelector('video');let n=0;function paint(){g.fillStyle='#2d7d95';g.fillRect(0,0,640,360);g.fillStyle='#f6e3ad';g.font='38px sans-serif';g.fillText('LIVE FRAME '+(++n),60,190);requestAnimationFrame(paint)}paint();v.srcObject=c.captureStream(20);v.play();</script></body>`}));
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByRole('button',{name:/视频与引路灯验证/}).click();await page.locator('.msg-videos').waitFor();
  check('battle is absent from normal navigation',!await page.locator('.sb-nav').getByRole('button',{name:'对战',exact:true}).count());
  check('new monster proactive alert is not mounted',!await page.locator('.hunt-alert').count());
  await page.locator('.msg-videos').click();await page.locator('.vr-card:not(.vr-site)').click();
  const frame=page.locator('.sb-video-shell iframe');await frame.waitFor();await frame.evaluate(el=>{el.dataset.probeIdentity='same-player';});
  check('iframe explicitly denies fullscreen takeover',(await frame.getAttribute('allow')).includes("fullscreen 'none'"));
  await page.getByRole('button',{name:'悬浮播放',exact:true}).click();await page.locator('.sb-video-shell.is-floating').waitFor();
  check('floating does not replace the live player',await page.locator('.is-floating iframe').getAttribute('data-probe-identity')==='same-player');
  const controls=await page.locator('.sb-video-shell .sb-video-controls').boundingBox();
  check('floating controls are actually clickable, not clipped',await page.evaluate(b=>!!document.elementFromPoint(b.x+b.width-15,b.y+b.height/2)?.closest('.sb-video-controls'),controls),controls);
  await page.screenshot({path:join(evidence,'floating-video.png'),fullPage:true});
  const titleBox=await page.locator('.sb-video-controls>span').boundingBox();
  await page.mouse.move(titleBox.x+20,titleBox.y+8);await page.mouse.down();await page.mouse.move(titleBox.x+100,titleBox.y+78,{steps:5});await page.mouse.up();
  const moved=await page.locator('.sb-video-shell.is-floating').boundingBox();
  check('floating player is draggable without replacing the iframe',moved.x>controls.x+50&&await frame.getAttribute('data-probe-identity')==='same-player');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    const closeBox=await page.getByRole('button',{name:'关闭视频',exact:true}).boundingBox();
    check(`floating controls remain visible and clickable at ${width}px`,closeBox.x>=0&&closeBox.x+closeBox.width<=width&&await page.evaluate(b=>!!document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.sb-video-x'),closeBox));
    await page.screenshot({path:join(evidence,`floating-video-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'放大',exact:true}).click();
  check('wide mode is reversible and not browser fullscreen',await page.locator('.is-wide iframe').getAttribute('data-probe-identity')==='same-player'&&await page.evaluate(()=>!document.fullscreenElement));
  await page.getByRole('button',{name:'退出放大',exact:true}).click();
  await page.getByRole('button',{name:'截取当前画面',exact:true}).click();
  await page.waitForFunction(()=>window.__nativeSent.some(m=>m.startsWith('sb-video:capture:')));
  const request=await page.evaluate(()=>JSON.parse(window.__nativeSent.findLast(m=>m.startsWith('sb-video:capture:')).slice('sb-video:capture:'.length)));
  // Browser bridge probe supplies a REAL current renderer capture; native API itself is separately tested by VideoFrameSmoke.
  const bytes=await frame.screenshot(),box=await frame.boundingBox();
  await page.evaluate(payload=>window.__nativeEmit('sb-video:frame-result:'+JSON.stringify(payload)),{id:request.id,name:'probe-live.png',dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:Math.round(box.width),height:Math.round(box.height)});
  await page.getByAltText('刚截取的播放器实时画面').waitFor();
  check('capture preview and download use current frame bytes',await page.getByRole('link',{name:'保存截图'}).getAttribute('href')==='data:image/png;base64,'+bytes.toString('base64'));
  await page.screenshot({path:join(evidence,'captured-video.png'),fullPage:true});
  await page.getByRole('button',{name:'关闭视频',exact:true}).click();check('close actually unloads the playing iframe',await frame.count()===0);
  await page.locator('.sb-browser-close').click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sb:float-guide-open')));
  await page.getByText('验证建议：从刚才的知识接着学',{exact:true}).waitFor();
  await page.waitForTimeout(250); // bridge sends the actual settled guide, no separate AI request
  float=await context.newPage();float.on('pageerror',e=>errors.push(e.message));await float.goto(base+'/#/float');await float.locator('.sb-ball').waitFor();
  writeFileSync(clock,'61000');await float.evaluate(()=>window.__nativeEmit('sb-float:tick'));
  await float.waitForFunction(()=>window.__nativeSent.some(m=>m.startsWith('sb-float:invite:{')&&m.includes('"kind":"guide"')));
  const invitation=await float.evaluate(()=>JSON.parse(window.__nativeSent.findLast(m=>m.startsWith('sb-float:invite:{')&&m.includes('"kind":"guide"')).slice('sb-float:invite:'.length)));
  check('floating guide reuses real recommendation and original session',invitation.topic.includes('验证建议')&&invitation.topic.includes('翻翻词条库')&&await float.evaluate(()=>document.documentElement.dataset.float==='ball'),invitation);
  await float.evaluate(id=>window.__nativeEmit('sb-float:guide-open:'+id),invitation.id);
  await float.waitForFunction(()=>document.documentElement.dataset.float==='screen');await float.getByText('验证建议：从刚才的知识接着学',{exact:true}).waitFor();
  check('clicking guide opens original context without auto-executing a suggestion',await float.locator('.msg-videos').count()===1&&await float.locator('.sb-nav-item.active').count()===0);
  await float.screenshot({path:join(evidence,'floating-guide.png'),fullPage:true});
  await page.getByRole('button',{name:/引路灯/}).first().click().catch(()=>{});
  for(const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'])await page.keyboard.press(key);
  check('hidden duel easter egg remains accessible',await page.evaluate(()=>location.hash==='#/pk'));
  check('no runtime exceptions',errors.length===0,errors);
}catch(e){console.error(e);errors.push(e.stack??String(e));process.exitCode=1;await page?.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});}
finally{writeFileSync(join(evidence,'results.json'),JSON.stringify({checks,errors},null,2));console.log('Evidence: '+evidence);await browser?.close();server.kill();}

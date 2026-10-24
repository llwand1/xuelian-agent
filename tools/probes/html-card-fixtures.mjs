/** Synthetic, self-contained learning cards shared by browser and native regression. */
export const demoHtml = `<!doctype html><html><head><title>弹簧振子 · 就地实验</title>
<style>
body{background:#f8fbff;font-family:system-ui,sans-serif;padding:20px;color:#173147}
h2{font-size:20px;margin:0 0 8px}p{color:#567085;font-size:14px}.lab{border:1px solid #d2e3ee;border-radius:12px;padding:16px;background:white}
.track{height:76px;position:relative;border-bottom:2px solid #b1c8d8;margin:12px 0 20px}.bob{--amplitude:55px;position:absolute;width:36px;height:36px;top:22px;left:45%;border-radius:9px;background:#297fa7;animation:swing 1.4s ease-in-out infinite alternate}
@keyframes swing{from{transform:translateX(calc(-1 * var(--amplitude)))}to{transform:translateX(var(--amplitude))}}button,input{font:inherit}button{background:#236d91;color:white;border:0;border-radius:8px;padding:9px 16px;margin:12px 0}label{display:flex;gap:12px;align-items:center;flex-wrap:wrap}canvas{width:100%;height:auto;border:1px solid #d7e4ed;border-radius:8px}#state{color:#236d91;font-weight:700}
</style></head><body><h2>改变振幅，看运动怎样变化</h2><p>独立 HTML 沙箱 · 动画与控件均在当前对话运行</p>
<div class="lab"><div class="track"><div class="bob"></div></div><label>振幅 <input id="amplitude" type="range" min="10" max="80" value="55"><output id="value">55</output></label>
<button id="toggle">暂停实验</button> <span id="state">运行中</span><canvas id="plot" width="580" height="100"></canvas></div>
<script>
const bob=document.querySelector('.bob'),button=document.querySelector('#toggle'),state=document.querySelector('#state');
button.addEventListener('click',()=>{const paused=bob.style.animationPlayState!=='paused';bob.style.animationPlayState=paused?'paused':'running';button.textContent=paused?'继续实验':'暂停实验';state.textContent=paused?'已暂停':'运行中';});
const slider=document.querySelector('#amplitude');slider.addEventListener('input',()=>{document.querySelector('#value').textContent=slider.value;bob.style.setProperty('--amplitude',slider.value+'px');draw();});
const ctx=document.querySelector('#plot').getContext('2d');function draw(){ctx.clearRect(0,0,580,100);ctx.strokeStyle='#297fa7';ctx.lineWidth=3;ctx.beginPath();for(let x=0;x<580;x++){const y=50+Number(slider.value)/80*42*Math.sin(x/35);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}draw();
window.fixtureStarted=(window.fixtureStarted||0)+1;
</script></body></html>`;

export function attackHtml(base) {
  return `<title>隔离边界验证</title><h2>攻击语料</h2><script>
// Suppress presentation error reporting to inspect the actual browser boundary, not the UI fallback.
addEventListener('securitypolicyviolation',e=>e.stopImmediatePropagation(),true);
(async()=>{const result={};
try{parent.document.body.dataset.leaked='yes';result.parent=false;}catch{result.parent=true;}
try{localStorage.setItem('leak','yes');result.storage=false;}catch{result.storage=true;}
try{result.popup=window.open('about:blank')===null;}catch{result.popup=true;}
try{await fetch('${base}/__html_probe/fetch',{method:'POST',body:'probe'});result.fetch=false;}catch{result.fetch=true;}
try{new WebSocket('ws://127.0.0.1:9/__html_probe/ws');}catch{}
const img=new Image();img.src='${base}/__html_probe/image';
const script=document.createElement('script');script.src='${base}/__html_probe/script';document.head.append(script);
const frame=document.createElement('iframe');frame.src='${base}/__html_probe/frame';document.body.append(frame);
try{parent.postMessage({type:'sb-desktop:capture'},'*');}catch{}
try{window.chrome.webview.postMessage('sb-desktop:capture');result.nativeAttempt=true;}catch{result.nativeAttempt=false;}
parent.postMessage({type:'html-fixture-result',result},'${base}');
})();</script>`;
}

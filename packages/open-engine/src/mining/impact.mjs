import { Group, Tween, Easing } from './vendor/tween.mjs';
const glyphs = { '-': ['000','000','111','000','000'], '1': ['010','110','010','010','111'], '8': ['111','101','111','101','111'], '+': ['000','010','111','010','000'] };
function number(ctx, text, x, y, color) {
  ctx.fillStyle=color;
  [...text].forEach((ch,n)=>glyphs[ch]?.forEach((row,dy)=>[...row].forEach((v,dx)=>{if(v==='1')ctx.fillRect(Math.round(x+n*5+dx),Math.round(y+dy),1,1);})));
}
function sparks(ctx,e,color,count=8) {
  const r=4+e.progress*25;ctx.fillStyle=color;
  for(let i=0;i<count;i++){const a=i*Math.PI*2/count;ctx.fillRect(Math.round(e.x+Math.cos(a)*r),Math.round(e.y+Math.sin(a)*r*.7),i%2+1,2);}
}
function shield(ctx,e,broken) {
  const x=Math.round(e.x),y=Math.round(e.y),r=11+Math.round(e.progress*5);
  ctx.strokeStyle=broken?'#c59cb9':'#9ff3e2';ctx.lineWidth=1;ctx.fillStyle='#6ed6d52b';
  if(broken){sparks(ctx,e,'#a5cce2',6);return;}
  ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y-r);ctx.lineTo(x+r,y+3);ctx.lineTo(x+5,y+r);ctx.lineTo(x,y+r+3);ctx.lineTo(x-5,y+r);ctx.lineTo(x-r,y+3);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#e0fff4';ctx.fillRect(x-1,y-5,2,9);ctx.fillRect(x-4,y-2,8,2);
}
// Bounded action-specific pixel feedback, real local Tween.js time; no giant generic square rings.
export class ImpactLayer {
  constructor(reduced=false) {
    this.reduced=reduced;this.group=new Group();this.items=[];this.clock=0;this.textures={};
    if(typeof Image!=='undefined'){
      const sources={star:new URL('./assets/star_04.png',import.meta.url),spark:new URL('./assets/spark_03.png',import.meta.url),magic:new URL('./assets/magic_03.png',import.meta.url)};
      for(const [key,url] of Object.entries(sources)){const image=new Image();image.src=url.href;this.textures[key]=image;}
    }
  }
  emit(e) {
    if(this.items.length>=8)return;
    const item={x:e.x,y:e.y,kind:e.kind||e.type,fromX:e.fromX??e.x,fromY:e.fromY??e.y,progress:0};this.items.push(item);
    new Tween(item,this.group).to({progress:1},this.reduced?120:item.kind==='defeat'?680:460).easing(Easing.Quadratic.Out)
      .onComplete(()=>{this.items=this.items.filter(i=>i!==item);}).start(this.clock);
  }
  draw(ctx,dt) {
    this.clock+=dt*1000;this.group.update(this.clock,false);
    for(const e of this.items){
      ctx.save();ctx.globalAlpha=1-e.progress;
      const hurt=['wrong','stagger','hurt'].includes(e.kind), guard=['guard','blocked','guard-break'].includes(e.kind);
      const color=hurt?'#f29491':guard?'#9ff3e2':'#ffeab1';
      if(this.reduced){ctx.fillStyle=color;ctx.fillRect(Math.round(e.x)-3,Math.round(e.y)-3,6,6);ctx.restore();continue;}
      if(e.kind==='enemy-attack'||e.kind==='attack'){
        for(let i=0;i<7;i++){const t=Math.max(0,Math.min(1,e.progress*1.8-i*.045));ctx.globalAlpha=(1-e.progress)*(1-i/8);ctx.fillStyle=e.kind==='attack'?'#ffebae':'#f6b08b';ctx.fillRect(Math.round(e.fromX+(e.x-e.fromX)*t),Math.round(e.fromY+(e.y-e.fromY)*t),3,2);}
        ctx.globalAlpha=1-e.progress;
      }
      if(guard)shield(ctx,e,e.kind==='guard-break');
      else if(e.kind==='dodge'){
        ctx.strokeStyle='#c0bde5';ctx.lineWidth=1;
        for(let i=0;i<3;i++){const x=Math.round(e.x-12+e.progress*22+i*5),y=Math.round(e.y-6);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+4,y+5);ctx.lineTo(x,y+10);ctx.stroke();}
      }else if(hurt){sparks(ctx,e,color,6);number(ctx,e.kind==='hurt'?'-8':'-',e.x-4,e.y-12-e.progress*18,color);}
      else if(e.kind!=='enemy-attack'){
        sparks(ctx,e,color,e.kind==='defeat'?12:7);
        if(['attack','slash','defeat','slay'].includes(e.kind)){
          // Two short swept crescents composed of integer pixels, not a rectangular shockwave.
          for(let i=0;i<15;i++){const a=-1.1+i*.12,r=17+e.progress*8;ctx.fillStyle=i<8?'#fff9df':'#e1b567';ctx.fillRect(Math.round(e.x+Math.cos(a)*r-10),Math.round(e.y+Math.sin(a)*r),2,i<8?3:2);}
          if(e.kind==='attack')number(ctx,'-1',e.x-4,e.y-15-e.progress*20,'#fff3ce');
        }
        const texture=this.textures[e.kind==='defeat'?'magic':e.kind==='star'?'star':'spark'];
        if(texture?.complete&&texture.naturalWidth){const size=e.kind==='defeat'?30:14;ctx.imageSmoothingEnabled=false;ctx.drawImage(texture,Math.round(e.x-size/2),Math.round(e.y-size/2),size,size);}
      }
      if(e.kind==='bolt'){ctx.strokeStyle='#e2daff';ctx.beginPath();ctx.moveTo(e.x,e.y-24);ctx.lineTo(e.x+5,e.y-8);ctx.lineTo(e.x-4,e.y);ctx.lineTo(e.x,e.y+15);ctx.stroke();}
      ctx.restore();
    }
  }
  dispose(){this.group.removeAll();this.items=[];}
}

import { Group, Tween, Easing } from './vendor/tween.mjs';

// Real local Tween.js clock, not a decorative dependency. All particles are bounded.
export class ImpactLayer {
  constructor(reduced = false) {
    this.reduced = reduced; this.group = new Group(); this.items = []; this.clock = 0; this.textures = {};
    if (typeof Image !== 'undefined') {
      const sources = { star: new URL('./assets/star_04.png', import.meta.url), spark: new URL('./assets/spark_03.png', import.meta.url), magic: new URL('./assets/magic_03.png', import.meta.url) };
      for (const [key, url] of Object.entries(sources)) { const image = new Image(); image.src = url.href; this.textures[key] = image; }
    }
  }
  emit(e) {
    const item = { x: e.x, y: e.y, kind: e.kind || e.type, fromX: e.fromX ?? e.x, fromY: e.fromY ?? e.y, progress: 0 };
    if (this.items.length >= 8) return;
    this.items.push(item);
    new Tween(item, this.group).to({ progress: 1 }, this.reduced ? 120 : 520).easing(Easing.Quadratic.Out)
      .onComplete(() => { this.items = this.items.filter(i => i !== item); }).start(this.clock);
  }
  draw(ctx, dt) {
    this.clock += dt * 1000; this.group.update(this.clock, false);
    for (const e of this.items) {
      if (e.kind === 'enemy-attack' || e.kind === 'attack') {
        ctx.save();ctx.strokeStyle=e.kind==='attack'?'#ffecad':'#e69a83';ctx.lineWidth=2;
        const dx=e.x-e.fromX,dy=e.y-e.fromY;
        for(let i=0;i<5;i++){
          const t=Math.max(0,e.progress-i*.04),x=Math.round(e.fromX+dx*t),y=Math.round(e.fromY+dy*t);
          ctx.globalAlpha=(1-e.progress)*(1-i/6);ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(x-2,y-2,4,4);
        }
        ctx.restore();
      }
      const wrong = ['wrong', 'stagger', 'hurt', 'guard-break'].includes(e.kind);
      const r = this.reduced ? 8 : 6 + e.progress * 36;
      ctx.save(); ctx.globalAlpha = 1 - e.progress;
      ctx.strokeStyle = wrong ? '#dd837e' : ['guard', 'blocked'].includes(e.kind) ? '#9fded8' : e.kind === 'dodge' ? '#b7b2d8' : '#fff0b5'; ctx.lineWidth = 2;
      // Stepped square shock ring, radial sparks, slash and lightning variations.
      ctx.strokeRect(Math.round(e.x - r), Math.round(e.y - r * .65), Math.round(r * 2), Math.round(r * 1.3));
      const texture = this.textures[e.kind === 'star' ? 'star' : e.kind === 'burst' ? 'magic' : 'spark'];
      if (!this.reduced && texture?.complete && texture.naturalWidth) {
        ctx.imageSmoothingEnabled = false; const size = Math.round(18 + e.progress * 38);
        ctx.drawImage(texture, Math.round(e.x - size / 2), Math.round(e.y - size / 2), size, size);
      }
      if (!this.reduced) for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, x = Math.round(e.x + Math.cos(a) * r * 1.6), y = Math.round(e.y + Math.sin(a) * r);
        ctx.fillStyle = i % 2 ? '#e6b462' : ctx.strokeStyle; ctx.fillRect(x, y, 2 + i % 2, 2);
      }
      if (e.kind === 'bolt') { ctx.beginPath(); ctx.moveTo(e.x - 3, e.y - 38); ctx.lineTo(e.x + 8, e.y - 8); ctx.lineTo(e.x - 7, e.y); ctx.lineTo(e.x + 4, e.y + 30); ctx.stroke(); }
      else if (['attack', 'slash', 'defeat'].includes(e.kind)) for (let i = 0; i < 5; i++) { ctx.fillStyle = '#fff9df'; ctx.fillRect(Math.round(e.x - 25 + i * 10), Math.round(e.y + 12 - i * 6), 12, 3); }
      ctx.restore();
    }
  }
  dispose() { this.group.removeAll(); this.items = []; }
}

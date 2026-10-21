import { MiningSimulation } from './simulation.mjs';
import { Renderer } from './render.mjs';
import { TILE } from './world.mjs';
export { COMBAT_ACTIONS, DEFAULT_COMBAT, parseCombatSettings } from './combat.mjs';

export class MiningRuntime {
  constructor(canvas, { onEncounter, onRequestRound, onNotice = () => {}, onState = () => {}, settings, storageKey = null } = {}) {
    this.canvas = canvas; this.onNotice = onNotice; this.storageKey = storageKey;
    this.input = {}; this.game = new MiningSimulation(onEncounter); this.disposed = false;
    this.onState = onState; this.reportedAt = 0;
    this.requestRound = onRequestRound ?? (() => this.encounter());
    if (settings) this.game.combat.configure(settings);
    this.last = 0; this.accumulator = 0; this.cleanups = [];
    try { const raw = storageKey && localStorage.getItem(storageKey); if (raw) this.game.restore(JSON.parse(raw)); }
    catch { onNotice('矿境存档未能恢复；旧存档未覆盖，本次可继续探索。'); this.storageKey = null; }
    this.renderer = new Renderer(canvas, this.game);
    const listen = (el, event, fn) => { el.addEventListener(event, fn); this.cleanups.push(() => el.removeEventListener(event, fn)); };
    const keys = { a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right', s: 'down', ArrowDown: 'down', w: 'jump', ArrowUp: 'jump', ' ': 'jump' };
    listen(canvas, 'keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const key = keys[e.key] || keys[e.key.toLowerCase()];
      if (key) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.setInput(key, true); }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); this.recall(); }
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); this.requestRound(); }
    });
    listen(canvas, 'keyup', e => { const key = keys[e.key] || keys[e.key.toLowerCase()]; if (key) { e.preventDefault(); e.stopPropagation(); this.setInput(key, false); } });
    listen(canvas, 'blur', () => this.clearInput());
    listen(window, 'blur', () => this.clearInput());
    listen(document, 'visibilitychange', () => { this.clearInput(); this.last = 0; this.save(); });
    const point = e => {
      const box = canvas.getBoundingClientRect(), p = this.renderer.screenToWorld(e.clientX - box.left, e.clientY - box.top);
      this.game.target = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }; return p;
    };
    listen(canvas, 'pointermove', point);
    listen(canvas, 'contextmenu', e => e.preventDefault());
    listen(canvas, 'pointerdown', e => {
      e.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
      const p = point(e);
      if (e.button === 2) { this.game.torch(this.game.target.x, this.game.target.y); return; }
      if (this.game.monsters.hit(p.x, p.y)) onNotice('怪物只受答题结算的平A伤害；点击「开始轮播」准备行动。');
      else this.setInput('mine', true);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, event, () => this.setInput('mine', false));
    this.resize = new ResizeObserver(() => this.renderer.resize()); this.resize.observe(canvas);
    this.timer = setInterval(() => this.save(), 5000);
    this.frame = requestAnimationFrame(t => this.loop(t));
  }
  loop(time) {
    if (this.disposed) return;
    const dt = this.last ? Math.min(.05, (time - this.last) / 1000) : 1 / 60; this.last = time;
    this.accumulator += dt;
    if (!document.hidden) {
      while (this.accumulator >= 1 / 60) { this.game.tick(this.input); this.input.jumpPressed = false; this.accumulator -= 1 / 60; }
      for (const effect of this.game.effects.splice(0)) this.renderer.effect(effect);
      this.renderer.draw(dt);
      if (time - this.reportedAt >= 100) { this.reportedAt = time; this.onState(this.game.combat.state()); }
    } else this.accumulator = 0;
    this.frame = requestAnimationFrame(t => this.loop(t));
  }
  setInput(key, down) { if (key === 'jump' && down && !this.input.jump) this.input.jumpPressed = true; this.input[key] = down; }
  clearInput() { this.input = {}; }
  setPaused(paused) { this.game.paused = paused; this.clearInput(); this.onState(this.state()); }
  setCard(key, origin, answered) { this.game.setCard(key, origin, answered); }
  resolve(kind, key) { const changed = this.game.resolve(kind, key); this.onState(this.game.combat.state()); return changed; }
  configure(settings) { const ok = this.game.combat.configure(settings); this.onState(this.game.combat.state()); return ok; }
  state() { return this.game.combat.state(); }
  recover() { this.game.combat.recover(); this.onState(this.state()); }
  encounter() { const ok = this.game.encounter(); this.onState(this.state()); return ok; }
  recall() { this.game.recall(); this.renderer.snap(); }
  save() {
    if (!this.storageKey) return;
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.game.snapshot())); }
    catch { this.onNotice('矿境自动保存失败（存储不可用或已满）；学习记账不受影响。'); }
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); clearInterval(this.timer);
    this.save(); this.resize.disconnect(); this.cleanups.forEach(f => f()); this.renderer.impacts.dispose();
  }
}

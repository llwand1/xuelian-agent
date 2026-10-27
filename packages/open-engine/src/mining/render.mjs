import { drawMonster } from './monsters.mjs';
import { ImpactLayer } from './impact.mjs';
import { TILE, WIDTH, HEIGHT, BLOCK, BLOCKS, hash } from './world.mjs';
import { HERO_MAP, HERO_PAL, drawSprite } from './studentbuddy-art.mjs';
import { resolveHeldItem, PICKAXE_ITEM, ITEM_ICONS, ITEM_PALETTE } from './inventory.mjs';

// One canvas pixel is two screen pixels. No gradients, blur, or vector artwork.
export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.game = game;
    this.camera = { x: 0, y: 0 }; this.ready = false; this.pointer = null; this.clock = 0; this.particles = []; this.textures = new Map();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; this.impacts = new ImpactLayer(this.reduced); this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(); this.cssW = rect.width; this.cssH = rect.height;
    const w = Math.max(1, Math.floor(rect.width / 2)), h = Math.max(1, Math.floor(rect.height / 2));
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.canvas.width = this.w; this.canvas.height = this.h; this.ctx.imageSmoothingEnabled = false;
    // Changing canvas dimensions clears its buffer. Paint in the resize callback, not one RAF later.
    this.draw(0);
  }
  screenToWorld(x, y) { return { x: x * this.w / this.cssW + Math.round(this.camera.x), y: y * this.h / this.cssH + Math.round(this.camera.y) }; }
  worldToScreen(x, y) { return { x: Math.round((x - Math.round(this.camera.x)) * this.cssW / this.w), y: Math.round((y - Math.round(this.camera.y)) * this.cssH / this.h) }; }
  snap() { this.ready = false; }
  effect(e) {
    if (['impact', 'stagger', 'slay', 'attack', 'dodge', 'guard', 'guard-break', 'hurt', 'blocked', 'defeat', 'pass', 'enemy-attack'].includes(e.type)) { this.impacts.emit(e); return; }
    if (!['chip', 'break', 'jump', 'land', 'place', 'recall', 'teleport'].includes(e.type)) return;
    const n = this.reduced ? 2 : e.type === 'teleport' ? 24 : e.type === 'break' ? 14 : 4;
    for (let i = 0; i < n; i++) this.particles.push({ x: e.x, y: e.y, vx: (Math.random() - .5) * 100, vy: -20 - Math.random() * 80, life: .3 + Math.random() * .3, color: e.color || (e.type === 'teleport' ? i % 2 ? '#c6acf5' : '#efd496' : '#dbc79b') });
    if (this.particles.length > 150) this.particles.splice(0, this.particles.length - 150);
  }
  texture(id, variant) {
    const key = `${id}:${variant}`; if (this.textures.has(key)) return this.textures.get(key);
    const tile = document.createElement('canvas'); tile.width = tile.height = 12;
    const c = tile.getContext('2d');
    const dirt = id === BLOCK.DIRT || id === BLOCK.MOSS;
    const pal = dirt ? ['#895835', '#70472e', '#a06a43', '#b47b4f'] : id === BLOCK.BEDROCK ? ['#39323e', '#24202a', '#504652', '#625566'] : ['#77737d', '#5b5862', '#8b8790', '#9a959c'];
    c.fillStyle = pal[0]; c.fillRect(0, 0, 12, 12);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i, variant, id + 29) * 12), y = Math.floor(hash(i, variant + 11, id + 61) * 12);
      const w = 1 + Math.floor(hash(i, variant, 62) * 3), h = 1 + Math.floor(hash(i, variant, 49) * 2);
      c.fillStyle = pal[1 + i % 3]; c.fillRect(x, y, w, h);
      if (!dirt && i % 4 === 0) { c.fillStyle = pal[1]; c.fillRect(x + w, y + 1, 1, 3); }
    }
    if (id >= BLOCK.CRYSTAL && id <= BLOCK.GOLD) {
      const ore = id === BLOCK.CRYSTAL ? ['#3b728e', '#6bb1d4', '#b8e3ee'] : id === BLOCK.AMETHYST ? ['#67517c', '#ac8dcd', '#dbc8ec'] : ['#8e6b31', '#d9ae4e', '#f5df95'];
      for (let i = 0; i < 4; i++) {
        const x = 1 + (i * 3 + variant) % 9, y = 1 + (i * 5 + variant * 2) % 9;
        c.fillStyle = ore[0]; c.fillRect(x - 1, y, 4, 3); c.fillStyle = ore[1]; c.fillRect(x, y, 2, 3); c.fillStyle = ore[2]; c.fillRect(x, y, 1, 1);
      }
    }
    this.textures.set(key, tile); return tile;
  }
  background() {
    const c = this.ctx, w = this.w, h = this.h, cam = this.camera;
    for (let y = 0; y < h; y += 24) { c.fillStyle = ['#619bd6', '#6da9df', '#7bb6e4', '#87c2e8'][Math.min(3, Math.floor(y / Math.max(1, h / 4)))]; c.fillRect(0, y, w, 24); }
    // Pixel clouds with flat shaded undersides, moving only through parallax.
    for (let i = -1; i < 8; i++) {
      const x = Math.round(i * 103 - (cam.x * .13 % 103)), y = 14 + (i * 23 + 100) % Math.max(20, Math.floor(h * .3));
      c.fillStyle = '#bfd8ec'; c.fillRect(x, y + 11, 48, 8); c.fillRect(x + 7, y + 7, 37, 14);
      c.fillStyle = '#edf1ed'; c.fillRect(x + 4, y + 7, 39, 8); c.fillRect(x + 11, y + 2, 16, 15); c.fillRect(x + 27, y + 5, 12, 11);
    }
    const horizon = (this.game.world.definition ? Math.floor((this.game.world.spawn.y + 38) / TILE) : 38) * TILE - cam.y;
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = ['#75a9b7', '#64989c', '#52877c'][layer];
      for (let x = 0; x < w; x += 4) {
        const worldX = x + cam.x * (.12 + layer * .1);
        const height = 18 + Math.sin(worldX * .018 + layer) * 12 + Math.sin(worldX * .043) * 6;
        const y = Math.floor(horizon - height - (2 - layer) * 13);
        c.fillRect(x, y, 4, h - y);
      }
    }
    // Far forest, made from stepped foliage rather than smooth silhouettes.
    c.fillStyle = '#3e7865';
    for (let i = -1; i < Math.ceil(w / 29) + 1; i++) {
      const x = Math.floor(i * 29 - cam.x * .37 % 29), y = Math.floor(horizon - 32 - hash(i, 5) * 23);
      c.fillRect(x + 13, y + 16, 3, 67); c.fillRect(x + 4, y + 9, 22, 22); c.fillRect(x, y + 17, 29, 10); c.fillRect(x + 9, y + 3, 14, 34);
    }
  }
  tree(tx) {
    const c = this.ctx, g = this.game.world;
    if (tx >= 43 && tx <= 57 || g.get(tx, g.surface[tx]) !== BLOCK.MOSS || hash(tx, 14, g.seed) < .62) return;
    const x = tx * TILE + 10, y = g.surface[tx] * TILE, tall = 66 + Math.floor(hash(tx, 15, g.seed) * 5) * 8;
    c.fillStyle = '#513c29'; c.fillRect(x - 2, y - tall, 10, tall); c.fillRect(x - 6, y - 4, 18, 4);
    c.fillStyle = '#9a6a39'; c.fillRect(x, y - tall, 3, tall); c.fillStyle = '#704c2b';
    for (let i = 12; i < tall; i += 17) { c.fillRect(x + 4, y - i, 4, 3); c.fillRect(x - 1, y - i - 7, 3, 4); }
    c.fillStyle = '#28512d'; c.fillRect(x - 28, y - tall - 5, 60, 29); c.fillRect(x - 19, y - tall - 20, 42, 50);
    c.fillStyle = '#3b792f'; c.fillRect(x - 31, y - tall - 10, 50, 25); c.fillRect(x - 18, y - tall - 26, 40, 35); c.fillRect(x + 17, y - tall - 12, 18, 27);
    c.fillStyle = '#53983c'; c.fillRect(x - 20, y - tall - 22, 26, 11); c.fillRect(x - 28, y - tall - 9, 15, 9); c.fillRect(x + 7, y - tall - 17, 16, 8);
    c.fillStyle = '#6da74a'; c.fillRect(x - 13, y - tall - 23, 9, 4); c.fillRect(x + 9, y - tall - 16, 5, 3);
  }
  tile(tx, ty, id) {
    const c = this.ctx, world = this.game.world, x = tx * TILE, y = ty * TILE;
    if (id === BLOCK.PLATFORM) {
      c.fillStyle = '#50351f'; c.fillRect(x, y, 24, 6); c.fillStyle = '#b48a50'; c.fillRect(x, y, 24, 2); c.fillRect(x + 3, y + 2, 3, 6); c.fillRect(x + 18, y + 2, 3, 6); return;
    }
    c.drawImage(this.texture(id, Math.floor(hash(tx, ty, world.seed) * 6)), x, y, 24, 24);
    // Only exposed edges are outlined. The terrain should not read as a tiled grid.
    c.fillStyle = id <= BLOCK.DIRT ? '#503725' : '#413d48';
    if (!world.solid(tx - 1, ty)) c.fillRect(x, y, 2, 24);
    if (!world.solid(tx + 1, ty)) c.fillRect(x + 22, y, 2, 24);
    if (!world.solid(tx, ty + 1)) c.fillRect(x, y + 22, 24, 2);
    if (!world.solid(tx, ty - 1)) { c.fillStyle = id <= BLOCK.DIRT ? '#be8c53' : '#a29aa3'; c.fillRect(x, y, 24, 2); }
    if (id === BLOCK.MOSS) {
      c.fillStyle = '#345b25'; c.fillRect(x, y, 24, 7);
      c.fillStyle = '#538d2d'; c.fillRect(x, y, 24, 4);
      c.fillStyle = '#88c947'; c.fillRect(x, y, 24, 2);
      for (let i = 0; i < 5; i++) { const dx = (i * 6 + tx) % 23; c.fillStyle = i % 2 ? '#6cb238' : '#46922d'; c.fillRect(x + dx, y + 3, 2, 3 + (i + tx) % 3); }
      if (world.get(tx, ty - 1) === BLOCK.AIR) {
        c.fillStyle = '#70af36';
        for (let i = 0; i < 4; i++) c.fillRect(x + (i * 7 + tx * 3) % 23, y - 2 - i % 2 * 2, 2, 4);
        if (hash(tx, 23, world.seed) > .8) { c.fillStyle = '#d5ddec'; c.fillRect(x + 14, y - 6, 2, 2); c.fillStyle = '#e7b76c'; c.fillRect(x + 16, y - 6, 2, 2); }
      }
    }
    const d = this.game.damage.get(world.index(tx, ty));
    if (d) {
      const progress = d.amount / BLOCKS[id].hp;
      c.fillStyle = '#30252e'; c.fillRect(x + 11, y + 4, 2, 7); c.fillRect(x + 8, y + 10, 5, 2);
      if (progress > .3) { c.fillRect(x + 8, y + 10, 2, 7); c.fillRect(x + 10, y + 15, 7, 2); }
      if (progress > .65) { c.fillRect(x + 16, y + 15, 2, 7); c.fillRect(x + 3, y + 7, 8, 2); }
    }
  }
  actor(p, sprite) {
    const c = this.ctx, map = sprite?.pixels || HERO_MAP, palette = sprite?.palette || HERO_PAL;
    const width = Math.max(...map.map(row => row.length)), scale = width <= 20 && map.length <= 19 ? 2 : 1;
    const x = Math.round(p.x + p.w / 2 - width * scale / 2), y = Math.round(p.y + p.h - map.length * scale + p.renderOffset);
    const walking = p.grounded && Math.abs(p.vx) > 12, step = walking ? Math.floor(p.walk * .08) % 4 : 0;
    drawSprite(c, map, palette, x, y + (walking && step % 2 ? -1 : 0), {
      scale, flip: p.facing < 0,
      rowShift: row => row >= map.length - 4 && walking ? (step < 2 ? 1 : -1) : row >= 7 && row < map.length - 4 && step % 2 ? -1 : 0
    });
  }
  player() {
    const g = this.game, p = g.player, c = this.ctx;
    const appearance = g.registry.get('characters', g.appearanceId);
    c.save(); if (g.combat.hurt > 0 && !this.reduced) c.globalAlpha = Math.floor(g.combat.hurt * 20) % 2 ? .5 : 1;
    this.actor(p, g.registry.get('sprites', appearance?.spriteId)); c.restore();
    if (g.combat.guard > 0) {
      c.fillStyle = '#9fded8';
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + (this.reduced ? 0 : this.clock * .8); c.fillRect(Math.round(p.x + 9 + Math.cos(a) * 16), Math.round(p.y + 18 + Math.sin(a) * 23), 2, 2); }
    }
    const y = Math.round(p.y + 4 + p.renderOffset);
    const held = resolveHeldItem(g.registry, g.heldItem);
    if (held.id === PICKAXE_ITEM) {
    // Small original pixel pickaxe, a few integer-angle poses (not smooth vector art).
    const swing = this.game.swing > 0;
    const poses = [[[0, 0], [2, -2], [4, -4], [6, -6], [8, -8]], [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0]], [[0, 0], [2, 2], [4, 4], [6, 6], [8, 8]]];
    const pose = swing ? poses[Math.floor(this.clock * 14) % 3] : poses[0];
    const hx = Math.round(p.x + 9 + p.facing * 10), hy = y + 17;
    c.fillStyle = '#34241d'; for (const [dx, dy] of pose) c.fillRect(hx + dx * p.facing, hy + dy, 3, 3);
    c.fillStyle = '#ab8452'; for (const [dx, dy] of pose) c.fillRect(hx + dx * p.facing, hy + dy, 1, 2);
    const end = pose.at(-1), ex = hx + end[0] * p.facing, ey = hy + end[1];
    c.fillStyle = '#3c3c4d'; c.fillRect(ex - 4, ey - 3, 12, 4); c.fillRect(ex - 6, ey - 1, 3, 6); c.fillRect(ex + 6, ey - 1, 3, 6);
    c.fillStyle = '#b0bec9'; c.fillRect(ex - 3, ey - 3, 10, 2); c.fillStyle = '#ecdfb9'; c.fillRect(ex, ey - 3, 3, 2);
    } else drawSprite(c, ITEM_ICONS[held.icon] || ITEM_ICONS.spark, ITEM_PALETTE, Math.round(p.x + (p.facing > 0 ? 13 : -11)), y + 13, { scale: 1, flip: p.facing < 0 });
    if (g.teleportFlash > 0) {
      const phase = Math.floor(this.clock * 9) % 3;
      c.fillStyle = '#7061a0'; c.fillRect(Math.round(p.x - 8), Math.round(p.y + 36), 35, 3);
      for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#baa3ee' : '#e6c78b'; const angle = i * Math.PI / 5 + phase * .25; c.fillRect(Math.round(p.x + 9 + Math.cos(angle) * 20), Math.round(p.y + 18 + Math.sin(angle) * 24), 2, 3); }
    }
  }
  light(x0, x1, y0, y1) {
    const c = this.ctx, world = this.game.world, p = this.game.player;
    const lights = world.lanterns.filter(l => l.x > x0 - 6 && l.x < x1 + 6 && l.y > y0 - 6 && l.y < y1 + 6);
    for (let y = y0 * TILE; y <= (y1 + 1) * TILE; y += 8) for (let x = x0 * TILE; x <= (x1 + 1) * TILE; x += 8) {
      const tx = Math.min(WIDTH - 1, Math.max(0, Math.floor(x / TILE))), ty = Math.min(HEIGHT - 1, Math.max(0, Math.floor(y / TILE)));
      if (ty < world.surface[tx] + 1) continue;
      const depth = (y / TILE - world.surface[tx]);
      let brightness = Math.max(0, .88 - depth * .16);
      brightness = Math.max(brightness, 1 - Math.hypot(x + 4 - p.x - 9, (y + 4 - p.y - 19) * 1.05) / 150);
      for (const l of lights) brightness = Math.max(brightness, .96 - Math.hypot(x + 4 - (l.x + .5) * TILE, y + 4 - (l.y + .5) * TILE) / 137);
      if (!world.explored[world.index(tx, ty)]) brightness = Math.min(brightness, .12);
      const alpha = Math.min(.96, Math.max(0, Math.round((1 - brightness) * 7) / 7));
      if (alpha > 0) { c.fillStyle = `rgba(12,9,17,${alpha})`; c.fillRect(x, y, 8, 8); }
    }
  }
  draw(dt) {
    if (!this.cssW || !this.cssH) return;
    const g = this.game, world = g.world, p = g.player, c = this.ctx;
    this.clock += dt;
    const tx = Math.max(0, Math.min(WIDTH * TILE - this.w, p.x + 9 - this.w * .43));
    const ty = Math.max(0, Math.min(HEIGHT * TILE - this.h, p.y + 15 - this.h * .56));
    if (!this.ready) { this.camera = { x: tx, y: ty }; this.ready = true; }
    else { const a = 1 - Math.exp(-9 * dt); this.camera.x += (tx - this.camera.x) * a; this.camera.y += (ty - this.camera.y) * a; }
    c.setTransform(1, 0, 0, 1, 0, 0); this.background();
    c.save(); c.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));
    const x0 = Math.max(0, Math.floor(this.camera.x / TILE) - 1), x1 = Math.min(WIDTH - 1, Math.ceil((this.camera.x + this.w) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(this.camera.y / TILE) - 1), y1 = Math.min(HEIGHT - 1, Math.ceil((this.camera.y + this.h) / TILE) + 1);
    for (let x = Math.max(1, x0 - 3); x <= Math.min(WIDTH - 2, x1 + 3); x++) this.tree(x);
    // The underground background wall is brown near soil, charcoal in deep caves.
    for (let x = x0; x <= x1; x++) {
      const top = world.surface[x] * TILE;
      c.fillStyle = '#4a302a'; c.fillRect(x * TILE, top, TILE, Math.max(0, (y1 + 1) * TILE - top));
      c.fillStyle = '#2d272e'; c.fillRect(x * TILE, top + 6 * TILE, TILE, Math.max(0, (y1 + 1) * TILE - top - 6 * TILE));
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const id = world.get(x, y);
      if (id) this.tile(x, y, id);
      else if (y >= world.surface[x] && hash(x, y, world.seed) > .55) { c.fillStyle = '#44363a'; c.fillRect(x * TILE + 4, y * TILE + 10, 8, 2); c.fillStyle = '#1f1c25'; c.fillRect(x * TILE + 12, y * TILE + 12, 2, 7); }
    }
    for (const l of world.lanterns) {
      if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
      const x = l.x * TILE + 11, y = l.y * TILE + 13, flick = this.reduced ? 0 : Math.floor(this.clock * 6 + l.x) % 2;
      c.fillStyle = '#39291e'; c.fillRect(x, y - 2, 4, 10); c.fillStyle = '#a0743e'; c.fillRect(x, y, 2, 8);
      c.fillStyle = '#d27030'; c.fillRect(x - 2, y - 9, 7, 8); c.fillStyle = '#f3bb4d'; c.fillRect(x, y - 11 - flick, 3, 9); c.fillStyle = '#ffe5a2'; c.fillRect(x + 1, y - 7, 2, 5);
    }
    for (const npc of g.npcs) {
      if (npc.x < this.camera.x - TILE || npc.x > this.camera.x + this.w + TILE || npc.y < this.camera.y - TILE * 2 || npc.y > this.camera.y + this.h + TILE) continue;
      const definition = g.registry.get('npcs', npc.id); this.actor(npc, g.registry.get('sprites', definition.spriteId));
      // Names and replies are native-resolution DOM text, never scaled canvas text.
    }
    drawMonster(c, g.monsters?.current, this.clock);
    this.player();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const e = this.particles[i]; e.life -= dt; if (e.life <= 0) { this.particles.splice(i, 1); continue; }
      e.x += e.vx * dt; e.y += e.vy * dt; e.vy += dt * 200; c.fillStyle = e.color; c.fillRect(Math.round(e.x), Math.round(e.y), 2, 2);
    }
    this.light(x0, x1, y0, y1);
    if (g.target && world.inside(g.target.x, g.target.y)) {
      const t = g.target, x = t.x * TILE, y = t.y * TILE, valid = g.targetState(t.x, t.y) === 'ok';
      c.strokeStyle = valid ? '#f4da8f' : '#b96c70'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, 23, 23);
      if (g.mining) { c.fillStyle = '#302328'; c.fillRect(x, y - 5, 24, 3); c.fillStyle = '#f4da8f'; c.fillRect(x, y - 5, Math.round(24 * g.mining.progress), 2); }
    }
    this.impacts.draw(c, dt);
    c.restore();
  }
}

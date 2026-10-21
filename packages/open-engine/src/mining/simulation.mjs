import { World, TILE, BLOCK, BLOCKS, WIDTH, HEIGHT } from './world.mjs';
import { createPlayer, stepPlayer, safeSpawn } from './physics.mjs';
import { PICKAXE_ITEM } from './inventory.mjs';
import { MonsterDirector } from './monsters.mjs';
import { MiningCombat } from './combat.mjs';

// Game domain only: no term database, question generator, grading or network calls.
// The host owns learning; mining/contact merely asks the host to reveal its current card.
export class MiningSimulation {
  constructor(onEncounter = () => {}) {
    this.world = new World(137); this.player = createPlayer(this.world.spawn);
    this.damage = new Map(); this.mining = null; this.target = null; this.swing = 0;
    this.time = 0; this.mined = 0; this.teleportFlash = 0; this.effects = [];
    this.npcs = []; this.heldItem = PICKAXE_ITEM;
    this.registry = { get: () => null, list: () => [] };
    this.onEncounter = onEncounter; this.paused = false; this.available = false;
    this.monsters = new MonsterDirector(this);
    this.combat = new MiningCombat(this);
  }
  effect(type, data = {}) { this.effects.push({ type, ...data }); }
  targetState(tx, ty) {
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || !this.world.inside(tx, ty)) return 'outside';
    const p = this.player;
    if (Math.hypot((tx + .5) * TILE - p.x - 9, (ty + .5) * TILE - p.y - 19) > TILE * 6) return 'range';
    if (!this.world.clearLine(p.x + 9, p.y + 19, tx, ty)) return 'blocked';
    return this.world.get(tx, ty) === BLOCK.BEDROCK ? 'bedrock' : 'ok';
  }
  tick(input, dt = 1 / 60) {
    if (this.paused) return;
    this.time += dt; this.swing = Math.max(0, this.swing - dt); this.teleportFlash = Math.max(0, this.teleportFlash - dt);
    const move = stepPlayer(this.player, this.world, input, dt);
    if (move.jumped) this.effect('jump', { x: this.player.x + 9, y: this.player.y + 38 });
    if (move.landed) this.effect('land', { x: this.player.x + 9, y: this.player.y + 38 });
    this.world.reveal(this.player.x + 9, this.player.y + 19, 10);
    if (input.mine && this.target) this.mine(this.target.x, this.target.y, dt); else this.mining = null;
    this.monsters.tick(dt);
    this.combat.tick(dt);
  }
  mine(tx, ty, dt) {
    if (this.paused || this.targetState(tx, ty) !== 'ok') { this.mining = null; return false; }
    const id = this.world.get(tx, ty), block = BLOCKS[id];
    if (!id) return false;
    const index = this.world.index(tx, ty), damage = this.damage.get(index) || { amount: 0, pulse: 0 };
    damage.amount += 10 * dt; damage.pulse += dt; this.damage.set(index, damage);
    this.mining = { x: tx, y: ty, progress: Math.min(1, damage.amount / block.hp) }; this.swing = .18;
    if (damage.pulse > .12) { damage.pulse = 0; this.effect('chip', { x: (tx + .5) * TILE, y: (ty + .5) * TILE, color: block.color }); }
    if (damage.amount < block.hp) return false;
    this.world.set(tx, ty, BLOCK.AIR); this.damage.delete(index); this.mined++;
    this.effect('break', { x: (tx + .5) * TILE, y: (ty + .5) * TILE, color: block.color });
    return true;
  }
  encounter() {
    return this.combat.begin();
  }
  setCard(key, origin, answered = false) {
    this.cardResolved = key === this.cardKey ? this.cardResolved || answered : answered;
    this.available = !!key; this.cardKey = key; this.monsters.setCard(key, origin);
  }
  resolve(kind, key) { return this.combat.resolve(kind, key); }
  recall() {
    const world = this.world, floor = Math.floor((world.spawn.y + 38) / TILE), sx = Math.floor(world.spawn.x / TILE);
    for (let x = sx - 1; x <= sx + 1; x++) {
      world.set(x, floor, BLOCK.DIRT);
      for (let y = floor - 2; y < floor; y++) world.set(x, y, BLOCK.AIR);
    }
    this.player = createPlayer(world.spawn); safeSpawn(this.player, world); this.target = null;
    this.teleportFlash = .8; this.effect('teleport', { x: this.player.x + 9, y: this.player.y + 19 });
  }
  torch(tx, ty) {
    if (this.targetState(tx, ty) !== 'ok' || this.world.get(tx, ty) || this.world.lanterns.length >= 1000 || this.world.lanterns.some(l => l.x === tx && l.y === ty)) return false;
    this.world.lanterns.push({ x: tx, y: ty }); this.effect('place', { x: (tx + .5) * TILE, y: (ty + .5) * TILE }); return true;
  }
  snapshot() {
    return { version: 1, seed: this.world.seed, deltas: [...this.world.deltas], lanterns: this.world.lanterns, explored: [...this.world.explored], player: { x: this.player.x, y: this.player.y }, mined: this.mined };
  }
  restore(v) {
    if (!v || v.version !== 1 || v.seed !== 137 || !Array.isArray(v.deltas) || v.deltas.length > WIDTH * HEIGHT || !Array.isArray(v.lanterns) || v.lanterns.length > 1000 || !Number.isFinite(v.player?.x) || !Number.isFinite(v.player?.y) || v.player.x < TILE || v.player.x > (WIDTH - 1) * TILE - 18 || v.player.y < 0 || v.player.y > (HEIGHT - 2) * TILE - 38 || !Number.isInteger(v.mined) || v.mined < 0) throw new Error('矿境存档格式无效');
    const world = new World(137), seen = new Set();
    for (const pair of v.deltas) {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('矿境地形存档无效');
      const [i, id] = pair;
      if (!Number.isInteger(i) || i < 0 || i >= WIDTH * (HEIGHT - 2) || i % WIDTH === 0 || i % WIDTH === WIDTH - 1 || seen.has(i) || !Number.isInteger(id) || !BLOCKS[id] || id === BLOCK.BEDROCK) throw new Error('矿境地形存档无效');
      seen.add(i); world.set(i % WIDTH, Math.floor(i / WIDTH), id);
    }
    for (const l of v.lanterns) if (!l || !Number.isInteger(l.x) || !Number.isInteger(l.y) || !world.inside(l.x, l.y)) throw new Error('矿境火把存档无效');
    world.lanterns = v.lanterns.map(l => ({ x: l.x, y: l.y }));
    if (v.explored !== undefined) {
      if (!Array.isArray(v.explored) || v.explored.length !== WIDTH * HEIGHT || v.explored.some(n => n !== 0 && n !== 1)) throw new Error('矿境探索存档无效');
      world.explored.set(v.explored);
    }
    const player = createPlayer(v.player); safeSpawn(player, world);
    this.world = world; this.player = player; this.mined = v.mined;
  }
}

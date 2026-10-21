import { createPlayer, stepPlayer, collides } from './physics.mjs';
import { TILE, WIDTH } from './world.mjs';

export const MONSTER_KINDS = ['slime', 'bat', 'wisp'];
export const MONSTER_LABELS = { slime: '遗忘史莱姆', bat: '混淆蝠', wisp: '词火灵' };
// One current learning encounter, not an independent combat/progression economy.
export class MonsterDirector {
  constructor(game) { this.game = game; this.current = null; this.serial = 0; this.wait = 15; this.available = false; this.origin = 'library'; }
  setCard(key, origin = 'library') {
    this.available = !!key; this.origin = origin;
    if (!key) this.current = null;
  }
  spawn() {
    const g = this.game, p = g.player;
    let spawn = null;
    for (const dx of [4, -4, 3, -3, 2, -2, 1, -1]) {
      const x = Math.max(TILE, Math.min((WIDTH - 2) * TILE, p.x + dx * TILE));
      for (let dy = -2; dy <= 3; dy++) {
        const y = Math.floor((p.y + p.h) / TILE) * TILE + dy * TILE - 20;
        if (g.world.solid(Math.floor((x + 11) / TILE), Math.floor((y + 20) / TILE)) && !collides(g.world, x, y, 22, 20)) { spawn = { x, y }; break; }
      }
      if (spawn) break;
    }
    if (!spawn) spawn = { x: p.x, y: p.y + 18 };
    const kind = MONSTER_KINDS[this.serial++ % MONSTER_KINDS.length];
    this.current = { ...createPlayer(spawn), w: 22, h: 20, key: String(this.serial), origin: this.origin, kind, state: 'alive', age: 0, cooldown: .8, anchor: spawn, flash: 0, dodge: 0, hp: 3, maxHp: 3, attackIn: this.game.combat.settings.attackSeconds };
  }
  tick(dt) {
    const m = this.current, g = this.game;
    if (!this.available || g.combat.hp <= 0) return;
    if (!m || m.state !== 'alive') {
      this.wait = Math.max(0, this.wait - dt);
      if (this.wait <= .00001) this.spawn();
      return;
    }
    m.age += dt; m.cooldown -= dt; m.flash = Math.max(0, m.flash - dt); m.dodge = Math.max(0, m.dodge - dt);
    if (m.kind === 'slime') {
      const jump = m.cooldown <= 0;
      stepPlayer(m, g.world, { left: m.x > g.player.x + 36, right: m.x < g.player.x - 36, jump, jumpPressed: jump }, dt);
      if (jump) m.cooldown = 1.6;
    } else {
      const x = m.anchor.x + Math.sin(m.age * 1.4) * 30, y = m.anchor.y - 12 + Math.sin(m.age * 2.2) * 12;
      if (!collides(g.world, x, y, m.w, m.h)) { m.x = x; m.y = y; }
    }
    m.attackIn = Math.max(0, m.attackIn - dt);
    if (m.attackIn <= .00001) {
      if (Math.hypot(m.x - g.player.x, m.y - g.player.y) < TILE * 9) g.combat.enemyAttack();
      m.attackIn = g.combat.settings.attackSeconds;
    }
  }
  hit(x, y) {
    const m = this.current;
    return !!m && m.state === 'alive' && x >= m.x - 8 && x <= m.x + m.w + 8 && y >= m.y - 8 && y <= m.y + m.h + 8;
  }
}

// Original, code-native pixel art. No commercial game sprites or assets.
export function drawMonster(ctx, m, time) {
  if (!m || m.state !== 'alive') return;
  const x = Math.round(m.x + (m.dodge ? Math.sin(m.dodge * 16) * 12 : 0)), y = Math.round(m.y), beat = Math.floor(time * 6) % 2;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = m.flash ? '#fff4d2' : m.origin === 'due' ? '#c572c9' : m.kind === 'wisp' ? '#f0bd64' : '#73bb8c';
  if (m.kind === 'slime') { ctx.fillRect(2, 7 - beat, 18, 12 + beat); ctx.fillRect(5, 3 - beat, 12, 16); }
  else if (m.kind === 'bat') { ctx.fillRect(7, 5, 10, 13); ctx.fillRect(-8, beat ? 9 : 1, 17, 6); ctx.fillRect(16, beat ? 9 : 1, 17, 6); ctx.fillRect(6, 1, 3, 7); ctx.fillRect(16, 1, 3, 7); }
  else { ctx.fillRect(6, 1 - beat, 10, 18); ctx.fillRect(2, 6 - beat, 18, 10); ctx.fillRect(8, -4 - beat, 6, 8); ctx.fillStyle = '#fff0ba'; ctx.fillRect(8, 7, 6, 7); }
  ctx.fillStyle = '#292239'; ctx.fillRect(6, 8, 3, 4); ctx.fillRect(14, 8, 3, 4);
  ctx.fillStyle = '#fff1d2'; ctx.fillRect(6, 8, 1, 1); ctx.fillRect(14, 8, 1, 1);
  ctx.fillStyle = '#342439'; ctx.fillRect(0, -10, 24, 3);
  ctx.fillStyle = m.attackIn <= 1.5 ? '#ffad72' : '#dd9cd9'; ctx.fillRect(0, -10, Math.round(24 * m.hp / m.maxHp), 3);
  if (m.attackIn <= 1.5) { ctx.fillStyle = '#fff0b3'; ctx.fillRect(10, -22, 3, 7); ctx.fillRect(10, -13, 3, 2); }
  ctx.restore();
}

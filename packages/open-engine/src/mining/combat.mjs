// Extensible action registry: every future action supplies both learning outcomes.
export const COMBAT_ACTIONS = Object.freeze({
  attack: { code: 'A', label: '平A', success: '攻击命中', failure: '攻击被闪避', apply(c, m, ok) {
    const g=c.game;g.swing=.5;
    if(ok){
      m.hp--;m.flash=.4;c.say('attack','平A命中 · 怪物生命 -1','monster');
      if(m.hp<=0){m.state='defeated';g.monsters.wait=c.settings.spawnSeconds;c.say('defeat','怪物击破 · 下一只将按间隔出现。','monster');}
    }else{m.dodge=.5;c.say('dodge','平A被闪避 · 本轮未造成伤害','monster');}
  } },
  defend: { code: 'B', label: '防御', success: '架起护盾', failure: '防御失误', apply(c, _m, ok) {
    if(ok){c.guard=Math.min(2,c.guard+1);c.say('guard','防御成功 · 护盾可抵挡一次攻击');}
    else{c.guard=0;c.say('guard-break','防御失误 · 未形成护盾');}
  } },
});
export const DEFAULT_COMBAT = Object.freeze({ spawnSeconds: 15, roundSeconds: 4, attackSeconds: 12, sequence: ['attack', 'defend'] });
export function parseCombatSettings(v) {
  if (!v || typeof v !== 'object' || !Number.isInteger(v.spawnSeconds) || v.spawnSeconds < 5 || v.spawnSeconds > 120 ||
    !Number.isInteger(v.roundSeconds) || v.roundSeconds < 2 || v.roundSeconds > 30 ||
    !Number.isInteger(v.attackSeconds) || v.attackSeconds < 8 || v.attackSeconds > 60 ||
    !Array.isArray(v.sequence) || !v.sequence.length || v.sequence.length > 16 || v.sequence.some(a => typeof a !== 'string' || !Object.hasOwn(COMBAT_ACTIONS, a))) return null;
  return { spawnSeconds: v.spawnSeconds, roundSeconds: v.roundSeconds, attackSeconds: v.attackSeconds, sequence: [...v.sequence] };
}
export class MiningCombat {
  constructor(game) {
    this.game = game; this.settings = parseCombatSettings(DEFAULT_COMBAT); this.index = 0; this.pending = null;
    this.cooldown = 0; this.hp = 100; this.guard = 0; this.hurt = 0; this.event = 0; this.log = [];
    this.say('quiet', '安静探索，怪物会按间隔出现。');
  }
  say(kind, text, target = 'player') {
    this.log.unshift({ id: ++this.event, kind, text }); this.log.length = Math.min(5, this.log.length);
    if (['quiet', 'pass', 'recover'].includes(kind)) return;
    const g = this.game, p = target === 'monster' ? g.monsters?.current ?? g.player : g.player;
    g.effect(kind, { x: p.x + p.w / 2, y: p.y + p.h / 2, kind, fromX: g.player.x + 9, fromY: g.player.y + 19 });
  }
  configure(value) {
    const next = parseCombatSettings(value); if (!next) return false;
    this.settings = next; this.index %= next.sequence.length;
    // Do not accelerate an attack or a round already in flight when editing difficulty.
    this.game.monsters.wait = next.spawnSeconds;
    if (this.game.monsters.current?.state === 'alive') this.game.monsters.current.attackIn = Math.max(this.game.monsters.current.attackIn, next.attackSeconds);
    return true;
  }
  begin() {
    const g = this.game;
    if (g.paused || !g.available || g.cardResolved || this.hp <= 0 || this.pending || this.cooldown > .001 || g.monsters.current?.state !== 'alive') return false;
    this.pending = { action: this.settings.sequence[this.index], key: g.cardKey, target: g.monsters.current.key };
    g.onEncounter('monster'); return true;
  }
  resolve(kind, key = this.game.cardKey) {
    if (!['wrong', 'slay', 'slash', 'burst', 'star', 'bolt', 'ink'].includes(kind)) return false;
    if (!this.pending || this.pending.key !== key) return false;
    const action = this.pending.action, target = this.pending.target, g = this.game, m = g.monsters.current;
    g.cardResolved = true;
    this.pending = null; this.index = (this.index + 1) % this.settings.sequence.length; this.cooldown = this.settings.roundSeconds;
    if (kind === 'slay') { this.say('pass', '斩：跳过本轮，没有攻击或防御。'); return true; }
    if (this.hp <= 0 || m?.state !== 'alive' || m.key !== target) { this.say('pass', '本轮学习已记录，原战斗目标已离场。'); return true; }
    const ok = kind !== 'wrong';
    COMBAT_ACTIONS[action].apply(this, m, ok);
    return true;
  }
  enemyAttack() {
    if (this.hp <= 0) return;
    const m=this.game.monsters.current,p=this.game.player;
    if(m)this.game.effect('enemy-attack',{kind:'enemy-attack',x:p.x+9,y:p.y+19,fromX:m.x+11,fromY:m.y+10});
    if (this.guard > 0) { this.guard--; this.say('blocked', '护盾格挡 · 未受伤'); return; }
    this.hp = Math.max(0, this.hp - 8); this.hurt = .45; this.say('hurt', '受到攻击 · 生命 -8');
    if (!this.hp) {
      this.game.monsters.current.state = 'dismissed'; this.game.recall();
      this.say('recover', '已回营休息。学习进度保留，点击「恢复出发」继续。');
    }
  }
  recover() {
    if (this.hp > 0) return;
    this.hp = 100; this.guard = 0; this.game.monsters.wait = this.settings.spawnSeconds;
    this.say('recover', '恢复完成 · 新怪物仍会等待刷怪间隔');
  }
  tick(dt) { this.cooldown = Math.max(0, this.cooldown - dt); this.hurt = Math.max(0, this.hurt - dt); }
  state() {
    const m = this.game.monsters.current;
    return { hp: this.hp, guard: this.guard, index: this.index, pending: this.pending?.action ?? null,
      cooldown: this.cooldown, paused: this.game.paused, action: this.settings.sequence[this.index],
      monster: m?.state === 'alive' ? { kind: m.kind, hp: m.hp, maxHp: m.maxHp, attackIn: m.attackIn, windup: m.attackIn <= 1.5 } : null,
      spawnIn: this.game.monsters.wait, log: this.log.map(e => ({ ...e })) };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { MiningSimulation } from '../src/mining/simulation.mjs';
import { ImpactLayer } from '../src/mining/impact.mjs';
import { TILE, BLOCK } from '../src/mining/world.mjs';

const spawn = (g, key = 'term:1') => { g.setCard(key, 'due'); g.monsters.tick(g.combat.settings.spawnSeconds); return g.monsters.current; };
const cool = g => {g.combat.tick(g.combat.settings.roundSeconds);g.setCard(g.cardKey+':next');};
test('mining and contact never force a question or pause the world', () => {
  const events = [], g = new MiningSimulation(r => events.push(r)); spawn(g);
  const before=g.player.x;g.tick({right:true});assert.ok(g.player.x>before);
  const x=Math.floor((g.player.x+9)/TILE),y=Math.floor((g.player.y+38)/TILE);
  g.world.set(x,y,BLOCK.DIRT);g.mine(x,y,1);assert.equal(g.world.get(x,y),BLOCK.AIR);
  Object.assign(g.player,{x:g.monsters.current.x,y:g.monsters.current.y});g.monsters.tick(0);
  assert.equal(g.paused,false);assert.deepEqual(events,[]);assert.equal('grade' in g,false);
});
test('spawn cooldown is independent from questions, capped at one monster, and repeats only after defeat',()=>{
  const g=new MiningSimulation();g.setCard('a','due');g.monsters.tick(14.99);assert.equal(g.monsters.current,null);
  g.setCard('b');g.monsters.tick(.01);const m=g.monsters.current;assert.ok(m);
  g.setCard('c');assert.equal(g.monsters.current,m);g.monsters.tick(1);assert.equal(g.monsters.current,m);
  g.combat.configure({...g.combat.settings,sequence:['attack']});
  for(let i=0;i<3;i++){assert.equal(g.encounter(),true);g.resolve('slash');cool(g);}
  assert.equal(m.state,'defeated');g.setCard('next');g.monsters.tick(14.99);assert.equal(g.monsters.current,m);
  g.monsters.tick(.01);assert.notEqual(g.monsters.current,m);
});
test('A hits only on a correct answer; wrong A dodges, B guards or fails; each question consumes one slot',()=>{
  const events=[],g=new MiningSimulation(r=>events.push(r));const m=spawn(g);
  assert.equal(g.resolve('slash'),false);assert.equal(m.hp,3);
  assert.equal(g.encounter(),true);assert.equal(g.paused,false);assert.equal(g.encounter(),false);
  assert.equal(g.resolve('wrong'),true);assert.equal(m.hp,3);assert.ok(m.dodge>0);assert.equal(g.combat.index,1);
  assert.equal(g.resolve('slash'),false);assert.equal(g.encounter(),false);cool(g);
  assert.equal(g.encounter(),true);g.resolve('slash');assert.equal(m.hp,3);assert.equal(g.combat.guard,1);
  g.combat.enemyAttack();assert.equal(g.combat.hp,100);assert.equal(g.combat.guard,0);
  cool(g);g.encounter();g.resolve('slash');assert.equal(m.hp,2);
  cool(g);g.encounter();g.combat.guard=1;g.resolve('wrong');assert.equal(g.combat.guard,0);assert.equal(m.hp,2);
  assert.equal(events.length,4);assert.ok(g.combat.log.some(e=>e.kind==='guard-break'));
});
test('slay passes the current action without hurting, defending, defeating or fabricating learning rewards',()=>{
  const g=new MiningSimulation();const m=spawn(g);g.encounter();g.resolve('slay');
  assert.equal(m.hp,3);assert.equal(m.state,'alive');assert.equal(g.combat.guard,0);assert.equal(g.combat.index,1);
  assert.equal(g.encounter(),false);cool(g);assert.equal(g.encounter(),true);
  assert.equal('xp' in g,false);assert.equal('reviewed' in g,false);
});
test('monsters attack slowly with a windup while the unanswered question remains open; only explicit rest freezes time',()=>{
  const g=new MiningSimulation();spawn(g);g.encounter();
  for(let i=0;i<12*60-1;i++)g.tick({});assert.equal(g.combat.hp,100);assert.ok(g.combat.state().monster.windup);
  g.tick({});assert.equal(g.combat.hp,92);assert.equal(g.combat.pending.action,'attack');
  const time=g.time,attack=g.monsters.current.attackIn;g.paused=true;
  for(let i=0;i<100;i++)g.tick({});assert.equal(g.time,time);assert.equal(g.monsters.current.attackIn,attack);
  g.paused=false;g.tick({});assert.ok(g.time>time);assert.equal(g.resolve('slash','stale-key'),false);
  assert.equal(g.resolve('slash','term:1'),true);
});
test('custom ABB and BAA sequence wraps, settings preserve the in-flight action and do not speed up enemy attacks',()=>{
  const g=new MiningSimulation();spawn(g);g.combat.configure({spawnSeconds:25,roundSeconds:7,attackSeconds:20,sequence:['attack','defend','defend']});
  const seen=[];
  for(let i=0;i<4;i++){g.encounter();seen.push(g.combat.pending.action);g.resolve('wrong');assert.equal(g.combat.cooldown,7);cool(g);}
  assert.deepEqual(seen,['attack','defend','defend','attack']);
  g.encounter();const locked=g.combat.pending.action;g.combat.configure({spawnSeconds:5,roundSeconds:4,attackSeconds:8,sequence:['defend','attack','attack']});
  assert.equal(g.combat.pending.action,locked);assert.ok(g.monsters.current.attackIn>=20);
});
test('falling in combat keeps the pending learning card, recalls without world reset and requires explicit recovery',()=>{
  const g=new MiningSimulation();spawn(g);g.encounter();g.combat.hp=8;g.combat.enemyAttack();
  assert.equal(g.combat.hp,0);assert.ok(g.combat.pending);assert.equal(g.player.x,g.world.spawn.x);
  g.resolve('slash');assert.equal(g.combat.hp,0);g.combat.recover();assert.equal(g.combat.hp,100);
  assert.equal(g.monsters.wait,15);assert.equal(g.monsters.current.state,'dismissed');
});
test('three monster types use the same spawn cooldown and never replace each other when cards change',()=>{
  const g=new MiningSimulation(),kinds=[];
  for(let i=0;i<3;i++){const m=spawn(g,String(i));kinds.push(m.kind);m.state='defeated';g.monsters.wait=15;}
  assert.equal(new Set(kinds).size,3);
});
test('no cards means exploration only; no fabricated demo terms or encounters', () => {
  const g = new MiningSimulation(() => assert.fail('empty pool must not manufacture questions'));
  assert.equal(g.encounter(), false); g.setCard(null);g.monsters.tick(100);assert.equal(g.monsters.current, null);
  assert.equal(g.targetState(999, -1), 'outside');assert.equal(g.mine(999, -1, 1), false);
});

test('terrain-only saves roundtrip atomically; corrupt records cannot overwrite the world', () => {
  const g = new MiningSimulation(); g.world.set(48, 38, BLOCK.AIR); g.mined = 1;
  const saved = g.snapshot(), restored = new MiningSimulation(); restored.restore(saved);
  assert.equal(restored.world.get(48, 38), BLOCK.AIR); assert.equal(restored.mined, 1);
  const before = restored.world;
  assert.throws(() => restored.restore({ ...saved, deltas: [[0, BLOCK.AIR]] }));
  assert.throws(() => restored.restore({ ...saved, player: { x: Infinity, y: 0 } }));
  assert.throws(() => restored.restore({ ...saved, lanterns: [{ x: -1, y: 0 }] }));
  assert.throws(() => restored.restore({ ...saved, explored: [5] }));
  assert.equal(restored.world, before);
  assert.equal(JSON.stringify(saved).includes('definition'), false);
  restored.recall(); assert.equal(restored.player.x, restored.world.spawn.x);
});

test('actual Tween.js impacts advance on simulation clock, are bounded and dispose', () => {
  const fx = new ImpactLayer(); for (let i = 0; i < 40; i++) fx.emit({ x: i, y: 0, kind: 'bolt' });
  assert.equal(fx.items.length, 8);
  const ctx = new Proxy({}, { get: (_t, p) => p === 'strokeStyle' ? '#fff' : () => {}, set: () => true });
  fx.draw(ctx, .26); assert.ok(fx.items[0].progress > 0 && fx.items[0].progress < 1);
  fx.draw(ctx, .3); assert.equal(fx.items.length, 0); assert.equal(fx.group.getAll().length, 0);
  for (let i = 0; i < 100; i++) { fx.emit({ x: 0, y: 0, kind: 'star' }); fx.draw(ctx, .6); }
  assert.equal(fx.group.getAll().length, 0);
  fx.dispose(); assert.equal(fx.group.getAll().length, 0);
  const calm = new ImpactLayer(true); calm.emit({ x: 0, y: 0 }); calm.draw(ctx, .13); assert.equal(calm.items.length, 0);
});

test('a resolved card can never begin a second action, including after cooldown or mode restoration',()=>{
  const g=new MiningSimulation();spawn(g);g.encounter();g.resolve('wrong');g.combat.tick(20);
  assert.equal(g.encounter(),false);g.setCard('term:1','due',false);assert.equal(g.encounter(),false);
  g.setCard('next','library',true);assert.equal(g.encounter(),false);
  g.setCard('unanswered','library',false);assert.equal(g.encounter(),true);
});

test('an unanswered action from a defeated player cannot hit a newly spawned monster after recovery',()=>{
  const g=new MiningSimulation();spawn(g);g.encounter();g.combat.hp=8;g.combat.enemyAttack();
  g.combat.recover();g.monsters.tick(g.combat.settings.spawnSeconds);const m=g.monsters.current;
  g.resolve('slash');assert.equal(m.hp,3);assert.equal(g.combat.pending,null);
  assert.match(g.combat.log[0].text,/原战斗目标已离场/);
});

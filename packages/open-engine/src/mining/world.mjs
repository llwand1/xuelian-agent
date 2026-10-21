import { generateClassicTerrain } from './terrain-generator.mjs';
export const TILE = 24;
export const WIDTH = 200;
export const HEIGHT = 150;
export const GEN_VERSION = 2;
export const BLOCK = Object.freeze({ AIR: 0, MOSS: 1, DIRT: 2, STONE: 3, CRYSTAL: 4, AMETHYST: 5, GOLD: 6, BEDROCK: 7, SEAL: 8, PLATFORM: 9 });
export const BLOCKS = Object.freeze([
  { name: '空气', hp: 0, solid: false },
  { name: '草地', hp: 2, solid: true, color: '#68ae36' },
  { name: '泥土', hp: 2, solid: true, color: '#98613d' },
  { name: '岩石', hp: 4, solid: true, color: '#85818b' },
  { name: '知识矿', hp: 5, solid: true, color: '#83c8e5' },
  { name: '知识矿', hp: 6, solid: true, color: '#b594db' },
  { name: '知识矿', hp: 7, solid: true, color: '#e9c562' },
  { name: '世界基岩', hp: Infinity, solid: true, color: '#20263d' },
  { name: '岩石', hp: 4, solid: true, color: '#85818b' },
  { name: '木平台', hp: 1, solid: false, platform: true, color: '#a97943' }
]);
export function hash(x, y, seed = 137) {
  let n = Math.imul(x ^ seed, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function seedNumber(text) { let n = 2166136261; for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
export class World {
  constructor(seed = 137, generate = true) {
    this.seed = seed >>> 0;
    this.cells = new Uint8Array(WIDTH * HEIGHT);
    this.original = new Uint8Array(WIDTH * HEIGHT);
    this.explored = new Uint8Array(WIDTH * HEIGHT);
    this.surface = new Uint16Array(WIDTH);
    this.deltas = new Map();
    this.lanterns = [];
    this.spawn = { x: 46 * TILE, y: 38 * TILE - 38 };
    if (generate) this.generate();
  }
  index(x, y) { return y * WIDTH + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT; }
  get(x, y) { return this.inside(x, y) ? this.cells[this.index(x, y)] : BLOCK.BEDROCK; }
  solid(x, y) { return BLOCKS[this.get(x, y)].solid; }
  set(x, y, value) {
    if (!this.inside(x, y)) return false;
    const i = this.index(x, y);
    this.cells[i] = value;
    if (value === this.original[i]) this.deltas.delete(i); else this.deltas.set(i, value);
    return true;
  }
  generate() { generateClassicTerrain(this, { WIDTH, HEIGHT, TILE, BLOCK, hash }); }
  carveEllipse(cx, cy, rx, ry) {
    for (let x = cx - rx; x <= cx + rx; x++) for (let y = cy - ry; y <= cy + ry; y++) {
      if (this.inside(x, y) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) this.cells[this.index(x, y)] = BLOCK.AIR;
    }
  }
  reveal(px, py, radius = 10) {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    for (let x = cx - radius; x <= cx + radius; x++) for (let y = cy - radius; y <= cy + radius; y++) {
      if (this.inside(x, y) && (x - cx) ** 2 + (y - cy) ** 2 < radius ** 2) this.explored[this.index(x, y)] = 1;
    }
  }
  clearLine(px, py, tx, ty) {
    const dx = (tx + .5) * TILE - px, dy = (ty + .5) * TILE - py;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (TILE * .25)));
    for (let i = 1; i < steps; i++) {
      const x = Math.floor((px + dx * i / steps) / TILE), y = Math.floor((py + dy * i / steps) / TILE);
      if (x === tx && y === ty) return true;
      if (this.solid(x, y)) return false;
    }
    return true;
  }
}

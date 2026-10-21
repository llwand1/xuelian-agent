// Built-in terrain adapter. Imported maps use the separate declarative compiler.
// The v2 generator is preserved byte-for-byte in behavior for old saves.
export function generateClassicTerrain(target, { WIDTH, HEIGHT, TILE, BLOCK, hash }) {
    const s = target.seed;
    for (let x = 0; x < WIDTH; x++) {
      let h = Math.round(38 + Math.sin(x * .085) * 2 + Math.sin(x * .24 + s % 12) * 1.4);
      if (x >= 37 && x <= 55) h = 38;
      target.surface[x] = h;
      for (let y = 0; y < HEIGHT; y++) {
        let id = y < h ? BLOCK.AIR : y === h ? BLOCK.MOSS : y < h + 6 ? BLOCK.DIRT : BLOCK.STONE;
        if (y > h + 8 && x > 3 && x < WIDTH - 4 && y < HEIGHT - 3) {
          const cave = Math.sin(x * .19 + Math.sin(y * .13) * 2.4) + Math.sin(y * .27 - x * .075) + Math.sin(x * .08 + y * .11);
          if (cave > 1.52 || Math.sin(x * .12 + y * .15) > .95 && y > 57) id = BLOCK.AIR;
          if (id === BLOCK.STONE) {
            const ore = hash(Math.floor(x / 3), Math.floor(y / 2), s);
            if (ore > .90 && hash(x, y, s + 1) > .32) id = y < 70 ? BLOCK.CRYSTAL : y < 102 ? BLOCK.AMETHYST : BLOCK.GOLD;
          }
        }
        if (x === 0 || x === WIDTH - 1 || y >= HEIGHT - 2) id = BLOCK.BEDROCK;
        target.cells[target.index(x, y)] = id;
      }
    }
    // A shallow, torch-marked entrance makes the first vein easy to reach.
    for (let x = 54; x <= 75; x++) {
      const floor = Math.min(57, 38 + Math.floor((x - 54) * .9));
      for (let y = floor - 4; y < floor; y++) target.cells[target.index(x, y)] = BLOCK.AIR;
      target.cells[target.index(x, floor)] = x < 57 ? BLOCK.MOSS : BLOCK.STONE;
    }
    target.carveEllipse(68, 54, 8, 5);
    target.carveEllipse(71, 62, 4, 7);
    target.carveEllipse(72, 73, 8, 6);
    for (const [x, y] of [[58, 40], [59, 41], [60, 42], [62, 44], [63, 45], [64, 46], [65, 47], [68, 58], [69, 58], [70, 58]]) {
      target.cells[target.index(x, y)] = BLOCK.CRYSTAL;
    }
    for (let x = 67; x <= 77; x += 2) target.cells[target.index(x, 77)] = BLOCK.AMETHYST;
    for (const [x, y] of [[68, 60], [72, 56], [72, 50]]) target.cells[target.index(x, y)] = BLOCK.PLATFORM;
    target.lanterns = [{ x: 56, y: 37 }, { x: 63, y: 45 }, { x: 69, y: 53 }, { x: 72, y: 62 }];
    target.original.set(target.cells);
    target.reveal(target.spawn.x + 9, target.spawn.y + 19, 13);
}

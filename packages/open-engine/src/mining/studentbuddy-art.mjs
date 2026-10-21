// StudentBuddy original red-cloak hero. Copyright (c) 2026 llwan.
// MIT; see the repository LICENSE. Shared with the historical mining prototype.
export const HERO_MAP = [
    '......kkkk......',
    '.....khhHHk.....',
    '....khhhhHHk....',
    '....khkkkkhk....',
    '....khkeekhk....',
    '.....khhhhk.....',
    '...kcCkaaakk....',
    '..kcCCkaHakgk...',
    '..kcCkaaaakbgk..',
    '.kcCCkaHaakbgk..',
    '.kcCkkaaaakbbk..',
    '.kcCk.kaaak.kk..',
    'kcCCk.kaaak.....',
    'kcCk..kllllk....',
    'kCk...kl..lk....',
    'kk....kl..lk....',
    '......kk..kk....',
];
export const HERO_PAL = {
    k: '#07050a', h: '#4d4b5e', H: '#9c99b4', e: '#ffd27a', c: '#5a0f19', C: '#9b1f2c',
    a: '#2e2c3a', l: '#1d1b25', b: '#3b2616', g: '#ffe39a',
};
const WHITE = new Proxy({}, { get: () => '#fff4e0' });
export function drawSprite(ctx, map, pal, x, y, opts = {}) {
    const s = opts.scale ?? 1;
    const p = opts.flash ? WHITE : pal;
    const w = Math.max(...map.map((r) => r.length));
    ctx.globalAlpha = opts.alpha ?? 1;
    map.forEach((row, ry) => {
        const shift = opts.rowShift ? opts.rowShift(ry) : 0;
        for (let rx = 0; rx < row.length; rx++) {
            const ch = row[rx];
            if (ch === '.' || ch === ' ')
                continue;
            const col = p[ch];
            if (!col)
                continue;
            const cx = opts.flip ? w - 1 - rx : rx;
            ctx.fillStyle = col;
            ctx.fillRect(Math.round(x + (cx + shift) * s), Math.round(y + ry * s), s, s);
        }
    });
    ctx.globalAlpha = 1;
}

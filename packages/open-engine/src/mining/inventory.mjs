// Spells are usable items. Legacy kind stays in content packs for v1 compatibility.
export const PICKAXE_ITEM = 'studentbuddy.core:pickaxe';
export function inventoryItems(registry) {
  return [{ id: PICKAXE_ITEM, name: '工具镐', description: '按住左键挖矿，挖到题目后作答。', icon: 'pickaxe', category: '工具', abilityId: null }, ...registry.list('abilities').map(a => ({ id: a.id, name: a.name, description: a.description, icon: a.icon, category: a.kind === 'spell' ? '魔法物品' : '道具', abilityId: a.id }))];
}
export function resolveHeldItem(registry, id) { return inventoryItems(registry).find(item => item.id === id) || inventoryItems(registry)[0]; }
// Original code-native 16px sprites, not Terraria assets.
export const ITEM_ICONS = Object.freeze({
  pickaxe: ['................','....qqqqq.......','..qqhhhhhqq.....','.qhhqq..qqh.....','..qq.....qh.....','.........qq.....','........w.......','.......ww.......','......ww........','.....ww.........','....ww..........','...ww...........','..ww............','................','................','................'],
  portal: ['................','.....vvvv.......','...vvllllvv.....','..vl......lv....','..vl..g...lv....','.vl..ggg...lv...','.vl...g....lv...','.vl........lv...','.vl....g...lv...','..vl..gg..lv....','..vl...g..lv....','...vvllllvv.....','.....vvvv.......','....wwwwww......','...wwwwwwww.....','................'],
  torch: ['................','.......g........','......ggg.......','.....gffgg......','.....gfffgg.....','......gffg......','.......gg.......','.......ww.......','.......ww.......','.......ww.......','.......ww.......','.......ww.......','.......ww.......','.......ww.......','................','................'],
  spark: ['................','.......l........','.......v........','.......v........','....v..l..v.....','.....vlgvv......','..lvvlggglvvl...','.....vlgvv......','....v..l..v.....','.......v........','.......v........','.......l........','................','................','................','................']
});
export const ITEM_PALETTE = Object.freeze({ q: '#586675', h: '#d4e4eb', w: '#ab7547', v: '#7862a3', l: '#c7b3ec', g: '#ffe09b', f: '#e79a39' });

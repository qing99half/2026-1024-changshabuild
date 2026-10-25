// Keep existing indices stable so older saved games retain their selected skin.
export const SKINS = Object.freeze([
  { name: '经典红', color: '#dc5954', art: null, cost: 0, speed: 1, hurt: 1, pickup: 1, graze: 1, styleBonus: 1, voice: null, fx: 'round' },
  { name: '霓虹蓝', color: '#4fc9d8', art: null, cost: 25, speed: 1.01, hurt: .98, pickup: 1.02, graze: 1.02, styleBonus: 1, voice: null, fx: 'neon' },
  { name: '琥珀', color: '#edaa43', art: null, cost: 25, speed: .99, hurt: .97, pickup: 1.02, graze: 1.02, styleBonus: 1, voice: null, fx: 'ember' },
  { name: '紫电', color: '#b56ad5', art: null, cost: 25, speed: 1, hurt: .98, pickup: 1.03, graze: 1.02, styleBonus: 1, voice: null, fx: 'spark' },
  { name: '青柠', color: '#a9cc6b', art: null, cost: 25, speed: 1, hurt: .98, pickup: 1.02, graze: 1.03, styleBonus: 1, voice: null, fx: 'dots' },
  { name: '蓝色光环', color: '#2cc5f5', art: 'Player06-02-139.png', cost: 150, speed: 1.01, hurt: .95, pickup: 1.05, graze: 1.05, styleBonus: 1.05, voice: null, fx: 'halo' },
  { name: '几何白', color: '#f1f1f1', art: 'Player07-01-113.png', cost: 150, speed: .99, hurt: .94, pickup: 1.05, graze: 1.05, styleBonus: 1.05, voice: null, fx: 'polygon' },
  { name: '星球', color: '#31a8d9', art: 'Player08-151.png', cost: 150, speed: .99, hurt: .95, pickup: 1.06, graze: 1.05, styleBonus: 1.05, voice: null, fx: 'orbit' },
  { name: '像素白', color: '#d8d8d8', art: 'Player09-112.png', cost: 150, speed: 1.01, hurt: .95, pickup: 1.05, graze: 1.06, styleBonus: 1.05, voice: null, fx: 'pixel' },
  { name: '青柠星', color: '#a7d257', art: 'Player10-01-145.png', cost: 150, speed: 1.01, hurt: .95, pickup: 1.05, graze: 1.05, styleBonus: 1.05, voice: null, fx: 'star' },
  { name: '哈吉米', color: '#f7c9ce', art: 'assets/skins/hajimi.svg', cost: 300, revealAt: 150, speed: 1.01, hurt: .93, pickup: 1.08, graze: 1.08, styleBonus: 1.10, voice: 'hajimi', fx: 'paws' },
  { name: '大狗叫', color: '#dca36e', art: 'assets/skins/dagou.svg', cost: 450, revealAt: 250, speed: .99, hurt: .91, pickup: 1.09, graze: 1.10, styleBonus: 1.15, voice: 'dagou', fx: 'bark' },
  { name: 'TES 球', color: '#ff3d2b', art: 'assets/skins/tes.svg', cost: 600, revealAt: 350, speed: 1.01, hurt: .90, pickup: 1.10, graze: 1.10, styleBonus: 1.18, voice: null, fx: 'tes', music: 'tes',
    fxColors: Object.freeze(['#ff3d2b', '#ffffff']), shatterColors: Object.freeze(['#ff3d2b', '#ffffff', '#e93225']) },
  { name: '科比球', color: '#e6b744', art: 'assets/skins/kobe-24.svg', cost: 750, revealAt: 500, speed: .99, hurt: .88, pickup: 1.08, graze: 1.12, styleBonus: 1.24, voice: null, fx: 'kobe',
    fxColors: Object.freeze(['#f6cb58', '#8c62c0']), shatterColors: Object.freeze(['#74503e', '#f3c747', '#8b59ba']) }
].map(skin => Object.freeze(skin)));

export function isSkinRevealed(game, index) {
  const skin = SKINS[index];
  return Boolean(skin && (game.unlocked.includes(index) || (game.lifetimePoints || 0) >= (skin.revealAt || 0)));
}

export function activeSkin(game) {
  return SKINS[game.roundSkin ?? 0] || SKINS[0];
}

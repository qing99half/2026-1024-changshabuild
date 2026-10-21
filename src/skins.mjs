// Indices 0–9 match existing saved games. New secret skins are appended.
export const SKINS = Object.freeze([
  { name: '经典红', color: '#dc5954', art: null, cost: 0, speed: 1, hurt: 1, pickup: 1, voice: null, fx: 'round' },
  { name: '霓虹蓝', color: '#4fc9d8', art: null, cost: 25, speed: 1.02, hurt: 1.03, pickup: 1, voice: null, fx: 'neon' },
  { name: '琥珀', color: '#edaa43', art: null, cost: 25, speed: .98, hurt: .97, pickup: 1, voice: null, fx: 'ember' },
  { name: '紫电', color: '#b56ad5', art: null, cost: 25, speed: 1, hurt: 1.03, pickup: 1.03, voice: null, fx: 'spark' },
  { name: '青柠', color: '#a9cc6b', art: null, cost: 25, speed: 1, hurt: .97, pickup: .97, voice: null, fx: 'dots' },
  { name: '蓝色光环', color: '#2cc5f5', art: 'Player06-02-139.png', cost: 150, speed: 1.01, hurt: 1.02, pickup: 1, voice: null, fx: 'halo' },
  { name: '几何白', color: '#f1f1f1', art: 'Player07-01-113.png', cost: 150, speed: .99, hurt: .98, pickup: .99, voice: null, fx: 'polygon' },
  { name: '星球', color: '#31a8d9', art: 'Player08-151.png', cost: 150, speed: .98, hurt: 1, pickup: 1.03, voice: null, fx: 'orbit' },
  { name: '像素白', color: '#d8d8d8', art: 'Player09-112.png', cost: 150, speed: 1.02, hurt: 1, pickup: .97, voice: null, fx: 'pixel' },
  { name: '青柠星', color: '#a7d257', art: 'Player10-01-145.png', cost: 150, speed: 1.01, hurt: 1.01, pickup: 1.02, voice: null, fx: 'star' },
  { name: '哈吉米', color: '#f7c9ce', art: '/assets/skins/hajimi.svg', cost: 300, revealAt: 150, speed: 1.02, hurt: 1.02, pickup: .98, voice: 'hajimi', fx: 'paws' },
  { name: '大狗叫', color: '#dca36e', art: '/assets/skins/dagou.svg', cost: 450, revealAt: 250, speed: .98, hurt: .99, pickup: 1.02, voice: 'dagou', fx: 'bark' }
].map(skin => Object.freeze(skin)));

export function isSkinRevealed(game, index) {
  const skin = SKINS[index];
  return Boolean(skin && (game.unlocked.includes(index) || (game.lifetimePoints || 0) >= (skin.revealAt || 0)));
}

export function activeSkin(game) {
  return SKINS[game.roundSkin ?? 0] || SKINS[0];
}

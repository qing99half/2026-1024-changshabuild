import { createGame, startRound, startTutorial, skipTutorial, step, turn, togglePause, selectSkin, skinCost, buySkin, snapshotProgress, STEP, WORLD, ENEMY_TRAIL_LIFE, ENEMY_TYPES } from './core.mjs';
import { preloadAudio, playAudioEvent, startMusic, pauseMusic, setMusicPitch, setMelodicMode } from './audio.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = $('stage');
const colors = ['#dc5954', '#4fc9d8', '#edaa43', '#b56ad5', '#a9cc6b', '#2cc5f5', '#f1f1f1', '#31a8d9', '#d8d8d8', '#a7d257'];
const skinNames = ['经典红', '霓虹蓝', '琥珀', '紫电', '青柠', '蓝色光环', '几何白', '星球', '像素白', '青柠星'];
const enemyColors = ['#347da0', '#4c9c79', '#c77a39', '#7658a1', '#c64498', '#ba4d44', '#b9bdbf'];
const enemyArt = ['EnemySquare-129.png', 'EnemySquare2-128.png', 'EnemySquare3-131.png', 'EnemySquare4-137.png', 'EnemySquare5-115.png', 'GoalZone1-136.png', 'EnemySquare7-134.png'];
const warningArt = ['warning2-146.png', 'warning6-135.png', 'warning3-162.png', 'warning4-122.png', 'warning5-126.png', 'warning-118.png', 'warning7-150.png'];
const fxArt = { arrow: 'texture-ArrowTrail-2-51.png', explode: 'texture-EnemyExplode-71.png', point: 'GoalZone1-136.png' };
const bonusArt = { points: 'Plus2-142.png', freeze: 'Time-125.png', bomb: 'Bomb-132.png' };
const skinArt = [null, null, null, null, null, 'Player06-02-139.png', 'Player07-01-113.png', 'Player08-151.png', 'Player09-112.png', 'Player10-01-145.png'];
const artFiles = ['BackCircle-154.png', 'GoalZone-133.png', 'pointTurn02-124.png', ...enemyArt, ...warningArt,
  ...Object.values(fxArt), ...Object.values(bonusArt), ...skinArt].filter(Boolean);
const art = new Map();
for (const file of new Set(artFiles)) {
  const image = new Image();
  image.src = `/assets/original/${file}`;
  art.set(file, image);
}
const debugMode = new URLSearchParams(location.search).has('debug');
const storageKey = debugMode ? 'righty-web-debug-progress-v1' : 'righty-web-progress-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* Browsers with disabled storage still play. */ }
const game = createGame({ ...saved, classicSpawns: new URLSearchParams(location.search).get('mode') === 'original' });
let reducedMotion = false;
try { reducedMotion = localStorage.getItem('righty-reduced-motion') === 'true'; } catch { /* Local settings are optional. */ }
let melodicAudio = true;
try { melodicAudio = localStorage.getItem('righty-melodic-audio') !== 'false'; } catch { /* Local settings are optional. */ }
setMelodicMode(melodicAudio);
let previousTime = 0;
let accumulator = 0;
let visualTime = 0;
let lastStatus = game.status;
let musicPitch = 1;
let shake = 0;
const particles = [];
const rings = [];
const labels = [];
let skinFeedback = '';

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(snapshotProgress(game))); } catch { /* Private browsing. */ }
}

function consumeEvents() {
  for (const event of game.events.splice(0)) {
    playAudioEvent(event.kind, event);
    visualEvent(event);
    if (event.kind === 'results' || event.kind === 'unlock' || event.kind === 'tutorial-complete') save();
    if (event.kind === 'tutorial-stage' || event.kind === 'tutorial-retry') syncUI();
    if (event.kind === 'results') pauseMusic();
  }
}

function burst(x, y, count, speed, lifetime, color, radius = 3, sprite = null, delay = 0, tintSprite = false) {
  if (reducedMotion) count = Math.ceil(count * .3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (.45 + Math.random() * .75);
    particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      age: -delay, life: lifetime * (.65 + Math.random() * .55), color,
      radius: radius * (.55 + Math.random()), sprite, tintSprite, rotation: angle });
  }
}

function ring(x, y, color, delay = 0, life = .5, maxRadius = 45) {
  rings.push({ x, y, color, age: -delay, life, maxRadius });
}

function visualEvent(event) {
  const x = event.x ?? game.player?.x ?? 0, y = event.y ?? game.player?.y ?? 0;
  const goalX = game.goal?.x ?? 0, goalY = game.goal?.y ?? 0;
  const scoreEvent = ['deliver', 'deliver-turn', 'near-miss', 'bonus', 'freeze', 'bomb'].includes(event.kind);
  if (scoreEvent) labels.push({ x, y, text: event.kind === 'bonus' ? '+2' : '+1', age: 0, life: .75 });
  if (event.kind === 'turn') {
    for (const delay of [0, .1, .2]) ring(x, y, '#c9534f', delay, .5, 50);
  }
  if (event.kind === 'pickup') { burst(x, y, 30, 2, .75, '#f4f4f0', 7, fxArt.point); shake = Math.max(shake, .1); }
  if (event.kind === 'deliver') { burst(x, y, 30, 2, .75, '#ffffff', 7, fxArt.point); shake = Math.max(shake, .1); }
  if (event.kind === 'deliver-turn') {
    for (const delay of [0, .07, .14]) ring(goalX, goalY, '#d75c54', delay, .5, 85);
    burst(x, y, 50, .75, .5, '#c7544d', 6, fxArt.point);
  }
  if (event.kind === 'goal-burst') {
    burst(x, y, 30, 2, .75, '#ffffff', 7, fxArt.point);
    for (const speed of [1.125, .375, .75]) burst(x, y, 150, speed, .5, '#ffffff', 4, fxArt.point);
    shake = Math.max(shake, .1);
  }
  if (event.kind === 'bonus') { burst(x, y, 30, 2, .75, '#ffffff', 7, fxArt.point); shake = Math.max(shake, .1); }
  if (event.kind === 'freeze') { burst(x, y, 30, 2, .75, '#d8f4ff', 7, fxArt.point); ring(x, y, '#b9eafb', 0, .75, 420); shake = Math.max(shake, .15); }
  if (event.kind === 'bomb') {
    for (const delay of [0, .05, .1]) burst(x, y, 50, 20, 3, '#f7f7f3', 5, fxArt.explode, delay);
    for (const delay of [0, .08, .16, .24]) ring(x, y, '#f7f7f3', delay, .8, 350);
    shake = Math.max(shake, .22);
  }
  if (event.kind === 'enemy-explode') {
    burst(x, y, 50, 4, 2, enemyColors[event.type] || '#ffffff', 6, fxArt.explode, 0, true);
    ring(x, y, enemyColors[event.type] || '#ffffff', 0, .35, 55);
    shake = Math.max(shake, .08);
  }
  if (event.kind === 'reverse') ring(goalX, goalY, '#e46359', 0, .7, 145);
  if (event.kind === 'die') { burst(x, y, 75, 5, 3, colors[game.selectedSkin], 8, fxArt.explode); shake = Math.max(shake, .15); }
}

function updateVisualEffects(dt) {
  if (game.status === 'paused') return;
  shake = Math.max(0, shake - .004 * 60 * dt);
  for (const p of particles) { p.age += dt; if (p.age >= 0) { p.x += p.vx * dt; p.y += p.vy * dt; } }
  if (game.status === 'playing' && game.freezeFxTimer > 0 && Math.random() < 10 * dt) {
    particles.push({ x: WORLD.left + Math.random() * WORLD.width, y: WORLD.bottom + Math.random() * WORLD.height,
      vx: 0, vy: .2, age: 0, life: 2, color: '#b9eafb', radius: px(1 + Math.random() * .5),
      sprite: 'Time-125.png', opacity: .1 });
  }
  for (const r of rings) r.age += dt;
  for (const label of labels) { label.age += dt; label.y += .55 * dt; }
  for (const [array, expired] of [[particles, p => p.age >= p.life], [rings, r => r.age >= r.life], [labels, l => l.age >= l.life]]) {
    for (let i = array.length - 1; i >= 0; i--) if (expired(array[i])) array.splice(i, 1);
  }
}

function drawVisualEffects() {
  ctx.save();
  for (const wave of game.bombWaves) {
    const radius = 2 * 0.09948128461837769 * (0.1 + 2.5 * 60 * wave.age);
    ctx.globalAlpha = Math.max(0, .65 * (1 - wave.age));
    circle(sx(wave.x), sy(wave.y), px(radius), null, '#f7f7f3', 5);
  }
  for (const p of particles) {
    if (p.age < 0) continue;
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life) * (p.opacity ?? 1);
    const size = p.radius * 2 * (1 - p.age / p.life);
    const drawn = p.sprite && (p.tintSprite
      ? drawTintedArt(p.sprite, p.color, sx(p.x), sy(p.y), size)
      : drawArt(p.sprite, sx(p.x), sy(p.y), size));
    if (!drawn) circle(sx(p.x), sy(p.y), size / 2, p.color);
  }
  for (const r of rings) {
    if (r.age < 0) continue;
    const progress = r.age / r.life;
    ctx.globalAlpha = (1 - progress) * .75;
    circle(sx(r.x), sy(r.y), 5 + r.maxRadius * progress, null, r.color, 2.5 * (1 - progress) + .5);
  }
  ctx.textAlign = 'center'; ctx.font = '900 23px Arial';
  for (const label of labels) {
    ctx.globalAlpha = Math.max(0, 1 - label.age / label.life);
    ctx.fillStyle = '#f4f4f0'; ctx.fillText(label.text, sx(label.x), sy(label.y) - 34);
  }
  ctx.restore();
}

function syncUI() {
  $('menu').hidden = game.status !== 'menu';
  $('paused').hidden = game.status !== 'paused';
  $('results').hidden = game.status !== 'results';
  $('pause').hidden = game.status !== 'playing';
  $('tutorial').hidden = game.status !== 'tutorial';
  if (game.status === 'tutorial') {
    const stage = game.tutorial.stage;
    $('tutorial-step').textContent = `0${stage + 1} / 03`;
    $('tutorial-title').textContent = ['点击，改变方向', '拾取光点，送回圆环', '避开敌人，继续前进'][stage];
    $('tutorial-detail').textContent = ['连续转向两次，感受单键操作', '碰到白色光点后，转向返回起点圆环', '至少转向一次，并坚持到敌人离开场地'][stage];
    $('tutorial-input').src = `/assets/original/${matchMedia('(pointer: coarse)').matches ? 'Instruct_Control_MouseON-144.png' : 'Instruct_Control_Space-143.png'}`;
  }
  $('menu-best').textContent = game.best;
  $('menu-points').textContent = game.totalPoints;
  $('result-score').textContent = game.lastScore;
  $('result-time').textContent = `${game.lastTime.toFixed(2)}s`;
  $('result-best').textContent = game.best;
  $('result-earned').textContent = `+${game.lastScore} 点`;
  $('result-balance').textContent = game.totalPoints;
  const index = game.selectedSkin;
  $('skin-name').textContent = skinNames[index];
  const preview = $('skin-dot');
  preview.classList.toggle('has-art', Boolean(skinArt[index]));
  preview.style.background = skinArt[index] ? `center / contain no-repeat url('/assets/original/${skinArt[index]}')` : colors[index];
  const owned = game.unlocked.includes(index);
  const cost = skinCost(index);
  $('start').firstChild.textContent = owned ? '开始游戏 ' : '使用经典红开始 ';
  $('skin-state').textContent = owned ? '已拥有' : `需 ${cost} 点`;
  $('skin-buy').hidden = owned;
  $('skin-buy').textContent = game.totalPoints >= cost ? `解锁 · ${cost} 点` : `还差 ${cost - game.totalPoints} 点`;
  $('skin-feedback').textContent = skinFeedback;
  $('motion-toggle').textContent = `动态效果：${reducedMotion ? '减弱' : '标准'}`;
  $('audio-toggle').textContent = `转向音效：${melodicAudio ? '原声音律' : '原版'}`;
}

function play(forceTutorial = false) {
  if (!game.unlocked.includes(game.selectedSkin)) game.selectedSkin = 0;
  skinFeedback = '';
  preloadAudio();
  playAudioEvent('menu-click');
  particles.length = 0; rings.length = 0; labels.length = 0; shake = 0;
  if (forceTutorial || !game.tutorialSeen) startTutorial(game);
  else startRound(game);
  musicPitch = 1;
  accumulator = 0;
  consumeEvents();
  syncUI();
  setMusicPitch(1);
  startMusic();
}

$('start').addEventListener('click', () => play());
$('restart').addEventListener('click', () => play());
$('replay-tutorial').addEventListener('click', () => play(true));
$('motion-toggle').addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  if (reducedMotion) shake = 0;
  try { localStorage.setItem('righty-reduced-motion', String(reducedMotion)); } catch { /* Local settings are optional. */ }
  syncUI();
});
$('audio-toggle').addEventListener('click', () => {
  melodicAudio = !melodicAudio;
  setMelodicMode(melodicAudio);
  try { localStorage.setItem('righty-melodic-audio', String(melodicAudio)); } catch { /* Local settings are optional. */ }
  syncUI();
  playAudioEvent('menu-click');
});
$('tutorial-skip').addEventListener('click', event => { event.stopPropagation(); skipTutorial(game); consumeEvents(); syncUI(); });
$('debug-panel').hidden = !debugMode;
for (const button of $('debug-panel').querySelectorAll('[data-debug]')) button.addEventListener('click', event => {
  event.stopPropagation();
  if (game.status !== 'playing') startRound(game);
  game.player.speed = 0;
  game.spawnTimer = -999;
  const kind = button.dataset.debug;
  if (kind === 'wall') {
    game.enemies = ENEMY_TYPES.map((config, type) => ({ id: 300 + type,
      x: WORLD.left - .49, y: -3 + type, vx: -2.4, vy: 0, type, shape: config.name,
      radius: config.radius, hitW: config.width, hitH: config.height,
      split: type === 6 ? .276 : undefined, pulseScale: type === 3 ? .125 : undefined,
      pulseDirection: 1, fadeAlpha: 1, fadeDirection: -1, near: false,
      trail: [{ x: WORLD.left - .49, y: -3 + type, age: 0 }] }));
  } else if (kind === 'gallery') {
    game.enemies = ENEMY_TYPES.map((config, type) => ({ id: 100 + type,
      x: -4.9 + type * 1.55, y: 1.25, vx: 0, vy: 0, type, shape: config.name,
      radius: config.radius, hitW: config.width, hitH: config.height,
      split: type === 6 ? .276 : undefined, pulseScale: type === 3 ? .125 : undefined,
      pulseDirection: 1, fadeAlpha: 1, fadeDirection: -1, near: false, debugGallery: true,
      trail: [{ x: -4.9 + type * 1.55, y: 1.25, age: 0 }] }));
  } else if (kind === 'turn') {
    game.player.x = game.goal.x; game.player.y = game.goal.y;
    game.player.carrying = true;
    game.point = { x: game.goal.x, y: game.goal.y, kind: 'turn', phase: 'carried', returnTimer: 0 };
  } else {
    if (kind === 'bomb') game.enemies = [1.8, 3.1, 4.5].map((x, id) => ({ id: 200 + id,
      x: game.player.x + x, y: game.player.y, vx: 0, vy: 0, type: id,
      shape: ENEMY_TYPES[id].name, radius: ENEMY_TYPES[id].radius,
      hitW: ENEMY_TYPES[id].width, hitH: ENEMY_TYPES[id].height, near: false,
      trail: [{ x: game.player.x + x, y: game.player.y, age: 0 }] }));
    game.bonuses.push({ x: game.player.x, y: game.player.y, vx: 0, kind, radius: .2925 });
  }
  step(game); consumeEvents(); syncUI();
});
$('resume').addEventListener('click', () => { togglePause(game); startMusic(); syncUI(); });
$('pause').addEventListener('click', () => { togglePause(game); pauseMusic(); syncUI(); });
for (const id of ['menu-from-pause', 'menu-from-results']) {
  $(id).addEventListener('click', () => { game.status = 'menu'; pauseMusic(); playAudioEvent('menu-click'); syncUI(); });
}
for (const [id, direction] of [['skin-prev', -1], ['skin-next', 1]]) {
  $(id).addEventListener('click', () => {
    selectSkin(game, (game.selectedSkin + colors.length + direction) % colors.length);
    skinFeedback = '';
    save(); syncUI(); playAudioEvent('menu-click');
  });
}
$('skin-buy').addEventListener('click', () => {
  if (buySkin(game)) {
    skinFeedback = `${skinNames[game.selectedSkin]} 已解锁，下一局可使用`;
    consumeEvents(); save(); syncUI();
  } else {
    skinFeedback = `还差 ${skinCost(game.selectedSkin) - game.totalPoints} 点，继续游玩即可解锁`;
    playAudioEvent('menu-no'); syncUI();
  }
});
canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  if (turn(game)) consumeEvents();
});
window.addEventListener('keydown', event => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (['Space', 'Enter'].includes(event.code)) {
    if (game.status === 'playing' || game.status === 'tutorial') { turn(game); consumeEvents(); }
    else if (game.status === 'menu' || game.status === 'results') play();
    else if (game.status === 'paused') { togglePause(game); startMusic(); syncUI(); }
  } else if (event.code === 'Escape') {
    if (togglePause(game)) { game.status === 'paused' ? pauseMusic() : startMusic(); syncUI(); }
  }
});
window.addEventListener('blur', () => { if (game.status === 'playing') { togglePause(game); pauseMusic(); syncUI(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.status === 'playing') { togglePause(game); pauseMusic(); syncUI(); } });

const pixelsPerUnit = 540 / WORLD.height;
const sx = x => (x - WORLD.left) * pixelsPerUnit;
const sy = y => (WORLD.top - y) * pixelsPerUnit;
const px = amount => amount * pixelsPerUnit;

function drawArt(file, x, y, width, height = width, alpha = 1) {
  const image = art.get(file);
  if (!image?.complete || !image.naturalWidth) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  ctx.restore();
  return true;
}

const tintedArt = new Map();
function drawTintedArt(file, tint, x, y, width, height = width, alpha = 1) {
  const image = art.get(file);
  if (!image?.complete || !image.naturalWidth) return false;
  const key = `${file}:${tint}`;
  if (!tintedArt.has(key)) {
    const layer = document.createElement('canvas');
    layer.width = image.naturalWidth; layer.height = image.naturalHeight;
    const paint = layer.getContext('2d');
    paint.drawImage(image, 0, 0);
    paint.globalCompositeOperation = 'multiply';
    paint.fillStyle = tint;
    paint.fillRect(0, 0, layer.width, layer.height);
    paint.globalCompositeOperation = 'destination-in';
    paint.drawImage(image, 0, 0);
    tintedArt.set(key, layer);
  }
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.drawImage(tintedArt.get(key), x - width / 2, y - height / 2, width, height);
  ctx.restore();
  return true;
}

function circle(x, y, radius, fill, stroke, width = 1) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function polygon(x, y, radius, sides, rotation, fill) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + Math.PI * 2 * i / sides;
    const dx = x + Math.cos(angle) * radius;
    const dy = y + Math.sin(angle) * radius;
    i ? ctx.lineTo(dx, dy) : ctx.moveTo(dx, dy);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

function background() {
  ctx.fillStyle = '#383839'; ctx.fillRect(0, 0, 960, 540);
  drawArt('BackCircle-154.png', 815 + Math.sin(visualTime * .18) * 8, 156, 360, 360, .025);
  drawArt('BackCircle-154.png', 122 - Math.sin(visualTime * .15) * 6, 465, 270, 270, .018);
  ctx.fillStyle = '#ad474040'; ctx.fillRect(0, 0, 960, 3); ctx.fillRect(0, 537, 960, 3);
  ctx.fillStyle = '#ad474025'; ctx.fillRect(0, 0, 4, 540); ctx.fillRect(956, 0, 4, 540);
}

function drawBackgroundScore() {
  if (game.status === 'menu') return;
  ctx.save();
  ctx.fillStyle = 'rgba(241, 241, 239, 0.13)';
  ctx.font = '300 232px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(game.status === 'results' ? game.lastScore : game.score), 480, 274);
  ctx.restore();
}

function drawGoal() {
  if (!game.goal) return;
  const x = sx(game.goal.x), y = sy(game.goal.y), radius = px(game.goal.size * 2.2);
  if (!drawArt('GoalZone-133.png', x, y, radius * 2.6)) {
    circle(x + 2, y + 3, radius, null, '#00000088', 5);
    circle(x, y, radius, '#30303255', '#f2f2f1', 3);
  }
  for (let i = 0; i < 27; i++) {
    const a = i * 2.399 + visualTime * (i % 2 ? .18 : -.1);
    const d = radius * (.34 + (i * 13 % 51) / 100);
    circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.7 + (i % 3) * .3, i % 4 ? '#eaeaea' : '#ffffff85');
  }
}

function drawPoint() {
  if (!game.point || game.point.phase === 'carried') return;
  const point = game.point, x = sx(point.x), y = sy(point.y);
  const radius = px(.3) + Math.sin(visualTime * 4) * 1.2;
  if (point.kind === 'turn') {
    circle(x, y, radius, '#f0f0ee');
    if (!drawArt('pointTurn02-124.png', x, y, radius * 1.5)) {
      ctx.fillStyle = '#c8544f';
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + visualTime * .7;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * radius * .16, y + Math.sin(angle) * radius * .16);
        ctx.arc(x, y, radius * .65, angle + .12, angle + 1.18);
        ctx.closePath(); ctx.fill();
      }
    }
  } else {
    circle(x + 2, y + 3, radius, '#00000055');
    circle(x, y, radius, '#f1f1f0');
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * .67 + visualTime * .9;
      circle(x + Math.cos(a) * radius * 1.12, y + Math.sin(a) * radius * 1.12, 1.5 + i % 2, '#ffffffd0');
    }
  }
}

function drawEnemyTrail(enemy, color, radius, offsetY = 0) {
  if (!enemy.trail || enemy.trail.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const life = ENEMY_TYPES[enemy.type]?.trailLife || ENEMY_TRAIL_LIFE;
  for (let i = 1; i < enemy.trail.length; i++) {
    const previous = enemy.trail[i - 1], current = enemy.trail[i];
    const freshness = Math.max(0, 1 - (previous.age + current.age) / (2 * life));
    if (freshness <= 0) continue;
    ctx.globalAlpha = .18 * freshness;
    ctx.lineWidth = Math.max(.2, radius * 1.3 * freshness);
    ctx.beginPath(); ctx.moveTo(sx(previous.x), sy(previous.y + offsetY)); ctx.lineTo(sx(current.x), sy(current.y + offsetY)); ctx.stroke();
  }
  for (let i = 3; i < enemy.trail.length - 1; i += 7) {
    const point = enemy.trail[i];
    const freshness = Math.max(0, 1 - point.age / .6);
    if (freshness <= 0) continue;
    ctx.globalAlpha = .28 * freshness;
    const side = i % 2 ? 1 : -1;
    drawArt(fxArt.arrow, sx(point.x), sy(point.y + offsetY) + side * radius * .8, 9 * freshness, 9 * freshness);
  }
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of game.enemies) {
    const x = sx(enemy.x), y = sy(enemy.y), r = px(enemy.radius);
    const fill = enemyColors[enemy.type] || enemyColors[0];
    const config = ENEMY_TYPES[enemy.type] || ENEMY_TYPES[0];
    if (Math.abs(enemy.x) > 6.1 || enemy.debugGallery) {
      const side = enemy.vx < 0 ? 1 : -1;
      const galleryWidth = px(config.width * (enemy.type === 5 ? 5 : 1.4));
      const warningX = enemy.debugGallery ? x + galleryWidth / 2 + 12 : sx(side * 6.28);
      const remaining = Math.max(0, Math.abs(enemy.x) - 6.1);
      const flash = .55 + .35 * Math.sin(visualTime * 12);
      ctx.save(); ctx.translate(warningX, y); if (side < 0) ctx.scale(-1, 1);
      drawArt(warningArt[enemy.type], 0, 0, enemy.debugGallery ? 28 : 42,
        enemy.debugGallery ? 28 : 42, enemy.debugGallery ? .9 : flash * Math.min(1, remaining / .25));
      ctx.restore();
    }
    if (enemy.type === 6 && Number.isFinite(enemy.split)) {
      drawEnemyTrail(enemy, fill, Math.max(r, 14), -enemy.split);
      drawEnemyTrail(enemy, fill, Math.max(r, 14), enemy.split);
    } else drawEnemyTrail(enemy, fill, Math.max(r, 14));
    const sprite = enemyArt[enemy.type] || enemyArt[0];
    const width = px(config.width * (enemy.type === 5 ? 5 : 1.4));
    const height = px(config.height * (enemy.type === 5 ? 5 : 1.4));
    const alpha = enemy.fadeAlpha ?? 1;
    if (enemy.type === 6) {
      const split = Number.isFinite(enemy.split) ? enemy.split : 0;
      for (const offset of [-split, split]) drawArt(sprite, x, sy(enemy.y + offset), width, height, alpha);
    } else if (enemy.type === 5) {
      drawTintedArt(sprite, '#ba4d44', x, y, width, height, alpha);
    } else if (enemy.type === 3) {
      const scale = Number.isFinite(enemy.pulseScale) ? enemy.pulseScale / .125 : 1;
      drawArt(sprite, x, y, width * scale, height * scale, alpha);
    } else drawArt(sprite, x, y, width, height, alpha);
    if (enemy.near) circle(x, y, Math.max(r + 10, 25), null, '#ffffff26', 1.5);
  }
}

function drawBonuses() {
  for (const bonus of game.bonuses) {
    const x = sx(bonus.x), y = sy(bonus.y);
    if (drawArt(bonusArt[bonus.kind], x, y, 43)) continue;
    circle(x, y, 18, '#f1f1ed', '#333336', 3);
    if (bonus.kind === 'points') {
      ctx.fillStyle = '#333336'; ctx.font = '900 17px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+2', x, y + 1);
    } else if (bonus.kind === 'freeze') {
      circle(x, y, 12, null, '#333336', 2);
      ctx.strokeStyle = '#333336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    } else {
      ctx.fillStyle = '#333336';
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); ctx.arc(x, y, 13, a - .45, a + .45); ctx.closePath(); ctx.fill();
      }
      circle(x, y, 3.5, '#333336');
    }
  }
}

function drawPlayer() {
  if (!game.player) return;
  const player = game.player, x = sx(player.x), y = sy(player.y), r = px(player.size * .82);
  const color = colors[game.selectedSkin];
  for (let i = 1; i < game.trail.length; i++) {
    const previous = game.trail[i - 1], current = game.trail[i];
    ctx.strokeStyle = color + Math.round(Math.max(0, current.ttl / .25) * 70).toString(16).padStart(2, '0');
    ctx.lineWidth = r * 1.35;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx(previous.x), sy(previous.y)); ctx.lineTo(sx(current.x), sy(current.y)); ctx.stroke();
    if (i % 3 === 0) circle(sx(current.x) + Math.sin(i * 7.7) * r * .55, sy(current.y) + Math.cos(i * 5.2) * r * .55, 1 + i % 4, color + 'a0');
  }
  circle(x + 2, y + 3, r, '#0000008c');
  if (!skinArt[game.selectedSkin] || !drawArt(skinArt[game.selectedSkin], x, y, r * 2.05)) circle(x, y, r, color);
  if (player.carrying) circle(x, y, r * .79, '#f1f1ef', color, 2);
  if (!player.clockwise) {
    ctx.fillStyle = '#fff'; ctx.font = '900 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('↶', x, y + r + 22);
  }
}

function hud() {
  if (!['playing', 'paused', 'dying', 'results'].includes(game.status)) return;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (game.freezeTimer > 0) { ctx.fillStyle = '#a1d7f3'; ctx.font = '900 14px Arial'; ctx.fillText(`FREEZE  ${Math.ceil(game.freezeTimer)}s`, 480, 65); }
  if (game.slowTimer > 0) { ctx.fillStyle = '#ec827b'; ctx.font = '900 14px Arial'; ctx.fillText('SLOW MOTION', 480, 65); }
  ctx.restore();
}

function render() {
  ctx.save();
  if (shake > 0 && !reducedMotion) ctx.translate((Math.random() * 2 - 1) * px(shake), (Math.random() * 2 - 1) * px(shake));
  background();
  drawBackgroundScore();
  if (game.status === 'menu') {
    ctx.globalAlpha = .25;
    polygon(786 + Math.sin(visualTime) * 15, 230, 35, 6, visualTime * .2, '#a75dc0');
    polygon(728, 410, 20, 4, .8, '#d85782');
    circle(670, 310, 25, '#d65a55');
    ctx.globalAlpha = 1;
  } else {
    drawGoal(); drawPoint(); drawEnemies(); drawBonuses(); drawPlayer(); drawVisualEffects(); hud();
    if (game.freezeTimer > 0) { ctx.fillStyle = 'rgba(190, 230, 245, 0.045)'; ctx.fillRect(0, 0, 960, 540); }
    if (game.status === 'dying') {
      ctx.fillStyle = `rgba(235, 75, 67, ${Math.min(.4, game.deathTimer / 5)})`;
      ctx.fillRect(0, 0, 960, 540);
    }
  }
  ctx.restore();
}

function frame(timestamp) {
  if (!previousTime) previousTime = timestamp;
  const elapsed = Math.min((timestamp - previousTime) / 1000, .08);
  previousTime = timestamp;
  visualTime += elapsed;
  updateVisualEffects(elapsed);
  if (game.status === 'playing' || game.status === 'dying' || game.status === 'tutorial') {
    const targetPitch = game.status === 'dying' ? .1 : game.freezeTimer > 0 ? .5 : 1;
    const speed = game.status === 'dying' ? .6 : targetPitch < musicPitch ? .4 : .6;
    musicPitch += Math.sign(targetPitch - musicPitch) * Math.min(Math.abs(targetPitch - musicPitch), speed * elapsed);
    setMusicPitch(musicPitch);
  }
  if (game.status === 'playing' || game.status === 'dying' || game.status === 'tutorial') {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      step(game); consumeEvents(); accumulator -= STEP; steps++;
    }
  } else accumulator = 0;
  if (game.status !== lastStatus) { lastStatus = game.status; syncUI(); }
  render();
  requestAnimationFrame(frame);
}

syncUI();
preloadAudio();
requestAnimationFrame(frame);

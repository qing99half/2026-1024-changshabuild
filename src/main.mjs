import { createGame, startRound, startTutorial, skipTutorial, step, turn, togglePause, selectSkin, skinCost, buySkin, activateDeveloperMode, snapshotProgress, STEP, WORLD, ENEMY_TRAIL_LIFE, ENEMY_TYPES } from './core.mjs';
import { preloadAudio, preloadVoiceSet, preloadCharacterAudio, unlockAudio, playAudioEvent, previewEliminate, startMusic, pauseMusic, fadeOutMusic, setMusicAtmosphere, setMelodicMode, setVolumeLevels } from './audio.mjs';
import { SKINS, isSkinRevealed, activeSkin } from './skins.mjs';
import { normalizeVolumes } from './audio-policy.mjs';
import { requestLandscape } from './orientation.mjs';
import { directionVector } from './directions.mjs';
import { drawPowerupBackground, drawPowerupForeground, drawPowerupPlayerAura } from './powerup-visuals.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = $('stage');
const colors = SKINS.map(skin => skin.color);
const skinNames = SKINS.map(skin => skin.name);
const skinDescriptions = [
  '原版圆环', '双线光轨', '暖色火星', '紫色电弧', '断续光点',
  '环绕光圈', '几何碎片', '绕行光点', '像素方块', '青柠星芒',
  '猫爪粒子', '声波扩散', '红色圆球 · 白色断开 T · 专属背景曲', '黑棕圆球 · 黄紫 24 号球衣'
];
const enemyColors = ['#347da0', '#4c9c79', '#c77a39', '#7658a1', '#c64498', '#ba4d44', '#b9bdbf', '#e6ad55', '#8cdbd6'];
const enemyArt = ['EnemySquare-129.png', 'EnemySquare2-128.png', 'EnemySquare3-131.png', 'EnemySquare4-137.png', 'EnemySquare5-115.png', 'GoalZone1-136.png', 'EnemySquare7-134.png'];
const warningArt = ['warning2-146.png', 'warning6-135.png', 'warning3-162.png', 'warning4-122.png', 'warning5-126.png', 'warning-118.png', 'warning7-150.png', 'warning2-146.png'];
const fxArt = { explode: 'texture-EnemyExplode-71.png', point: 'GoalZone1-136.png', pulse: 'pulse-138.png' };
const bonusArt = { points: 'Plus2-142.png', freeze: 'Time-125.png', bomb: 'Bomb-132.png' };
const skinArt = SKINS.map(skin => skin.art);
const artUrl = file => file.startsWith('assets/') ? file : `assets/original/${file}`;
const artFiles = ['BackCircle-154.png', 'GoalZone-133.png', 'pointTurn02-124.png', 'pointTurn-130.png', ...enemyArt, ...warningArt,
  ...Object.values(fxArt), ...Object.values(bonusArt), ...skinArt].filter(Boolean);
const art = new Map();
for (const file of new Set(artFiles)) {
  const image = new Image();
  image.src = artUrl(file);
  art.set(file, image);
}
const storageKey = 'righty-web-progress-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* Browsers with disabled storage still play. */ }
const game = createGame({ ...saved, classicSpawns: new URLSearchParams(location.search).get('mode') === 'original' });
let reducedMotion = false;
try { reducedMotion = localStorage.getItem('righty-reduced-motion') === 'true'; } catch { /* Local settings are optional. */ }
let melodicAudio = false;
try { melodicAudio = localStorage.getItem('righty-audio-mode-v2') === 'extended'; } catch { /* Local settings are optional. */ }
setMelodicMode(melodicAudio);
const volumeStorageKey = 'righty-volume-levels-v1';
let volumeLevels = normalizeVolumes();
try { volumeLevels = normalizeVolumes(JSON.parse(localStorage.getItem(volumeStorageKey) || '{}')); }
catch { /* Invalid local settings use the current 100% mix. */ }
setVolumeLevels(volumeLevels);
let settingsOpen = false;
let settingsReturnFocus = null;
let previousTime = 0;
let accumulator = 0;
let visualTime = 0;
let lastStatus = game.status;
let shake = 0;
let skinMouthUntil = 0;
const TES_BASE_SPIN = 120 * Math.PI / 180;
let tesSpinAngle = 0;
let tesSpinSpeed = TES_BASE_SPIN;
let tesParticleClock = 0;
const particles = [];
const rings = [];
const scorePulses = [];
const pointTrailParticles = [];
const turnExplosions = [];
const tesWhips = [];
const labels = [];
const grazeFlashes = [];
const bonusParticleClocks = new Map();
let pointTrailSource = null;
let pointTrailClock = 0;
let skinFeedback = '';
let developerShortcutUntil = 0;

function resetTesSpin() {
  tesSpinAngle = 0;
  tesSpinSpeed = TES_BASE_SPIN;
  tesParticleClock = 0;
  tesWhips.length = 0;
}

function emitTesSpinParticle() {
  const player = game.player;
  const angle = Math.random() * Math.PI * 2;
  const radius = player.size * .82;
  const tangent = .3 + Math.min(1.2, tesSpinSpeed / TES_BASE_SPIN * .12);
  particles.push({
    x: player.x + Math.cos(angle) * radius * .9,
    y: player.y + Math.sin(angle) * radius * .9,
    vx: -Math.sin(angle) * tangent + Math.cos(angle) * .15,
    vy: Math.cos(angle) * tangent + Math.sin(angle) * .15,
    gravity: 4, age: 0, life: .3 + Math.random() * .2,
    color: Math.random() < .5 ? '#ffffff' : '#ff3d2b',
    radius: 1.5 + Math.random(), shape: 'dot'
  });
}

function updateTesSpin(seconds) {
  if (game.status !== 'playing' || game.roundSkin !== 12) return;
  tesSpinAngle = (tesSpinAngle + tesSpinSpeed * seconds) % (Math.PI * 2);
  tesSpinSpeed = TES_BASE_SPIN + (tesSpinSpeed - TES_BASE_SPIN) * Math.pow(.99, seconds);
  const rate = Math.min(12, 2 + 2 * (tesSpinSpeed / TES_BASE_SPIN - 1)) * (reducedMotion ? .3 : 1);
  tesParticleClock += rate * Math.min(seconds, .08);
  while (tesParticleClock >= 1) { emitTesSpinParticle(); tesParticleClock--; }
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(snapshotProgress(game))); } catch { /* Private browsing. */ }
}

function consumeEvents() {
  for (const event of game.events.splice(0)) {
    playAudioEvent(event.kind, { ...event, skinIndex: game.roundSkin });
    visualEvent(event);
    if (event.kind === 'tutorial-complete') {
      resetTesSpin();
      if (game.roundSkin === 12 || (melodicAudio && game.roundSkin === 13)) preloadCharacterAudio(game.roundSkin);
      startMusic(game.roundSkin, { restart: Boolean(activeSkin(game).music) });
    }
    if (event.kind === 'die') fadeOutMusic();
    if (event.kind === 'results' || event.kind === 'unlock' || event.kind === 'tutorial-complete' || event.kind === 'developer-mode') save();
    if (event.kind === 'tutorial-stage' || event.kind === 'tutorial-retry' || event.kind === 'tutorial-demo') syncUI();
    if (event.kind === 'results') pauseMusic();
  }
}

function burst(x, y, count, speed, lifetime, color, radius = 3, sprite = null, delay = 0, tintSprite = false, shape = null) {
  if (reducedMotion) count = Math.ceil(count * .3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (.45 + Math.random() * .75);
    particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      age: -delay, life: lifetime * (.65 + Math.random() * .55),
      color: Array.isArray(color) ? color[i % color.length] : color,
      radius: radius * (.55 + Math.random()), sprite, tintSprite, shape, rotation: angle });
  }
}

function shatter(x, y, count, speed, lifetime, color, radius) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (.45 + Math.random() * .75);
    particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      gravity: 9.81, age: 0, life: lifetime,
      color: Array.isArray(color) ? color[i % color.length] : color,
      radius: radius * (.55 + Math.random()),
      sprite: fxArt.explode, tintSprite: true, rotation: angle });
  }
}

function ring(x, y, color, delay = 0, life = .5, maxRadius = 45) {
  rings.push({ x, y, color, age: -delay, life, maxRadius });
}

function originalTurnPulse(x, y, color) {
  for (const delay of [0, .1, .2]) rings.push({ x, y, color, age: -delay, life: .5, originalPulse: true });
}

function scorePulse() {
  const count = reducedMotion ? 7 : 23;
  for (let i = 0; i < count; i++) scorePulses.push({ age: -i / 30, life: .75 });
}

function visualEvent(event) {
  const x = event.x ?? game.player?.x ?? 0, y = event.y ?? game.player?.y ?? 0;
  const goalX = game.goal?.x ?? 0, goalY = game.goal?.y ?? 0;
  const skin = activeSkin(game);
  if (event.kind === 'turn' && game.status === 'playing' && game.roundSkin === 12) {
    tesSpinSpeed *= 1.2;
    const { x: headingX, y: headingY } = directionVector(event.heading ?? Math.round(event.dir * 2));
    let sideX = headingY * (game.player.clockwise ? 1 : -1);
    let sideY = -headingX * (game.player.clockwise ? 1 : -1);
    const radius = game.player.size * .82;
    let originX = x + sideX * radius * 2.55 - headingX * radius * .2;
    let originY = y + sideY * radius * 2.55 - headingY * radius * .2;
    if (originX < WORLD.left + .1 || originX > WORLD.right - .1 ||
        originY < WORLD.bottom + .1 || originY > WORLD.top - .1) {
      sideX *= -1; sideY *= -1;
      originX = x + sideX * radius * 2.55 - headingX * radius * .2;
      originY = y + sideY * radius * 2.55 - headingY * radius * .2;
    }
    tesWhips.push({ originX, originY, sideX, sideY, headingX, headingY,
      age: 0, life: .32, impact: false });
    if (tesWhips.length > 2) tesWhips.shift();
  }
  const scoreEvent = ['deliver', 'deliver-turn', 'bonus', 'freeze', 'bomb', 'invincible', 'phase', 'bullet'].includes(event.kind);
  if (scoreEvent) labels.push({ x, y, text: event.kind === 'bonus' ? '+2' : '+1', age: 0, life: .75 });
  if ((event.scoreDelta || 0) > 0) scorePulse();
  if (event.kind === 'turn') originalTurnPulse(x, y, skin.color);
  if (event.kind === 'pickup') { burst(x, y, 30, 2, .75, '#f4f4f0', 7, fxArt.point); shake = Math.max(shake, .1); }
  if (event.kind === 'deliver') { burst(x, y, 30, 2, .75, '#ffffff', 7, fxArt.point); shake = Math.max(shake, .1); }
  if (event.kind === 'deliver-turn') {
    turnExplosions.push({ x: goalX, y: goalY, age: 0, scale: .25,
      direction: game.player?.clockwise ? 1 : -1, pointKind: event.pointKind });
    burst(goalX, goalY, 125, .75, .5, '#c7544d', 6, fxArt.point);
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
  if (['invincible', 'phase', 'bullet'].includes(event.kind)) {
    const tint = { invincible: '#f6d688', phase: '#a6dadd', bullet: '#b5b6ff' }[event.kind];
    burst(x, y, 24, 1.8, .65, tint, 5, fxArt.point);
    ring(x, y, tint, 0, .55, 72);
  }
  if (event.kind === 'enemy-teleport') burst(x, y, 14, 1.2, .45, enemyColors[8], 4);
  if (event.kind === 'phase-pass') ring(x, y, '#a6dadd', 0, .32, 34);
  if (event.kind === 'enemy-explode') {
    shatter(x, y, 50, 4, 2, enemyColors[event.type] || '#ffffff', 6);
    if (event.source === 'invincible') ring(x, y, '#f6d688', 0, .3, 46);
    shake = Math.max(shake, event.source === 'near-miss' ? .06 : .08);
  }
  if (event.kind === 'near-miss') {
    const extreme = event.grade === 'extreme';
    const angle = Math.atan2(y - (event.playerY ?? game.player?.y ?? y), x - (event.playerX ?? game.player?.x ?? x));
    grazeFlashes.push({ x, y, angle, extreme, age: 0, life: .45 });
    const earned = event.scoreDelta !== 0;
    labels.push({ x, y, text: earned ? (extreme ? '极限擦肩 +1' : '擦肩 +1') : '擦肩成功', age: -.16,
      life: .48, color: extreme ? '#fff4bc' : '#f4f4f0', size: extreme ? 26 : 21 });
    if (event.styleDelta > 0) labels.push({ x, y: y - .3, text: `风格 +${event.styleDelta}`,
      age: -.23, life: .48, color: '#fff4bc', size: 15 });
    shake = Math.max(shake, extreme ? .1 : .06);
  }
  if (event.kind === 'die') {
    shatter(x, y, 75, 5, 3, skin.shatterColors || skin.color, 8);
    for (const enemy of event.enemies || [])
      shatter(enemy.x, enemy.y, 50, 4, 2, enemyColors[enemy.type] || '#ffffff', 6);
    shake = Math.max(shake, .15);
  }
  skinVisualEvent(event.kind, x, y, skin);
}

function skinVisualEvent(kind, x, y, skin) {
  if (melodicAudio && skin.voice && ['turn', 'pickup', 'deliver', 'deliver-turn'].includes(kind))
    skinMouthUntil = visualTime + .13;
  if (skin.fx === 'round' || !['turn', 'pickup', 'deliver', 'deliver-turn'].includes(kind)) return;
  const count = kind === 'turn' ? (skin.fx === 'tes' ? 3 : 10) : kind === 'pickup' ? 8 : 16;
  const shape = {
    neon: 'line', spark: 'line', polygon: 'diamond', pixel: 'pixel',
    star: 'star', paws: 'paw', bark: 'wave', tes: 'line', kobe: 'star'
  }[skin.fx] || 'dot';
  const life = skin.fx === 'ember' || skin.fx === 'orbit' ? .6 : .42;
  burst(x, y, count, kind === 'turn' ? 1.5 : 2.3, life, skin.fxColors || skin.color,
    skin.fx === 'dots' ? 2.4 : 4.2, null, 0, false, shape);
  if (kind === 'turn' && ['halo', 'orbit', 'bark'].includes(skin.fx)) {
    ring(x, y, skin.color, .03, .4, skin.fx === 'bark' ? 68 : 45);
    if (skin.fx === 'bark') ring(x, y, skin.color, .12, .43, 78);
  }
  if ((kind === 'deliver' || kind === 'deliver-turn') && ['star', 'paws', 'bark'].includes(skin.fx))
    ring(x, y, skin.color, 0, .55, 92);
}

function emitPointParticle(x, y, scale = 1) {
  const angle = Math.random() * Math.PI * 2;
  pointTrailParticles.push({ x: x + Math.cos(angle) * .222 * scale,
    y: y + Math.sin(angle) * .222 * scale,
    vx: Math.cos(angle) * scale, vy: Math.sin(angle) * scale,
    age: 0, life: 1, scale });
}

function tesWhipGeometry(whip) {
  const player = game.player;
  const radius = player.size * .82;
  const contact = { x: player.x + whip.sideX * radius * .84,
    y: player.y + whip.sideY * radius * .84 };
  const strike = Math.sin(Math.PI / 2 * Math.min(1, whip.age / .13));
  const recovery = Math.min(1, Math.max(0, (whip.age - .13) / (whip.life - .13)));
  const reach = .2 + .8 * strike - .18 * Math.sin(Math.PI / 2 * recovery);
  const tipX = whip.originX + (contact.x - whip.originX) * reach;
  const tipY = whip.originY + (contact.y - whip.originY) * reach;
  const bend = whip.age <= .13
    ? radius * .65 * Math.sin(Math.PI * strike)
    : radius * .15 * Math.sin(Math.PI * recovery);
  const points = Array.from({ length: 9 }, (_, index) => {
    const along = index / 8;
    const curve = bend * Math.sin(Math.PI * along);
    return { x: whip.originX + (tipX - whip.originX) * along + whip.headingX * curve,
      y: whip.originY + (tipY - whip.originY) * along + whip.headingY * curve };
  });
  return { points, contact, sideX: whip.sideX, sideY: whip.sideY,
    headingX: whip.headingX, headingY: whip.headingY, radius };
}

function emitTesWhipImpact(whip) {
  const geometry = tesWhipGeometry(whip);
  const count = reducedMotion ? 2 : 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const scatter = (Math.random() - .5) * 2;
    particles.push({ x: geometry.contact.x, y: geometry.contact.y,
      vx: geometry.sideX * (1.5 + Math.random() * 1.5) + geometry.headingX * .8 + scatter * geometry.headingX,
      vy: geometry.sideY * (1.5 + Math.random() * 1.5) + geometry.headingY * .8 + scatter * geometry.headingY,
      gravity: 3.5, age: 0, life: .22 + Math.random() * .2,
      color: i % 2 ? '#ff3d2b' : '#ffffff', radius: 1.5 + Math.random() * 1.5, shape: 'line',
      rotation: Math.atan2(geometry.sideY, geometry.sideX) });
  }
}

function updateVisualEffects(dt) {
  if (game.status === 'paused') return;
  shake = Math.max(0, shake - .004 * 60 * dt);
  for (const p of particles) {
    p.age += dt;
    if (p.age >= 0) { p.vy -= (p.gravity || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  if (game.status === 'playing' && game.freezeFxTimer > 0 && Math.random() < 10 * dt) {
    particles.push({ x: WORLD.left + Math.random() * WORLD.width, y: WORLD.bottom + Math.random() * WORLD.height,
      vx: 0, vy: .2, age: 0, life: 2, color: '#b9eafb', radius: px(1 + Math.random() * .5),
      sprite: 'Time-125.png', opacity: .1 });
  }
  for (const r of rings) r.age += dt;
  for (const r of scorePulses) r.age += dt;
  for (const p of pointTrailParticles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  for (const fx of turnExplosions) {
    fx.age += dt;
    if (fx.scale < 1.5 && !fx.contracting) fx.scale += .035 * 60 * dt;
    else { fx.contracting = true; fx.scale -= .035 * 60 * dt; }
  }
  for (const whip of tesWhips) {
    whip.age += dt;
    if (!whip.impact && whip.age >= .13) {
      whip.impact = true;
      if (game.status === 'playing' && game.roundSkin === 12 && game.player) emitTesWhipImpact(whip);
    }
  }
  if (game.point && game.point.phase !== 'returning') {
    if (pointTrailSource !== game.point) { pointTrailSource = game.point; pointTrailClock = 0; }
    pointTrailClock += dt;
    while (pointTrailClock >= .25) {
      pointTrailClock -= .25;
      const point = game.point;
      const x = point.phase === 'carried' ? (point.displayX ?? point.x) : point.x;
      const y = point.phase === 'carried' ? (point.displayY ?? point.y) : point.y;
      emitPointParticle(x, y);
    }
  } else pointTrailSource = null;
  const bonusScale = 43 / px(.6);
  for (const bonus of game.bonuses) {
    let clock = (bonusParticleClocks.get(bonus) || 0) + dt;
    while (clock >= .25) { clock -= .25; emitPointParticle(bonus.x, bonus.y, bonusScale); }
    bonusParticleClocks.set(bonus, clock);
  }
  for (const bonus of bonusParticleClocks.keys())
    if (!game.bonuses.includes(bonus)) bonusParticleClocks.delete(bonus);
  for (const flash of grazeFlashes) flash.age += dt;
  for (const label of labels) { label.age += dt; label.y += .55 * dt; }
  for (const [array, expired] of [[particles, p => p.age >= p.life], [rings, r => r.age >= r.life],
    [scorePulses, p => p.age >= p.life], [pointTrailParticles, p => p.age >= p.life],
    [turnExplosions, fx => fx.age >= 3 || fx.scale <= 0], [tesWhips, whip => whip.age >= whip.life], [labels, l => l.age >= l.life],
    [grazeFlashes, f => f.age >= f.life]]) {
    for (let i = array.length - 1; i >= 0; i--) if (expired(array[i])) array.splice(i, 1);
  }
}

function drawScorePulses() {
  for (const pulse of scorePulses) {
    if (pulse.age < 0) continue;
    const t = pulse.age / pulse.life;
    const alpha = t < .25 ? t / .25 : (1 - t) / .75;
    drawTintedArt(fxArt.pulse, '#5e5e5e', 480, 270, px(15 * (1 - t)), px(15 * (1 - t)), alpha * .392);
  }
}

function drawSkinParticle(p, x, y, radius) {
  if (!p.shape || p.shape === 'dot') { circle(x, y, radius, p.color); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  if (p.shape === 'line' || p.shape === 'wave') {
    ctx.lineWidth = p.shape === 'wave' ? 1.5 : 2.4;
    ctx.beginPath();
    if (p.shape === 'wave') ctx.arc(0, 0, radius, -.9, .9);
    else { ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); }
    ctx.stroke();
  } else if (p.shape === 'pixel') {
    const edge = Math.max(2, radius * 1.65);
    ctx.fillRect(-edge / 2, -edge / 2, edge, edge);
  } else if (p.shape === 'paw') {
    circle(0, radius * .25, radius * .58, p.color);
    for (const dx of [-.8, 0, .8]) circle(dx * radius, -radius * .65, radius * .25, p.color);
  } else {
    const points = p.shape === 'star' ? 8 : 4;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = i * Math.PI * 2 / points - Math.PI / 2;
      const r = p.shape === 'star' && i % 2 ? radius * .4 : radius;
      if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
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
    if (!drawn) drawSkinParticle(p, sx(p.x), sy(p.y), size / 2);
  }
  for (const r of rings) {
    if (r.age < 0) continue;
    const progress = r.age / r.life;
    if (r.originalPulse) {
      ctx.globalAlpha = 1;
      const size = px(1.3 * (.689189136 + .310810864 * progress));
      const alpha = progress < .476 ? 1 : (1 - progress) / .524;
      drawTintedArt(fxArt.pulse, r.color, sx(r.x), sy(r.y), size, size, alpha);
      continue;
    }
    ctx.globalAlpha = (1 - progress) * .75;
    circle(sx(r.x), sy(r.y), 5 + r.maxRadius * progress, null, r.color, 2.5 * (1 - progress) + .5);
  }
  ctx.globalAlpha = 1;
  for (const fx of turnExplosions) {
    const arrowImage = art.get('pointTurn-130.png');
    const pulseImage = art.get(fxArt.pulse);
    const arrowSize = px((arrowImage?.naturalWidth || 400) / 100 * 1.2 * fx.scale);
    const pulseSize = px((pulseImage?.naturalWidth || 500) / 100 * .09948128 * fx.scale);
    ctx.save();
    ctx.translate(sx(fx.x), sy(fx.y));
    drawTintedArt(fxArt.pulse, '#ba4d44', 0, 0, pulseSize, pulseSize, .294);
    ctx.rotate(fx.age * (fx.direction > 0 ? -4 : -5) * 60 * Math.PI / 180);
    drawArt('pointTurn-130.png', 0, 0, arrowSize, arrowSize, .588 * Math.max(0, 1 - fx.age / 1.2));
    if (fx.pointKind === 'angle45') {
      ctx.rotate(-fx.age * (fx.direction > 0 ? -4 : -5) * 60 * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, 1 - fx.age / 1.2);
      ctx.fillStyle = '#fff'; ctx.font = '900 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('45°', 0, 0);
    }
    ctx.restore();
  }
  ctx.textAlign = 'center';
  for (const label of labels) {
    if (label.age < 0) continue;
    ctx.globalAlpha = Math.max(0, 1 - label.age / label.life);
    ctx.font = `900 ${label.size || 23}px Arial`;
    ctx.fillStyle = label.color || '#f4f4f0'; ctx.fillText(label.text, sx(label.x), sy(label.y) - 34);
  }
  ctx.restore();
}

function drawGrazeFlashes() {
  for (const flash of grazeFlashes) {
    const age = flash.age;
    const x = sx(flash.x), y = sy(flash.y);
    if (age < .16) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(flash.angle + Math.PI / 2);
      ctx.globalCompositeOperation = 'screen';
      const power = age < .05 ? 1 - age / .085 : Math.max(0, 1 - (age - .05) / .11);
      const length = flash.extreme ? 145 : 112;
      const blade = (offset, scale = 1) => {
        ctx.save(); ctx.translate(0, offset);
        ctx.globalAlpha = power * scale;
        const glow = ctx.createLinearGradient(0, -length, 0, length);
        glow.addColorStop(0, '#ffffff00'); glow.addColorStop(.5, '#ffffffdd'); glow.addColorStop(1, '#ffffff00');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.moveTo(-3, -length); ctx.lineTo(7, -length * .18);
        ctx.lineTo(3, length); ctx.lineTo(-7, length * .18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(-1, -length * .7, 2, length * 1.4);
        ctx.restore();
      };
      blade(0);
      if (flash.extreme) { ctx.rotate(.42); blade(0, .75); }
      if (age >= .05) {
        ctx.globalAlpha = Math.max(0, 1 - (age - .05) / .11) * .65;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -length * .9, 2, length * 1.8);
      }
      ctx.restore();
    }
    if (!reducedMotion && age < .11) {
      ctx.save();
      ctx.globalAlpha = (flash.extreme ? .23 : .11) * Math.max(0, 1 - age / .11);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 960, 540);
      ctx.restore();
    }
  }
}

function syncUI() {
  $('settings').hidden = !settingsOpen;
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
    $('tutorial-input').src = `assets/original/${matchMedia('(pointer: coarse)').matches ? 'Instruct_Control_MouseON-144.png' : 'Instruct_Control_Space-143.png'}`;
  }
  $('menu-best').textContent = game.best;
  $('menu-points').textContent = game.totalPoints;
  $('result-score').textContent = game.lastScore;
  $('result-time').textContent = `${game.lastTime.toFixed(2)}s`;
  $('result-best').textContent = game.best;
  $('result-earned').textContent = `+${game.lastScore + (game.lastStylePoints || 0)} 点`;
  $('result-style').textContent = `其中风格奖励 +${game.lastStylePoints || 0} 点`;
  $('result-balance').textContent = game.totalPoints;
  const index = game.selectedSkin;
  const skin = SKINS[index];
  const revealed = isSkinRevealed(game, index);
  const owned = game.unlocked.includes(index);
  const delta = value => value === 1 ? '标准' : `${value > 1 ? '+' : ''}${Math.round((value - 1) * 100)}%`;
  $('skin-name').textContent = revealed ? skin.name : '???';
  const preview = $('skin-dot');
  preview.classList.toggle('has-art', revealed && Boolean(skin.art));
  preview.classList.toggle('secret', !revealed);
  preview.style.background = !revealed ? '' : skin.art ? `center / contain no-repeat url('${artUrl(skin.art)}')` : skin.color;
  const cost = skinCost(index);
  $('start').firstChild.textContent = owned ? '开始游戏 ' : '使用经典红开始 ';
  $('skin-state').textContent = !revealed
    ? `隐藏球 · 生涯 ${game.lifetimePoints}/${skin.revealAt}`
    : owned ? '已拥有' : `需 ${cost} 点`;
  $('skin-description').textContent = revealed ? skinDescriptions[index] : '继续游玩，揭开隐藏球的身份';
  $('skin-traits').hidden = !revealed;
  $('skin-traits').innerHTML = revealed
    ? `<span>移动速度 <b>${delta(skin.speed)}</b></span><span>危险圈 <b>${delta(skin.hurt)}</b></span><span>拾取 <b>${delta(skin.pickup)}</b></span><span>擦肩带 <b>${delta(skin.graze)}</b></span><span>风格收益 <b>${delta(skin.styleBonus)}</b></span>`
    : '';
  $('skin-preview').hidden = !revealed;
  $('skin-buy').hidden = owned || !revealed;
  $('skin-buy').textContent = game.totalPoints >= cost ? `解锁 · ${cost} 点` : `还差 ${cost - game.totalPoints} 点`;
  $('skin-feedback').textContent = skinFeedback;
  $('motion-toggle').textContent = `动态效果：${reducedMotion ? '减弱' : '标准'}`;
  $('audio-toggle').textContent = `音效模式：${melodicAudio ? '扩展音律' : '原版'}`;
  for (const [key, value] of Object.entries(volumeLevels)) {
    $(`volume-${key}`).value = value;
    $(`volume-${key}-value`).textContent = `${value}%`;
  }
  $('developer-badge').hidden = !game.developerMode;
}

function openSettings(button) {
  settingsReturnFocus = button;
  settingsOpen = true;
  syncUI();
  $('settings-close').focus();
}

function closeSettings() {
  settingsOpen = false;
  syncUI();
  settingsReturnFocus?.focus();
}

function play(forceTutorial = false) {
  if (!game.unlocked.includes(game.selectedSkin)) game.selectedSkin = 0;
  skinFeedback = '';
  preloadAudio();
  playAudioEvent('menu-click');
  particles.length = 0; rings.length = 0; scorePulses.length = 0; pointTrailParticles.length = 0;
  bonusParticleClocks.clear();
  turnExplosions.length = 0; labels.length = 0; grazeFlashes.length = 0; pointTrailSource = null;
  pointTrailClock = 0; shake = 0;
  if (forceTutorial || !game.tutorialSeen) startTutorial(game);
  else startRound(game);
  resetTesSpin();
  if (melodicAudio) preloadVoiceSet(activeSkin(game).voice);
  if (game.roundSkin === 12 || (melodicAudio && game.roundSkin === 13)) preloadCharacterAudio(game.roundSkin);
  accumulator = 0;
  consumeEvents();
  syncUI();
  startMusic(game.roundSkin, { restart: Boolean(activeSkin(game).music) });
}

$('start').addEventListener('click', () => play());
$('restart').addEventListener('click', () => play());
$('replay-tutorial').addEventListener('click', () => play(true));
$('settings-from-menu').addEventListener('click', event => openSettings(event.currentTarget));
$('settings-from-pause').addEventListener('click', event => openSettings(event.currentTarget));
$('settings-close').addEventListener('click', closeSettings);
for (const key of ['turn', 'effects', 'music']) {
  $(`volume-${key}`).addEventListener('input', event => {
    volumeLevels = setVolumeLevels({ [key]: event.currentTarget.value });
    $(`volume-${key}-value`).textContent = `${volumeLevels[key]}%`;
    try { localStorage.setItem(volumeStorageKey, JSON.stringify(volumeLevels)); } catch { /* Local settings are optional. */ }
  });
}
$('preview-eliminate').addEventListener('click', async () => {
  await unlockAudio();
  await preloadAudio();
  previewEliminate();
});
$('motion-toggle').addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  if (reducedMotion) shake = 0;
  try { localStorage.setItem('righty-reduced-motion', String(reducedMotion)); } catch { /* Local settings are optional. */ }
  syncUI();
});
$('audio-toggle').addEventListener('click', () => {
  melodicAudio = !melodicAudio;
  setMelodicMode(melodicAudio);
  try { localStorage.setItem('righty-audio-mode-v2', melodicAudio ? 'extended' : 'original'); } catch { /* Local settings are optional. */ }
  syncUI();
  if (melodicAudio && isSkinRevealed(game, game.selectedSkin))
    preloadVoiceSet(SKINS[game.selectedSkin].voice);
  if (melodicAudio && game.selectedSkin === 13 && isSkinRevealed(game, 13)) preloadCharacterAudio(13);
  playAudioEvent('menu-click');
});
$('tutorial-skip').addEventListener('click', event => { event.stopPropagation(); skipTutorial(game); consumeEvents(); syncUI(); });
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
    if (melodicAudio && isSkinRevealed(game, game.selectedSkin)) preloadVoiceSet(SKINS[game.selectedSkin].voice);
    if ((game.selectedSkin === 12 || (melodicAudio && game.selectedSkin === 13)) && isSkinRevealed(game, game.selectedSkin))
      preloadCharacterAudio(game.selectedSkin);
  });
}
$('skin-preview').addEventListener('click', async () => {
  const index = game.selectedSkin;
  await unlockAudio();
  if (melodicAudio) await preloadVoiceSet(SKINS[index].voice);
  if (index === 12 || (melodicAudio && index === 13)) await preloadCharacterAudio(index);
  if (game.selectedSkin === index && isSkinRevealed(game, index))
    playAudioEvent('turn', { skinIndex: index, toneBand: 1, dir: 1, toneId: 'turn-middle-right' });
});
$('skin-buy').addEventListener('click', () => {
  if (buySkin(game)) {
    skinFeedback = `${skinNames[game.selectedSkin]} 已解锁，下一局可使用`;
    if (melodicAudio) preloadVoiceSet(SKINS[game.selectedSkin].voice);
    if (game.selectedSkin === 12 || (melodicAudio && game.selectedSkin === 13)) preloadCharacterAudio(game.selectedSkin);
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
  if (settingsOpen) {
    if (event.code === 'Escape') { event.preventDefault(); closeSettings(); }
    return;
  }
  if (event.shiftKey && event.code === 'Tab') {
    event.preventDefault();
    if (!event.repeat) developerShortcutUntil = performance.now() + 1200;
    return;
  }
  if (event.code === 'KeyP' && performance.now() <= developerShortcutUntil) {
    event.preventDefault();
    if (event.repeat) return;
    developerShortcutUntil = 0;
    if (activateDeveloperMode(game)) {
      skinFeedback = '开发者奖励 · +2000 点';
      consumeEvents();
      syncUI();
    }
    return;
  }
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

if (matchMedia('(pointer: coarse)').matches) {
  requestLandscape(screen, document).then(result => {
    if (result === 'unsupported') {
      $('rotate-action').hidden = true;
      $('rotate-help').textContent = '打开自动旋转，并将手机横过来';
    }
  });
}
$('rotate-action').addEventListener('click', async () => {
  const result = await requestLandscape(screen, document, true);
  if (result !== 'locked') {
    $('rotate-action').hidden = true;
    $('rotate-help').textContent = '浏览器未允许自动横屏，请打开自动旋转并将手机横过来';
  }
});

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
  for (const particle of pointTrailParticles) {
    const t = particle.age / particle.life;
    const alpha = t < .5 ? 1 : (1 - t) * 2;
    const size = px(.45 * (particle.scale || 1) * (1 - t));
    drawArt(fxArt.point, sx(particle.x), sy(particle.y), size, size, alpha);
  }
  if (!game.point) return;
  const point = game.point;
  const x = sx(point.phase === 'carried' ? (point.displayX ?? point.x) : point.x);
  const y = sy(point.phase === 'carried' ? (point.displayY ?? point.y) : point.y);
  if (point.phase === 'carried') return;
  const remaining = point.phase === 'returning' ? Math.max(0, point.returnTimer / .22) : 1;
  const radius = px(.3) * remaining;
  drawPointPulse(x, y, point.age ?? game.time, 1, remaining);
  if (point.kind === 'turn' || point.kind === 'angle45') {
    circle(x, y, radius, '#f0f0ee');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((game.player?.clockwise ? -1 : 1) * (point.age || 0) * 2 * 60 * Math.PI / 180);
    if (game.player?.clockwise) ctx.scale(1, -1);
    if (point.kind === 'angle45') {
      ctx.fillStyle = '#c8544f'; ctx.font = `900 ${Math.max(12, radius * .68)}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('45°', 0, 1);
    } else if (!drawArt('pointTurn02-124.png', 0, 0, radius * 1.5)) {
      ctx.fillStyle = '#c8544f';
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * radius * .16, Math.sin(angle) * radius * .16);
        ctx.arc(0, 0, radius * .65, angle + .12, angle + 1.18);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  } else {
    circle(x + 2, y + 3, radius, '#00000055');
    circle(x, y, radius, '#f1f1f0');
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * .67 + visualTime * .9;
      circle(x + Math.cos(a) * radius * 1.12, y + Math.sin(a) * radius * 1.12, 1.5 + i % 2, '#ffffffd0');
    }
  }
}

function drawPointPulse(x, y, age, scale = 1, alpha = 1) {
  const progress = age % 1;
  const pulseAlpha = progress < .7 ? 1 : (1 - progress) / .3;
  const size = px(1.2 * scale * progress);
  drawArt(fxArt.pulse, x, y, size, size, pulseAlpha * alpha);
}

function drawEnemyTrail(enemy, color, config) {
  if (!config.trailWidth || !enemy.trail || enemy.trail.length < 2) return;
  ctx.save();
  const life = config.trailLife || ENEMY_TRAIL_LIFE;
  const width = px(config.width * (enemy.type === 5 ? 5 : enemy.type === 7 ? 1.45 : 1.4));
  const height = px(config.height * (enemy.type === 5 ? 5 : enemy.type === 7 ? 1.45 : 1.4));
  for (let i = enemy.trail.length - 2; i >= 0; i -= 4) {
    const point = enemy.trail[i];
    const freshness = Math.max(0, 1 - point.age / life);
    if (freshness <= 0) continue;
    const alpha = .13 * .784 * freshness * (enemy.fadeAlpha ?? 1);
    if (enemy.type === 7) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(sx(point.x) - width / 2, sy(point.y) - height / 2, width, height);
      ctx.globalAlpha = 1;
      continue;
    }
    const image = enemyArt[enemy.type] || enemyArt[0];
    if (enemy.type === 5) drawTintedArt(image, color, sx(point.x), sy(point.y), width, height, alpha);
    else if (!drawArt(image, sx(point.x), sy(point.y), width, height, alpha)) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(sx(point.x) - width / 2, sy(point.y) - height / 2, width, height);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function warningScale(initial, age) {
  let scale = initial;
  for (let frame = 0; frame < Math.floor(age * 60) && frame < 170; frame++)
    scale = scale < 11 ? scale + .1 : 0;
  return scale;
}

function drawEnemyWarning(enemy, config, y) {
  if (enemy.type === 8) return;
  const age = enemy.age || 0;
  const alpha = Math.max(0, 1 - age * .6);
  if (alpha <= 0) return;
  if (enemy.type === 7) {
    const direction = Math.sign(enemy.vx) || -1;
    const warningX = Math.max(WORLD.left + .6,
      Math.min(WORLD.right - .6, enemy.x + direction * config.warningOffset));
    const x = sx(warningX);
    const side = px(config.width * 1.45);
    ctx.save();
    ctx.globalAlpha = alpha * .38;
    ctx.fillStyle = enemyColors[7];
    ctx.shadowColor = enemyColors[7];
    ctx.shadowBlur = side;
    ctx.fillRect(x - side / 2, y - side / 2, side, side);
    ctx.restore();
    return;
  }
  const scaleY = warningScale(config.warningScaleY, age);
  if (scaleY <= 0) return;
  const file = warningArt[enemy.type];
  const image = art.get(file);
  if (!image?.complete || !image.naturalWidth) return;
  const direction = Math.sign(enemy.vx) || -1;
  const x = sx(enemy.x + direction * config.warningOffset);
  const width = px(image.naturalWidth / 100 * config.warningScaleX * .125);
  const height = px(image.naturalHeight / 100 * scaleY * .125);
  ctx.save();
  ctx.translate(x, y);
  if (direction < 0) ctx.scale(-1, 1);
  drawArt(file, 0, 0, width, height, alpha);
  ctx.restore();
}

function drawEnemies() {
  if (game.status === 'dying') return;
  for (const enemy of game.enemies) {
    const x = sx(enemy.x), y = sy(enemy.y), r = px(enemy.radius);
    const fill = enemyColors[enemy.type] || enemyColors[0];
    const config = ENEMY_TYPES[enemy.type] || ENEMY_TYPES[0];
    if (enemy.type === 8 && enemy.phase === 'warning') {
      const progress = 1 - Math.max(0, enemy.phaseTimer) / .8;
      const alpha = Math.sin(Math.PI * Math.min(1, progress)) * .72;
      const targetX = sx(enemy.targetX), targetY = sy(enemy.targetY);
      const side = px(config.width * 1.45);
      const warningSide = side * (1.55 - .25 * progress);
      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.shadowColor = fill;
      ctx.shadowBlur = side * .9;
      ctx.globalAlpha = alpha * .25;
      ctx.fillRect(targetX - side / 2, targetY - side / 2, side, side);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.strokeRect(targetX - warningSide / 2, targetY - warningSide / 2, warningSide, warningSide);
      ctx.restore();
      continue;
    }
    drawEnemyWarning(enemy, config, y);
    drawEnemyTrail(enemy, fill, config);
    if (enemy.type >= 7) {
      const width = px(config.width * 1.45);
      const height = px(config.height * 1.45);
      ctx.save();
      if (enemy.type === 8 && enemy.phase === 'grace') ctx.globalAlpha = .52;
      ctx.fillStyle = fill;
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      ctx.restore();
      continue;
    }
    const sprite = enemyArt[enemy.type] || enemyArt[0];
    const width = px(config.width * (enemy.type === 5 ? 5 : 1.4));
    const height = px(config.height * (enemy.type === 5 ? 5 : 1.4));
    const alpha = enemy.fadeAlpha ?? 1;
    if (enemy.type === 5) {
      drawTintedArt(sprite, '#ba4d44', x, y, width, height, alpha);
    } else if (enemy.type === 3) {
      const scale = Number.isFinite(enemy.pulseScale) ? enemy.pulseScale / .125 : 1;
      drawArt(sprite, x, y, width * scale, height * scale, alpha);
    } else drawArt(sprite, x, y, width, height, alpha);
    if (enemy.near) {
      const pulse = .25 + .12 * Math.sin(visualTime * 11);
      ctx.globalAlpha = pulse;
      circle(x, y, Math.max(r + 8, 23), null, '#e9f7ff', 1.2);
      ctx.globalAlpha = 1;
    }
  }
}

function drawBonuses() {
  for (const bonus of game.bonuses) {
    const x = sx(bonus.x), y = sy(bonus.y);
    drawPointPulse(x, y, visualTime, 43 / px(.6));
    if (drawArt(bonusArt[bonus.kind], x, y, 43)) continue;
    circle(x, y, 18, '#f1f1ed', '#333336', 3);
    if (bonus.kind === 'points') {
      ctx.fillStyle = '#333336'; ctx.font = '900 17px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+2', x, y + 1);
    } else if (bonus.kind === 'freeze') {
      circle(x, y, 12, null, '#333336', 2);
      ctx.strokeStyle = '#333336'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    } else if (bonus.kind === 'bomb') {
      ctx.fillStyle = '#333336';
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); ctx.arc(x, y, 13, a - .45, a + .45); ctx.closePath(); ctx.fill();
      }
      circle(x, y, 3.5, '#333336');
    } else {
      const glyph = { invincible: '✦', phase: '◎', bullet: '≫' }[bonus.kind] || '?';
      ctx.fillStyle = '#333336'; ctx.font = '900 24px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, x, y + 1);
    }
  }
}

function drawTesWhips() {
  if (game.roundSkin !== 12 || !game.player || !['playing', 'paused'].includes(game.status)) return;
  for (const whip of tesWhips) {
    const geometry = tesWhipGeometry(whip);
    const fade = whip.age <= .1 ? 1 : Math.cos(Math.PI / 2 * Math.min(1, (whip.age - .1) / .22));
    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    geometry.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(sx(point.x), sy(point.y));
      else ctx.lineTo(sx(point.x), sy(point.y));
    });
    ctx.strokeStyle = '#ff3d2b';
    ctx.lineWidth = px(geometry.radius * .28);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = px(geometry.radius * .13);
    ctx.stroke();
    circle(sx(geometry.points[0].x), sy(geometry.points[0].y), px(geometry.radius * .14), '#ff3d2b', '#ffffff', 1);
    ctx.restore();
  }
}

function drawPlayer() {
  if (!game.player || game.status === 'dying') return;
  const player = game.player, x = sx(player.x), y = sy(player.y), r = px(player.size * .82);
  const skin = activeSkin(game), color = skin.color;
  for (let i = 1; i < game.trail.length; i++) {
    const previous = game.trail[i - 1], current = game.trail[i];
    const fade = Math.max(0, current.ttl / 1);
    ctx.strokeStyle = color + Math.round(fade * 92).toString(16).padStart(2, '0');
    ctx.lineWidth = r * (skin.fx === 'neon' ? .55 : skin.fx === 'dots' ? .4 : 1.2);
    ctx.lineCap = 'round';
    if (skin.fx === 'dots') ctx.setLineDash([r * .3, r * .58]);
    ctx.beginPath(); ctx.moveTo(sx(previous.x), sy(previous.y)); ctx.lineTo(sx(current.x), sy(current.y)); ctx.stroke();
    ctx.setLineDash([]);
    if (skin.fx === 'neon') {
      const dx = sx(current.x - previous.x), dy = sy(current.y - previous.y);
      const length = Math.hypot(dx, dy) || 1;
      const ox = -dy / length * r * .32, oy = dx / length * r * .32;
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#e1fcff' + Math.round(fade * 170).toString(16).padStart(2, '0');
      ctx.beginPath(); ctx.moveTo(sx(previous.x) + ox, sy(previous.y) + oy);
      ctx.lineTo(sx(current.x) + ox, sy(current.y) + oy); ctx.stroke();
    }
    if (i % 4 === 0) {
      const shape = { polygon: 'diamond', pixel: 'pixel', star: 'star', paws: 'paw', bark: 'wave', spark: 'line', tes: 'line', kobe: 'star' }[skin.fx] || 'dot';
      const offset = skin.fx === 'orbit' ? r * .65 : r * .35;
      ctx.globalAlpha = fade * .7;
      const particleColor = skin.fxColors ? skin.fxColors[i % skin.fxColors.length] : color;
      drawSkinParticle({ shape, color: particleColor, rotation: i * .8 }, sx(current.x) + Math.sin(i * 7.7) * offset,
        sy(current.y) + Math.cos(i * 5.2) * offset, skin.fx === 'paws' ? 3 : 2.5);
      ctx.globalAlpha = 1;
    }
  }
  ctx.save();
  if (game.phaseTimer > 0) ctx.globalAlpha = .48;
  circle(x + 2, y + 3, r, '#0000008c');
  let skinDrawn = false;
  if (skin.art) {
    if (game.roundSkin === 12) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tesSpinAngle);
      skinDrawn = drawArt(skin.art, 0, 0, r * 2.05);
      ctx.restore();
    } else skinDrawn = drawArt(skin.art, x, y, r * 2.05);
  }
  if (!skinDrawn) circle(x, y, r, color);
  if (skin.voice && visualTime < skinMouthUntil) {
    ctx.fillStyle = '#543338';
    ctx.beginPath(); ctx.ellipse(x, y + r * .4, r * .15, r * .11, 0, 0, Math.PI * 2); ctx.fill();
  }
  circle(x, y, px(player.size * .85 * skin.hurt), null, color + '30', 1);
  if (player.carrying) {
    if (game.roundSkin === 12) circle(x, y, r * .79, 'rgba(241,241,239,.25)', 'rgba(255,255,255,.75)', 2);
    else circle(x, y, r * .79, '#f1f1ef', color, 2);
  }
  ctx.restore();
  drawPowerupPlayerAura(ctx, game, visualTime, reducedMotion, x, y, r);
  if (game.bulletTimer > 0) {
    ctx.save(); ctx.globalAlpha = .38;
    circle(x, y, r * 1.57, null, '#aaaaff', 2);
    ctx.restore();
  }
  if (!player.clockwise) {
    ctx.fillStyle = '#fff'; ctx.font = '900 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('↶', x, y + r + 22);
  }
}

function hud() {
  if (!['playing', 'paused', 'dying', 'results'].includes(game.status)) return;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const modes = [];
  if (game.freezeTimer > 0) modes.push(`冻结 ${Math.ceil(game.freezeTimer)}s`);
  if (game.invincibleTimer > 0) modes.push(`无敌 ${Math.ceil(game.invincibleTimer)}s`);
  if (game.phaseTimer > 0) modes.push(`虚化 ${Math.ceil(game.phaseTimer)}s`);
  if (game.bulletTimer > 0) modes.push(`子弹时间 ${Math.ceil(game.bulletTimer)}s`);
  if (game.angle45) modes.push('45°转向');
  if (modes.length) {
    ctx.fillStyle = '#d9f2f1'; ctx.font = '900 14px Arial';
    ctx.fillText(modes.join('   ·   '), 480, 65);
  }
  ctx.restore();
}

function render() {
  ctx.save();
  if (shake > 0 && !reducedMotion) ctx.translate((Math.random() * 2 - 1) * px(shake), (Math.random() * 2 - 1) * px(shake));
  background();
  drawPowerupBackground(ctx, game, visualTime, reducedMotion);
  drawScorePulses();
  drawBackgroundScore();
  if (game.status === 'menu') {
    ctx.globalAlpha = .25;
    polygon(786 + Math.sin(visualTime) * 15, 230, 35, 6, visualTime * .2, '#a75dc0');
    polygon(728, 410, 20, 4, .8, '#d85782');
    circle(670, 310, 25, '#d65a55');
    ctx.globalAlpha = 1;
  } else {
    drawGoal(); drawEnemies(); drawBonuses(); drawTesWhips(); drawPlayer(); drawPoint(); drawVisualEffects(); drawGrazeFlashes();
    if (game.freezeTimer > 0) { ctx.fillStyle = 'rgba(190, 230, 245, 0.045)'; ctx.fillRect(0, 0, 960, 540); }
    drawPowerupForeground(ctx, game, visualTime, reducedMotion);
    hud();
  }
  ctx.restore();
}

function frame(timestamp) {
  if (!previousTime) previousTime = timestamp;
  const realElapsed = Math.max(0, (timestamp - previousTime) / 1000);
  const elapsed = Math.min(realElapsed, .08);
  previousTime = timestamp;
  visualTime += elapsed;
  updateVisualEffects(elapsed * (game.slowPhase ? game.timeScale : 1));
  if (game.status === 'playing' || game.status === 'tutorial')
    setMusicAtmosphere(game.freezeTimer > 0 ? 'freeze' : 'normal');
  if (game.status === 'playing' || game.status === 'dying' || game.status === 'tutorial') {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      step(game); consumeEvents(); accumulator -= STEP; steps++;
    }
  } else accumulator = 0;
  updateTesSpin(realElapsed);
  if (game.status !== lastStatus) { lastStatus = game.status; syncUI(); }
  render();
  requestAnimationFrame(frame);
}

syncUI();
preloadAudio();
if (melodicAudio) preloadVoiceSet(SKINS[game.selectedSkin].voice);
if (game.selectedSkin === 12 || (melodicAudio && game.selectedSkin === 13))
  preloadCharacterAudio(game.selectedSkin);
requestAnimationFrame(frame);

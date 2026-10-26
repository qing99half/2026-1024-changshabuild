import { turnTone } from './melody.mjs';
import { SKINS, activeSkin, isSkinRevealed } from './skins.mjs';
import { directionVector, turnHeading, toneDirection } from './directions.mjs';
import { nextPointKind } from './special-points.mjs';
import { chooseBonusKind, applyPowerup, stepPowerups, playerSpeedMultiplier, enemySpeedMultiplier, spawnSpeedMultiplier, enemyContactEffect } from './powerups.mjs';
import { createNewEnemy, advanceNewEnemy, newEnemyCanCollide } from './new-enemies.mjs';

export const STEP = 1 / 60;
export const ENEMY_TRAIL_LIFE = 0.65;
// The Unity camera has a 3.84 world-unit orthographic half-height; 16:9 gives this field.
export const WORLD = Object.freeze({ width: 13.653333333333334, height: 7.68, left: -6.826666666666667, right: 6.826666666666667, top: 3.84, bottom: -3.84 });
export const ENEMY_UNLOCK_SCORES = Object.freeze([0, 2, 4, 6, 8, 10, 12, 8, 12]);
export const CLASSIC_ENEMY_UNLOCK_SCORES = Object.freeze([0, 5, 10, 15, 20, 25, 30, 35, 40]);
export const ENEMY_TYPES = Object.freeze([
  { name: 'EnemySquare', width: .5, height: .5, radius: .25, trailLife: .5, trailWidth: .49, warningOffset: 2.11, warningScaleX: 10, warningScaleY: 1 },
  { name: 'EnemySquare2', width: 1.0465, height: .4945, radius: .53, trailLife: .65, trailWidth: .488, warningOffset: 2.41, warningScaleX: 5.5, warningScaleY: .55 },
  { name: 'EnemySquare3', width: .4922, height: .9085, radius: .46, trailLife: .5, trailWidth: .901, warningOffset: 2.09, warningScaleX: 5.5, warningScaleY: .55 },
  { name: 'EnemySquare4', width: .5, height: .5, radius: .25, trailLife: .5, trailWidth: .49, warningOffset: 2.11, warningScaleX: 10, warningScaleY: 1 },
  { name: 'EnemySquare5', width: .5, height: .5, radius: .25, trailLife: .5, trailWidth: 0, warningOffset: 2.21, warningScaleX: 10, warningScaleY: 8 },
  { name: 'EnemySquare6', width: .0625, height: .0625, radius: .03125, trailLife: .5, trailWidth: .5, warningOffset: 2.11, warningScaleX: 10, warningScaleY: 1 },
  { name: 'EnemySquare7', width: .4945, height: .4945, radius: .25, trailLife: .5, trailWidth: .485, warningOffset: 2.1, warningScaleX: 5.5, warningScaleY: .55 },
  { name: 'EnemyBounce45', width: .4, height: .4, radius: .2, trailLife: .5, trailWidth: .392, warningOffset: 2.1, warningScaleX: 5.5, warningScaleY: .55 },
  { name: 'EnemyBlink', width: .448, height: .448, radius: .224, trailLife: .5, trailWidth: 0, warningOffset: 0, warningScaleX: 0, warningScaleY: 0 }
]);

function random(game) {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function between(game, lo, hi) { return lo + random(game) * (hi - lo); }

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function playerRadius(player) { return player.size * 0.85; }
function hurtRadius(game) { return playerRadius(game.player) * activeSkin(game).hurt; }
function pickupDistance(game, targetRadius) {
  return (playerRadius(game.player) + targetRadius) * activeSkin(game).pickup;
}
function nearMissRadius(game) {
  const inner = hurtRadius(game);
  const originalOuter = nearMissBaseRadius(game.player);
  return inner + Math.max(0, originalOuter - inner) * 1.125 * (activeSkin(game).graze ?? 1);
}
export function grazeBounds(game) { return { inner: hurtRadius(game), outer: nearMissRadius(game) }; }
function nearMissBaseRadius(player) { return player.size * 3 * 0.42823535203933716; }
function goalRadius(goal) { return goal.size * 2.325; }

function emit(game, kind, text = '', detail = {}) {
  game.events.push({ kind, text, ...detail });
  if (text) game.toast = { text, ttl: 0.75 };
}

function circleHitsBox(circle, box, halfWidth, halfHeight) {
  const dx = Math.max(Math.abs(circle.x - box.x) - halfWidth, 0);
  const dy = Math.max(Math.abs(circle.y - box.y) - halfHeight, 0);
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function enemyParts(enemy) {
  return [{ x: enemy.x, y: enemy.y, part: 'body' }];
}

function enemyHitsCircle(enemy, circle, padding = 0) {
  const parts = enemyParts(enemy);
  const dynamicRadius = enemy.type === 3 && Number.isFinite(enemy.pulseScale) ? 2 * enemy.pulseScale : enemy.radius;
  const hasBox = Number.isFinite(enemy.hitW) && Number.isFinite(enemy.hitH) && enemy.type !== 3 && enemy.type !== 5;
  for (const part of parts) {
    if (hasBox) {
      if (circleHitsBox({ ...circle, radius: circle.radius + padding }, part, enemy.hitW / 2, enemy.hitH / 2)) return part;
    } else if (Math.hypot(circle.x - part.x, circle.y - part.y) < circle.radius + dynamicRadius + padding) return part;
  }
  return null;
}

function enemyClearance(enemy, point) {
  const dynamicRadius = enemy.type === 3 && Number.isFinite(enemy.pulseScale) ? 2 * enemy.pulseScale : enemy.radius;
  const hasBox = Number.isFinite(enemy.hitW) && Number.isFinite(enemy.hitH) && enemy.type !== 3 && enemy.type !== 5;
  return Math.min(...enemyParts(enemy).map(part => hasBox
    ? Math.hypot(Math.max(Math.abs(point.x - part.x) - enemy.hitW / 2, 0),
      Math.max(Math.abs(point.y - part.y) - enemy.hitH / 2, 0))
    : Math.hypot(point.x - part.x, point.y - part.y) - dynamicRadius));
}

export function createGame(saved = {}, seed = 0x1024) {
  const priorUnlocked = Array.isArray(saved.unlocked)
    ? saved.unlocked.filter(n => Number.isInteger(n) && n >= 0 && n < SKINS.length) : [];
  const unlocked = [...new Set([0, ...priorUnlocked])];
  const totalPoints = Math.max(0, Number(saved.totalPoints) || 0);
  // The last two skins were previously free; old saves may own them without spending points.
  const priorSpending = unlocked.reduce((sum, index) => sum + (index < 12 ? SKINS[index].cost : 0), 0);
  return {
    status: 'menu', seed: seed >>> 0, events: [], toast: null,
    score: 0, lastScore: 0, lastTime: 0, best: Number(saved.best) || 0,
    stylePoints: 0, lastStylePoints: 0, grazeCombo: 0,
    totalPoints, lifetimePoints: Math.max(Number(saved.lifetimePoints) || 0, totalPoints + priorSpending),
    gamesPlayed: Number(saved.gamesPlayed) || 0,
    selectedSkin: unlocked.includes(saved.selectedSkin) ? saved.selectedSkin : 0,
    roundSkin: 0,
    unlocked, tutorialSeen: saved.tutorialSeen === undefined ? Number(saved.gamesPlayed) > 0 : Boolean(saved.tutorialSeen),
    tutorial: null, introducedEnemies: [], nextEnemyId: 1,
    classicSpawns: Boolean(saved.classicSpawns), developerMode: Boolean(saved.developerMode), freezeFxTimer: 0,
    time: 0, deathTimer: 0, freezeTimer: 0, slowTimer: 0, slowPhase: null, timeScale: 1,
    angle45: false, invincibleTimer: 0, phaseTimer: 0, bulletTimer: 0, bonusIntroduced: [],
    player: null, goal: null, point: null, enemies: [], bonuses: [], bombWaves: [], trail: [],
    spawnTimer: 0, spawned: 0, nextBonusAt: 7, pointCount: 0, nextSpecialPointAt: 8, specialDebuts: 0,
    pointSpawnLow: 0.2, pointSpawnHigh: 0.8, goalCorner: -1, goalTarget: null
  };
}

export function snapshotProgress(game) {
  return { best: game.best, totalPoints: game.totalPoints, lifetimePoints: game.lifetimePoints,
    gamesPlayed: game.gamesPlayed, developerMode: game.developerMode,
    selectedSkin: game.selectedSkin, unlocked: [...game.unlocked], tutorialSeen: game.tutorialSeen };
}

export function activateDeveloperMode(game) {
  game.developerMode = true;
  game.totalPoints += 2000;
  game.lifetimePoints += 2000;
  emit(game, 'developer-mode', '开发者奖励 · +2000 点');
  return true;
}

export function skinCost(index) { return SKINS[index]?.cost ?? Infinity; }

export function selectSkin(game, index) {
  if (index < 0 || index >= SKINS.length) return false;
  game.selectedSkin = index;
  return true;
}

export function buySkin(game) {
  const index = game.selectedSkin;
  if (game.unlocked.includes(index)) return true;
  if (!isSkinRevealed(game, index)) return false;
  const cost = skinCost(index);
  if (game.totalPoints < cost) return false;
  game.totalPoints -= cost;
  game.unlocked.push(index);
  emit(game, 'unlock', '外观已解锁');
  return true;
}

export function startRound(game) {
  game.status = 'playing';
  game.roundSkin = game.unlocked.includes(game.selectedSkin) ? game.selectedSkin : 0;
  game.tutorial = null;
  game.events = [];
  game.score = 0;
  game.stylePoints = 0;
  game.grazeCombo = 0;
  game.lastTime = 0;
  game.time = 0;
  game.deathTimer = 0;
  game.freezeTimer = 0;
  game.freezeFxTimer = 0;
  game.slowTimer = 0;
  game.slowPhase = null;
  game.timeScale = 1;
  game.angle45 = false;
  game.invincibleTimer = 0;
  game.phaseTimer = 0;
  game.bulletTimer = 0;
  game.bonusIntroduced = [];
  game.player = { x: 0, y: -2.65, dir: 0, speed: 0, size: 0.425, growth: 0.0001, clockwise: true, carrying: false };
  game.goal = { x: 0, y: -2.65, size: 0.375 };
  game.point = { x: 0, y: 2.75, kind: 'normal', phase: 'field', returnTimer: 0, age: 0 };
  game.enemies = [];
  game.bonuses = [];
  game.bombWaves = [];
  game.trail = [];
  game.spawnTimer = 2;
  game.spawned = 0;
  game.introducedEnemies = [];
  game.nextEnemyId = 1;
  game.nextBonusAt = 7;
  game.pointCount = 0;
  game.nextSpecialPointAt = 8;
  game.specialDebuts = 0;
  game.pointSpawnLow = 0.2;
  game.pointSpawnHigh = 0.8;
  game.goalCorner = -1;
  game.goalTarget = null;
  game.toast = null;
  emit(game, 'start');
}

const TUTORIAL_LABELS = ['按键转向', '拾取并送回', '避开敌人'];

function placeTutorialStage(game, stage) {
  game.roundSkin = 0;
  game.tutorial = { stage, turns: 0, elapsed: 0, collected: false, failures: game.tutorial?.failures || 0 };
  game.status = 'tutorial';
  game.score = 0;
  game.player = { x: -2.5, y: stage === 0 ? -1.6 : -1.8, dir: 0, speed: .035,
    size: .425, growth: 0, clockwise: true, carrying: false };
  game.goal = { x: -2.5, y: -1.8, size: .375 };
  game.point = stage === 1 ? { x: -2.5, y: 1.35, kind: 'normal', phase: 'field', returnTimer: 0, age: 0 } : null;
  game.enemies = stage === 2 ? [{ id: -1, x: 5.8, y: .2, vx: -2.1, vy: 0,
    type: 0, shape: 'EnemySquare', radius: .25, hitW: .5, hitH: .5,
    near: false, trail: [{ x: 5.8, y: .2, age: 0 }] }]
    : [];
  game.bonuses = [];
  game.bombWaves = [];
  game.trail = [];
  emit(game, 'tutorial-stage', TUTORIAL_LABELS[stage], { stage });
}

function advanceTutorial(game) {
  const next = game.tutorial.stage + 1;
  if (next < TUTORIAL_LABELS.length) placeTutorialStage(game, next);
  else {
    game.tutorialSeen = true;
    startRound(game);
    emit(game, 'tutorial-complete', '教程完成');
  }
}

export function startTutorial(game) {
  game.events = [];
  game.tutorial = null;
  placeTutorialStage(game, 0);
}

export function skipTutorial(game) {
  game.tutorialSeen = true;
  startRound(game);
  emit(game, 'tutorial-complete');
}

function stepTutorial(game) {
  if (game.point) game.point.age = (game.point.age || 0) + STEP;
  const guide = game.tutorial;
  guide.elapsed += STEP;
  const player = game.player;
  const move = player.speed;
  if (player.dir === 0) player.y += move;
  else if (player.dir === 1) player.x += move;
  else if (player.dir === 2) player.y -= move;
  else player.x -= move;
  game.trail.push({ x: player.x, y: player.y, ttl: 1 });
  game.trail = game.trail.filter(p => (p.ttl -= STEP) > 0).slice(-80);
  if (Math.abs(player.x) > 6.25 || Math.abs(player.y) > 3.3) {
    guide.failures++;
    placeTutorialStage(game, guide.stage);
    emit(game, 'tutorial-retry', '再试一次');
    return game;
  }
  if (guide.stage === 1) {
    if (game.point.phase === 'field' && distance(player, game.point) < .65) {
      game.point.phase = 'carried';
      player.carrying = true;
      guide.collected = true;
      emit(game, 'pickup', '把光点送回圆环', { x: player.x, y: player.y });
    }
    if (game.point.phase === 'carried') {
      game.point.x = player.x;
      game.point.y = player.y;
      if (distance(player, game.goal) < playerRadius(player) + goalRadius(game.goal)) {
        emit(game, 'deliver', '+1', { x: game.goal.x, y: game.goal.y });
        advanceTutorial(game);
      }
    }
  } else if (guide.stage === 2) {
    const enemy = game.enemies[0];
    enemy.x += enemy.vx * STEP;
    enemy.trail.push({ x: enemy.x, y: enemy.y, age: 0 });
    enemy.trail = enemy.trail.filter(p => (p.age += STEP) < .5).slice(-42);
    if (enemyHitsCircle(enemy, { x: player.x, y: player.y, radius: playerRadius(player) })) {
      guide.failures++;
      placeTutorialStage(game, 2);
      emit(game, 'tutorial-retry', '避开方块');
    } else if (enemy.x < WORLD.left - .3 && guide.turns >= 1) advanceTutorial(game);
  }
  return game;
}

export function turn(game) {
  if (game.status !== 'playing' && game.status !== 'tutorial') return false;
  const heading = turnHeading(Math.round(game.player.dir * 2), game.player.clockwise, game.angle45 && game.status === 'playing');
  game.player.dir = heading / 2;
  const tone = turnTone(game.player.y, toneDirection(heading));
  emit(game, 'turn', '', {
    x: game.player.x, y: game.player.y, dir: game.player.dir, heading,
    toneId: tone.id, toneBand: tone.band
  });
  if (game.status === 'tutorial') {
    game.tutorial.turns++;
    if (game.tutorial.stage === 0 && game.tutorial.turns >= 2) advanceTutorial(game);
  }
  return true;
}

export function togglePause(game) {
  if (game.status === 'playing') { game.status = 'paused'; return true; }
  if (game.status === 'paused') { game.status = 'playing'; return true; }
  return false;
}

function resetSize(game) {
  game.player.size = 0.425;
  game.player.growth += 0.000008;
  game.player.speed += 0.00055;
}

function score(game, value, reason, position = {}) {
  game.score += value;
  resetSize(game);
  emit(game, reason, `+${value}`, { scoreDelta: value, ...position });
  if (game.score >= 3 && game.goalCorner < 0) chooseGoalTarget(game);
}

function checkGraze(game, enemy, reward = true, previousPlayer = game.player, previousEnemy = enemy) {
  if (enemy.type === 8 && !newEnemyCanCollide(enemy)) {
    enemy.phasePassed = false;
    enemy.near = false;
    enemy.closestClearance = undefined;
    enemy.grazeMode = undefined;
    return null;
  }
  const contactEffect = enemyContactEffect(game);
  if (contactEffect === 'ignore') {
    const overlapping = Boolean(enemyHitsCircle(enemy,
      { x: game.player.x, y: game.player.y, radius: hurtRadius(game) }));
    if (overlapping && !enemy.phasePassed) emit(game, 'phase-pass', '',
      { x: game.player.x, y: game.player.y, targetId: enemy.id, type: enemy.type });
    enemy.phasePassed = overlapping;
    enemy.near = false;
    enemy.closestClearance = undefined;
    enemy.grazeMode = undefined;
    return null;
  }
  enemy.phasePassed = false;
  const player = game.player;
  const outer = nearMissRadius(game);
  const inner = hurtRadius(game);
  const relativeTravel = Math.hypot((player.x - previousPlayer.x) - (enemy.x - previousEnemy.x),
    (player.y - previousPlayer.y) - (enemy.y - previousEnemy.y));
  const samples = Math.max(1, Math.ceil(relativeTravel / .06));
  let touched = false;
  let closest = Infinity;
  let qualifyingMode = null;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const movingPlayer = { x: previousPlayer.x + (player.x - previousPlayer.x) * t,
      y: previousPlayer.y + (player.y - previousPlayer.y) * t };
    const movingEnemy = { ...enemy,
      x: previousEnemy.x + (enemy.x - previousEnemy.x) * t,
      y: previousEnemy.y + (enemy.y - previousEnemy.y) * t };
    if (enemyHitsCircle(movingEnemy, { ...movingPlayer, radius: inner })) {
      if (contactEffect === 'shatter') {
        enemy.gone = true;
        emit(game, 'enemy-explode', '', { x: enemy.x, y: enemy.y, type: enemy.type,
          targetId: enemy.id, source: 'invincible' });
        return 'completed';
      }
      if (reward) die(game, 'enemy');
      return 'hit';
    }
    const clearance = enemyClearance(movingEnemy, movingPlayer);
    if (clearance < outer) {
      touched = true;
      closest = Math.min(closest, clearance);
      const velocityLength = Math.hypot(enemy.vx, enemy.vy) || 1;
      const travelX = enemy.vx / velocityLength, travelY = enemy.vy / velocityLength;
      const offsetX = movingPlayer.x - movingEnemy.x, offsetY = movingPlayer.y - movingEnemy.y;
      const forward = offsetX * travelX + offsetY * travelY;
      const lateral = offsetY * travelX - offsetX * travelY;
      const playerTravel = directionVector(Math.round(player.dir * 2));
      const alignment = playerTravel.x * travelX + playerTravel.y * travelY;
      const perpendicular = Math.abs(alignment) < .75
        && forward > .08 && forward >= Math.abs(lateral) * .25;
      const headOn = alignment < -.75
        && Math.abs(lateral) > .08 && Math.abs(forward) <= .12;
      const mode = perpendicular ? 'perpendicular' : headOn ? 'head-on' : null;
      if (mode && clearance <= inner + (outer - inner) * .85) qualifyingMode = mode;
    }
  }
  if (touched) {
    if (!enemy.near) emit(game, 'near-miss-enter', '',
      { x: enemy.x, y: enemy.y, targetId: enemy.id, type: enemy.type, mode: qualifyingMode });
    enemy.near = true;
    enemy.closestClearance = Math.min(enemy.closestClearance ?? Infinity, closest);
    if (qualifyingMode) enemy.grazeMode = qualifyingMode;
  }
  if (enemy.near && enemyClearance(enemy, player) >= outer + .09) {
    if (!enemy.grazeMode) {
      enemy.near = false;
      enemy.closestClearance = undefined;
      return null;
    }
    const grade = enemy.closestClearance <= inner + (outer - inner) * .25 ? 'extreme' : 'normal';
    enemy.gone = true;
    if (reward) {
      game.grazeCombo++;
      const styleDelta = (grade === 'extreme' ? 1 : 0) + (game.grazeCombo % 3 === 0 ? 1 : 0);
      game.stylePoints += styleDelta;
      score(game, 1, 'near-miss', { x: enemy.x, y: enemy.y, playerX: player.x, playerY: player.y,
        targetId: enemy.id, type: enemy.type, mode: enemy.grazeMode, grade, styleDelta, combo: game.grazeCombo });
    } else emit(game, 'near-miss', '擦肩成功', { x: enemy.x, y: enemy.y, targetId: enemy.id, type: enemy.type,
      playerX: player.x, playerY: player.y, mode: enemy.grazeMode,
      grade, styleDelta: 0, combo: 0, scoreDelta: 0 });
    emit(game, 'enemy-explode', '', { x: enemy.x, y: enemy.y, type: enemy.type,
      targetId: enemy.id, source: 'near-miss', grade });
    return 'completed';
  }
  return null;
}

function chooseGoalTarget(game) {
  const corners = [
    { x: -WORLD.width * 0.4, y: -WORLD.height * 0.35 }, { x: WORLD.width * 0.4, y: -WORLD.height * 0.35 },
    { x: WORLD.width * 0.4, y: WORLD.height * 0.35 }, { x: -WORLD.width * 0.4, y: WORLD.height * 0.35 }
  ];
  let next;
  if (game.score < 10) next = game.goalCorner === 0 ? 1 : game.goalCorner === 1 ? 0 : Math.floor(random(game) * 2);
  else {
    next = Math.floor(random(game) * 4);
    if (next === game.goalCorner) next = (next + 1) % 4;
  }
  game.goalCorner = next;
  game.goalTarget = corners[next];
}

function goalSpeed(scoreValue) {
  if (scoreValue < 3) return 0;
  if (scoreValue < 5) return 0.01;
  if (scoreValue < 10) return 0.015;
  if (scoreValue < 15) return 0.0175;
  if (scoreValue < 20) return 0.02;
  if (scoreValue < 25) return 0.0225;
  if (scoreValue < 30) return 0.025;
  if (scoreValue < 40) return 0.03;
  return 0.035;
}

function goalSize(scoreValue) {
  if (scoreValue < 5) return 0.375;
  if (scoreValue < 10) return 0.35;
  if (scoreValue < 15) return 0.325;
  if (scoreValue < 20) return 0.3;
  if (scoreValue < 25) return 0.275;
  if (scoreValue < 30) return 0.25;
  return 0.225;
}

function nextPoint(game) {
  if (game.pointSpawnLow >= 0.075) {
    game.pointSpawnLow -= 0.005;
    game.pointSpawnHigh += 0.005;
  }
  const choice = nextPointKind(game, game.score, () => random(game));
  game.pointCount = choice.pointCount;
  game.nextSpecialPointAt = choice.nextSpecialPointAt;
  game.specialDebuts = choice.specialDebuts;
  const viewX = between(game, game.pointSpawnLow, game.pointSpawnHigh);
  const viewY = between(game, game.score <= 10 ? 0.5 : game.pointSpawnLow, game.pointSpawnHigh);
  game.point = { x: (viewX - 0.5) * WORLD.width, y: (viewY - 0.5) * WORLD.height, kind: choice.kind, phase: 'field', returnTimer: 0, age: 0 };
  emit(game, 'point-spawn');
}

function spawnEnemy(game) {
  const side = random(game) < 0.5 ? -1 : 1;
  const x = side * WORLD.width * 0.75;
  const y = between(game, -3.3, 3.3);
  game.spawned++;
  if (game.spawned >= game.nextBonusAt) {
    game.spawned = 0;
    game.nextBonusAt = 10 + Math.floor(random(game) * 10);
    const kind = chooseBonusKind(game, () => random(game));
    game.bonuses.push({ x, y, vx: -side * 2.4, kind, radius: 0.2925 });
    return;
  }
  const thresholds = game.classicSpawns ? CLASSIC_ENEMY_UNLOCK_SCORES : ENEMY_UNLOCK_SCORES;
  const eligible = ENEMY_TYPES.map((_, index) => index).filter(index => game.score >= thresholds[index]);
  const debut = eligible.find(index => !game.introducedEnemies.includes(index));
  const type = debut ?? eligible[Math.floor(random(game) * eligible.length)];
  if (!game.introducedEnemies.includes(type)) game.introducedEnemies.push(type);
  const config = ENEMY_TYPES[type];
  if (type >= 7) {
    const enemy = createNewEnemy(type, { id: game.nextEnemyId++, x, y, side,
      random: () => random(game), player: game.player });
    game.enemies.push(enemy);
    if (type === 8) emit(game, 'enemy-telegraph', '',
      { x: enemy.targetX, y: enemy.targetY, type, targetId: enemy.id });
    return;
  }
  const groupId = type === 6 ? game.nextEnemyId : null;
  for (const member of type === 6 ? [-1, 1] : [0]) {
    const memberY = y + member * .276;
    game.enemies.push({ id: game.nextEnemyId++, groupId, pairMember: member,
      x, y: memberY, vx: -side * 2.4, vy: 0, type,
      shape: config.name, radius: config.radius, hitW: config.width, hitH: config.height,
      pulseScale: type === 3 ? .125 : undefined,
      pulseDirection: 1, fadeAlpha: 1, fadeDirection: -1, age: 0, near: false,
      trail: [{ x, y: memberY, age: 0 }] });
  }
}

function die(game, reason) {
  if (game.status !== 'playing') return;
  const enemies = game.enemies.filter(enemy => !enemy.gone).map(enemy =>
    ({ x: enemy.x, y: enemy.y, type: enemy.type, id: enemy.id }));
  game.status = 'dying';
  game.deathTimer = 2;
  game.enemies = [];
  game.bonuses = [];
  game.point = null;
  game.bombWaves = [];
  game.trail = [];
  emit(game, 'die', reason === 'wall' ? '撞到边界' : '撞到障碍',
    { x: game.player.x, y: game.player.y, enemies });
}

function finishRound(game) {
  game.status = 'results';
  game.timeScale = 1;
  game.slowPhase = null;
  game.slowTimer = 0;
  game.lastScore = game.score;
  game.lastStylePoints = Math.floor(game.stylePoints * (activeSkin(game).styleBonus ?? 1));
  game.lastTime = game.time;
  game.best = Math.max(game.best, game.score);
  game.totalPoints += game.score + game.lastStylePoints;
  game.lifetimePoints += game.score + game.lastStylePoints;
  game.gamesPlayed++;
  emit(game, 'results');
}

export function step(game) {
  if (game.toast) {
    game.toast.ttl -= STEP;
    if (game.toast.ttl <= 0) game.toast = null;
  }
  if (game.status === 'dying') {
    game.deathTimer -= STEP;
    if (game.deathTimer <= 0) finishRound(game);
    return game;
  }
  if (game.status === 'tutorial') return stepTutorial(game);
  if (game.status !== 'playing') return game;
  stepPowerups(game, STEP);

  if (game.slowPhase === 'down') {
    if (game.timeScale >= 0.25) game.timeScale -= STEP * game.timeScale * 2;
    else game.slowPhase = 'up';
  } else if (game.slowPhase === 'up') {
    if (game.timeScale < 1) game.timeScale += STEP * game.timeScale * 2;
    else { game.timeScale = 1; game.slowPhase = null; }
  }
  game.slowTimer = game.slowPhase ? 1 : 0;
  const dtScale = game.timeScale;
  game.time += STEP * dtScale;
  if (game.point) game.point.age = (game.point.age || 0) + STEP * dtScale;
  game.freezeTimer = Math.max(0, game.freezeTimer - STEP * dtScale);
  game.freezeFxTimer = Math.max(0, game.freezeFxTimer - STEP * dtScale);
  const player = game.player;
  const previousPlayer = { x: player.x, y: player.y };
  if (player.speed < 0.054) player.speed = Math.min(0.054, player.speed + 0.025 * STEP);
  player.size += player.growth * dtScale;
  const speed = player.speed * dtScale * activeSkin(game).speed * playerSpeedMultiplier(game);
  const travel = directionVector(Math.round(player.dir * 2));
  player.x += travel.x * speed;
  player.y += travel.y * speed;
  game.trail.push({ x: player.x, y: player.y, ttl: 1 });
  if (game.trail.length > 80) game.trail.shift();
  game.trail = game.trail.filter(p => (p.ttl -= STEP) > 0);
  if (Math.abs(player.x) > 6.42 || Math.abs(player.y) > 3.48) {
    die(game, 'wall');
    return game;
  }

  if (game.goalTarget) {
    const target = game.goalTarget;
    const d = distance(game.goal, target);
    const move = goalSpeed(game.score) * dtScale;
    if (d <= move) {
      game.goal.x = target.x;
      game.goal.y = target.y;
      chooseGoalTarget(game);
    } else {
      game.goal.x += (target.x - game.goal.x) / d * move;
      game.goal.y += (target.y - game.goal.y) / d * move;
    }
  }
  game.goal.size = Math.max(goalSize(game.score), game.goal.size - 0.005 * STEP);

  if (game.point?.phase === 'field' && distance(player, game.point) < pickupDistance(game, 1.95 * 0.15)) {
    game.point.phase = 'carried';
    game.point.displayX = player.x;
    game.point.displayY = player.y;
    player.carrying = true;
    emit(game, 'pickup', '把光点送回圆环', { x: player.x, y: player.y });
  }
  if (game.point?.phase === 'carried') {
    game.point.displayX = player.x;
    game.point.displayY = player.y;
    game.point.x = player.x;
    game.point.y = player.y;
    if (distance(player, game.goal) < playerRadius(player) + goalRadius(game.goal)) {
      const pointKind = game.point.kind;
      const special = pointKind === 'turn' || pointKind === 'angle45';
      game.point.phase = 'returning';
      game.point.returnTimer = 0.22;
      player.carrying = false;
      score(game, 1, special ? 'deliver-turn' : 'deliver',
        { x: game.goal.x, y: game.goal.y, pointKind });
      if (special) {
        if (pointKind === 'turn') player.clockwise = !player.clockwise;
        else game.angle45 = !game.angle45;
        game.slowPhase = 'down';
        game.slowTimer = 1;
        if (pointKind === 'turn') emit(game, 'reverse', player.clockwise ? '恢复右转' : '方向反转：左转',
          { x: game.goal.x, y: game.goal.y });
        else emit(game, 'angle-mode', game.angle45 ? '转向角度：45°' : '转向角度：90°',
          { x: game.goal.x, y: game.goal.y, angle45: game.angle45 });
      }
    }
  }
  if (game.point?.phase === 'returning') {
    game.point.returnTimer -= STEP;
    game.point.x += (game.goal.x - game.point.x) * 0.16;
    game.point.y += (game.goal.y - game.point.y) * 0.16;
    if (game.point.returnTimer <= 0) {
      emit(game, 'goal-burst', '', { x: game.goal.x, y: game.goal.y });
      nextPoint(game);
    }
  }

  // A collected shield or phase ball must affect collisions in this same step.
  for (const bonus of game.bonuses) {
    if (game.freezeTimer <= 0) bonus.x += bonus.vx * STEP * dtScale;
    if (distance(player, bonus) < pickupDistance(game, bonus.radius)) {
      bonus.gone = true;
      if (bonus.kind === 'points') score(game, 2, 'bonus', { x: bonus.x, y: bonus.y });
      else if (bonus.kind === 'freeze') {
        score(game, 1, 'freeze', { x: bonus.x, y: bonus.y });
        game.freezeTimer = 7; game.freezeFxTimer = 5.5;
      } else if (bonus.kind === 'bomb') {
        score(game, 1, 'bomb', { x: bonus.x, y: bonus.y });
        game.bombWaves.push({ x: bonus.x, y: bonus.y, age: 0 });
      } else {
        score(game, 1, bonus.kind, { x: bonus.x, y: bonus.y });
        applyPowerup(game, bonus.kind);
      }
    }
  }
  game.bonuses = game.bonuses.filter(b => !b.gone && Math.abs(b.x) < WORLD.width * 0.9);

  if (game.freezeTimer <= 0) {
    game.spawnTimer += STEP * dtScale * spawnSpeedMultiplier(game);
    const interval = Math.max(0.48, 2 - game.score / 40);
    if (game.spawnTimer >= interval) {
      game.spawnTimer = 0;
      spawnEnemy(game);
    }
  }
  for (const enemy of game.enemies) {
    const previousEnemy = { x: enemy.x, y: enemy.y };
    enemy.age = (enemy.age || 0) + STEP * dtScale;
    if (enemy.type === 3 && Number.isFinite(enemy.pulseScale)) {
      enemy.pulseScale += .002 * (enemy.pulseDirection || 1) * dtScale;
      if (enemy.pulseScale >= .275) { enemy.pulseScale = .275; enemy.pulseDirection = -1; }
      if (enemy.pulseScale <= .125) { enemy.pulseScale = .125; enemy.pulseDirection = 1; }
    }
    if (enemy.type === 4 && Number.isFinite(enemy.fadeAlpha)) {
      enemy.fadeAlpha += (enemy.fadeDirection || -1) * STEP / 1.5 * dtScale;
      if (enemy.fadeAlpha <= .025) { enemy.fadeAlpha = .025; enemy.fadeDirection = 1; }
      if (enemy.fadeAlpha >= 1) { enemy.fadeAlpha = 1; enemy.fadeDirection = -1; }
    }
    enemy.trail ??= [{ x: enemy.x, y: enemy.y, age: 0 }];
    for (const point of enemy.trail) point.age += STEP;
    enemy.trail = enemy.trail.filter(point => point.age < (ENEMY_TYPES[enemy.type]?.trailLife || ENEMY_TRAIL_LIFE));
    if (game.freezeTimer <= 0) {
      if (!enemy.trail.length) enemy.trail.push({ x: enemy.x, y: enemy.y, age: 0 });
      if (enemy.type >= 7) {
        for (const event of advanceNewEnemy(enemy, STEP * dtScale * enemySpeedMultiplier(game),
          { random: () => random(game), player }))
          emit(game, event.kind, '', { ...event, type: enemy.type, targetId: enemy.id });
      } else {
        enemy.x += enemy.vx * STEP * dtScale * enemySpeedMultiplier(game);
        enemy.y += enemy.vy * STEP * dtScale * enemySpeedMultiplier(game);
      }
      if (enemy.type === 6 && enemy.pairMember
        && (enemy.vx < 0 ? enemy.x <= .54 : enemy.x >= .54))
        enemy.y += enemy.pairMember * .6 * STEP * dtScale;
      const tail = enemy.trail.at(-1);
      if (enemy.type !== 8 && Math.hypot(enemy.x - tail.x, enemy.y - tail.y) >= 0.01)
        enemy.trail.push({ x: enemy.x, y: enemy.y, age: 0 });
      if (enemy.trail.length > 42) enemy.trail.shift();
    }
    if (checkGraze(game, enemy, true, previousPlayer, previousEnemy) === 'hit') break;
    const exited = enemy.type !== 8 && (enemy.vx < 0 ? enemy.x < WORLD.left - .5 : enemy.x > WORLD.right + .5);
    if (!enemy.gone && exited) {
      enemy.gone = true;
      for (const part of enemyParts(enemy)) emit(game, 'enemy-explode', '',
        { x: Math.max(WORLD.left, Math.min(WORLD.right, part.x)), y: part.y,
          type: enemy.type, targetId: enemy.id, source: 'boundary' });
    }
  }
  game.enemies = game.enemies.filter(e => !e.gone && Math.abs(e.x) < WORLD.width * 0.9 && Math.abs(e.y) < 3.8);
  if (game.status !== 'playing') return game;
  for (const wave of game.bombWaves) {
    wave.age += STEP * dtScale;
    const scale = 0.1 + 2.5 * 60 * wave.age;
    const radius = 2 * 0.09948128461837769 * scale;
    for (const enemy of game.enemies) {
      if (enemy.gone) continue;
      if (enemy.type === 8 && !newEnemyCanCollide(enemy)) continue;
      const hit = enemyHitsCircle(enemy, { x: wave.x, y: wave.y, radius });
      if (hit) {
        enemy.gone = true;
        for (const part of enemyParts(enemy)) emit(game, 'enemy-explode', '',
          { x: part.x, y: part.y, type: enemy.type, targetId: enemy.id, source: 'bomb' });
      }
    }
  }
  game.enemies = game.enemies.filter(enemy => !enemy.gone);
  game.bombWaves = game.bombWaves.filter(wave => wave.age < 1);
  return game;
}

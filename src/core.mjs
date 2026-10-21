import { turnTone } from './melody.mjs';
import { SKINS, activeSkin, isSkinRevealed } from './skins.mjs';

export const STEP = 1 / 60;
export const ENEMY_TRAIL_LIFE = 0.62;
// The Unity camera has a 3.84 world-unit orthographic half-height; 16:9 gives this field.
export const WORLD = Object.freeze({ width: 13.653333333333334, height: 7.68, left: -6.826666666666667, right: 6.826666666666667, top: 3.84, bottom: -3.84 });
export const ENEMY_UNLOCK_SCORES = Object.freeze([0, 2, 4, 6, 8, 10, 12]);
export const CLASSIC_ENEMY_UNLOCK_SCORES = Object.freeze([0, 5, 10, 15, 20, 25, 30]);
export const ENEMY_TYPES = Object.freeze([
  { name: 'EnemySquare', width: .5, height: .5, radius: .25, trailLife: .5, warningOffset: 2.11 },
  { name: 'EnemySquare2', width: 1.0465, height: .4945, radius: .53, trailLife: .65, warningOffset: 2.41 },
  { name: 'EnemySquare3', width: .4922, height: .9085, radius: .46, trailLife: .5, warningOffset: 2.09 },
  { name: 'EnemySquare4', width: .5, height: .5, radius: .25, trailLife: .5, warningOffset: 2.11 },
  { name: 'EnemySquare5', width: .5, height: .5, radius: .25, trailLife: .5, warningOffset: 2.21 },
  { name: 'EnemySquare6', width: .0625, height: .0625, radius: .03125, trailLife: .5, warningOffset: 2.11 },
  { name: 'EnemySquare7', width: .4945, height: .4945, radius: .25, trailLife: .5, warningOffset: 2.1 }
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
function nearMissRadius(player) { return player.size * 3 * 0.42823535203933716; }
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
  if (enemy.type === 6 && Number.isFinite(enemy.split)) {
    return [{ x: enemy.x, y: enemy.y - enemy.split, part: 'down' },
      { x: enemy.x, y: enemy.y + enemy.split, part: 'up' }];
  }
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

export function createGame(saved = {}, seed = 0x1024) {
  const unlocked = Array.isArray(saved.unlocked)
    ? [...new Set([0, ...saved.unlocked.filter(n => Number.isInteger(n) && n >= 0 && n < SKINS.length)])]
    : [0];
  const totalPoints = Math.max(0, Number(saved.totalPoints) || 0);
  const priorSpending = unlocked.reduce((sum, index) => sum + SKINS[index].cost, 0);
  return {
    status: 'menu', seed: seed >>> 0, events: [], toast: null,
    score: 0, lastScore: 0, lastTime: 0, best: Number(saved.best) || 0,
    totalPoints, lifetimePoints: Math.max(Number(saved.lifetimePoints) || 0, totalPoints + priorSpending),
    gamesPlayed: Number(saved.gamesPlayed) || 0,
    selectedSkin: unlocked.includes(saved.selectedSkin) ? saved.selectedSkin : 0,
    roundSkin: 0,
    unlocked, tutorialSeen: saved.tutorialSeen === undefined ? Number(saved.gamesPlayed) > 0 : Boolean(saved.tutorialSeen),
    tutorial: null, introducedEnemies: [], nextEnemyId: 1,
    classicSpawns: Boolean(saved.classicSpawns), freezeFxTimer: 0,
    time: 0, deathTimer: 0, freezeTimer: 0, slowTimer: 0, slowPhase: null, timeScale: 1,
    player: null, goal: null, point: null, enemies: [], bonuses: [], bombWaves: [], trail: [],
    spawnTimer: 0, spawned: 0, nextBonusAt: 7, pointCount: 0, nextTurnPointAt: 8,
    pointSpawnLow: 0.2, pointSpawnHigh: 0.8, goalCorner: -1, goalTarget: null
  };
}

export function snapshotProgress(game) {
  return { best: game.best, totalPoints: game.totalPoints, lifetimePoints: game.lifetimePoints,
    gamesPlayed: game.gamesPlayed,
    selectedSkin: game.selectedSkin, unlocked: [...game.unlocked], tutorialSeen: game.tutorialSeen };
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
  game.lastTime = 0;
  game.time = 0;
  game.deathTimer = 0;
  game.freezeTimer = 0;
  game.freezeFxTimer = 0;
  game.slowTimer = 0;
  game.slowPhase = null;
  game.timeScale = 1;
  game.player = { x: 0, y: -2.65, dir: 0, speed: 0, size: 0.425, growth: 0.0001, clockwise: true, carrying: false };
  game.goal = { x: 0, y: -2.65, size: 0.375 };
  game.point = { x: 0, y: 2.75, kind: 'normal', phase: 'field', returnTimer: 0 };
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
  game.nextTurnPointAt = 8;
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
  game.point = stage === 1 ? { x: -2.5, y: 1.35, kind: 'normal', phase: 'field', returnTimer: 0 } : null;
  game.enemies = stage === 2 ? [{ id: -1, x: 5.8, y: .2, vx: -2.1, vy: 0,
    type: 0, shape: 'EnemySquare', radius: .25, hitW: .5, hitH: .5,
    near: false, trail: [{ x: 5.8, y: .2, age: 0 }] }] : [];
  game.bonuses = [];
  game.bombWaves = [];
  game.trail = [];
  emit(game, 'tutorial-stage', TUTORIAL_LABELS[stage], { stage });
}

function advanceTutorial(game) {
  const next = game.tutorial.stage + 1;
  if (next < 3) placeTutorialStage(game, next);
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
  const guide = game.tutorial;
  guide.elapsed += STEP;
  const player = game.player;
  const move = player.speed;
  if (player.dir === 0) player.y += move;
  else if (player.dir === 1) player.x += move;
  else if (player.dir === 2) player.y -= move;
  else player.x -= move;
  game.trail.push({ x: player.x, y: player.y, ttl: .25 });
  game.trail = game.trail.filter(p => (p.ttl -= STEP) > 0).slice(-30);
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
  game.player.dir = (game.player.dir + (game.player.clockwise ? 1 : 3)) % 4;
  const tone = turnTone(game.player.y, game.player.dir);
  emit(game, 'turn', '', {
    x: game.player.x, y: game.player.y, dir: game.player.dir,
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
  game.pointCount++;
  if (game.pointSpawnLow >= 0.075) {
    game.pointSpawnLow -= 0.005;
    game.pointSpawnHigh += 0.005;
  }
  const special = game.pointCount >= game.nextTurnPointAt;
  if (special) {
    game.pointCount = 0;
    game.nextTurnPointAt = 2 + Math.floor(random(game) * 8);
  }
  const viewX = between(game, game.pointSpawnLow, game.pointSpawnHigh);
  const viewY = between(game, game.score <= 10 ? 0.5 : game.pointSpawnLow, game.pointSpawnHigh);
  game.point = { x: (viewX - 0.5) * WORLD.width, y: (viewY - 0.5) * WORLD.height, kind: special ? 'turn' : 'normal', phase: 'field', returnTimer: 0 };
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
    const kind = ['points', 'freeze', 'bomb'][Math.floor(random(game) * 3)];
    game.bonuses.push({ x, y, vx: -side * 2.4, kind, radius: 0.2925 });
    return;
  }
  const thresholds = game.classicSpawns ? CLASSIC_ENEMY_UNLOCK_SCORES : ENEMY_UNLOCK_SCORES;
  const pool = thresholds.filter(threshold => game.score >= threshold).length;
  const debut = ENEMY_TYPES.findIndex((_, index) => index < pool && !game.introducedEnemies.includes(index));
  const type = debut >= 0 ? debut : Math.floor(random(game) * pool);
  if (!game.introducedEnemies.includes(type)) game.introducedEnemies.push(type);
  const config = ENEMY_TYPES[type];
  game.enemies.push({ id: game.nextEnemyId++, x, y, vx: -side * 2.4, vy: 0, type,
    shape: config.name, radius: config.radius, hitW: config.width, hitH: config.height,
    split: type === 6 ? .276 : undefined, pulseScale: type === 3 ? .125 : undefined,
    pulseDirection: 1, fadeAlpha: 1, fadeDirection: -1, age: 0, near: false,
    trail: [{ x, y, age: 0 }] });
}

function die(game, reason) {
  if (game.status !== 'playing') return;
  game.status = 'dying';
  game.deathTimer = 2;
  emit(game, 'die', reason === 'wall' ? '撞到边界' : '撞到障碍', { x: game.player.x, y: game.player.y });
}

function finishRound(game) {
  game.status = 'results';
  game.timeScale = 1;
  game.slowPhase = null;
  game.slowTimer = 0;
  game.lastScore = game.score;
  game.lastTime = game.time;
  game.best = Math.max(game.best, game.score);
  game.totalPoints += game.score;
  game.lifetimePoints += game.score;
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
  game.freezeTimer = Math.max(0, game.freezeTimer - STEP * dtScale);
  game.freezeFxTimer = Math.max(0, game.freezeFxTimer - STEP * dtScale);
  const player = game.player;
  if (player.speed < 0.054) player.speed = Math.min(0.054, player.speed + 0.025 * STEP);
  player.size += player.growth * dtScale;
  const speed = player.speed * dtScale * activeSkin(game).speed;
  if (player.dir === 0) player.y += speed;
  else if (player.dir === 1) player.x += speed;
  else if (player.dir === 2) player.y -= speed;
  else player.x -= speed;
  game.trail.push({ x: player.x, y: player.y, ttl: 0.25 });
  if (game.trail.length > 30) game.trail.shift();
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
    player.carrying = true;
    emit(game, 'pickup', '把光点送回圆环', { x: player.x, y: player.y });
  }
  if (game.point?.phase === 'carried') {
    game.point.x = player.x;
    game.point.y = player.y;
    if (distance(player, game.goal) < playerRadius(player) + goalRadius(game.goal)) {
      const special = game.point.kind === 'turn';
      game.point.phase = 'returning';
      game.point.returnTimer = 0.22;
      player.carrying = false;
      score(game, 1, special ? 'deliver-turn' : 'deliver', { x: game.goal.x, y: game.goal.y });
      if (special) {
        player.clockwise = !player.clockwise;
        game.slowPhase = 'down';
        game.slowTimer = 1;
        emit(game, 'reverse', player.clockwise ? '恢复右转' : '方向反转：左转', { x: game.goal.x, y: game.goal.y });
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

  if (game.freezeTimer <= 0) {
    game.spawnTimer += STEP * dtScale;
    const interval = Math.max(0.48, 2 - game.score / 40);
    if (game.spawnTimer >= interval) {
      game.spawnTimer = 0;
      spawnEnemy(game);
    }
  }
  for (const enemy of game.enemies) {
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
    enemy.trail = enemy.trail.filter(point => point.age < ENEMY_TRAIL_LIFE);
    if (game.freezeTimer <= 0) {
      if (!enemy.trail.length) enemy.trail.push({ x: enemy.x, y: enemy.y, age: 0 });
      enemy.x += enemy.vx * STEP * dtScale;
      enemy.y += enemy.vy * STEP * dtScale;
      if (enemy.type === 6 && Number.isFinite(enemy.split) && Math.abs(enemy.x) < 2.4) {
        enemy.split = Math.min(1.25, enemy.split + .6 * STEP * dtScale);
      }
      const tail = enemy.trail.at(-1);
      if (Math.hypot(enemy.x - tail.x, enemy.y - tail.y) >= 0.01) enemy.trail.push({ x: enemy.x, y: enemy.y, age: 0 });
      if (enemy.trail.length > 42) enemy.trail.shift();
    }
    const hit = enemyHitsCircle(enemy, { x: player.x, y: player.y, radius: hurtRadius(game) });
    if (hit) { die(game, 'enemy'); break; }
    const close = enemyHitsCircle(enemy, { x: player.x, y: player.y, radius: nearMissRadius(player) });
    const stillClose = enemyHitsCircle(enemy, { x: player.x, y: player.y, radius: nearMissRadius(player) + .09 });
    if (close) enemy.near = true;
    else if (enemy.near && !stillClose) {
      enemy.gone = true;
      score(game, 1, 'near-miss', { x: enemy.x, y: enemy.y, targetId: enemy.id });
      emit(game, 'enemy-explode', '', { x: enemy.x, y: enemy.y, type: enemy.type, targetId: enemy.id, source: 'near-miss' });
    }
    const exited = enemy.vx < 0 ? enemy.x < WORLD.left - .5 : enemy.x > WORLD.right + .5;
    if (!enemy.gone && exited) {
      enemy.gone = true;
      for (const part of enemyParts(enemy)) emit(game, 'enemy-explode', '',
        { x: Math.max(WORLD.left, Math.min(WORLD.right, part.x)), y: part.y,
          type: enemy.type, targetId: enemy.id, source: 'boundary' });
    }
  }
  game.enemies = game.enemies.filter(e => !e.gone && Math.abs(e.x) < WORLD.width * 0.9 && Math.abs(e.y) < 3.8);
  if (game.status !== 'playing') return game;
  for (const bonus of game.bonuses) {
    if (game.freezeTimer <= 0) bonus.x += bonus.vx * STEP * dtScale;
    if (distance(player, bonus) < pickupDistance(game, bonus.radius)) {
      bonus.gone = true;
      if (bonus.kind === 'points') score(game, 2, 'bonus', { x: bonus.x, y: bonus.y });
      else if (bonus.kind === 'freeze') {
        score(game, 1, 'freeze', { x: bonus.x, y: bonus.y });
        game.freezeTimer = 7; game.freezeFxTimer = 5.5;
      }
      else {
        score(game, 1, 'bomb', { x: bonus.x, y: bonus.y });
        game.bombWaves.push({ x: bonus.x, y: bonus.y, age: 0 });
      }
    }
  }
  game.bonuses = game.bonuses.filter(b => !b.gone && Math.abs(b.x) < WORLD.width * 0.9);
  for (const wave of game.bombWaves) {
    wave.age += STEP * dtScale;
    const scale = 0.1 + 2.5 * 60 * wave.age;
    const radius = 2 * 0.09948128461837769 * scale;
    for (const enemy of game.enemies) {
      if (enemy.gone) continue;
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

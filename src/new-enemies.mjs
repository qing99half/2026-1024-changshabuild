const BOUNCE_SPEED = 2.4 / Math.SQRT2;
const BOUNCE_EDGE = 3.3;
const BLINK_BOUNDS = Object.freeze({ left: -5.8, right: 5.8, bottom: -2.8, top: 2.8 });
const BLINK_CLEARANCE = 1.2;
const BLINK_WARNING = 0.8;
const BLINK_GRACE = 0.15;
const BLINK_ACTIVE = 0.5;
const BLINK_HOPS = 3;

function sample(random) {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
}

function blinkTarget(random, player) {
  const reference = player && Number.isFinite(player.x) && Number.isFinite(player.y)
    ? player : { x: 0, y: 0 };
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = BLINK_BOUNDS.left + sample(random) * (BLINK_BOUNDS.right - BLINK_BOUNDS.left);
    const y = BLINK_BOUNDS.bottom + sample(random) * (BLINK_BOUNDS.top - BLINK_BOUNDS.bottom);
    if (Math.hypot(x - reference.x, y - reference.y) >= BLINK_CLEARANCE) return { x, y };
  }
  const corners = [
    { x: BLINK_BOUNDS.left, y: BLINK_BOUNDS.bottom },
    { x: BLINK_BOUNDS.left, y: BLINK_BOUNDS.top },
    { x: BLINK_BOUNDS.right, y: BLINK_BOUNDS.bottom },
    { x: BLINK_BOUNDS.right, y: BLINK_BOUNDS.top }
  ];
  return corners.reduce((farthest, corner) =>
    Math.hypot(corner.x - reference.x, corner.y - reference.y) >
      Math.hypot(farthest.x - reference.x, farthest.y - reference.y) ? corner : farthest);
}

export function createNewEnemy(type, { id, x, y, side, random = Math.random, player } = {}) {
  const shared = { id, x, y, type, radius: .25, age: 0, near: false, trail: [] };
  if (type === 7) {
    return { ...shared, shape: 'EnemyBounce45', vx: -side * BOUNCE_SPEED,
      vy: (sample(random) < .5 ? -1 : 1) * BOUNCE_SPEED,
      trail: [{ x, y, age: 0 }] };
  }
  if (type === 8) {
    const target = blinkTarget(random, player);
    return { ...shared, radius: .28, shape: 'EnemyBlink', vx: 0, vy: 0,
      phase: 'warning', phaseTimer: BLINK_WARNING, jumps: 0,
      targetX: target.x, targetY: target.y };
  }
  throw new RangeError(`Unsupported new enemy type: ${type}`);
}

function advanceBounce(enemy, dt) {
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  const limit = BOUNCE_EDGE - enemy.radius;
  while (enemy.y > limit || enemy.y < -limit) {
    if (enemy.y > limit) { enemy.y = 2 * limit - enemy.y; enemy.vy = -Math.abs(enemy.vy); }
    else { enemy.y = -2 * limit - enemy.y; enemy.vy = Math.abs(enemy.vy); }
  }
  return [];
}

function nextBlinkPhase(enemy, random, player, events) {
  if (enemy.phase === 'warning') {
    enemy.x = enemy.targetX;
    enemy.y = enemy.targetY;
    enemy.jumps++;
    enemy.phase = 'grace';
    enemy.phaseTimer = BLINK_GRACE;
    events.push({ kind: 'enemy-teleport', x: enemy.x, y: enemy.y, type: enemy.type, targetId: enemy.id });
  } else if (enemy.phase === 'grace') {
    enemy.phase = 'active';
    enemy.phaseTimer = BLINK_ACTIVE;
  } else if (enemy.phase === 'active') {
    if (enemy.jumps >= BLINK_HOPS) {
      enemy.phase = 'gone';
      enemy.phaseTimer = 0;
      enemy.gone = true;
    } else {
      const target = blinkTarget(random, player);
      enemy.targetX = target.x;
      enemy.targetY = target.y;
      enemy.phase = 'warning';
      enemy.phaseTimer = BLINK_WARNING;
      events.push({ kind: 'enemy-telegraph', x: target.x, y: target.y, type: enemy.type, targetId: enemy.id });
    }
  }
}

function advanceBlink(enemy, dt, random, player) {
  const events = [];
  let remaining = dt;
  for (let transition = 0; transition < BLINK_HOPS * 3 && enemy.phase !== 'gone'; transition++) {
    const elapsed = Math.min(remaining, enemy.phaseTimer);
    enemy.phaseTimer -= elapsed;
    remaining -= elapsed;
    if (enemy.phaseTimer > 1e-9) break;
    nextBlinkPhase(enemy, random, player, events);
    if (remaining <= 1e-9) break;
  }
  return events;
}

export function advanceNewEnemy(enemy, dt, { random = Math.random, player } = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || enemy.gone) return [];
  if (enemy.type === 7) return advanceBounce(enemy, dt);
  if (enemy.type === 8) return advanceBlink(enemy, dt, random, player);
  throw new RangeError(`Unsupported new enemy type: ${enemy.type}`);
}

export function newEnemyCanCollide(enemy) {
  return !enemy.gone && (enemy.type === 7 || (enemy.type === 8 && enemy.phase === 'active'));
}

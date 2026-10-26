const BOUNCE_SPEED = 2.4 / Math.SQRT2;
const BOUNCE_EDGE = 3.3;
const BLINK_LANE_LIMIT = 2.8;
const BLINK_STATION_X = 5.4;
const BLINK_CLEARANCE = 1.2;
const BLINK_WARNING = 0.8;
const BLINK_GRACE = 0.15;
const BLINK_ACTIVE = 0.5;
const BLINK_HOPS = 3;

function sample(random) {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
}

function blinkLane(y, side, player) {
  const proposed = Math.max(-BLINK_LANE_LIMIT, Math.min(BLINK_LANE_LIMIT, y));
  const reference = player && Number.isFinite(player.x) && Number.isFinite(player.y)
    ? player : { x: 0, y: 0 };
  if (Math.hypot(side * BLINK_STATION_X - reference.x, proposed - reference.y) >= BLINK_CLEARANCE)
    return proposed;
  return reference.y >= 0 ? -BLINK_LANE_LIMIT : BLINK_LANE_LIMIT;
}

export function createNewEnemy(type, { id, x, y, side, random = Math.random, player } = {}) {
  const shared = { id, x, y, type, age: 0, near: false, trail: [] };
  if (type === 7) {
    return { ...shared, shape: 'EnemyBounce45', radius: .2, hitW: .4, hitH: .4,
      vx: -side * BOUNCE_SPEED,
      vy: (sample(random) < .5 ? -1 : 1) * BOUNCE_SPEED,
      trail: [{ x, y, age: 0 }] };
  }
  if (type === 8) {
    const entranceSide = side === -1 ? -1 : 1;
    const laneY = blinkLane(y, entranceSide, player);
    return { ...shared, radius: .224, hitW: .448, hitH: .448,
      shape: 'EnemyBlink', vx: 0, vy: 0, side: entranceSide, laneY,
      phase: 'warning', phaseTimer: BLINK_WARNING, jumps: 0,
      targetX: entranceSide * BLINK_STATION_X, targetY: laneY };
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

function nextBlinkPhase(enemy, events) {
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
      enemy.targetX = enemy.jumps === 1 ? 0 : -enemy.side * BLINK_STATION_X;
      enemy.targetY = enemy.laneY;
      enemy.phase = 'warning';
      enemy.phaseTimer = BLINK_WARNING;
      events.push({ kind: 'enemy-telegraph', x: enemy.targetX, y: enemy.targetY,
        type: enemy.type, targetId: enemy.id });
    }
  }
}

function advanceBlink(enemy, dt) {
  const events = [];
  let remaining = dt;
  for (let transition = 0; transition < BLINK_HOPS * 3 && enemy.phase !== 'gone'; transition++) {
    const elapsed = Math.min(remaining, enemy.phaseTimer);
    enemy.phaseTimer -= elapsed;
    remaining -= elapsed;
    if (enemy.phaseTimer > 1e-9) break;
    nextBlinkPhase(enemy, events);
    if (remaining <= 1e-9) break;
  }
  return events;
}

export function advanceNewEnemy(enemy, dt, { random = Math.random, player } = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || enemy.gone) return [];
  if (enemy.type === 7) return advanceBounce(enemy, dt);
  if (enemy.type === 8) return advanceBlink(enemy, dt);
  throw new RangeError(`Unsupported new enemy type: ${enemy.type}`);
}

export function newEnemyCanCollide(enemy) {
  return !enemy.gone && (enemy.type === 7 || (enemy.type === 8 && enemy.phase === 'active'));
}

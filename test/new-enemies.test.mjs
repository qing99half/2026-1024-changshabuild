import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewEnemy, advanceNewEnemy, newEnemyCanCollide } from '../src/new-enemies.mjs';

const player = { x: 0, y: 0 };

test('45-degree enemy moves diagonally at normal speed and reflects inside top and bottom edges', () => {
  const enemy = createNewEnemy(7, { id: 8, x: 5, y: 3, side: 1, random: () => .9, player });
  assert.deepEqual([enemy.radius, enemy.hitW, enemy.hitH], [.2, .4, .4]);
  assert.ok(Math.abs(Math.hypot(enemy.vx, enemy.vy) - 2.4) < 1e-12);
  assert.ok(enemy.vx < 0 && enemy.vy > 0);
  const priorX = enemy.x;
  advanceNewEnemy(enemy, .1, { player });
  assert.ok(enemy.x < priorX);
  assert.ok(enemy.y <= 3.1 && enemy.y >= -3.1);
  assert.ok(enemy.vy < 0);
  assert.equal(newEnemyCanCollide(enemy), true);
  advanceNewEnemy(enemy, 10, { player });
  assert.ok(enemy.y <= 3.1 && enemy.y >= -3.1);
});

test('teleport enemy warns before appearing and cannot collide during its grace period', () => {
  const enemy = createNewEnemy(8, { id: 9, x: 10, y: 0, side: 1, random: () => .5, player });
  assert.equal(enemy.phase, 'warning');
  assert.deepEqual([enemy.radius, enemy.hitW, enemy.hitH], [.224, .448, .448]);
  assert.equal(enemy.phaseTimer, .8);
  assert.equal(enemy.trail.length, 0);
  assert.ok(Math.hypot(enemy.targetX - player.x, enemy.targetY - player.y) >= 1.2);
  assert.equal(newEnemyCanCollide(enemy), false);
  const target = { x: enemy.targetX, y: enemy.targetY };
  assert.deepEqual(advanceNewEnemy(enemy, .8, { random: () => .25, player }),
    [{ kind: 'enemy-teleport', ...target, type: 8, targetId: 9 }]);
  assert.equal(enemy.phase, 'grace');
  assert.deepEqual({ x: enemy.x, y: enemy.y }, target);
  assert.equal(newEnemyCanCollide(enemy), false);
  advanceNewEnemy(enemy, .149, { player });
  assert.equal(newEnemyCanCollide(enemy), false);
  advanceNewEnemy(enemy, .001, { player });
  assert.equal(enemy.phase, 'active');
  assert.equal(newEnemyCanCollide(enemy), true);
});

test('teleport enemy announces subsequent positions, performs three hops, then leaves', () => {
  const enemy = createNewEnemy(8, { id: 10, x: -10, y: 1, side: -1, random: () => .75, player });
  let teleports = 0;
  let telegraphs = 0;
  const visited = [];
  const laneY = enemy.laneY;
  for (let hop = 0; hop < 3; hop++) {
    teleports += advanceNewEnemy(enemy, .8, { random: () => .2, player })
      .filter(event => event.kind === 'enemy-teleport').length;
    visited.push([enemy.x, enemy.y]);
    advanceNewEnemy(enemy, .15, { random: () => .2, player });
    const events = advanceNewEnemy(enemy, .5, { random: () => .2, player });
    telegraphs += events.filter(event => event.kind === 'enemy-telegraph').length;
    if (hop < 2) {
      assert.equal(enemy.phase, 'warning');
      assert.equal(enemy.targetY, laneY);
    }
  }
  assert.deepEqual(visited, [[-5.4, laneY], [0, laneY], [5.4, laneY]]);
  assert.equal(teleports, 3);
  assert.equal(telegraphs, 2);
  assert.equal(enemy.jumps, 3);
  assert.equal(enemy.phase, 'gone');
  assert.equal(enemy.gone, true);
  assert.equal(newEnemyCanCollide(enemy), false);
  assert.equal(enemy.trail.length, 0);
});

test('teleport lane is chosen once away from the first target and never rerolled', () => {
  const nearEntrance = { x: 5.4, y: .1 };
  const enemy = createNewEnemy(8,
    { id: 12, x: 10, y: 0, side: 1, random: () => .5, player: nearEntrance });
  assert.equal(enemy.laneY, -2.8);
  assert.deepEqual([enemy.targetX, enemy.targetY], [5.4, -2.8]);
  advanceNewEnemy(enemy, .8, { random: () => .99, player: { x: 0, y: -2.8 } });
  advanceNewEnemy(enemy, .15, { random: () => .99, player: { x: 0, y: -2.8 } });
  advanceNewEnemy(enemy, .5, { random: () => .99, player: { x: 0, y: -2.8 } });
  assert.deepEqual([enemy.targetX, enemy.targetY], [0, -2.8]);
});

test('stopped enemy time does not advance a warning', () => {
  const enemy = createNewEnemy(8, { id: 11, x: 10, y: 0, side: 1, random: () => .1, player });
  assert.deepEqual(advanceNewEnemy(enemy, 0, { player }), []);
  assert.equal(enemy.phaseTimer, .8);
  assert.equal(enemy.jumps, 0);
});

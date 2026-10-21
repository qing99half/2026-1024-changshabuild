import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startRound, startTutorial, skipTutorial, step, turn, selectSkin, buySkin, snapshotProgress, WORLD, ENEMY_TRAIL_LIFE } from '../src/core.mjs';

test('one input turns 90 degrees and four inputs complete a circuit', () => {
  const game = createGame();
  startRound(game);
  assert.deepEqual([game.player.x, game.player.y, game.player.dir], [0, -2.65, 0]);
  for (const direction of [1, 2, 3, 0]) {
    assert.equal(turn(game), true);
    assert.equal(game.player.dir, direction);
  }
  assert.equal(game.score, 0);
});

test('a point is scored only after carrying it into the goal', () => {
  const game = createGame();
  startRound(game);
  game.point.x = 0;
  game.point.y = -.5;
  game.player.y = -.5;
  step(game);
  assert.equal(game.player.carrying, true);
  assert.equal(game.score, 0);
  game.player.y = game.goal.y;
  step(game);
  assert.equal(game.player.carrying, false);
  assert.equal(game.score, 1);
  assert.equal(game.point.phase, 'returning');
});

test('special delivery reverses turn direction', () => {
  const game = createGame();
  startRound(game);
  game.point = { x: 0, y: -.5, kind: 'turn', phase: 'field', returnTimer: 0 };
  game.player.y = -.5;
  step(game);
  game.player.y = game.goal.y;
  step(game);
  assert.equal(game.player.clockwise, false);
  assert.ok(game.slowTimer > 0);
  turn(game);
  assert.equal(game.player.dir, 3);
});

test('special delivery eases down to quarter speed and back', () => {
  const game = createGame();
  startRound(game);
  game.point = { x: 0, y: -.5, kind: 'turn', phase: 'field', returnTimer: 0 };
  game.player.y = -.5;
  step(game);
  game.player.y = game.goal.y;
  step(game);
  game.player.speed = 0;
  game.player.dir = 1;
  let lowest = 1;
  for (let i = 0; i < 200 && game.slowPhase; i++) {
    step(game);
    lowest = Math.min(lowest, game.timeScale);
  }
  assert.ok(lowest <= .25 && lowest > .2);
  assert.equal(game.timeScale, 1);
  assert.equal(game.slowPhase, null);
});

test('a near miss scores once when the player leaves the danger zone', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 0;
  game.player.y = 0;
  game.enemies = [{ x: .65, y: 0, vx: 0, vy: 0, type: 0, shape: 'square', radius: .21, near: false }];
  step(game);
  assert.equal(game.score, 0);
  assert.equal(game.enemies[0].near, true);
  game.enemies[0].x = .95;
  step(game);
  assert.equal(game.score, 1);
  assert.equal(game.enemies.some(enemy => enemy.x === .95), false);
});

test('death leads to results and banks the score once', () => {
  const game = createGame({ best: 2, totalPoints: 5, gamesPlayed: 1 });
  startRound(game);
  game.score = 4;
  game.player.x = 6.43;
  step(game);
  assert.equal(game.status, 'dying');
  for (let i = 0; i < 121; i++) step(game);
  assert.equal(game.status, 'results');
  assert.deepEqual(snapshotProgress(game), { best: 4, totalPoints: 9, gamesPlayed: 2, selectedSkin: 0, unlocked: [0], tutorialSeen: true });
  for (let i = 0; i < 30; i++) step(game);
  assert.equal(game.totalPoints, 9);
});

test('bonuses grant their distinct rewards', () => {
  for (const [kind, expectedScore] of [['points', 2], ['freeze', 1], ['bomb', 1]]) {
    const game = createGame();
    startRound(game);
    game.spawnTimer = 0;
    game.player.y = 0;
    game.bonuses = [{ x: 0, y: 0, vx: 0, kind, radius: .18 }];
    step(game);
    assert.equal(game.score, expectedScore);
    assert.equal(game.bonuses.length, 0);
    if (kind === 'freeze') assert.ok(game.freezeTimer > 6.9);
    if (kind === 'bomb') assert.equal(game.bombWaves.length, 1);
  }
});

test('bomb clears enemies as its expanding collider reaches them', () => {
  const game = createGame();
  startRound(game);
  game.spawnTimer = 0;
  game.player.y = 0;
  game.enemies = [{ x: 5, y: 0, vx: 0, vy: 0, type: 0, shape: 'square', radius: .25, near: false }];
  game.bonuses = [{ x: 0, y: 0, vx: 0, kind: 'bomb', radius: .18 }];
  step(game);
  assert.equal(game.enemies.length, 1);
  for (let i = 0; i < 20; i++) step(game);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.events.filter(event => event.kind === 'enemy-explode' && event.source === 'bomb').length, 1);
});

test('each enemy crossing the wall emits its own typed explosion', () => {
  const game = createGame();
  startRound(game);
  game.spawnTimer = 0;
  game.enemies = Array.from({ length: 7 }, (_, type) => ({ id: 300 + type,
    x: WORLD.left - .49, y: -3 + type, vx: -2.4, vy: 0, type,
    radius: .25, hitW: .5, hitH: .5, split: type === 6 ? .276 : undefined,
    near: false }));
  step(game);
  const explosions = game.events.filter(event => event.kind === 'enemy-explode' && event.source === 'boundary');
  assert.deepEqual([...new Set(explosions.map(event => event.type))], [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(explosions.length, 8); // The two bodies of type 7 burst separately.
  assert.equal(game.enemies.length, 0);
});

test('tutorial teaches turning, then saves completion when skipped', () => {
  const game = createGame();
  startTutorial(game);
  assert.equal(game.status, 'tutorial');
  assert.equal(game.tutorial.stage, 0);
  turn(game); turn(game);
  assert.equal(game.tutorial.stage, 1);
  skipTutorial(game);
  assert.equal(game.status, 'playing');
  assert.equal(snapshotProgress(game).tutorialSeen, true);
});

test('all tutorial stages can be completed without granting currency', () => {
  const game = createGame();
  startTutorial(game);
  turn(game); turn(game);
  for (let i = 0; i < 140 && !game.player.carrying; i++) step(game);
  assert.equal(game.player.carrying, true);
  turn(game); turn(game);
  for (let i = 0; i < 140 && game.tutorial.stage === 1; i++) step(game);
  assert.equal(game.tutorial.stage, 2);
  for (let i = 0; i < 420 && game.status === 'tutorial'; i++) {
    if (game.player.dir === 0 && game.player.y > 2.2) turn(game);
    if (game.player.dir === 1 && game.player.x > 4) turn(game);
    step(game);
  }
  assert.equal(game.status, 'playing');
  assert.equal(game.tutorialSeen, true);
  assert.equal(game.totalPoints, 0);
});

test('new enemy classes debut as their score thresholds open', () => {
  const game = createGame();
  startRound(game);
  game.player.speed = 0;
  for (let type = 0; type < 7; type++) {
    game.score = type * 2;
    game.spawnTimer = 2;
    game.spawned = 0;
    step(game);
    assert.equal(game.enemies.at(-1).type, type);
  }
});

test('original comparison mode keeps the five-point enemy unlock gaps', () => {
  const game = createGame({ classicSpawns: true });
  startRound(game);
  game.score = 2;
  game.spawnTimer = 2;
  step(game);
  assert.equal(game.enemies[0].type, 0);
  game.score = 5;
  game.spawnTimer = 2;
  step(game);
  assert.equal(game.enemies[1].type, 1);
});

test('wide and dual-body enemies collide using their actual parts', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 0; game.player.y = 0;
  game.enemies = [{ x: .83, y: 0, vx: 0, vy: 0, type: 1, radius: .53,
    hitW: 1.0465, hitH: .4945, near: false }];
  step(game);
  assert.equal(game.status, 'dying');
  startRound(game);
  game.player.x = 0; game.player.y = .55;
  game.enemies = [{ x: 0, y: 0, vx: 0, vy: 0, type: 6, radius: .25,
    hitW: .4945, hitH: .4945, split: .276, near: false }];
  step(game);
  assert.equal(game.status, 'dying');
});

test('reward events keep the contact location and amount', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 1; game.player.y = 0;
  game.bonuses = [{ x: 1.2, y: 0, vx: 0, kind: 'points', radius: .2925 }];
  step(game);
  assert.deepEqual(game.events.find(event => event.kind === 'bonus'),
    { kind: 'bonus', text: '+2', scoreDelta: 2, x: 1.2, y: 0 });
});

test('unlocking a skin spends earned points and survives a save roundtrip', () => {
  const game = createGame({ totalPoints: 30 });
  selectSkin(game, 1);
  assert.equal(buySkin(game), true);
  assert.equal(game.totalPoints, 5);
  const loaded = createGame(snapshotProgress(game));
  assert.equal(loaded.selectedSkin, 1);
  assert.deepEqual(loaded.unlocked, [0, 1]);
});

test('scoring keeps the permanent speed increase above the opening cap', () => {
  const game = createGame();
  startRound(game);
  game.player.speed = .054;
  game.point = { x: 0, y: -2.65, kind: 'normal', phase: 'carried', returnTimer: 0 };
  game.player.carrying = true;
  step(game);
  assert.equal(game.score, 1);
  const increasedSpeed = game.player.speed;
  assert.ok(increasedSpeed > .054);
  step(game);
  assert.equal(game.player.speed, increasedSpeed);
});

test('the recorded no-input round ends on the upper boundary in 2.96 seconds', () => {
  const game = createGame();
  startRound(game);
  while (game.status === 'playing') step(game);
  assert.equal(game.score, 0);
  assert.equal(game.status, 'dying');
  assert.ok(Math.abs(game.time - 2.96) < .02);
});

test('opening enemy spawns beyond the field and travels into view', () => {
  const game = createGame();
  startRound(game);
  step(game);
  assert.equal(game.enemies.length, 1);
  const enemy = game.enemies[0];
  assert.ok(Math.abs(enemy.x) > WORLD.width / 2);
  for (let i = 0; i < 100; i++) step(game);
  assert.ok(game.enemies.some(item => item === enemy && Math.abs(item.x) < WORLD.width / 2));
});

test('enemy trail follows movement, stays bounded, and fades during freeze', () => {
  const game = createGame();
  startRound(game);
  game.spawnTimer = 0;
  game.enemies = [{ x: 4, y: 2, vx: -2.4, vy: 0, type: 0, shape: 'square', radius: .25, near: false }];
  for (let i = 0; i < 10; i++) step(game);
  const enemy = game.enemies[0];
  assert.ok(enemy.trail.length > 2);
  assert.ok(enemy.trail.length <= 42);
  assert.ok(enemy.trail[0].x > enemy.trail.at(-1).x);
  const frozenX = enemy.x;
  game.freezeTimer = 1;
  for (let i = 0; i < Math.ceil(ENEMY_TRAIL_LIFE / (1 / 60)) + 1; i++) step(game);
  assert.equal(enemy.x, frozenX);
  assert.equal(enemy.trail.length, 0);
});

test('the seventh hazard spawn is replaced by one bonus', () => {
  const game = createGame();
  startRound(game);
  game.spawned = 6;
  step(game);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.bonuses.length, 1);
  assert.equal(game.spawned, 0);
});

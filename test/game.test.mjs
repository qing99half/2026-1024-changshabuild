import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startRound, startTutorial, skipTutorial, step, turn, selectSkin, buySkin, activateDeveloperMode, snapshotProgress, WORLD, ENEMY_TRAIL_LIFE, ENEMY_TYPES, grazeBounds } from '../src/core.mjs';
import { SKINS, isSkinRevealed } from '../src/skins.mjs';

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

test('the carried point stays centered on the player while its trail continues', () => {
  const game = createGame();
  startRound(game);
  game.player.speed = 0;
  game.point.x = 0;
  game.point.y = -.5;
  game.player.y = -.5;
  step(game);
  assert.equal(game.point.phase, 'carried');
  game.player.x = 2;
  step(game);
  assert.equal(game.point.x, 2);
  assert.equal(game.point.displayX, game.player.x);
  assert.equal(game.point.displayY, game.player.y);
  assert.equal(game.point.age > 0, true);
});

test('the invisible enemy disables both trail layers', () => {
  assert.equal(ENEMY_TYPES[4].name, 'EnemySquare5');
  assert.equal(ENEMY_TYPES[4].trailWidth, 0);
  assert.ok(ENEMY_TYPES.filter((enemy, index) => index !== 4).every(enemy => enemy.trailWidth > 0));
});

test('each developer shortcut grants 2000 points, including after reloading', () => {
  const game = createGame();
  assert.equal(activateDeveloperMode(game), true);
  assert.equal(activateDeveloperMode(game), true);
  assert.equal(game.totalPoints, 4000);
  assert.equal(game.lifetimePoints, 4000);
  const loaded = createGame(snapshotProgress(game));
  assert.equal(loaded.developerMode, true);
  assert.equal(activateDeveloperMode(loaded), true);
  assert.equal(loaded.totalPoints, 6000);
  assert.equal(loaded.lifetimePoints, 6000);
  assert.equal(isSkinRevealed(loaded, 11), true);
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

test('a head-on side graze scores once when the player leaves the danger zone', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 0; game.player.y = .76; game.player.dir = 3; game.player.speed = 0;
  game.point = null; game.spawnTimer = -100;
  game.enemies = [{ x: 0, y: 0, vx: 2.4, vy: 0, type: 0, shape: 'square', radius: .25, hitW: .5, hitH: .5, near: false }];
  step(game);
  assert.equal(game.score, 0);
  assert.equal(game.enemies[0].near, true);
  game.enemies[0].x = 1.2;
  step(game);
  assert.equal(game.score, 1);
  assert.equal(game.events.find(event => event.kind === 'near-miss').mode, 'head-on');
});

test('graze requires front perpendicular or aligned side head-on motion', () => {
  for (const direction of [1, -1]) {
    for (const [position, heading, expectedMode] of [
      ['front', 0, 'perpendicular'], ['front', 2, 'perpendicular'],
      ['side', direction > 0 ? 3 : 1, 'head-on'],
      ['front', direction > 0 ? 3 : 1, null],
      ['side', 0, null], ['side', direction > 0 ? 1 : 3, null]
    ]) {
      const game = createGame(); startRound(game);
      game.point = null; game.spawnTimer = -100;
      game.player.x = position === 'front' ? .3 * direction : 0;
      game.player.y = .76; game.player.dir = heading; game.player.speed = 0;
      game.enemies = [{ id: 72, x: 0, y: 0, vx: 2.4 * direction, vy: 0,
        type: 0, radius: .25, hitW: .5, hitH: .5, near: false }];
      step(game);
      game.enemies[0].x = 2 * direction;
      step(game);
      assert.equal(game.score, expectedMode ? 1 : 0, `${direction} ${position} ${heading}`);
      if (expectedMode) assert.equal(game.events.find(e => e.kind === 'near-miss').mode, expectedMode);
    }
  }
});

test('invalid graze expires and cannot be claimed by turning after exit', () => {
  const game = createGame(); startRound(game);
  game.point = null; game.spawnTimer = -100;
  game.player.x = 0; game.player.y = .76; game.player.dir = 1; game.player.speed = 0;
  game.enemies = [{ id: 73, x: 0, y: 0, vx: 2.4, vy: 0,
    type: 0, radius: .25, hitW: .5, hitH: .5, near: false }];
  step(game);
  assert.equal(game.enemies[0].near, true);
  game.enemies[0].x = 2;
  step(game);
  assert.equal(game.enemies[0].near, false);
  game.player.dir = 3;
  step(game);
  assert.equal(game.score, 0);
});

test('the safe graze band is 25 percent narrower than the prior expanded band', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 0; game.player.y = .78; game.player.dir = 3; game.player.speed = 0;
  game.point = null; game.spawnTimer = -100;
  assert.ok(Math.abs(grazeBounds(game).outer - .569) < .002);
  game.enemies = [{ id: 91, x: 0, y: 0, vx: 2.4, vy: 0, type: 0,
    radius: .25, hitW: .5, hitH: .5, near: false }];
  step(game);
  assert.equal(game.enemies[0].near, true);
  assert.equal(game.events.some(event => event.kind === 'near-miss-enter'), true);
  game.enemies[0].x = 1.2;
  step(game);
  assert.equal(game.score, 1);
  assert.equal(game.events.find(event => event.kind === 'near-miss').grade, 'normal');
  assert.equal(game.events.find(event => event.kind === 'near-miss').type, 0);
  assert.equal(game.events.find(event => event.kind === 'near-miss').combo, 1);
});

test('extreme grazes and every third graze award style currency only at settlement', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 0; game.player.y = .64; game.player.dir = 3;
  game.point = null; game.spawnTimer = -100;
  for (let i = 0; i < 3; i++) {
    game.player.speed = 0;
    game.enemies = [{ id: i + 1, x: 0, y: 0, vx: 2.4, vy: 0, type: 0,
      radius: .25, hitW: .5, hitH: .5, near: false }];
    step(game);
    assert.equal(game.status, 'playing');
    game.enemies[0].x = 1.2;
    step(game);
  }
  const grazes = game.events.filter(event => event.kind === 'near-miss');
  assert.deepEqual(grazes.map(event => event.grade), ['extreme', 'extreme', 'extreme']);
  assert.deepEqual(grazes.map(event => event.styleDelta), [1, 1, 2]);
  assert.deepEqual(grazes.map(event => event.combo), [1, 2, 3]);
  assert.equal(game.score, 3);
  assert.equal(game.stylePoints, 4);
  assert.equal(game.totalPoints, 0);
  game.player.x = 6.5;
  step(game);
  for (let i = 0; i < 121; i++) step(game);
  assert.equal(game.lastStylePoints, 4);
  assert.equal(game.totalPoints, 7);
});

test('a stronger skin expands the graze band and multiplies settlement style points', () => {
  const classic = createGame();
  const premium = createGame({ unlocked: [0, 11], selectedSkin: 11 });
  for (const game of [classic, premium]) {
    startRound(game);
    game.player.x = 0; game.player.y = .82; game.player.dir = 3; game.player.speed = 0;
    game.point = null; game.spawnTimer = -100;
    game.enemies = [{ id: 5, x: 0, y: 0, vx: 2.4, vy: 0, type: 0,
      radius: .25, hitW: .5, hitH: .5, near: false }];
    step(game);
  }
  assert.equal(classic.enemies[0].near, false);
  assert.equal(premium.enemies[0].near, true);
  premium.stylePoints = 20;
  premium.player.x = 6.5;
  step(premium);
  for (let i = 0; i < 121; i++) step(premium);
  assert.equal(premium.lastStylePoints, 23);
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
  assert.deepEqual(snapshotProgress(game), { best: 4, totalPoints: 9, lifetimePoints: 9,
    gamesPlayed: 2, developerMode: false, selectedSkin: 0, unlocked: [0], tutorialSeen: true });
  for (let i = 0; i < 30; i++) step(game);
  assert.equal(game.totalPoints, 9);
});

test('death snapshots every enemy as an independent shard source before results', () => {
  const game = createGame();
  startRound(game);
  game.enemies = [
    { id: 41, x: -2, y: -.276, type: 6 },
    { id: 42, x: -2, y: .276, type: 6 },
    { id: 43, x: 2, y: 1, type: 1 }
  ];
  game.player.x = 6.43;
  step(game);
  const deaths = game.events.filter(event => event.kind === 'die');
  assert.equal(game.status, 'dying');
  assert.deepEqual(deaths[0].enemies.map(({ id, type }) => [id, type]),
    [[41, 6], [42, 6], [43, 1]]);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.point, null);
  step(game);
  assert.equal(game.events.filter(event => event.kind === 'die').length, 1);
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
  game.enemies = Array.from({ length: 8 }, (_, index) => ({ id: 300 + index,
    type: Math.min(index, 6),
    x: WORLD.left - .49, y: -3 + index, vx: -2.4, vy: 0,
    radius: .25, hitW: .5, hitH: .5,
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
  for (let i = 0; i < 600 && game.status === 'tutorial'; i++) {
    if (game.player.dir === 0 && game.player.y > 2.2) turn(game);
    if (game.player.dir === 1 && game.player.x > 4) turn(game);
    step(game);
  }
  assert.equal(game.status, 'playing');
  assert.equal(game.tutorialSeen, true);
  assert.equal(game.totalPoints, 0);
  assert.equal(game.stylePoints, 0);
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

test('wide and paired enemies collide using each unit’s own box', () => {
  const game = createGame();
  startRound(game);
  game.player.x = 0; game.player.y = 0;
  game.enemies = [{ x: .83, y: 0, vx: 0, vy: 0, type: 1, radius: .53,
    hitW: 1.0465, hitH: .4945, near: false }];
  step(game);
  assert.equal(game.status, 'dying');
  startRound(game);
  game.player.x = 0; game.player.y = .55;
  game.enemies = [{ id: 1, x: 0, y: -.276, vx: 0, vy: 0, type: 6, radius: .25,
    hitW: .4945, hitH: .4945, pairMember: -1, near: false },
  { id: 2, x: 0, y: .276, vx: 0, vy: 0, type: 6, radius: .25,
    hitW: .4945, hitH: .4945, pairMember: 1, near: false }];
  step(game);
  assert.equal(game.status, 'dying');
});

test('the white pair spawns as two independently moving and removable enemies', () => {
  const game = createGame();
  startRound(game);
  game.player.speed = 0;
  game.score = 12;
  game.introducedEnemies = [0, 1, 2, 3, 4, 5];
  game.spawnTimer = 2;
  step(game);
  const pair = game.enemies.filter(enemy => enemy.type === 6);
  assert.equal(pair.length, 2);
  assert.notEqual(pair[0].id, pair[1].id);
  assert.equal(pair[0].groupId, pair[1].groupId);
  assert.ok(Math.abs(pair[0].y - pair[1].y) > .5);
  game.player.x = 3;
  for (const enemy of pair) { enemy.x = .54; enemy.y = enemy.pairMember * .276; enemy.vx = -2.4; }
  const before = pair.map(enemy => enemy.y);
  for (let i = 0; i < 90; i++) step(game);
  assert.ok(pair[0].y < before[0] && pair[1].y > before[1]);

  startRound(game);
  game.player.speed = 0;
  game.point = null;
  game.spawnTimer = -100;
  game.enemies = [
    { id: 70, x: 0, y: 1, vx: 0, vy: 0, type: 6, radius: .25, hitW: .4945, hitH: .4945, pairMember: -1, near: false },
    { id: 71, x: 0, y: -1, vx: 0, vy: 0, type: 6, radius: .25, hitW: .4945, hitH: .4945, pairMember: 1, near: false }
  ];
  game.bombWaves = [{ x: 0, y: 1, age: 0 }];
  step(game);
  assert.deepEqual(game.enemies.map(enemy => enemy.id), [71]);
  assert.deepEqual(game.events.filter(event => event.kind === 'enemy-explode').map(event => event.targetId), [70]);
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
  assert.deepEqual([...loaded.unlocked].sort((a, b) => a - b), [0, 1]);
});

test('TES and Kobe skins require their reveal thresholds and purchases', () => {
  const game = createGame({ totalPoints: 349, lifetimePoints: 349 });
  assert.deepEqual(game.unlocked, [0]);
  assert.deepEqual(SKINS.slice(12).map(skin => [skin.revealAt, skin.cost]), [[350, 600], [500, 750]]);
  selectSkin(game, 12);
  assert.equal(isSkinRevealed(game, 12), false);
  assert.equal(buySkin(game), false);
  game.lifetimePoints = 350;
  assert.equal(isSkinRevealed(game, 12), true);
  assert.equal(buySkin(game), false);
  game.totalPoints = 600;
  assert.equal(buySkin(game), true);
  assert.equal(game.totalPoints, 0);
  selectSkin(game, 13);
  assert.equal(isSkinRevealed(game, 13), false);
  game.lifetimePoints = 500;
  assert.equal(isSkinRevealed(game, 13), true);
  assert.equal(buySkin(game), false);
  game.totalPoints = 750;
  assert.equal(buySkin(game), true);
  assert.equal(game.totalPoints, 0);
  const restored = createGame(snapshotProgress(game));
  assert.equal(restored.selectedSkin, 13);
  assert.deepEqual(restored.unlocked, [0, 12, 13]);
  assert.equal(restored.lifetimePoints, 500);
  assert.deepEqual(SKINS.slice(12).map(({ speed, hurt, pickup, graze, styleBonus }) =>
    [speed, hurt, pickup, graze, styleBonus]),
  [[1.01, .90, 1.10, 1.10, 1.18], [.99, .88, 1.08, 1.12, 1.24]]);
});

test('legacy free TES and Kobe ownership survives without inflating lifetime points', () => {
  const game = createGame({ totalPoints: 20, lifetimePoints: 200, unlocked: [0, 12, 13], selectedSkin: 13 });
  assert.deepEqual(game.unlocked, [0, 12, 13]);
  assert.equal(game.selectedSkin, 13);
  assert.equal(game.lifetimePoints, 200);
  assert.equal(isSkinRevealed(game, 12), true);
  assert.equal(isSkinRevealed(game, 13), true);
  assert.equal(createGame(snapshotProgress(game)).lifetimePoints, 200);
  assert.equal(createGame({ totalPoints: 20, unlocked: [0, 12, 13] }).lifetimePoints, 20);
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

test('legacy progress reveals secret skins without losing previously spent points', () => {
  const migrated = createGame({ totalPoints: 20, unlocked: [0, 5], selectedSkin: 5 });
  assert.equal(migrated.lifetimePoints, 170);
  assert.equal(isSkinRevealed(migrated, 10), true);
  assert.equal(isSkinRevealed(migrated, 11), false);
  assert.equal(SKINS[10].cost, 300);
  assert.equal(SKINS[11].cost, 450);
  const hidden = createGame({ lifetimePoints: 149 });
  assert.equal(isSkinRevealed(hidden, 10), false);
  hidden.lifetimePoints = 150;
  assert.equal(isSkinRevealed(hidden, 10), true);
  const buyer = createGame({ totalPoints: 450, lifetimePoints: 450 });
  selectSkin(buyer, 11);
  assert.equal(buySkin(buyer), true);
  assert.equal(buyer.totalPoints, 0);
  assert.equal(snapshotProgress(buyer).lifetimePoints, 450);
});

test('skin movement and enemy hit radius change only within the equipped round', () => {
  const base = createGame();
  startRound(base);
  base.player.x = 0; base.player.y = 0; base.player.dir = 1; base.player.speed = .054;
  base.point = null; base.spawnTimer = -100;
  step(base);
  const neon = createGame({ unlocked: [0, 1], selectedSkin: 1 });
  startRound(neon);
  neon.player.x = 0; neon.player.y = 0; neon.player.dir = 1; neon.player.speed = .054;
  neon.point = null; neon.spawnTimer = -100;
  step(neon);
  assert.ok(neon.player.x > base.player.x);
  assert.ok(Math.abs(neon.player.x / base.player.x - SKINS[1].speed) < 1e-9);
  for (const game of [base, neon]) {
    startRound(game);
    game.player.x = 0; game.player.y = 0; game.player.dir = 1;
    game.point = null; game.spawnTimer = -100;
    game.enemies = [{ x: .6167, y: 0, vx: 0, vy: 0, type: 0, radius: .25, near: false }];
    step(game);
  }
  assert.equal(base.status, 'playing');
  assert.equal(neon.status, 'playing');
  assert.ok(SKINS[1].hurt < SKINS[0].hurt);
  startTutorial(neon);
  assert.equal(neon.roundSkin, 0);
});

test('pickup allowance changes without changing delivery or score rewards', () => {
  const generous = createGame({ unlocked: [0, 3], selectedSkin: 3 });
  const precise = createGame({ unlocked: [0, 4], selectedSkin: 4 });
  for (const game of [generous, precise]) {
    startRound(game);
    game.player.x = 0; game.player.y = 0; game.player.speed = 0;
  game.point = { x: 0, y: .67, kind: 'normal', phase: 'field', returnTimer: 0 };
    game.spawnTimer = -100;
    step(game);
  }
  assert.equal(generous.player.carrying, true);
  assert.equal(precise.player.carrying, false);
  assert.equal(generous.score, 0);
  assert.equal(precise.score, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBonusKind, applyPowerup, stepPowerups, playerSpeedMultiplier,
  enemySpeedMultiplier, spawnSpeedMultiplier, enemyContactEffect } from '../src/powerups.mjs';

test('the existing reward pool stays intact until new bonus score thresholds', () => {
  const game = { score: 3 };
  assert.equal(chooseBonusKind(game, () => 0), 'points');
  assert.equal(chooseBonusKind(game, () => 0.5), 'freeze');
  assert.equal(chooseBonusKind(game, () => 0.999), 'bomb');
  assert.deepEqual(game.bonusIntroduced, []);
});

test('each unlocked effect debuts at its first eligible reward slot', () => {
  const game = { score: 4 };
  assert.equal(chooseBonusKind(game, () => 0), 'invincible');
  game.score = 8;
  assert.equal(chooseBonusKind(game, () => 0), 'phase');
  game.score = 12;
  assert.equal(chooseBonusKind(game, () => 0), 'bullet');
  assert.deepEqual(game.bonusIntroduced, ['invincible', 'phase', 'bullet']);
  assert.equal(chooseBonusKind(game, () => 0.999), 'bullet');
  assert.equal(chooseBonusKind(game, () => 0), 'points');
});

test('crossing several thresholds at once introduces each new effect once', () => {
  const game = { score: 12 };
  const kinds = Array.from({ length: 3 }, () => chooseBonusKind(game, () => 0.999));
  assert.deepEqual(kinds, ['invincible', 'phase', 'bullet']);
});

test('invincible and phase replace one another while bullet time runs independently', () => {
  const game = { score: 7 };
  assert.equal(applyPowerup(game, 'invincible'), true);
  assert.deepEqual([game.invincibleTimer, game.phaseTimer], [5, 0]);
  assert.equal(applyPowerup(game, 'bullet'), true);
  assert.equal(applyPowerup(game, 'phase'), true);
  assert.deepEqual([game.invincibleTimer, game.phaseTimer, game.bulletTimer], [0, 5, 5]);
  assert.equal(game.score, 7);
  assert.equal(applyPowerup(game, 'points'), false);
});

test('powerup timers consume unscaled play time and stop at zero', () => {
  const game = { invincibleTimer: 0.2, phaseTimer: 0, bulletTimer: 1 };
  stepPowerups(game, 0.25);
  assert.deepEqual([game.invincibleTimer, game.phaseTimer, game.bulletTimer], [0, 0, 0.75]);
  stepPowerups(game, 2);
  assert.equal(game.bulletTimer, 0);
});

test('bullet time scales movement and spawning; freeze takes priority', () => {
  const game = { bulletTimer: 3, freezeTimer: 0 };
  assert.equal(playerSpeedMultiplier(game), 1.5);
  assert.equal(enemySpeedMultiplier(game), 0.5);
  assert.equal(spawnSpeedMultiplier(game), 0.5);
  game.freezeTimer = 2;
  assert.equal(playerSpeedMultiplier(game), 1.5);
  assert.equal(enemySpeedMultiplier(game), 0);
  assert.equal(spawnSpeedMultiplier(game), 0);
  game.bulletTimer = 0;
  game.freezeTimer = 0;
  assert.deepEqual([playerSpeedMultiplier(game), enemySpeedMultiplier(game), spawnSpeedMultiplier(game)], [1, 1, 1]);
});

test('phase ignores enemy contact; invincible shatters; normal contact remains fatal', () => {
  const game = { invincibleTimer: 0, phaseTimer: 0 };
  assert.equal(enemyContactEffect(game), 'normal');
  game.invincibleTimer = 2;
  assert.equal(enemyContactEffect(game), 'shatter');
  game.phaseTimer = 1;
  assert.equal(enemyContactEffect(game), 'ignore');
});

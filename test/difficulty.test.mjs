import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startRound, step, setDifficulty, snapshotProgress } from '../src/core.mjs';
import { adaptiveAssist, rewardForRound, spawnGapMultiplier } from '../src/difficulty.mjs';

test('all four difficulty choices persist and preserve raw score', () => {
  for (const [mode, earned] of [['rookie', 8], ['entry', 10], ['hard', 13], ['nightmare', 17]]) {
    const game = createGame();
    assert.equal(setDifficulty(game, mode), true);
    startRound(game);
    game.score = 10;
    game.player.x = 6.5;
    step(game);
    for (let i = 0; i < 121; i++) step(game);
    assert.equal(game.lastScore, 10);
    assert.equal(game.lastEarned, earned);
    assert.equal(game.best, 10);
    assert.equal(createGame(snapshotProgress(game)).difficulty, mode);
  }
});

test('long-term assistance changes only at round start and is bounded by mode', () => {
  const struggling = Array.from({ length: 8 }, () => ({ deliveries: 0, time: 10 }));
  const thriving = Array.from({ length: 8 }, () => ({ deliveries: 5, time: 120 }));
  assert.ok(adaptiveAssist(struggling, 'rookie') > adaptiveAssist(struggling, 'nightmare'));
  assert.ok(adaptiveAssist(thriving, 'rookie') < adaptiveAssist(thriving, 'nightmare'));
  const game = createGame({ difficulty: 'hard', performance: struggling });
  startRound(game);
  const fixed = spawnGapMultiplier(game);
  game.performance = thriving;
  assert.equal(spawnGapMultiplier(game), fixed);
  assert.ok(rewardForRound(10, 2, 'hard') > rewardForRound(10, 2, 'entry'));
});

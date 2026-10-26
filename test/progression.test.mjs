import test from 'node:test';
import assert from 'node:assert/strict';
import { waveForSpawnSlot, bonusGapRange, nextBonusGap, enemySpawnInterval,
  ENEMY_UNLOCK_SCORES, ENEMY_UNLOCK_WAVES } from '../src/progression.mjs';

test('four spawn slots form a wave, including reward slots', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 69].map(waveForSpawnSlot), [1, 1, 2, 2, 3, 18]);
  assert.deepEqual(ENEMY_UNLOCK_SCORES, [0, 3, 6, 9, 12, 15, 18, 22, 28]);
  assert.deepEqual(ENEMY_UNLOCK_WAVES, [1, 3, 5, 7, 9, 11, 13, 15, 18]);
});

test('reward gaps decrease with score and stop at five slots', () => {
  assert.deepEqual([0, 8, 16, 24, 32, 100].map(bonusGapRange),
    [[14, 18], [10, 14], [8, 10], [6, 8], [5, 5], [5, 5]]);
  for (const score of [0, 8, 16, 24, 32]) {
    const [min, max] = bonusGapRange(score);
    assert.equal(nextBonusGap(score, () => 0), min);
    assert.equal(nextBonusGap(score, () => .999999), max);
  }
});

test('ordinary spawn timing slows down while original comparison retains its curve', () => {
  assert.equal(enemySpawnInterval(0), 2);
  assert.equal(enemySpawnInterval(30), 1.5);
  assert.equal(enemySpawnInterval(72), .8);
  assert.equal(enemySpawnInterval(200), .8);
  assert.equal(enemySpawnInterval(30, true), 1.25);
  assert.equal(enemySpawnInterval(200, true), .48);
});

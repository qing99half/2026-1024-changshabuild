import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SPECIAL_POINT_STATE, nextPointKind } from '../src/special-points.mjs';

function seeded(seed = 1024) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function advance(state, score, random, normalDeliveries, wave, classic = false) {
  return nextPointKind({ ...state, normalDeliveries, wave }, score, random, classic);
}

test('left-turn waits for twelve normal deliveries and wave six', () => {
  let state = INITIAL_SPECIAL_POINT_STATE;
  for (let count = 1; count <= 12; count++) {
    state = advance(state, 30, () => 0, count, 5);
    assert.equal(state.kind, 'normal');
  }
  state = advance(state, 30, () => 0, 12, 6);
  assert.equal(state.kind, 'turn');
  assert.equal(state.specialDebuts, 1);
});

test('first 45-degree point waits for left-turn delivery, twenty normal deliveries and wave ten', () => {
  let state = advance(INITIAL_SPECIAL_POINT_STATE, 30, () => 0, 12, 6);
  for (let count = 12; count < 20; count++) {
    state = advance(state, 30, () => 0, count, 10);
    assert.equal(state.kind, 'normal');
  }
  state = advance(state, 30, () => 0, 20, 9);
  assert.equal(state.kind, 'normal');
  state = advance(state, 30, () => 0, 20, 10);
  assert.equal(state.kind, 'angle45');
  assert.equal(state.specialDebuts, 2);
});

test('after both debuts, score tiers shorten gaps without adjacent special points', () => {
  let state = { ...INITIAL_SPECIAL_POINT_STATE, specialDebuts: 2, pointCount: 0,
    nextSpecialPointAt: 7, normalDeliveries: 20, wave: 18 };
  let previous = 'normal';
  const random = seeded();
  const counts = { low: 0, middle: 0, cap: 0 };
  for (const [name, score] of [['low', 0], ['middle', 20], ['cap', 32]]) {
    state = { ...state, pointCount: 0, nextSpecialPointAt: name === 'low' ? 7 : name === 'middle' ? 6 : 5 };
    previous = 'normal';
    for (let i = 0; i < 3000; i++) {
      state = advance(state, score, random, 20, 18);
      if (state.kind !== 'normal') {
        assert.equal(previous, 'normal');
        counts[name]++;
      }
      previous = state.kind;
    }
  }
  assert.ok(counts.low < counts.middle && counts.middle < counts.cap);
  assert.ok(counts.low > 350 && counts.low < 500);
  assert.ok(counts.cap > 700 && counts.cap < 850);
});

test('classic comparison keeps eighth replacement and 45-degree debut schedule', () => {
  let state = { ...INITIAL_SPECIAL_POINT_STATE, nextSpecialPointAt: 8 };
  for (let i = 0; i < 7; i++) {
    state = advance(state, 30, () => 0, i, 1, true);
    assert.equal(state.kind, 'normal');
  }
  state = advance(state, 30, () => 0, 7, 1, true);
  assert.equal(state.kind, 'turn');
  state = advance(state, 30, () => 0, 7, 1, true);
  assert.equal(state.kind, 'normal');
  state = advance(state, 30, () => 0, 8, 1, true);
  assert.equal(state.kind, 'angle45');
});

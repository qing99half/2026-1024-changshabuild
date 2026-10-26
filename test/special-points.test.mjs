import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SPECIAL_POINT_STATE, nextPointKind } from '../src/special-points.mjs';

function seeded(seed = 1024) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test('the eighth replacement is still the left-turn point, followed by a guaranteed 45-degree debut', () => {
  let state = INITIAL_SPECIAL_POINT_STATE;
  const random = () => 0;
  for (let i = 1; i <= 7; i++) {
    state = nextPointKind(state, 30, random);
    assert.equal(state.kind, 'normal', `replacement ${i}`);
  }
  state = nextPointKind(state, 30, random);
  assert.equal(state.kind, 'turn');
  assert.equal(state.specialDebuts, 1);
  state = nextPointKind(state, 30, random);
  assert.equal(state.kind, 'normal');
  state = nextPointKind(state, 30, random);
  assert.equal(state.kind, 'angle45');
  assert.equal(state.specialDebuts, 2);
});

test('a score tier increase shortens the pending gap without allowing consecutive special points', () => {
  let state = INITIAL_SPECIAL_POINT_STATE;
  for (let i = 0; i < 8; i++) state = nextPointKind(state, 0, () => .999);
  assert.equal(state.kind, 'turn');
  assert.equal(state.nextSpecialPointAt, 4);
  state = nextPointKind(state, 0, () => .999);
  assert.equal(state.kind, 'normal');
  state = nextPointKind(state, 20, () => .999);
  assert.equal(state.kind, 'angle45');
  assert.equal(state.nextSpecialPointAt, 2);
});

test('both special kinds grow in frequency with score and stop changing at the cap', () => {
  function rates(score) {
    let state = INITIAL_SPECIAL_POINT_STATE;
    const random = seeded();
    const counts = { turn: 0, angle45: 0 };
    let previous = 'normal';
    for (let i = 0; i < 30000; i++) {
      state = nextPointKind(state, score, random);
      if (state.kind !== 'normal') {
        assert.equal(previous, 'normal');
        counts[state.kind]++;
      }
      previous = state.kind;
    }
    return { turn: counts.turn / 30000, angle45: counts.angle45 / 30000 };
  }
  const low = rates(0), middle = rates(10), cap = rates(20);
  assert.ok(low.turn < middle.turn && middle.turn < cap.turn);
  assert.ok(low.angle45 < middle.angle45 && middle.angle45 < cap.angle45);
  assert.deepEqual(rates(100), cap);
  assert.ok(low.turn > .16 && low.turn < .21);
  assert.ok(low.angle45 > .13 && low.angle45 < .17);
  assert.ok(cap.turn > .23 && cap.turn < .27);
  assert.ok(cap.angle45 > .23 && cap.angle45 < .27);
});

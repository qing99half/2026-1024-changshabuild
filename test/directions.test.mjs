import test from 'node:test';
import assert from 'node:assert/strict';
import { directionVector, toneDirection, turnHeading } from '../src/directions.mjs';

test('eight headings preserve unit speed and clockwise compass order', () => {
  const headings = Array.from({ length: 8 }, (_, index) => directionVector(index));
  for (const vector of headings) assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-12);
  assert.deepEqual(headings[0], { x: 0, y: 1 });
  assert.deepEqual(headings[2], { x: 1, y: 0 });
  assert.deepEqual(headings[4], { x: 0, y: -1 });
  assert.deepEqual(headings[6], { x: -1, y: 0 });
  assert.ok(headings[1].x > 0 && headings[1].y > 0);
});

test('45-degree and ordinary turns follow the same left-right switch', () => {
  let heading = 0;
  for (let i = 0; i < 8; i++) heading = turnHeading(heading, true, true);
  assert.equal(heading, 0);
  assert.equal(turnHeading(0, true, true), 1);
  assert.equal(turnHeading(0, false, true), 7);
  assert.equal(turnHeading(0, true, false), 2);
  assert.equal(turnHeading(0, false, false), 6);
  assert.equal(turnHeading(1, true, false), 3, 'restoring 90 degrees preserves a diagonal heading');
});

test('diagonal turns use an existing nearest cardinal melody direction', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, heading) => toneDirection(heading)),
    [0, 1, 1, 2, 2, 3, 3, 0]);
});

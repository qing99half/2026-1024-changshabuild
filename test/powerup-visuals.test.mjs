import test from 'node:test';
import assert from 'node:assert/strict';
import { powerupVisualState, drawPowerupBackground, drawPowerupForeground,
  drawPowerupPlayerAura } from '../src/powerup-visuals.mjs';

function context() {
  const calls = { saved: 0, restored: 0, fills: 0, strokes: 0 };
  const ctx = {
    save() { calls.saved++; }, restore() { calls.restored++; },
    fillRect() { calls.fills++; }, strokeRect() { calls.strokes++; },
    beginPath() {}, arc() {}, fill() { calls.fills++; }, stroke() { calls.strokes++; },
    setLineDash() {},
    createLinearGradient() { return { addColorStop() {} }; }
  };
  return { ctx, calls };
}

test('powerup visuals distinguish invincible and phase and stay off outside the round', () => {
  const game = { status: 'playing', invincibleTimer: 4, phaseTimer: 0 };
  assert.equal(powerupVisualState(game, 1).kind, 'invincible');
  game.phaseTimer = 4;
  assert.equal(powerupVisualState(game, 1).kind, 'phase');
  game.status = 'paused';
  assert.equal(powerupVisualState(game, 1).kind, 'phase');
  game.status = 'results';
  assert.equal(powerupVisualState(game, 1), null);
  const { ctx, calls } = context();
  drawPowerupBackground(ctx, game, 1);
  drawPowerupForeground(ctx, game, 1);
  drawPowerupPlayerAura(ctx, game, 1, false, 100, 100, 20);
  assert.deepEqual(calls, { saved: 0, restored: 0, fills: 0, strokes: 0 });
});

test('reduced motion retains tint but narrows breathing amplitude', () => {
  const game = { status: 'playing', invincibleTimer: 5, phaseTimer: 0 };
  const early = powerupVisualState(game, 0, false);
  game.invincibleTimer = 5 - .15625;
  const peak = powerupVisualState(game, 1, false);
  const reducedPeak = powerupVisualState(game, 1, true);
  assert.ok(peak.tintAlpha > early.tintAlpha);
  assert.ok(reducedPeak.tintAlpha > 0);
  assert.ok(reducedPeak.tintAlpha < peak.tintAlpha);
});

test('background, foreground, and player aura restore canvas state', () => {
  for (const kind of ['invincible', 'phase']) {
    const game = { status: 'playing', invincibleTimer: kind === 'invincible' ? 4 : 0,
      phaseTimer: kind === 'phase' ? 4 : 0 };
    const { ctx, calls } = context();
    drawPowerupBackground(ctx, game, 0, false);
    drawPowerupForeground(ctx, game, 0, false);
    drawPowerupPlayerAura(ctx, game, 0, false, 100, 100, 20);
    assert.equal(calls.saved, 3);
    assert.equal(calls.restored, 3);
    assert.ok(calls.fills > 1);
    assert.ok(calls.strokes > 1);
  }
});

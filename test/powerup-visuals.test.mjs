import test from 'node:test';
import assert from 'node:assert/strict';
import { powerupVisualState, bulletTimeVisualState, drawBulletTimeWorld,
  drawBulletTimeMatte, drawPowerupBackground, drawPowerupForeground,
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

test('bullet time fades its world grayscale in and out while paused state holds steady', () => {
  const game = { status: 'playing', bulletTimer: 5 };
  assert.equal(bulletTimeVisualState(game).strength, 0);
  game.bulletTimer = 4.9;
  assert.ok(Math.abs(bulletTimeVisualState(game).strength - .5) < 1e-9);
  game.bulletTimer = 3;
  assert.equal(bulletTimeVisualState(game).strength, 1);
  game.status = 'paused';
  assert.equal(bulletTimeVisualState(game).strength, 1);
  game.bulletTimer = .125;
  assert.equal(bulletTimeVisualState(game).strength, .5);
  game.status = 'results';
  assert.equal(bulletTimeVisualState(game), null);
});

test('grayscale is scoped to selected world draws and restores the context', () => {
  const game = { status: 'playing', bulletTimer: 3 };
  const filters = [];
  const ctx = { filter: 'none', stack: [], save() { this.stack.push(this.filter); },
    restore() { this.filter = this.stack.pop(); } };
  drawBulletTimeWorld(ctx, game, () => filters.push(ctx.filter));
  assert.deepEqual(filters, ['grayscale(1)']);
  assert.equal(ctx.filter, 'none');
  game.bulletTimer = 0;
  drawBulletTimeWorld(ctx, game, () => filters.push(ctx.filter));
  assert.deepEqual(filters, ['grayscale(1)', 'none']);
});

test('bullet time suppresses colored world masks while retaining other player auras', () => {
  const game = { status: 'playing', bulletTimer: 3, invincibleTimer: 4, phaseTimer: 0 };
  const { ctx, calls } = context();
  drawPowerupBackground(ctx, game, 0);
  drawPowerupForeground(ctx, game, 0);
  assert.equal(calls.fills, 0);
  assert.equal(calls.strokes, 0);
  drawBulletTimeMatte(ctx, game);
  drawPowerupPlayerAura(ctx, game, 0, false, 100, 100, 20);
  assert.ok(calls.fills > 0);
  assert.ok(calls.strokes > 0);
  assert.equal(calls.saved, calls.restored);
});

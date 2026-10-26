const WIDTH = 960;
const HEIGHT = 540;
const EFFECT_DURATION = 5;

export function bulletTimeVisualState(game) {
  if (!game || !['playing', 'paused'].includes(game.status) || !(game.bulletTimer > 0)) return null;
  const remaining = Math.min(EFFECT_DURATION, game.bulletTimer);
  const elapsed = EFFECT_DURATION - remaining;
  return { elapsed, strength: Math.max(0, Math.min(1, elapsed / .2, remaining / .25)) };
}

// Scope desaturation to world layers; the player and collectible sprites are drawn later.
export function drawBulletTimeWorld(ctx, game, draw) {
  const state = bulletTimeVisualState(game);
  if (!state || state.strength <= 0) return draw();
  ctx.save();
  ctx.filter = `grayscale(${state.strength})`;
  try { return draw(); }
  finally { ctx.restore(); }
}

export function drawBulletTimeMatte(ctx, game, reducedMotion = false) {
  const state = bulletTimeVisualState(game);
  if (!state || state.strength <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(80, 80, 80, ${.11 * state.strength})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (!reducedMotion) {
    ctx.fillStyle = `rgba(255, 255, 255, ${.018 * state.strength})`;
    for (let i = 0; i < 5; i++)
      ctx.fillRect(0, (state.elapsed * 35 + i * 109) % HEIGHT, WIDTH, 1);
  }
  ctx.restore();
}

// The visual state is derived from game state so pausing also pauses the pulse.
export function powerupVisualState(game, time, reducedMotion = false) {
  if (!game || !['playing', 'paused'].includes(game.status)) return null;
  const kind = game.phaseTimer > 0 ? 'phase' : game.invincibleTimer > 0 ? 'invincible' : null;
  if (!kind) return null;
  const remaining = kind === 'phase' ? game.phaseTimer : game.invincibleTimer;
  const fade = Math.min(1, Math.max(0, remaining / .3));
  const activeTime = Math.max(0, EFFECT_DURATION - remaining);
  const wave = .5 + .5 * Math.sin(activeTime * Math.PI * 3.2);
  const pulse = reducedMotion ? .5 + (wave - .5) * .22 : wave;
  return {
    kind, pulse, fade, animationTime: activeTime,
    tintAlpha: (kind === 'invincible' ? .055 + .045 * pulse : .065 + .045 * pulse) * fade,
    edgeAlpha: (kind === 'invincible' ? .12 + .06 * pulse : .11 + .055 * pulse) * fade,
    ringAlpha: (.56 + .27 * pulse) * fade,
    rgb: kind === 'invincible' ? '248, 195, 81' : '128, 225, 232'
  };
}

function edgeGradients(ctx, state, strength) {
  const spanX = WIDTH * .19;
  const spanY = HEIGHT * .2;
  const sides = [
    [0, 0, spanX, 0, 0, 0, spanX, HEIGHT],
    [WIDTH, 0, WIDTH - spanX, 0, WIDTH - spanX, 0, spanX, HEIGHT],
    [0, 0, 0, spanY, 0, 0, WIDTH, spanY],
    [0, HEIGHT, 0, HEIGHT - spanY, 0, HEIGHT - spanY, WIDTH, spanY]
  ];
  for (const [x0, y0, x1, y1, x, y, width, height] of sides) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, `rgba(${state.rgb}, ${strength})`);
    gradient.addColorStop(1, `rgba(${state.rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }
}

export function drawPowerupBackground(ctx, game, time, reducedMotion = false) {
  if (bulletTimeVisualState(game)) return;
  const state = powerupVisualState(game, time, reducedMotion);
  if (!state) return;
  ctx.save();
  ctx.fillStyle = `rgba(${state.rgb}, ${state.tintAlpha})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  edgeGradients(ctx, state, state.edgeAlpha * .72);
  ctx.restore();
}

export function drawPowerupForeground(ctx, game, time, reducedMotion = false) {
  if (bulletTimeVisualState(game)) return;
  const state = powerupVisualState(game, time, reducedMotion);
  if (!state) return;
  ctx.save();
  edgeGradients(ctx, state, state.edgeAlpha * .65);
  ctx.strokeStyle = `rgba(${state.rgb}, ${state.edgeAlpha * .7})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
  ctx.restore();
}

function ring(ctx, x, y, radius, color, width) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawPowerupPlayerAura(ctx, game, time, reducedMotion = false, x, y, r) {
  const state = powerupVisualState(game, time, reducedMotion);
  if (!state || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return;
  ctx.save();
  const animationTime = state.animationTime;
  if (state.kind === 'invincible') {
    ctx.shadowColor = `rgba(${state.rgb}, ${state.ringAlpha * .7})`;
    ctx.shadowBlur = reducedMotion ? 8 : 16;
    ring(ctx, x, y, r * (1.24 + .09 * state.pulse),
      `rgba(${state.rgb}, ${state.ringAlpha})`, reducedMotion ? 3 : 4);
    ctx.shadowBlur = 0;
    ring(ctx, x, y, r * (1.62 + .1 * state.pulse),
      `rgba(${state.rgb}, ${state.ringAlpha * .43})`, 2);
    const count = reducedMotion ? 3 : 7;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + animationTime * (i % 2 ? -.35 : .45);
      const distance = r * (1.46 + .18 * Math.sin(animationTime * 2 + i));
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance,
        reducedMotion ? 1.5 : 1.6 + i % 3 * .45, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${state.rgb}, ${state.ringAlpha * .78})`;
      ctx.fill();
    }
  } else {
    const displacement = reducedMotion ? 2 : 4 + 1.5 * state.pulse;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + side * displacement, y - side * displacement * .35, r * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${state.rgb}, ${state.ringAlpha * .12})`;
      ctx.fill();
      ring(ctx, x + side * displacement, y - side * displacement * .35, r * 1.04,
        `rgba(${state.rgb}, ${state.ringAlpha * .37})`, 2);
    }
    ctx.setLineDash(reducedMotion ? [5, 8] : [8, 6]);
    ring(ctx, x, y, r * (1.34 + .08 * state.pulse),
      `rgba(${state.rgb}, ${state.ringAlpha * .8})`, 2.5);
  }
  ctx.restore();
}

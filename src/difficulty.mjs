export const DIFFICULTIES = Object.freeze({
  rookie: Object.freeze({ label: '菜鸟', spawn: 1.28, reward: .8, assistLimit: .12 }),
  entry: Object.freeze({ label: '入门', spawn: 1.12, reward: 1, assistLimit: .09 }),
  hard: Object.freeze({ label: '困难', spawn: .96, reward: 1.35, assistLimit: .06 }),
  nightmare: Object.freeze({ label: '噩梦', spawn: .84, reward: 1.7, assistLimit: .03 })
});

export function validDifficulty(value) { return value in DIFFICULTIES ? value : 'entry'; }

// A rolling history changes the next round only. Positive values make spawn gaps longer.
export function adaptiveAssist(history, difficulty) {
  const recent = Array.isArray(history) ? history.slice(-8) : [];
  if (recent.length < 2) return 0;
  const mean = recent.reduce((sum, round) => sum + Math.min(1, (round.deliveries || 0) / 3) * .7
    + Math.min(1, (round.time || 0) / 90) * .3, 0) / recent.length;
  const limit = DIFFICULTIES[validDifficulty(difficulty)].assistLimit;
  return Math.max(-limit, Math.min(limit, (0.5 - mean) * limit * 1.5));
}

export function spawnGapMultiplier(game) {
  const mode = DIFFICULTIES[validDifficulty(game.difficulty)];
  return mode.spawn * (1 + (game.roundAssist || 0));
}

export function rewardForRound(score, style, difficulty) {
  return Math.floor((score + style) * DIFFICULTIES[validDifficulty(difficulty)].reward);
}

export function recordRound(history, deliveries, time) {
  return [...(Array.isArray(history) ? history : []), { deliveries, time }].slice(-8);
}

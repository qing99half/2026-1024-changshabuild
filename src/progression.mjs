export const SPAWNS_PER_WAVE = 4;
export const ENEMY_UNLOCK_SCORES = Object.freeze([0, 3, 6, 9, 12, 15, 18, 22, 28]);
export const ENEMY_UNLOCK_WAVES = Object.freeze([1, 3, 5, 7, 9, 11, 13, 15, 18]);

export function waveForSpawnSlot(slot) {
  return Math.floor(Math.max(0, slot - 1) / SPAWNS_PER_WAVE) + 1;
}

export function bonusGapRange(score) {
  if (score >= 32) return [5, 5];
  if (score >= 24) return [6, 8];
  if (score >= 16) return [8, 10];
  if (score >= 8) return [10, 14];
  return [14, 18];
}

export function nextBonusGap(score, random) {
  const [minimum, maximum] = bonusGapRange(score);
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export function enemySpawnInterval(score, classic = false) {
  return classic ? Math.max(.48, 2 - score / 40) : Math.max(.8, 2 - score / 60);
}

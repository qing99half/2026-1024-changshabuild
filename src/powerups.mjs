const EXISTING_BONUSES = Object.freeze(['points', 'freeze', 'bomb']);
const NEW_BONUSES = Object.freeze([
  { kind: 'invincible', score: 4 },
  { kind: 'phase', score: 8 },
  { kind: 'bullet', score: 12 }
]);
const EFFECT_DURATION = 5;

export function chooseBonusKind(game, random) {
  game.bonusIntroduced ??= [];
  const available = NEW_BONUSES.filter(bonus => game.score >= bonus.score);
  const debut = available.find(bonus => !game.bonusIntroduced.includes(bonus.kind));
  if (debut) {
    game.bonusIntroduced.push(debut.kind);
    return debut.kind;
  }
  const pool = [...EXISTING_BONUSES, ...available.map(bonus => bonus.kind)];
  return pool[Math.floor(random() * pool.length)];
}

export function applyPowerup(game, kind) {
  if (kind === 'invincible') {
    game.invincibleTimer = EFFECT_DURATION;
    game.phaseTimer = 0;
  } else if (kind === 'phase') {
    game.phaseTimer = EFFECT_DURATION;
    game.invincibleTimer = 0;
  } else if (kind === 'bullet') {
    game.bulletTimer = EFFECT_DURATION;
  } else return false;
  return true;
}

export function stepPowerups(game, dt) {
  for (const key of ['invincibleTimer', 'phaseTimer', 'bulletTimer']) {
    game[key] = Math.max(0, (game[key] || 0) - dt);
  }
}

export function playerSpeedMultiplier(game) {
  return game.bulletTimer > 0 ? 1.5 : 1;
}

export function enemySpeedMultiplier(game) {
  if (game.freezeTimer > 0) return 0;
  return game.bulletTimer > 0 ? 0.5 : 1;
}

export function spawnSpeedMultiplier(game) {
  return enemySpeedMultiplier(game);
}

export function enemyContactEffect(game) {
  if (game.phaseTimer > 0) return 'ignore';
  if (game.invincibleTimer > 0) return 'shatter';
  return 'normal';
}

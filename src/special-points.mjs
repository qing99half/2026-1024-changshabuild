export const INITIAL_SPECIAL_POINT_STATE = Object.freeze({
  pointCount: 0,
  nextSpecialPointAt: 12,
  specialDebuts: 0,
  normalDeliveries: 0,
  wave: 1
});

function classicMaxGap(score) {
  if (score >= 20) return 2;
  if (score >= 10) return 3;
  return 4;
}

function gapRange(score) {
  if (score >= 32) return [3, 5];
  if (score >= 16) return [4, 6];
  return [5, 7];
}

function drawGap(score, random, classic) {
  if (classic) {
    const upper = classicMaxGap(score);
    return upper === 2 ? 2 : 2 + Math.floor(random() * (upper - 1));
  }
  const [lower, upper] = gapRange(score);
  return lower + Math.floor(random() * (upper - lower + 1));
}

// Called after the previous point returns; a spawned debut has been delivered.
export function nextPointKind(state, score, random, classic = false) {
  const pointCount = state.pointCount + 1;
  const debuts = state.specialDebuts;
  const normalDeliveries = state.normalDeliveries ?? 0;
  const wave = state.wave ?? 1;

  if (!classic && debuts < 2) {
    const ready = debuts === 0
      ? normalDeliveries >= 12 && wave >= 6
      : normalDeliveries >= 20 && wave >= 10;
    if (!ready) return { kind: 'normal', pointCount,
      nextSpecialPointAt: state.nextSpecialPointAt, specialDebuts: debuts };
  } else {
    const upper = classic ? classicMaxGap(score) : gapRange(score)[1];
    const target = debuts === 0 ? state.nextSpecialPointAt
      : Math.min(state.nextSpecialPointAt, upper);
    if (pointCount < target) return { kind: 'normal', pointCount,
      nextSpecialPointAt: target, specialDebuts: debuts };
  }

  const kind = debuts === 0 ? 'turn'
    : debuts === 1 ? 'angle45'
      : random() < (score < 10 ? .55 : .5) ? 'turn' : 'angle45';
  return {
    kind,
    pointCount: 0,
    nextSpecialPointAt: drawGap(score, random, classic),
    specialDebuts: Math.min(2, debuts + 1)
  };
}

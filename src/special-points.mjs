export const INITIAL_SPECIAL_POINT_STATE = Object.freeze({
  pointCount: 0,
  nextSpecialPointAt: 8,
  specialDebuts: 0
});

function maxGap(score) {
  if (score >= 20) return 2;
  if (score >= 10) return 3;
  return 4;
}

function nextGap(score, random) {
  const upper = maxGap(score);
  return upper === 2 ? 2 : 2 + Math.floor(random() * (upper - 1));
}

// Called exactly once whenever the previous point finishes returning to the goal.
// specialDebuts is 0 before the guaranteed left-turn point, 1 before the
// guaranteed 45-degree point, and 2 thereafter. The first point of the round
// is provided by startRound and is not counted here.
export function nextPointKind(state, score, random) {
  const pointCount = state.pointCount + 1;
  const nextSpecialPointAt = state.specialDebuts === 0
    ? state.nextSpecialPointAt
    : Math.min(state.nextSpecialPointAt, maxGap(score));
  if (pointCount < nextSpecialPointAt) {
    return { kind: 'normal', pointCount, nextSpecialPointAt, specialDebuts: state.specialDebuts };
  }

  const kind = state.specialDebuts === 0 ? 'turn'
    : state.specialDebuts === 1 ? 'angle45'
      : random() < (score < 10 ? .55 : .5) ? 'turn' : 'angle45';
  return {
    kind,
    pointCount: 0,
    nextSpecialPointAt: nextGap(score, random),
    specialDebuts: Math.min(2, state.specialDebuts + 1)
  };
}

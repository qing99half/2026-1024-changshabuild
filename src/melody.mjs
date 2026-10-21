// Musical turns use pitch-shifted Righty Tighty XL Bing/Bong samples.
// The soundtrack's stable pitch-class profile is closest to G minor; all turn
// notes stay within G minor pentatonic (G, Bb, C, D, F).
export const MELODY_BPM = 128;
export const MELODY_SIXTEENTH = 60 / MELODY_BPM / 4;
export const MUSIC_BEAT_PHASE = 0.025;
export const TURN_BANDS = Object.freeze([
  Object.freeze(['turn-upper-up', 'turn-upper-right', 'turn-upper-down', 'turn-upper-left']),
  Object.freeze(['turn-middle-up', 'turn-middle-right', 'turn-middle-down', 'turn-middle-left']),
  Object.freeze(['turn-lower-up', 'turn-lower-right', 'turn-lower-down', 'turn-lower-left'])
]);

export function turnTone(y, direction) {
  if (!Number.isFinite(y) || !Number.isInteger(direction) || direction < 0 || direction > 3) return null;
  const band = y > 1.28 ? 0 : y < -1.28 ? 2 : 1;
  return { band, id: TURN_BANDS[band][direction] };
}

export function nextMelodyDelay(musicTime, musicRate = 1) {
  if (!Number.isFinite(musicTime) || !Number.isFinite(musicRate) || musicRate <= 0) return 0;
  // A few milliseconds of tolerance make an input on the grid immediate.
  const index = Math.ceil((musicTime - MUSIC_BEAT_PHASE - 0.006) / MELODY_SIXTEENTH);
  const target = MUSIC_BEAT_PHASE + index * MELODY_SIXTEENTH;
  // Keep controls audible during the original game's freeze slow-motion.
  return Math.max(0, Math.min((target - musicTime) / musicRate, 0.14));
}

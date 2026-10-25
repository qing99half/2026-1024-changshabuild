export const DEFAULT_VOLUMES = Object.freeze({ turn: 100, effects: 100, music: 100 });
export const VOLUME_MIN = 50;
export const VOLUME_MAX = 200;
export const VOICE_SCALE = Object.freeze([65, 67, 70, 72, 74]); // G minor pentatonic notes near the source voices
export const VOICE_SAMPLE_MIDI = Object.freeze({
  ha_new: 72.732, ji_new: 67.5550621928, mi_new: 65.4764132511,
  da: 71.1950846771, gou: 65.5950930881, jiao: 71.1226079346
});
export const KOBE_VOICE_CLIPS = Object.freeze(['kobe-man', 'kobe-mamba-out', 'kobe-what-can-i-say']);

export function chooseKobeClip(random = Math.random) {
  return KOBE_VOICE_CLIPS[Math.min(KOBE_VOICE_CLIPS.length - 1,
    Math.floor(Math.max(0, random()) * KOBE_VOICE_CLIPS.length))];
}

export function normalizeVolume(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(number))) : 100;
}

export function normalizeVolumes(values = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_VOLUMES).map(key => [key, normalizeVolume(values?.[key])]));
}

const PHRASES = Object.freeze({
  turn: { count: 1, movement: 0, gain: .34, duration: .22 },
  pickup: { count: 1, movement: 0, gain: .34, duration: .23 },
  deliver: { count: 2, movement: 1, gain: .30, duration: .21 },
  'deliver-turn': { count: 2, movement: -1, gain: .32, duration: .23 },
  bonus: { count: 3, movement: 1, gain: .28, duration: .20 },
  freeze: { count: 2, movement: -1, gain: .31, duration: .27 },
  bomb: { count: 3, movement: -1, gain: .30, duration: .21 },
  eliminate: { count: 2, movement: -1, gain: .32, duration: .20 },
  die: { count: 3, movement: -1, gain: .32, duration: .27 }
});

function pick(array, random) {
  return array[Math.min(array.length - 1, Math.floor(Math.max(0, random()) * array.length))];
}

export function chooseVoicePhrase(kind, samples, event = {}, state = {}, random = Math.random) {
  const rule = PHRASES[kind];
  if (!rule || !Array.isArray(samples) || samples.length < 2) return null;
  const preferred = kind === 'turn'
    ? [4, 2, 1][Math.max(0, Math.min(2, event.toneBand ?? 1))]
    : kind === 'die' ? 3 : kind === 'bonus' ? 1 : 2;
  const low = rule.movement < 0 ? rule.count - 1 : 0;
  const high = rule.movement > 0 ? VOICE_SCALE.length - rule.count : VOICE_SCALE.length - 1;
  const candidates = [preferred - 1, preferred, preferred + 1].filter(index => index >= low && index <= high);
  let index = pick(candidates.length ? candidates : [Math.max(low, Math.min(high, preferred))], random);
  const phrase = [];
  for (let i = 0; i < rule.count; i++) {
    const previous = state.lastSample;
    const choices = samples.filter(name => name !== previous);
    const close = choices.filter(name => Math.abs(VOICE_SCALE[index] - VOICE_SAMPLE_MIDI[name]) <= 7);
    const sample = pick(close.length ? close : choices, random);
    state.lastSample = sample;
    phrase.push({ sample, midi: VOICE_SCALE[index], offset: i, gain: rule.gain, duration: rule.duration });
    if (i < rule.count - 1) index += rule.movement;
  }
  return phrase;
}

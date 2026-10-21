import { TURN_BANDS, TURN_MIDI, MELODY_SIXTEENTH, nextMelodyDelay } from './melody.mjs';
import { SKINS } from './skins.mjs';

// AudioClip references below come from the installed game's AudioManager component.
// Each WAV is decoded from that game's FSB5 resource without changing its samples.
const CLIPS = [87, 88, 89, 90, 91, 92, 93, 94, 95, 97, 98, 99, 100, 103];
const EXPLOSIONS = [91, 97, 90, 95]; // The fifth serialized clip is never selected by Random.Range(0, 4).
const MELODY_NOTES = TURN_BANDS.flat();
export const SFX_GAIN_MULTIPLIER = 1.5;
const VOICE_SETS = Object.freeze({
  hajimi: ['ha_new', 'ji_new', 'mi_new'],
  dagou: ['da', 'gou', 'jiao']
});
const VOICE_MIDI = Object.freeze({
  ha_new: 72.732, ji_new: 67.5550621928, mi_new: 65.4764132511,
  da: 71.1950846771, gou: 65.5950930881, jiao: 71.1226079346
});
const VOICE_GAIN = Object.freeze({
  ha_new: 1.2834, ji_new: 1.4778, mi_new: 1.4846,
  da: 1, gou: 1.0129, jiao: .9536
});
const SKIN_TONES = Object.freeze([
  {},
  { filter: 'highpass', frequency: 650, duration: .18 },
  { filter: 'lowpass', frequency: 1800, duration: .28 },
  { filter: 'lowpass', frequency: 3000, echo: .045, echoGain: .16 },
  { filter: 'highpass', frequency: 1300, duration: .13 },
  { filter: 'highpass', frequency: 520, echo: MELODY_SIXTEENTH, echoGain: .18 },
  { filter: 'lowpass', frequency: 2600, duration: .11 },
  { filter: 'lowpass', frequency: 950, duration: .29 },
  { filter: 'bandpass', frequency: 2200, duration: .12 },
  { filter: 'highpass', frequency: 900, echo: MELODY_SIXTEENTH, echoGain: .12 },
  {}, {}
]);

let context;
let effectsBus;
let buffers = new Map();
let melodyBuffers = new Map();
let voiceBuffers = new Map();
const voiceLoading = new Map();
let loading;
let music;
let melodicMode = true;
const activeNotes = [];
const activeVoices = [];

export function setMelodicMode(enabled) { melodicMode = Boolean(enabled); }

function audioContext() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    effectsBus = context.createGain();
    effectsBus.gain.value = SFX_GAIN_MULTIPLIER;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 8;
    limiter.attack.value = .003;
    limiter.release.value = .12;
    effectsBus.connect(limiter).connect(context.destination);
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

export function preloadVoiceSet(voice) {
  if (!VOICE_SETS[voice]) return Promise.resolve();
  if (voiceLoading.has(voice)) return voiceLoading.get(voice);
  const promise = Promise.all(VOICE_SETS[voice].map(async name => {
    try {
      const response = await fetch(`/assets/audio/guest/${name}.wav`);
      if (response.ok) voiceBuffers.set(name, await audioContext().decodeAudioData(await response.arrayBuffer()));
    } catch { /* Fall back to the calibrated original note. */ }
  }));
  voiceLoading.set(voice, promise);
  return promise;
}

function styleFor(event) { return SKIN_TONES[event.skinIndex] || SKIN_TONES[0]; }

function connectEffect(source, volume, style) {
  let output = source;
  let filter;
  if (style?.filter) {
    filter = audioContext().createBiquadFilter();
    filter.type = style.filter;
    filter.frequency.value = style.frequency;
    output.connect(filter);
    output = filter;
  }
  output.connect(volume).connect(effectsBus);
  return () => { source.disconnect(); filter?.disconnect(); volume.disconnect(); };
}

export function preloadAudio() {
  if (loading) return loading;
  const original = CLIPS.map(async id => {
    try {
      const response = await fetch(`/assets/audio/clip-${id}.wav`);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      buffers.set(id, await audioContext().decodeAudioData(arrayBuffer));
    } catch { /* Audio remains optional if a browser denies playback. */ }
  });
  const melodic = MELODY_NOTES.map(async id => {
    try {
      const response = await fetch(`/assets/audio/melodic/${id}.wav`);
      if (!response.ok) return;
      melodyBuffers.set(id, await audioContext().decodeAudioData(await response.arrayBuffer()));
    } catch { /* The original effect remains available if a derived note fails. */ }
  });
  loading = Promise.all([...original, ...melodic]);
  return loading;
}

function random(lo, hi) { return lo + Math.random() * (hi - lo); }

function sample(id, { pitch = 1, gain = 1, duration, style } = {}) {
  try {
    const buffer = buffers.get(id);
    if (!buffer) {
      audioContext();
      preloadAudio().then(() => { if (buffers.has(id)) sample(id, { pitch, gain, duration, style }); });
      return;
    }
    const ctx = audioContext();
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    volume.gain.value = gain;
    const cutoff = duration || style?.duration;
    if (cutoff) volume.gain.linearRampToValueAtTime(0.001, ctx.currentTime + cutoff);
    const cleanup = connectEffect(source, volume, style);
    source.onended = cleanup;
    source.start();
    if (cutoff) source.stop(ctx.currentTime + cutoff + .015);
  } catch { /* Audio remains optional. */ }
}

function note(id, gain = 0.4, offset = 0, style = null, echo = true) {
  try {
    const buffer = melodyBuffers.get(id);
    if (!buffer) return;
    const ctx = audioContext();
    const delay = music && !music.paused
      ? nextMelodyDelay(music.currentTime, music.playbackRate)
      : 0;
    const when = ctx.currentTime + delay + offset;
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    // Original music changes both tempo and pitch during freeze and death.
    source.playbackRate.value = music?.playbackRate || 1;
    volume.gain.setValueAtTime(gain, when);
    if (style?.duration) volume.gain.linearRampToValueAtTime(.001, when + style.duration);
    const cleanup = connectEffect(source, volume, style);
    activeNotes.push(source);
    if (activeNotes.length > 6) {
      const oldest = activeNotes.shift();
      try { oldest.stop(ctx.currentTime + 0.01); } catch { /* Already ended. */ }
    }
    source.onended = () => {
      const index = activeNotes.indexOf(source);
      if (index >= 0) activeNotes.splice(index, 1);
      cleanup();
    };
    source.start(when);
    if (style?.duration) source.stop(when + style.duration + .015);
    if (echo && style?.echo) note(id, gain * style.echoGain, offset + style.echo, { ...style, echo: 0 }, false);
  } catch { /* Audio remains optional. */ }
}

function voice(name, midi, gain = .34, offset = 0, duration = .22) {
  const buffer = voiceBuffers.get(name);
  if (!buffer || !Number.isFinite(midi)) return false;
  try {
    const ctx = audioContext();
    const gridDelay = music && !music.paused
      ? nextMelodyDelay(music.currentTime, music.playbackRate) : 0;
    const when = ctx.currentTime + gridDelay + offset;
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    const baseRate = Math.pow(2, (midi - VOICE_MIDI[name]) / 12);
    source.playbackRate.value = baseRate * (music?.playbackRate || 1);
    volume.gain.setValueAtTime(gain * VOICE_GAIN[name], when);
    volume.gain.setValueAtTime(gain * VOICE_GAIN[name], when + Math.max(.03, duration - .04));
    volume.gain.linearRampToValueAtTime(.001, when + duration);
    source.connect(volume).connect(effectsBus);
    activeVoices.push({ source, baseRate });
    if (activeVoices.length > 3) {
      const oldest = activeVoices.shift();
      try { oldest.source.stop(ctx.currentTime + .02); } catch { /* Already ended. */ }
    }
    source.onended = () => {
      const index = activeVoices.findIndex(item => item.source === source);
      if (index >= 0) activeVoices.splice(index, 1);
      source.disconnect(); volume.disconnect();
    };
    source.start(when);
    source.stop(when + duration + .015);
    return true;
  } catch { return false; }
}

function playSkinVoice(kind, event) {
  const set = VOICE_SETS[SKINS[event.skinIndex]?.voice];
  if (!set || !set.every(name => voiceBuffers.has(name))) return false;
  const band = Math.max(0, Math.min(2, event.toneBand ?? 1));
  if (kind === 'turn') return voice(set[band], TURN_MIDI[band][event.dir], .34);
  if (kind === 'pickup') return voice(set[2], 74, .36, 0, .25);
  if (kind === 'deliver' || kind === 'deliver-turn') {
    const sequence = kind === 'deliver-turn' ? [...set].reverse() : set;
    const notes = kind === 'deliver-turn' ? [74, 70, 67] : [67, 70, 74];
    sequence.forEach((name, index) => voice(name, notes[index], .30, index * MELODY_SIXTEENTH, .19));
    return true;
  }
  return false;
}

function explode() { sample(EXPLOSIONS[Math.floor(Math.random() * EXPLOSIONS.length)], { pitch: random(.95, 1.05) }); }

export function playAudioEvent(kind, event = {}) {
  const style = styleFor(event);
  switch (kind) {
    case 'turn':
      if (playSkinVoice(kind, event)) {
        sample(91, { gain: .09, duration: .025 });
        break;
      }
      if (melodicMode && melodyBuffers.has(event.toneId)) {
        sample(91, { gain: .09, duration: .025 }); // immediate original transient
        note(event.toneId, .4, 0, style);
      } else sample(94, { pitch: random(.8, .85), gain: .4, style });
      break;
    case 'pickup':
      if (playSkinVoice(kind, event)) break;
      if (melodicMode && melodyBuffers.has('turn-upper-down')) note('turn-upper-down', .52, 0, style); // D5
      else sample(87, { pitch: random(.95, 1.05) });
      break;
    case 'deliver':
      if (playSkinVoice(kind, event)) break;
      if (melodicMode && melodyBuffers.has('turn-middle-left')) note('turn-middle-left', .65, 0, style); // G4
      else sample(94);
      break;
    case 'deliver-turn':
      sample(99, { pitch: .8, gain: melodicMode ? .5 : 1 });
      if (playSkinVoice(kind, event)) break;
      if (melodicMode) {
        note('turn-middle-left', .48, 0, style); // G4
        note('turn-upper-up', .4, MELODY_SIXTEENTH, style); // G5
      }
      break;
    case 'goal-burst': explode(); break;
    case 'point-spawn': sample(103); break;
    case 'near-miss':
      if (melodicMode && melodyBuffers.has('turn-upper-right')) note('turn-upper-right', .46); // F5
      else sample(87);
      break;
    case 'enemy-explode': explode(); break;
    case 'bonus': sample(93); break;
    case 'freeze': sample(93); sample(92, { pitch: .52, gain: .85 }); break;
    case 'bomb': sample(93); sample(88, { gain: .5 }); explode(); break;
    case 'die': explode(); sample(88, { gain: .5 }); sample(89); break;
    case 'unlock': sample(98, { pitch: .8, gain: .65 }); break;
    case 'menu-click': sample(91, { pitch: random(1.2, 1.4) }); break;
    case 'menu-no': sample(100, { gain: .5 }); break;
  }
}

export function startMusic() {
  try {
    music ||= new Audio('/assets/audio/music-101.mp3');
    music.loop = true;
    music.volume = .4;
    music.play().catch(() => {});
  } catch { /* Music remains optional. */ }
}

export function pauseMusic() {
  if (music) music.pause();
  for (const source of activeNotes.splice(0)) {
    try { source.stop(context.currentTime + 0.01); } catch { /* Already ended. */ }
  }
  for (const item of activeVoices.splice(0)) {
    try { item.source.stop(context.currentTime + .01); } catch { /* Already ended. */ }
  }
}

export function setMusicPitch(pitch) {
  if (music) music.playbackRate = pitch;
  if (!context) return;
  for (const source of activeNotes) {
    source.playbackRate.setTargetAtTime(pitch, context.currentTime, 0.015);
  }
  for (const item of activeVoices) {
    item.source.playbackRate.setTargetAtTime(item.baseRate * pitch, context.currentTime, .015);
  }
}

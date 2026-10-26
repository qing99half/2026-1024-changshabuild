import { TURN_BANDS, MELODY_SIXTEENTH, nextMelodyDelay } from './melody.mjs';
import { SKINS } from './skins.mjs';
import { chooseVoicePhrase, chooseKobeClip, KOBE_VOICE_CLIPS, normalizeVolumes, VOICE_SAMPLE_MIDI } from './audio-policy.mjs';

// AudioClip references below come from the installed game's AudioManager component.
// Each WAV is decoded from that game's FSB5 resource without changing its samples.
const CLIPS = [87, 88, 89, 90, 91, 92, 93, 94, 95, 97, 98, 99, 100, 103];
const EXPLOSIONS = [91, 97, 90, 95]; // The fifth serialized clip is never selected by Random.Range(0, 4).
const MELODY_NOTES = TURN_BANDS.flat();
export const SFX_GAIN_MULTIPLIER = 1;
export const ORIGINAL_TURN = Object.freeze({ clip: 94, gain: .4, minPitch: .8, maxPitch: .85, voices: 3 });
const VOICE_SETS = Object.freeze({
  hajimi: ['ha_new', 'ji_new', 'mi_new'],
  dagou: ['da', 'gou', 'jiao']
});
const CHARACTER_SETS = Object.freeze({ 12: ['tes-whip'], 13: KOBE_VOICE_CLIPS });
const CHARACTER_GAIN = Object.freeze({
  // At default sliders, the whip's active RMS is about 10% above the TES theme's median short-window RMS.
  'tes-whip': 1.21, 'kobe-man': .42, 'kobe-mamba-out': .46, 'kobe-what-can-i-say': .54
});
const MUSIC_TRACKS = Object.freeze({
  default: 'assets/audio/music-101.mp3',
  tes: 'assets/audio/tes-theme.mp3'
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
let turnBus;
let effectsBus;
let musicBus;
let volumeLevels = normalizeVolumes();
let buffers = new Map();
let melodyBuffers = new Map();
let voiceBuffers = new Map();
const voiceLoading = new Map();
const characterBuffers = new Map();
const characterLoading = new Map();
let activeKobeVoice = null;
let loading;
let music;
let musicTrack = 'default';
let musicFilter;
let musicGain;
let musicMood = 'normal';
let musicFadeTimer;
let melodicMode = false;
const activeNotes = [];
const activeVoices = [];
const turnSources = Array(ORIGINAL_TURN.voices).fill(null);
let nextTurnSource = 0;
const voiceStates = new Map();
let lastEliminateVoiceAt = -Infinity;
let lastEliminateSoundAt = -Infinity;

export function setMelodicMode(enabled) { melodicMode = Boolean(enabled); }

export function setVolumeLevels(values) {
  volumeLevels = normalizeVolumes({ ...volumeLevels, ...values });
  if (context) {
    const now = context.currentTime;
    for (const [bus, key] of [[turnBus, 'turn'], [effectsBus, 'effects'], [musicBus, 'music']]) {
      bus.gain.cancelScheduledValues(now);
      if (context.state === 'running') bus.gain.setTargetAtTime(volumeLevels[key] / 100, now, .01);
      else bus.gain.setValueAtTime(volumeLevels[key] / 100, now);
    }
  }
  return { ...volumeLevels };
}

function audioContext() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    turnBus = context.createGain();
    effectsBus = context.createGain();
    musicBus = context.createGain();
    turnBus.gain.value = volumeLevels.turn / 100;
    effectsBus.gain.value = SFX_GAIN_MULTIPLIER * volumeLevels.effects / 100;
    musicBus.gain.value = volumeLevels.music / 100;
    turnBus.connect(context.destination);
    effectsBus.connect(context.destination);
    musicBus.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

export async function unlockAudio() {
  const ctx = audioContext();
  if (ctx.state === 'suspended') await ctx.resume();
}

export function preloadVoiceSet(voice) {
  if (!VOICE_SETS[voice]) return Promise.resolve();
  if (voiceLoading.has(voice)) return voiceLoading.get(voice);
  const promise = Promise.all(VOICE_SETS[voice].map(async name => {
    try {
      const response = await fetch(`assets/audio/guest/${name}.wav`);
      if (response.ok) voiceBuffers.set(name, await audioContext().decodeAudioData(await response.arrayBuffer()));
    } catch { /* Fall back to the calibrated original note. */ }
  })).then(() => {
    if (!VOICE_SETS[voice].every(name => voiceBuffers.has(name))) voiceLoading.delete(voice);
  });
  voiceLoading.set(voice, promise);
  return promise;
}

export function preloadCharacterAudio(skinIndex) {
  const set = CHARACTER_SETS[skinIndex];
  if (!set || set.every(name => characterBuffers.has(name))) return Promise.resolve();
  if (characterLoading.has(skinIndex)) return characterLoading.get(skinIndex);
  const promise = Promise.all(set.map(async name => {
    try {
      const response = await fetch(`assets/audio/character/${name}.mp3`);
      if (response.ok) characterBuffers.set(name, await audioContext().decodeAudioData(await response.arrayBuffer()));
    } catch { /* The standard effect remains available if a supplied clip cannot load. */ }
  })).finally(() => characterLoading.delete(skinIndex));
  characterLoading.set(skinIndex, promise);
  return promise;
}

function styleFor(event) { return SKIN_TONES[event.skinIndex] || SKIN_TONES[0]; }

function connectEffect(source, volume, style, channel = 'effects') {
  let output = source;
  let filter;
  if (style?.filter) {
    filter = audioContext().createBiquadFilter();
    filter.type = style.filter;
    filter.frequency.value = style.frequency;
    output.connect(filter);
    output = filter;
  }
  output.connect(volume).connect(channel === 'turn' ? turnBus : effectsBus);
  return () => { source.disconnect(); filter?.disconnect(); volume.disconnect(); };
}

export function preloadAudio() {
  if (loading) return loading;
  const original = CLIPS.map(async id => {
    try {
      const response = await fetch(`assets/audio/clip-${id}.wav`);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      buffers.set(id, await audioContext().decodeAudioData(arrayBuffer));
    } catch { /* Audio remains optional if a browser denies playback. */ }
  });
  const melodic = MELODY_NOTES.map(async id => {
    try {
      const response = await fetch(`assets/audio/melodic/${id}.wav`);
      if (!response.ok) return;
      melodyBuffers.set(id, await audioContext().decodeAudioData(await response.arrayBuffer()));
    } catch { /* The original effect remains available if a derived note fails. */ }
  });
  const elimination = (async () => {
    try {
      const response = await fetch('assets/audio/eliminate.wav');
      if (response.ok) buffers.set('eliminate', await audioContext().decodeAudioData(await response.arrayBuffer()));
    } catch { /* Use an original explosion if the separate cue cannot load. */ }
  })();
  loading = Promise.all([...original, ...melodic, elimination]);
  return loading;
}

function random(lo, hi) { return lo + Math.random() * (hi - lo); }

function sample(id, { pitch = 1, gain = 1, duration, style, delay = 0, channel = 'effects' } = {}) {
  try {
    const buffer = buffers.get(id);
    if (!buffer) {
      audioContext();
      preloadAudio().then(() => { if (buffers.has(id)) sample(id, { pitch, gain, duration, style, delay, channel }); });
      return;
    }
    const ctx = audioContext();
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    volume.gain.value = gain;
    const cutoff = duration || style?.duration;
    if (cutoff) volume.gain.linearRampToValueAtTime(0.001, ctx.currentTime + delay + cutoff);
    const cleanup = connectEffect(source, volume, style, channel);
    source.onended = cleanup;
    source.start(ctx.currentTime + delay);
    if (cutoff) source.stop(ctx.currentTime + delay + cutoff + .015);
  } catch { /* Audio remains optional. */ }
}

function originalTurn() {
  const buffer = buffers.get(ORIGINAL_TURN.clip);
  if (!buffer) {
    preloadAudio().then(() => { if (buffers.has(ORIGINAL_TURN.clip)) originalTurn(); });
    return;
  }
  try {
    const ctx = audioContext();
    const slot = nextTurnSource;
    nextTurnSource = (slot + 1) % turnSources.length;
    try { turnSources[slot]?.stop(); } catch { /* The previous voice may already have ended. */ }
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = random(ORIGINAL_TURN.minPitch, ORIGINAL_TURN.maxPitch);
    volume.gain.value = ORIGINAL_TURN.gain;
    const cleanup = connectEffect(source, volume, null, 'turn');
    turnSources[slot] = source;
    source.onended = () => { if (turnSources[slot] === source) turnSources[slot] = null; cleanup(); };
    source.start();
  } catch { /* Audio remains optional if the browser denies playback. */ }
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
    source.playbackRate.value = 1;
    volume.gain.setValueAtTime(gain, when);
    if (style?.duration) volume.gain.linearRampToValueAtTime(.001, when + style.duration);
    const cleanup = connectEffect(source, volume, style, 'turn');
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

function voice(name, midi, gain = .34, offset = 0, duration = .22, channel = 'effects', quantize = true) {
  const buffer = voiceBuffers.get(name);
  if (!buffer || !Number.isFinite(midi)) return false;
  try {
    const ctx = audioContext();
    const gridDelay = quantize && music && !music.paused
      ? nextMelodyDelay(music.currentTime, music.playbackRate) : 0;
    const when = ctx.currentTime + gridDelay + offset;
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    const baseRate = Math.pow(2, (midi - VOICE_SAMPLE_MIDI[name]) / 12);
    source.playbackRate.value = baseRate;
    volume.gain.setValueAtTime(gain * VOICE_GAIN[name], when);
    volume.gain.setValueAtTime(gain * VOICE_GAIN[name], when + Math.max(.03, duration - .04));
    volume.gain.linearRampToValueAtTime(.001, when + duration);
    source.connect(volume).connect(channel === 'turn' ? turnBus : effectsBus);
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

function playRandomSkinVoice(kind, event) {
  const voiceName = SKINS[event.skinIndex]?.voice;
  const set = VOICE_SETS[voiceName]?.filter(name => voiceBuffers.has(name));
  if (!set || set.length < 2) return false;
  const state = voiceStates.get(voiceName) || {};
  const phrase = chooseVoicePhrase(kind, set, event, state);
  if (!phrase) return false;
  voiceStates.set(voiceName, state);
  const channel = kind === 'turn' ? 'turn' : 'effects';
  return phrase.map(note => voice(note.sample, note.midi, note.gain,
    note.offset * MELODY_SIXTEENTH, note.duration, channel, kind !== 'turn')).some(Boolean);
}

function characterClip(name, channel, quantize = false) {
  const buffer = characterBuffers.get(name);
  if (!buffer) return false;
  try {
    const ctx = audioContext();
    const delay = quantize && music && !music.paused
      ? nextMelodyDelay(music.currentTime, music.playbackRate) : 0;
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    volume.gain.value = CHARACTER_GAIN[name];
    source.connect(volume).connect(channel === 'turn' ? turnBus : effectsBus);
    if (name.startsWith('kobe-')) activeKobeVoice = source;
    source.onended = () => {
      if (activeKobeVoice === source) activeKobeVoice = null;
      source.disconnect(); volume.disconnect();
    };
    source.start(ctx.currentTime + delay);
    return true;
  } catch { return false; }
}

function playKobeVoice(kind) {
  if (!['turn', 'pickup', 'deliver', 'deliver-turn', 'bonus', 'freeze', 'bomb', 'eliminate', 'die'].includes(kind)) return false;
  if (activeKobeVoice || !KOBE_VOICE_CLIPS.every(name => characterBuffers.has(name))) return false;
  return characterClip(chooseKobeClip(), kind === 'turn' ? 'turn' : 'effects', true);
}

function explode() { sample(EXPLOSIONS[Math.floor(Math.random() * EXPLOSIONS.length)], { pitch: random(.95, 1.05) }); }

function eliminate() {
  const now = Date.now();
  if (now - lastEliminateSoundAt < 80) return;
  lastEliminateSoundAt = now;
  if (buffers.has('eliminate')) sample('eliminate', { gain: .7, pitch: random(.96, 1.04) });
  else preloadAudio().then(() => {
    if (buffers.has('eliminate')) sample('eliminate', { gain: .7, pitch: random(.96, 1.04) });
    else explode();
  });
}

export function previewEliminate() { eliminate(); }

export function playAudioEvent(kind, event = {}) {
  const style = styleFor(event);
  const hasUncalibratedMusic = Boolean(SKINS[event.skinIndex]?.music);
  const voiceName = melodicMode && SKINS[event.skinIndex]?.voice;
  const voiceSet = VOICE_SETS[voiceName];
  const voiceReady = Boolean(voiceSet && voiceSet.filter(name => voiceBuffers.has(name)).length >= 2);
  const erasure = kind === 'enemy-explode' && ['near-miss', 'bomb'].includes(event.source);
  if (kind === 'turn' && event.skinIndex === 12 && characterClip('tes-whip', 'turn')) return;
  if (event.skinIndex === 12 && kind === 'turn') preloadCharacterAudio(12);
  if (melodicMode && event.skinIndex === 13) {
    if (kind === 'near-miss' || kind === 'goal-burst' || kind === 'point-spawn') return;
    const voiceKind = erasure ? 'eliminate' : ['invincible', 'phase', 'bullet'].includes(kind) ? 'bonus' : kind;
    if (voiceKind === 'eliminate') {
      const now = Date.now();
      if (now - lastEliminateVoiceAt < 100) return;
      lastEliminateVoiceAt = now;
    }
    if (playKobeVoice(voiceKind)) return;
    if (!KOBE_VOICE_CLIPS.every(name => characterBuffers.has(name))) preloadCharacterAudio(13);
  }
  if (voiceReady) {
    if (kind === 'near-miss' || kind === 'goal-burst' || kind === 'point-spawn') return;
    const voiceKind = erasure ? 'eliminate' : ['invincible', 'phase', 'bullet'].includes(kind) ? 'bonus' : kind;
    if (voiceKind === 'eliminate') {
      const now = Date.now();
      if (now - lastEliminateVoiceAt < 100) return;
      lastEliminateVoiceAt = now;
    }
    if (playRandomSkinVoice(voiceKind, event)) return;
  }
  switch (kind) {
    case 'turn':
      if (!melodicMode || hasUncalibratedMusic) { originalTurn(); break; }
      if (melodicMode && melodyBuffers.has(event.toneId)) {
        sample(91, { gain: .09, duration: .025, channel: 'turn' }); // immediate original transient
        note(event.toneId, .4, 0, style);
      } else originalTurn();
      break;
    case 'pickup':
      if (melodicMode && !hasUncalibratedMusic && melodyBuffers.has('turn-upper-down')) note('turn-upper-down', .52, 0, style); // D5
      else sample(87, { pitch: random(.95, 1.05) });
      break;
    case 'deliver':
      sample(94);
      break;
    case 'deliver-turn':
      sample(99, { pitch: .8 });
      break;
    case 'goal-burst': explode(); break;
    case 'point-spawn': sample(103); break;
    case 'near-miss':
      sample(87, { gain: event.grade === 'extreme' ? .44 : .36,
        pitch: event.grade === 'extreme' ? 1.035 : 1 });
      break;
    case 'enemy-explode':
      if (erasure) eliminate();
      else explode();
      break;
    case 'bonus': sample(93); break;
    case 'invincible': sample(93); sample(98, { pitch: 1.12, gain: .35 }); break;
    case 'phase': sample(93); sample(92, { pitch: 1.18, gain: .32 }); break;
    case 'bullet': sample(93); sample(99, { pitch: 1.16, gain: .3 }); break;
    case 'freeze': sample(93); sample(92, { pitch: .52, gain: .85 }); break;
    case 'bomb': sample(93); sample(88, { gain: .5 }); explode(); break;
    case 'die': explode(); sample(88, { gain: .5 }); sample(89); break;
    case 'unlock': sample(98, { pitch: .8, gain: .65 }); break;
    case 'menu-click': sample(91, { pitch: random(1.2, 1.4) }); break;
    case 'menu-no': sample(100, { gain: .5 }); break;
  }
}

export function startMusic(skinIndex, { restart = false } = {}) {
  try {
    const nextTrack = skinIndex == null ? musicTrack : SKINS[skinIndex]?.music || 'default';
    music ||= new Audio();
    if (musicTrack !== nextTrack || !music.getAttribute('src')) {
      music.pause();
      music.src = MUSIC_TRACKS[nextTrack] || MUSIC_TRACKS.default;
      music.load();
      musicTrack = nextTrack;
    } else if (restart) music.currentTime = 0;
    music.loop = true;
    music.volume = .4;
    music.playbackRate = 1;
    const ctx = audioContext();
    if (!musicFilter) {
      const source = ctx.createMediaElementSource(music);
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicGain = ctx.createGain();
      source.connect(musicFilter).connect(musicGain).connect(musicBus);
    }
    clearTimeout(musicFadeTimer);
    musicFilter.frequency.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicFilter.frequency.value = 20000;
    musicGain.gain.value = 1;
    musicMood = 'normal';
    music.play().catch(() => {});
  } catch { /* Music remains optional. */ }
}

export function pauseMusic() {
  clearTimeout(musicFadeTimer);
  if (music) music.pause();
  for (const source of activeNotes.splice(0)) {
    try { source.stop(context.currentTime + 0.01); } catch { /* Already ended. */ }
  }
  for (const item of activeVoices.splice(0)) {
    try { item.source.stop(context.currentTime + .01); } catch { /* Already ended. */ }
  }
  if (activeKobeVoice) {
    try { activeKobeVoice.stop(context.currentTime + .01); } catch { /* Already ended. */ }
    activeKobeVoice = null;
  }
}

export function setMusicAtmosphere(mood) {
  if (!musicFilter || musicMood === mood) return;
  musicMood = mood;
  const now = context.currentTime;
  musicFilter.frequency.setTargetAtTime(mood === 'freeze' ? 1700 : 20000, now, .12);
  musicGain.gain.setTargetAtTime(mood === 'freeze' ? .8 : 1, now, .12);
}

export function fadeOutMusic() {
  if (!music || music.paused || !musicGain) return;
  clearTimeout(musicFadeTimer);
  musicMood = 'dying';
  const now = context.currentTime;
  musicFilter.frequency.setTargetAtTime(1100, now, .06);
  if (musicGain.gain.cancelAndHoldAtTime) musicGain.gain.cancelAndHoldAtTime(now);
  else musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setTargetAtTime(.001, now, .045);
  musicFadeTimer = setTimeout(() => { if (musicMood === 'dying') music.pause(); }, 240);
}

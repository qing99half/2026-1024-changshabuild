import { TURN_BANDS, MELODY_SIXTEENTH, nextMelodyDelay } from './melody.mjs';

// AudioClip references below come from the installed game's AudioManager component.
// Each WAV is decoded from that game's FSB5 resource without changing its samples.
const CLIPS = [87, 88, 89, 90, 91, 92, 93, 94, 95, 97, 98, 99, 100, 103];
const EXPLOSIONS = [91, 97, 90, 95]; // The fifth serialized clip is never selected by Random.Range(0, 4).
const MELODY_NOTES = TURN_BANDS.flat();

let context;
let buffers = new Map();
let melodyBuffers = new Map();
let loading;
let music;
let melodicMode = true;
const activeNotes = [];

export function setMelodicMode(enabled) { melodicMode = Boolean(enabled); }

function audioContext() {
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === 'suspended') context.resume();
  return context;
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

function sample(id, { pitch = 1, gain = 1, duration } = {}) {
  try {
    const buffer = buffers.get(id);
    if (!buffer) {
      audioContext();
      preloadAudio().then(() => { if (buffers.has(id)) sample(id, { pitch, gain, duration }); });
      return;
    }
    const ctx = audioContext();
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    volume.gain.value = gain;
    if (duration) volume.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(volume).connect(ctx.destination);
    if (duration) source.start(ctx.currentTime, 0, duration);
    else source.start();
  } catch { /* Audio remains optional. */ }
}

function note(id, gain = 0.4, offset = 0) {
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
    source.connect(volume).connect(ctx.destination);
    activeNotes.push(source);
    if (activeNotes.length > 6) {
      const oldest = activeNotes.shift();
      try { oldest.stop(ctx.currentTime + 0.01); } catch { /* Already ended. */ }
    }
    source.onended = () => {
      const index = activeNotes.indexOf(source);
      if (index >= 0) activeNotes.splice(index, 1);
      source.disconnect();
      volume.disconnect();
    };
    source.start(when);
  } catch { /* Audio remains optional. */ }
}

function explode() { sample(EXPLOSIONS[Math.floor(Math.random() * EXPLOSIONS.length)], { pitch: random(.95, 1.05) }); }

export function playAudioEvent(kind, event = {}) {
  switch (kind) {
    case 'turn':
      if (melodicMode && melodyBuffers.has(event.toneId)) {
        sample(91, { gain: .09, duration: .025 }); // immediate original transient
        note(event.toneId, .4);
      } else sample(94, { pitch: random(.8, .85), gain: .4 });
      break;
    case 'pickup':
      if (melodicMode && melodyBuffers.has('turn-upper-down')) note('turn-upper-down', .52); // D5
      else sample(87, { pitch: random(.95, 1.05) });
      break;
    case 'deliver':
      if (melodicMode && melodyBuffers.has('turn-middle-left')) note('turn-middle-left', .65); // G4
      else sample(94);
      break;
    case 'deliver-turn':
      sample(99, { pitch: .8, gain: melodicMode ? .5 : 1 });
      if (melodicMode) {
        note('turn-middle-left', .48); // G4
        note('turn-upper-up', .4, MELODY_SIXTEENTH); // G5
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
}

export function setMusicPitch(pitch) {
  if (music) music.playbackRate = pitch;
  if (!context) return;
  for (const source of activeNotes) {
    source.playbackRate.setTargetAtTime(pitch, context.currentTime, 0.015);
  }
}

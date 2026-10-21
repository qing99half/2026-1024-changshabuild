// AudioClip references below come from the installed game's AudioManager component.
// Each WAV is decoded from that game's FSB5 resource without changing its samples.
const CLIPS = [87, 88, 89, 90, 91, 92, 93, 94, 95, 97, 98, 99, 100, 103];
const EXPLOSIONS = [91, 97, 90, 95]; // The fifth serialized clip is never selected by Random.Range(0, 4).

let context;
let buffers = new Map();
let loading;
let music;

function audioContext() {
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === 'suspended') context.resume();
  return context;
}

export function preloadAudio() {
  if (loading) return loading;
  loading = Promise.all(CLIPS.map(async id => {
    try {
      const response = await fetch(`/assets/audio/clip-${id}.wav`);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      buffers.set(id, await audioContext().decodeAudioData(arrayBuffer));
    } catch { /* Audio remains optional if a browser denies playback. */ }
  }));
  return loading;
}

function random(lo, hi) { return lo + Math.random() * (hi - lo); }

function sample(id, { pitch = 1, gain = 1 } = {}) {
  try {
    const buffer = buffers.get(id);
    if (!buffer) {
      audioContext();
      preloadAudio().then(() => { if (buffers.has(id)) sample(id, { pitch, gain }); });
      return;
    }
    const ctx = audioContext();
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    volume.gain.value = gain;
    source.connect(volume).connect(ctx.destination);
    source.start();
  } catch { /* Audio remains optional. */ }
}

function explode() { sample(EXPLOSIONS[Math.floor(Math.random() * EXPLOSIONS.length)], { pitch: random(.95, 1.05) }); }

export function playAudioEvent(kind) {
  switch (kind) {
    case 'turn': sample(94, { pitch: random(.8, .85), gain: .4 }); break;
    case 'pickup': sample(87, { pitch: random(.95, 1.05) }); break;
    case 'deliver': sample(94); break;
    case 'deliver-turn': sample(99, { pitch: .8 }); break;
    case 'goal-burst': explode(); break;
    case 'point-spawn': sample(103); break;
    case 'near-miss': sample(87); break;
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

export function pauseMusic() { if (music) music.pause(); }

export function setMusicPitch(pitch) { if (music) music.playbackRate = pitch; }

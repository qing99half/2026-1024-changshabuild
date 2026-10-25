import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseVoicePhrase, chooseKobeClip, KOBE_VOICE_CLIPS, normalizeVolume, normalizeVolumes, VOICE_SCALE, VOICE_SAMPLE_MIDI } from '../src/audio-policy.mjs';

test('Kobe voice choice has three equal ranges and no fourth clip', () => {
  assert.deepEqual(KOBE_VOICE_CLIPS, ['kobe-man', 'kobe-mamba-out', 'kobe-what-can-i-say']);
  assert.equal(chooseKobeClip(() => 0), 'kobe-man');
  assert.equal(chooseKobeClip(() => 1 / 3), 'kobe-mamba-out');
  assert.equal(chooseKobeClip(() => 2 / 3), 'kobe-what-can-i-say');
  assert.equal(chooseKobeClip(() => .999), 'kobe-what-can-i-say');
});

test('each sound channel accepts every one-percent step from 50 to 200', () => {
  for (let value = 50; value <= 200; value++)
    assert.deepEqual(normalizeVolumes({ turn: value, effects: value, music: value }),
      { turn: value, effects: value, music: value });
  assert.equal(normalizeVolume(49), 50);
  assert.equal(normalizeVolume(201), 200);
  assert.equal(normalizeVolume('125.6'), 126);
  assert.deepEqual(normalizeVolumes({ turn: 'bad' }), { turn: 100, effects: 100, music: 100 });
});

test('random voice phrases stay pentatonic, follow event contours, and avoid repeated syllables', () => {
  const set = ['ha_new', 'ji_new', 'mi_new'];
  const state = {};
  const random = (() => { let index = 0; return () => [0, .8, .35, .6, .15][index++ % 5]; })();
  const cases = [
    ['turn', 1, 0], ['pickup', 1, 0], ['deliver', 2, 1], ['deliver-turn', 2, -1],
    ['bonus', 3, 1], ['freeze', 2, -1], ['bomb', 3, -1],
    ['eliminate', 2, -1], ['die', 3, -1]
  ];
  let previousSample;
  for (const [kind, count, direction] of cases) {
    const phrase = chooseVoicePhrase(kind, set, { toneBand: 1 }, state, random);
    assert.equal(phrase.length, count, kind);
    for (const note of phrase) {
      assert.ok(VOICE_SCALE.includes(note.midi), `${kind} uses an out-of-scale pitch`);
      assert.ok(Math.abs(note.midi - VOICE_SAMPLE_MIDI[note.sample]) <= 7,
        `${kind} transposes a syllable by more than seven semitones`);
      assert.notEqual(note.sample, previousSample, `${kind} repeats a syllable`);
      previousSample = note.sample;
    }
    for (let i = 1; i < phrase.length; i++) {
      assert.equal(Math.sign(phrase[i].midi - phrase[i - 1].midi), direction);
      assert.ok(Math.abs(phrase[i].midi - phrase[i - 1].midi) <= 5);
    }
  }
});

test('the dedicated elimination cue is a short playable PCM WAV', () => {
  const data = readFileSync(new URL('../assets/audio/eliminate.wav', import.meta.url));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  assert.equal(data.readUInt16LE(20), 1);
  assert.equal(data.readUInt16LE(22), 1);
  assert.equal(data.readUInt32LE(24), 44100);
  assert.ok(data.length > 20000 && data.length < 40000);
});

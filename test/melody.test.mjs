import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createGame, startRound, turn } from '../src/core.mjs';
import { turnTone, TURN_BANDS, TURN_MIDI, MELODY_SIXTEENTH, MUSIC_BEAT_PHASE, nextMelodyDelay } from '../src/melody.mjs';
import { SFX_GAIN_MULTIPLIER } from '../src/audio.mjs';

test('a turn snapshots its post-turn heading and position into the audio event', () => {
  const game = createGame();
  startRound(game);
  game.events.length = 0;
  game.player.y = 2;
  turn(game);
  const event = game.events.find(item => item.kind === 'turn');
  assert.deepEqual([event.dir, event.toneBand, event.toneId], [1, 0, 'turn-upper-right']);
  game.player.y = -2;
  assert.equal(event.toneId, 'turn-upper-right');
  turn(game);
  assert.equal(game.events.at(-1).toneId, 'turn-lower-down');
});

test('all twelve direction-position judgements have calibrated original-sample WAVs', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/audio/melodic/manifest.json', import.meta.url)));
  for (const [band, row] of TURN_BANDS.entries()) {
    for (const [direction, id] of row.entries()) {
      const data = manifest.notes[id];
      assert.ok(data, `missing ${id}`);
      assert.ok([87, 94].includes(data.source_clip));
      assert.ok(Math.abs(data.pitch_error_cents) < 5, `${id} is out of tune`);
      assert.ok(existsSync(new URL(`../assets/audio/melodic/${id}.wav`, import.meta.url)));
      assert.ok([2, 5, 7, 10, 0].includes(data.midi % 12), `${id} is outside G minor pentatonic`);
      assert.equal(TURN_MIDI[band][direction], data.midi);
    }
  }
  assert.equal(turnTone(1.29, 0).id, 'turn-upper-up');
  assert.equal(turnTone(-1.29, 3).id, 'turn-lower-left');
});

test('trigger effects use the requested gain and guest voice assets are present', () => {
  assert.equal(SFX_GAIN_MULTIPLIER, 1.5);
  for (const name of ['ha_new', 'ji_new', 'mi_new', 'da', 'gou', 'jiao'])
    assert.ok(existsSync(new URL(`../assets/audio/guest/${name}.wav`, import.meta.url)), name);
});

test('melodic playback stays responsive on and between soundtrack subdivisions', () => {
  assert.equal(nextMelodyDelay(MUSIC_BEAT_PHASE), 0);
  const halfway = MUSIC_BEAT_PHASE + MELODY_SIXTEENTH / 2;
  assert.ok(nextMelodyDelay(halfway) > 0);
  assert.ok(nextMelodyDelay(halfway) < MELODY_SIXTEENTH);
  assert.ok(nextMelodyDelay(halfway, 0.5) <= 0.14);
  assert.equal(nextMelodyDelay(NaN), 0);
});

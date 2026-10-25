import test from 'node:test';
import assert from 'node:assert/strict';
import { requestLandscape } from '../src/orientation.mjs';

test('a mobile browser that permits direct orientation lock enters landscape on load', async () => {
  const calls = [];
  const screen = { orientation: { lock: async value => calls.push(value) } };
  assert.equal(await requestLandscape(screen, {}), 'locked');
  assert.deepEqual(calls, ['landscape']);
});

test('the user action enters fullscreen before locking, and exits if the lock fails', async () => {
  const calls = [];
  const document = {
    documentElement: { requestFullscreen: async () => calls.push('fullscreen') },
    exitFullscreen: async () => calls.push('exit')
  };
  const screen = { orientation: { lock: async () => { calls.push('lock'); throw new Error('blocked'); } } };
  assert.equal(await requestLandscape(screen, document, true), 'blocked');
  assert.deepEqual(calls, ['fullscreen', 'lock', 'exit']);
});

test('unsupported browsers keep the manual rotation path available', async () => {
  assert.equal(await requestLandscape({}, {}, true), 'unsupported');
});

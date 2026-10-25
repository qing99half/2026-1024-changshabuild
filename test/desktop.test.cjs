const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { gameAssetResponse } = require('../desktop/assets.cjs');

const root = join(__dirname, '..');

test('desktop scheme serves the game and its absolute assets', async () => {
  const page = await gameAssetResponse(new Request('righty://game/'), root);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Righty Tighty 99/);
  const logo = await gameAssetResponse(new Request('righty://game/assets/title-logo-99.svg'), root);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/svg+xml');
});

test('desktop scheme supports audio byte ranges and rejects other origins', async () => {
  const audio = await gameAssetResponse(new Request('righty://game/assets/audio/eliminate.wav', {
    headers: { range: 'bytes=0-3' }
  }), root);
  assert.equal(audio.status, 206);
  assert.equal(await audio.text(), 'RIFF');
  const outside = await gameAssetResponse(new Request('righty://other/'), root);
  assert.equal(outside.status, 404);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {Manager} = require('../src/manager.cjs');
const {profile, validate} = require('../src/model.cjs');
const {SoundLibrary} = require('../src/player-sounds.cjs');

test('custom sounds and independent volumes survive restart and original-file removal', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'longship-custom-sound-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const manager = new Manager(root); clearInterval(manager.poll);
  const p = profile(); p.installDir = root; p.saveDir = root; p.password = 'fixture-only';
  manager.profiles = [p];
  manager.runs.set(p.id, {status: 'running', profile: p});
  const library = new SoundLibrary(path.join(root, 'sounds'));
  const original = path.join(root, 'custom.wav');
  await fs.copyFile('resources/audio/player-join.wav', original);
  const candidate = await library.prepare(original);
  await Promise.all([
    manager.setPlayerSound(p.id, 'join', await library.store(candidate)),
    manager.setPlayerSound(p.id, 'join', {volume: 0.62}),
    manager.setPlayerSound(p.id, 'depart', {volume: 0.15})
  ]);
  await fs.unlink(original);
  const reopened = new Manager(root); clearInterval(reopened.poll); await reopened.load();
  const restored = reopened.get(p.id);
  assert.equal(restored.playerSounds.join.volume, 0.62);
  assert.equal(restored.playerSounds.depart.volume, 0.15);
  assert.equal(await library.source(restored, 'join'), candidate.source);
  assert.equal(await library.source(restored, 'depart'), null);
  await reopened.setPlayerSound(p.id, 'join', {file: null, name: ''});
  assert.equal(await library.source(reopened.get(p.id), 'join'), null);
  assert.equal(reopened.get(p.id).playerSounds.join.volume, 0.62);
  await assert.rejects(manager.setPlayerSound(p.id, 'join', {volume: NaN}));
  await assert.rejects(manager.setPlayerSound(p.id, 'depart', {file: '../escape.wav'}));
  assert.equal(p.playerSounds.join.volume, 0.62);
  assert.equal(p.playerSounds.depart.volume, 0.15);
  assert.doesNotThrow(() => validate(restored));
});

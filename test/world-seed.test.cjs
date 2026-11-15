const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {matchingSeedMetadata, prepareSeededWorld, verifyWorldSeed} = require('../src/world-seed.cjs');
const {selectedWorld} = require('../src/worlds.cjs');

test('seeded first launch can retry its exact metadata and preserves existing saves', async () => {
  const saveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'longship-seed-'));
  try {
    const profile = {saveDir, world: 'Charlie copy', worldSeed: 'es7LZlfx9s'};
    const container = path.join(saveDir, 'worlds_local');
    const file = path.join(container, profile.world + '.fwl');
    await fs.mkdir(container);
    await prepareSeededWorld(saveDir, profile.world, profile.worldSeed);
    const initial = await fs.readFile(file);
    await assert.rejects(() => prepareSeededWorld(saveDir, profile.world, 'Different'), {code: 'EEXIST'});
    assert.deepEqual(await fs.readFile(file), initial);
    const options = {optional: true, acceptSeedMetadata: matchingSeedMetadata};
    assert.equal(await selectedWorld(profile, options), null);
    await assert.rejects(() => selectedWorld({...profile, worldSeed: 'Different'}, options), /Refusing to create/);
    await fs.writeFile(path.join(container, profile.world + '.db'), 'fixture database');
    const world = await selectedWorld(profile, options);
    await verifyWorldSeed(world, profile.worldSeed);
    await assert.rejects(() => verifyWorldSeed(world, 'ES7LZLFX9S'), /different seed/);
  } finally {
    await fs.rm(saveDir, {recursive: true, force: true});
  }
});

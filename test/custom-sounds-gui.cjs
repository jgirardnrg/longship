const {_electron: electron} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {profile} = require('../src/model.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'longship-sound-controls-'));
  const data = path.join(root, 'data');
  await fs.mkdir(data);
  const p = profile(); p.installDir = root; p.saveDir = root; p.password = 'fixture-only';
  const second = {...profile(1), installDir: root, saveDir: root, password: 'fixture-only'};
  await fs.writeFile(path.join(data, 'profiles.json'), JSON.stringify({version: 1, profiles: [p, second]}));
  const chosen = path.join(root, 'my-join.wav'), bad = path.join(root, 'bad.wav');
  await fs.copyFile('resources/audio/player-join.wav', chosen);
  await fs.writeFile(bad, 'Not audio');
  let app;
  async function launch() {
    app = await electron.launch({executablePath: process.env.LONGSHIP_APP || require('electron'),
      args: [...(process.env.LONGSHIP_APP ? [] : [path.resolve('src/main.cjs')]), '--user-data-dir=' + root]});
    const page = await app.firstWindow();
    await page.locator('.sound-settings summary').click();
    return page;
  }
  try {
    let page = await launch();
    await app.evaluate(({dialog}, file) => {dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]});}, chosen);
    await page.locator('[data-sound-choose="join"]').click();
    await page.getByText('my-join.wav', {exact: true}).waitFor();
    await page.locator('#joinSoundVolume').evaluate(el => {el.value = '62'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));});
    await page.waitForFunction(async () => (await window.longship.profiles())[0].playerSounds.join.volume === 0.62);
    await page.locator('#departSoundVolume').evaluate(el => {el.value = '15'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));});
    await page.waitForFunction(async () => (await window.longship.profiles())[0].playerSounds.depart.volume === 0.15);
    const saved = (await page.evaluate(() => window.longship.profiles()))[0].playerSounds;
    await app.evaluate(({dialog}, file) => {dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]});}, bad);
    await page.locator('[data-sound-choose="depart"]').click();
    await page.getByText('This audio file cannot be played. Choose another file.', {exact: true}).waitFor();
    assert.deepEqual((await page.evaluate(() => window.longship.profiles()))[0].playerSounds, saved);
    await fs.unlink(chosen);
    await app.close(); app = null;
    page = await launch();
    await page.getByText('my-join.wav', {exact: true}).waitFor();
    assert.equal(await page.locator('#joinSoundVolume').inputValue(), '62');
    assert.equal(await page.locator('#departSoundVolume').inputValue(), '15');
    await page.evaluate(() => {
      window.clips = [];
      const OriginalAudio = window.Audio;
      window.Audio = function(source) {
        const audio = new OriginalAudio(source);
        audio.addEventListener('ended', () => clips.push({custom: source.startsWith('data:'), volume: audio.volume}));
        return audio;
      };
    });
    await page.locator('[data-sound-preview="join"]').click();
    await page.waitForFunction(() => clips.length === 1);
    await page.locator('[data-sound-preview="depart"]').click();
    await page.waitForFunction(() => clips.length === 2);
    const clips = await page.evaluate(() => clips);
    assert.equal(clips[0].custom, true); assert.ok(Math.abs(clips[0].volume - 0.62) < 0.001);
    assert.equal(clips[1].custom, false); assert.ok(Math.abs(clips[1].volume - 0.15) < 0.001);
    await page.screenshot({path: path.resolve('build/custom-sounds.png'), fullPage: true});
    await page.locator('[data-sound-reset="join"]').click();
    await page.getByText('Default join chime', {exact: true}).waitFor();
    assert.equal(await page.locator('#joinSoundVolume').inputValue(), '62');
    assert.equal((await page.evaluate(() => window.longship.profiles()))[1].playerSounds, undefined);
    console.log('CUSTOM SOUND GUI PASS: selection, decode rejection, auto-save, restart, copied audio, independent preview volumes, default reset, server isolation.');
  } finally {
    if (app) await app.close();
    await fs.rm(root, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

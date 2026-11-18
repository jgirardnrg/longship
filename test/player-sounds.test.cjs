const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('rapid joins and departures play in order, and a failure allows the next alert', async () => {
  const started = [], pending = [], warnings = [];
  class AudioFixture {
    constructor(file) { this.file = file; }
    play() {
      started.push(this.file);
      if (started.length === 2) return Promise.reject(Error('Output changed'));
      pending.push(this);
      return Promise.resolve();
    }
    pause() {}
  }
  const context = vm.createContext({Audio: AudioFixture, setTimeout, clearTimeout,
    notify: text => warnings.push(text), console: {error() {}}});
  vm.runInContext(fs.readFileSync('renderer/player-sounds.js', 'utf8'), context);
  const first = vm.runInContext("playPlayerSound('join')", context);
  const failed = vm.runInContext("playPlayerSound('depart')", context);
  const last = vm.runInContext("playPlayerSound('join')", context);
  await new Promise(setImmediate);
  assert.equal(started.length, 1);
  pending.shift().onended();
  await first;
  await failed;
  await new Promise(setImmediate);
  assert.equal(started.length, 3);
  pending.shift().onended();
  await last;
  assert.deepEqual(started.map(file => file.split('/').pop()),
    ['player-join.wav', 'player-depart.wav', 'player-join.wav']);
  assert.equal(warnings.length, 1);
});

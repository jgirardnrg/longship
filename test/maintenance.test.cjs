const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Manager } = require('../src/manager.cjs');
const { profile } = require('../src/model.cjs');
const { parseVdf, appBlock, SteamClient, installedBuild } = require('../src/steam.cjs');
const { safeName, pluginMap, frameworkMap, extract, modEnvironment } = require('../src/mods.cjs');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'longship-test-'));
  const installDir = path.join(root, 'server with spaces'), saveDir = path.join(root, 'saves');
  await fs.mkdir(installDir); await fs.mkdir(path.join(saveDir, 'worlds_local'), { recursive: true });
  const p = { ...profile(), password: 'fixture-password', port: 31542, installDir, saveDir, steamcmdPath: path.join(root, 'steamcmd') };
  const m = new Manager(path.join(root, 'app'), { inspect: async () => [] }); await m.save(p);
  return { root, p, m, cleanup: async () => { clearInterval(m.poll); await fs.rm(root, { recursive: true, force: true }); } };
}
async function manifest(p, build, branch = 'public') {
  await fs.mkdir(path.join(p.installDir, 'steamapps'), { recursive: true });
  await fs.writeFile(path.join(p.installDir, 'steamapps/appmanifest_896660.acf'), `"AppState" { "appid" "896660" "buildid" "${build}" "UserConfig" { "BetaKey" "${branch}" } }`);
}
// Tiny, stored ZIP fixture writer, so traversal/link/duplicate cases can be tested without running archive tools.
function crc32(bytes) { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), body = Buffer.from(entry.body || ''), crc = crc32(body);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(body.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, body);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE((3 << 8) | 20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(crc, 16); record.writeUInt32LE(body.length, 20); record.writeUInt32LE(body.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(((entry.mode || 0x81a4) * 65536) >>> 0, 38); record.writeUInt32LE(offset, 42); central.push(record, name); offset += head.length + name.length + body.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
test('Steam metadata is parsed by structure, not arbitrary buildid text', () => {
  const output = 'noise buildid 999\n"896660" { "name" "test {server}" "depots" { "branches" { "public" { "buildid" "456" } } } }\nnoise';
  assert.equal(parseVdf(appBlock(output))['896660'].depots.branches.public.buildid, '456');
  assert.throws(() => appBlock('no metadata')); assert.throws(() => parseVdf('"x" { "y" "z"')); assert.throws(() => parseVdf('}'));
});
test('Steam checks distinguish unknown/current/old builds and reject beta installs', async () => {
  const f = await fixture(); try {
    let argv; const steam = new SteamClient({ run: async (_exe, args) => { argv = args; return '"896660" { "depots" { "branches" { "public" { "buildid" "200" } } } }'; } });
    let state = await steam.check(f.p); assert.equal(state.available, null); assert.ok(argv.includes('anonymous'));
    await manifest(f.p, '100'); state = await steam.check(f.p); assert.equal(state.available, true);
    await manifest(f.p, '200'); assert.equal((await steam.check(f.p)).available, false);
    await manifest(f.p, '200', 'public-test'); await assert.rejects(() => installedBuild(f.p.installDir), /beta/);
  } finally { await f.cleanup(); }
});
test('Steam apply uses argv without a shell and requires success plus an installed manifest', async () => {
  const f = await fixture(); try {
    let argv; const steam = new SteamClient({ run: async (_exe, args) => { argv = args; await manifest(f.p, '200'); return "Success! App '896660' fully installed."; } });
    assert.equal((await steam.apply(f.p, '200')).installed, '200'); assert.equal(argv[1], f.p.installDir); assert.ok(argv.includes('validate'));
    const bad = new SteamClient({ run: async () => 'download failed' }); await assert.rejects(() => bad.apply(f.p, '200'), /did not confirm/);
  } finally { await f.cleanup(); }
});
test('patch failure after a graceful stop never restarts and preserves world/config backups', async () => {
  const f = await fixture(); try {
    await fs.writeFile(path.join(f.p.saveDir, 'worlds_local/Dedicated.db'), 'original-world'); await fs.writeFile(path.join(f.p.saveDir, 'worlds_local/Dedicated.fwl'), 'metadata');
    await fs.mkdir(path.join(f.p.installDir, 'BepInEx/config'), { recursive: true }); await fs.writeFile(path.join(f.p.installDir, 'BepInEx/config/plugin.cfg'), 'original-config');
    f.m.runs.set(f.p.id, { status: 'running', lines: [], child: { pid: 123 }, serverPid: 123 }); let stopped = 0, restarted = 0;
    f.m.stop = async () => { stopped++; f.m.runs.get(f.p.id).status = 'stopped'; }; f.m.start = async () => { restarted++; };
    f.m.updates.steam = { check: async () => ({ available: true, latest: '200', installed: '100' }), apply: async () => { throw Error('simulated patch failure'); } };
    await assert.rejects(() => f.m.updates.apply(f.p.id, { restart: true }), /simulated/); assert.equal(stopped, 1); assert.equal(restarted, 0); assert.equal(f.m.state(f.p.id).status, 'stopped');
    const backups = await fs.readdir(path.join(f.m.root, 'backups', f.p.id)); assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(f.m.root, 'backups', f.p.id, backups[0], 'Dedicated.db'), 'utf8'), 'original-world');
    assert.equal(f.m.maintenance.state(f.p.id).phase, 'failed'); assert.equal(f.m.maintenance.locked(f.p.installDir), false);
  } finally { await f.cleanup(); }
});
test('patch succeeds only after exit/backup/verification; optional restart occurs after unlocking', async () => {
  const f = await fixture(); try {
    f.m.runs.set(f.p.id, { status: 'running', lines: [], child: { pid: 123 } }); const steps = []; let checks = 0;
    f.m.stop = async () => { steps.push('stop'); f.m.runs.get(f.p.id).status = 'stopped'; };
    f.m.start = async () => { assert.equal(f.m.maintenance.locked(f.p.installDir), false); steps.push('restart'); };
    f.m.updates.steam = { check: async () => (++checks === 1 ? { available: true, installed: '100', latest: '200' } : { available: false, installed: '200', latest: '200' }), apply: async () => { assert.equal(f.m.active(f.p.id), false); steps.push('patch'); } };
    const result = await f.m.updates.apply(f.p.id, { restart: true }); assert.equal(result.restarted, true); assert.deepEqual(steps, ['stop', 'patch', 'restart']);
  } finally { await f.cleanup(); }
});
test('unmanaged/shared servers and maintenance locks prevent mutation/start', async () => {
  const f = await fixture(); try {
    f.m.maintenance.inspect = async () => [999]; await assert.rejects(() => f.m.maintenance.offline(f.p.id), /unmanaged/);
    let invoked = false; await assert.rejects(() => f.m.mods.install(f.p.id, '/not-read.zip'), /unmanaged/);
    f.m.maintenance.inspect = async () => [];
    await f.m.maintenance.perform(f.p.id, 'test', async () => { await assert.rejects(() => f.m.start(f.p.id), /locked/); await assert.rejects(() => f.m.save({ ...f.p, name: 'changed' })); invoked = true; });
    assert.equal(invoked, true);
    await fs.writeFile(path.join(f.p.installDir, '.longship-maintenance.lock'), 'other owner'); await assert.rejects(() => f.m.maintenance.perform(f.p.id, 'test', async () => {}), /exist/i); assert.equal(await fs.readFile(path.join(f.p.installDir, '.longship-maintenance.lock'), 'utf8'), 'other owner');
  } finally { await f.cleanup(); }
});
test('ZIP path, link, collision and package mapping guards', async () => {
  for (const name of ['../escape', 'C:/bad', '/bad', 'dir/../bad', 'NUL.dll', 'folder./x', 'x:y']) assert.throws(() => safeName(name));
  assert.throws(() => pluginMap([{ name: 'run.ps1' }]));
  assert.throws(() => frameworkMap([{ name: 'BepInEx/core/BepInEx.dll' }], 'win32'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'longship-zip-'));
  try { for (const entries of [[{ name: '../escape.dll' }], [{ name: 'link.dll', mode: 0xa1ff }], [{ name: 'Mod.dll' }, { name: 'mod.dll' }]]) {
    const archive = path.join(root, 'bad.zip'); await fs.writeFile(archive, zip(entries)); await assert.rejects(() => extract(archive, path.join(root, 'out-' + Math.random())));
  }} finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('plugin import is disabled, toggle moves out of loader path, removal archives files', async () => {
  const f = await fixture(); try {
    const archive = path.join(f.root, 'Example.zip'); await fs.writeFile(archive, zip([{ name: 'manifest.json', body: JSON.stringify({ name: 'Example', version_number: '1.2.3', dependencies: ['Required-Dependency-1.0.0'] }) }, { name: 'BepInEx/plugins/Example/Plugin.dll', body: 'fixture-not-executable' }, { name: 'BepInEx/plugins/Example/data.txt', body: 'asset' }]));
    await f.m.mods.install(f.p.id, archive); let data = await f.m.mods.list(f.p.id); assert.equal(data.managed.length, 1); const mod = data.managed[0]; assert.equal(mod.enabled, false);
    assert.equal(await fs.readFile(path.join(f.p.installDir, `BepInEx/Longship-disabled/${mod.id}/Example/data.txt`), 'utf8'), 'asset');
    await f.m.mods.toggle(f.p.id, mod.id, true); assert.equal((await f.m.mods.list(f.p.id)).managed[0].enabled, true);
    await f.m.mods.toggle(f.p.id, mod.id, false); const result = await f.m.mods.remove(f.p.id, mod.id); assert.equal((await f.m.mods.list(f.p.id)).managed.length, 0); assert.equal(await fs.readFile(path.join(result.archive, 'Example/data.txt'), 'utf8'), 'asset');
  } finally { await f.cleanup(); }
});
test('config edits back up old bytes, detect external changes and reject symlink escape', async () => {
  const f = await fixture(); try {
    const dir = path.join(f.p.installDir, 'BepInEx/config'); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'Example.cfg'), 'old');
    const old = await f.m.mods.readConfig(f.p.id, 'Example.cfg'); const result = await f.m.mods.writeConfig(f.p.id, 'Example.cfg', 'new', old.sha); assert.equal(await fs.readFile(result.backup, 'utf8'), 'old');
    await assert.rejects(() => f.m.mods.writeConfig(f.p.id, 'Example.cfg', 'overwritten', old.sha), /changed on disk/);
    await assert.rejects(() => f.m.mods.readConfig(f.p.id, '../Example.cfg'));
    if (process.platform !== 'win32') { await fs.symlink(path.join(f.root, 'outside'), path.join(dir, 'link.cfg')); await assert.rejects(() => f.m.mods.readConfig(f.p.id, 'link.cfg'), /Symlink/); }
  } finally { await f.cleanup(); }
});
test('modded Linux environment supports space-containing paths; vanilla mode disables loader', async () => {
  const f = await fixture(); try {
    await fs.mkdir(path.join(f.p.installDir, 'BepInEx/core'), { recursive: true }); await fs.writeFile(path.join(f.p.installDir, 'BepInEx/core/BepInEx.Preloader.dll'), 'fixture'); await fs.writeFile(path.join(f.p.installDir, 'libdoorstop.so'), 'fixture');
    const env = await modEnvironment({ ...f.p, modsEnabled: true }, 'linux'); assert.equal(env.LD_PRELOAD, 'libdoorstop.so'); assert.equal(env.DOORSTOP_ENABLED, '1'); assert.ok(env.LD_LIBRARY_PATH.includes(f.p.installDir));
    assert.equal((await modEnvironment({ ...f.p, modsEnabled: false }, 'win32')).DOORSTOP_DISABLE, '1');
    await fs.writeFile(path.join(f.p.installDir, 'doorstop_config.ini'), '[General]\nignore_disable_switch=true'); await assert.rejects(() => modEnvironment({ ...f.p, modsEnabled: false }, 'win32'), /ignore disabling/);
  } finally { await f.cleanup(); }
});
test('framework overlay rollback restores originals when a later destination is invalid', async () => {
  const f = await fixture(); try {
    const base = path.join(f.p.installDir, 'BepInEx/core'); await fs.mkdir(base, { recursive: true }); await fs.writeFile(path.join(base, 'BepInEx.dll'), 'original');
    await fs.mkdir(path.join(f.p.installDir, 'winhttp.dll')); // Deliberate invalid destination.
    const archive = path.join(f.root, 'framework.zip'); await fs.writeFile(archive, zip([{ name: 'BepInEx/core/BepInEx.dll', body: 'new' }, { name: 'BepInEx/core/BepInEx.Preloader.dll', body: 'preloader' }, { name: 'winhttp.dll', body: 'proxy' }]));
    await assert.rejects(() => f.m.mods.install(f.p.id, archive, 'framework'), /regular file/);
    assert.equal(await fs.readFile(path.join(base, 'BepInEx.dll'), 'utf8'), 'original'); await assert.rejects(() => fs.stat(path.join(base, 'BepInEx.Preloader.dll')), { code: 'ENOENT' });
  } finally { await f.cleanup(); }
});
test('legacy profiles gain opt-in update fields without losing passwords or IDs', async () => {
  const f = await fixture(); try {
    const legacy = { ...f.p }; delete legacy.modsEnabled; delete legacy.steamcmdPath; delete legacy.updateCheckHours; delete legacy.updateCheckEnabled;
    await fs.mkdir(path.join(f.p.installDir, 'BepInEx/core'), { recursive: true }); await fs.writeFile(path.join(f.p.installDir, 'BepInEx/core/BepInEx.dll'), 'fixture');
    await fs.writeFile(path.join(f.m.root, 'profiles.json'), JSON.stringify({ version: 1, profiles: [legacy] })); await f.m.load(); const migrated = f.m.get(f.p.id);
    assert.equal(migrated.password, legacy.password); assert.equal(migrated.bridgeToken, legacy.bridgeToken); assert.equal(migrated.modsEnabled, true); assert.equal(migrated.updateCheckEnabled, false); assert.equal(migrated.updateCheckHours, 6);
  } finally { await f.cleanup(); }
});

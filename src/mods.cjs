const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { atomic } = require('./storage.cjs');
const LIMIT = 256 * 1024 * 1024;
function safeName(name) {
  const normalized = String(name).replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /[:\x00-\x1f]/.test(normalized)) throw Error('Unsafe archive path.');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(p => p === '..' || p === '.' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('Unsafe archive path.');
  return parts.join('/');
}
async function noLinks(root, relative) {
  relative = safeName(relative);
  if ((await fs.lstat(root)).isSymbolicLink()) throw Error('Installation/config root must not be a symlink.');
  const realRoot = await fs.realpath(root);
  let current = realRoot;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Symlink targets are not supported for mod management.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!path.resolve(realRoot, relative).startsWith(realRoot + path.sep)) throw Error('Target escapes installation.');
}

async function extract(archive, destination) {
  await fs.mkdir(destination, { recursive: true });
  const files = [], names = new Set(); let total = 0, count = 0;
  await new Promise((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error) return reject(error);
      let failed = false;
      function fail(e) { if (!failed) { failed = true; zip.close(); reject(e); } }
      zip.on('error', fail); zip.on('end', () => { if (!failed) resolve(); });
      zip.on('entry', entry => {
        (async () => {
          if (++count > 10000) throw Error('Too many archive entries.');
          const name = safeName(entry.fileName);
          const type = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (type === 0xa000 || (type && type !== 0x8000 && type !== 0x4000)) throw Error('Archive links or special files are not permitted.');
          if (entry.generalPurposeBitFlag & 1) throw Error('Encrypted packages are not supported.');
          if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
          if (names.has(name.toLowerCase())) throw Error('Duplicate/case-colliding archive files.');
          names.add(name.toLowerCase());
          total += entry.uncompressedSize;
          if (entry.uncompressedSize > LIMIT || total > LIMIT) throw Error('Package exceeds the 256 MiB extraction limit.');
          const target = path.join(destination, name); await fs.mkdir(path.dirname(target), { recursive: true });
          const input = await new Promise((res, rej) => zip.openReadStream(entry, (e, stream) => e ? rej(e) : res(stream)));
          let actual = 0;
          const bound = new Transform({ transform(chunk, encoding, done) { actual += chunk.length; done(actual > entry.uncompressedSize || actual > LIMIT ? Error('Archive exceeded declared size.') : null, chunk); } });
          const file = await fs.open(target, 'wx', 0o600);
          try { await pipeline(input, bound, file.createWriteStream()); } finally { await file.close().catch(() => {}); }
          files.push({ name, path: target, size: actual }); zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  });
  return files;
}
function frameworkMap(files, platform) {
  let prefix = '';
  const core = files.find(f => /(?:^|\/)BepInEx\/core\/BepInEx\.dll$/i.test(f.name));
  if (!core) throw Error('Archive does not contain BepInEx 5 core.');
  prefix = core.name.slice(0, core.name.toLowerCase().indexOf('bepinex/core/bepinex.dll'));
  const mapped = [];
  for (const file of files) {
    if (!file.name.startsWith(prefix)) continue;
    const name = file.name.slice(prefix.length);
    if (/^BepInEx\//i.test(name) || /^(winhttp\.dll|doorstop_config\.ini|run_bepinex\.sh|libdoorstop(?:_x64)?\.so)$/i.test(name) || /^(doorstop_libs|unstripped_corlib)\//i.test(name)) mapped.push({ ...file, target: name });
  }
  if (!mapped.some(f => f.target.toLowerCase() === 'bepinex/core/bepinex.preloader.dll')) throw Error('BepInEx preloader is missing.');
  if (platform === 'win32' && !mapped.some(f => f.target.toLowerCase() === 'winhttp.dll')) throw Error('Select a Windows x64 BepInEx archive.');
  if (platform === 'linux' && !mapped.some(f => /(?:^|\/)libdoorstop(?:_x64)?\.so$/i.test(f.target))) throw Error('Select a Linux x64 BepInEx archive.');
  return mapped;
}
function pluginMap(files) {
  const mapped = [];
  for (const f of files) {
    const match = f.name.match(/(?:^|\/)BepInEx\/plugins\/(.+)$/i) || f.name.match(/^plugins\/(.+)$/i);
    if (match) mapped.push({ ...f, target: safeName(match[1]) });
  }
  if (!mapped.length) {
    // Standard local plugin packages may have a top-level DLL plus supporting assets.
    if (!files.some(f => /^[^/]+\.dll$/i.test(f.name))) throw Error('No plugin DLL found. Use a plugin ZIP with BepInEx/plugins or top-level DLLs.');
    for (const f of files) if (!/^(manifest\.json|icon\.png|readme.*|changelog.*|license.*)$/i.test(f.name)) {
      if (/^(BepInEx|config|patchers|doorstop_libs)\//i.test(f.name) || /\.(exe|bat|cmd|ps1|sh)$/i.test(f.name)) throw Error('Use a dedicated framework installer or a plugin-only package. Scripts and patchers are not installed as plugins.');
      mapped.push({ ...f, target: safeName(f.name) });
    }
  }
  if (!mapped.some(f => /\.dll$/i.test(f.target))) throw Error('No plugin DLL found.');
  const seen = new Set(); for (const f of mapped) { const key = f.target.toLowerCase(); if (seen.has(key)) throw Error('Plugin package has colliding paths.'); seen.add(key); }
  return mapped;
}
async function registry(install) {
  try { const data = JSON.parse(await fs.readFile(path.join(install, '.longship-mods.json'), 'utf8')); if (data.version !== 1 || !Array.isArray(data.mods)) throw Error('Unsupported mod registry.'); return data; }
  catch (e) { if (e.code === 'ENOENT') return { version: 1, mods: [] }; throw e; }
}
async function copyTree(source, dest, total = { bytes: 0, count: 0 }) {
  const st = await fs.lstat(source); if (st.isSymbolicLink()) throw Error('Symlinks cannot be backed up as mod data.');
  if (++total.count > 20000) throw Error('Mod backup contains too many files.');
  if (st.isDirectory()) { await fs.mkdir(dest, { recursive: true }); for (const entry of await fs.readdir(source)) await copyTree(path.join(source, entry), path.join(dest, entry), total); }
  else if (st.isFile()) { total.bytes += st.size; if (total.bytes > 1024 * 1024 * 1024) throw Error('Mod configuration backup exceeds 1 GiB.'); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(source, dest); }
}
class Mods {
  constructor(manager, maintenance) { this.manager = manager; this.maintenance = maintenance; }
  async list(id) {
    const p = this.manager.get(id), data = await registry(p.installDir);
    const exists = async relative => !!(await fs.stat(path.join(p.installDir, relative)).catch(() => null));
    return { framework: await exists('BepInEx/core/BepInEx.dll'), managed: data.mods, unmanaged: await this.scanUnmanaged(p.installDir, data.mods), configs: await this.configs(id) };
  }
  async scanUnmanaged(install, mods) {
    const found = [], root = path.join(install, 'BepInEx/plugins');
    async function walk(dir, depth = 0) { if (depth > 12 || found.length > 2000) return; for (const item of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) { if (item.isSymbolicLink()) continue; if (depth === 0 && item.name === 'Longship') continue; const file = path.join(dir, item.name); if (item.isDirectory()) await walk(file, depth + 1); else if (/\.dll$/i.test(item.name)) found.push(path.relative(root, file)); } }
    await walk(root); return found;
  }
  async configs(id) {
    const root = path.join(this.manager.get(id).installDir, 'BepInEx/config'), files = [];
    async function walk(dir, depth = 0) { if (depth > 8 || files.length > 1000) return; for (const item of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) { if (item.isSymbolicLink()) continue; const p = path.join(dir, item.name); if (item.isDirectory()) await walk(p, depth + 1); else if (/\.cfg$/i.test(item.name)) files.push(path.relative(root, p).split(path.sep).join('/')); } }
    await walk(root); return files;
  }
  async readConfig(id, relative) {
    relative = safeName(relative); if (!/\.cfg$/i.test(relative)) throw Error('Only .cfg files can be edited.');
    const root = path.join(this.manager.get(id).installDir, 'BepInEx/config'); await noLinks(root, relative);
    const file = path.join(root, relative), stat = await fs.stat(file); if (stat.size > 1024 * 1024) throw Error('Configuration exceeds 1 MiB.');
    const text = await fs.readFile(file, 'utf8'); return { text, sha: crypto.createHash('sha256').update(text).digest('hex') };
  }
  async writeConfig(id, relative, text, expected) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) throw Error('Configuration exceeds 1 MiB.');
    return this.maintenance.perform(id, 'Saving mod configuration', async p => {
      await this.maintenance.offline(id); const old = await this.readConfig(id, relative); if (old.sha !== expected) throw Error('Configuration changed on disk. Reload before saving.');
      const backup = path.join(this.manager.root, 'mod-backups', id, Date.now() + '-config', safeName(relative)); await atomic(backup, old.text);
      await atomic(path.join(p.installDir, 'BepInEx/config', safeName(relative)), text); return { backup };
    });
  }
  async snapshot(id) {
    const p = this.manager.get(id), dest = path.join(this.manager.root, 'mod-backups', id, Date.now() + '-prepatch');
    for (const relative of ['BepInEx/config', '.longship-mods.json', 'doorstop_config.ini']) {
      const source = path.join(p.installDir, relative);
      try { await fs.lstat(source); await copyTree(source, path.join(dest, relative)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return dest;
  }
  async install(id, archive, kind = 'plugin') {
    return this.maintenance.perform(id, kind === 'framework' ? 'Installing BepInEx' : 'Installing plugin', async p => {
      await this.maintenance.offline(id);
      const stage = path.join(this.manager.root, 'mod-staging', crypto.randomUUID()); await fs.mkdir(stage, { recursive: true });
      try {
        let files;
        if (/\.dll$/i.test(archive) && kind === 'plugin') { const stat = await fs.stat(archive); if (stat.size > LIMIT) throw Error('Plugin exceeds size limit.'); const target = path.join(stage, safeName(path.basename(archive))); await fs.copyFile(archive, target); files = [{ name: path.basename(archive), path: target, size: stat.size }]; }
        else if (/\.zip$/i.test(archive)) files = await extract(archive, stage);
        else throw Error('Choose a .zip package or a plugin .dll.');
        if (kind === 'framework') return await this.framework(id, p, files);
        const data = await registry(p.installDir), modId = crypto.randomUUID(), folder = `BepInEx/Longship-disabled/${modId}`;
        let manifest = {}; const mf = files.find(f => /(^|\/)manifest\.json$/i.test(f.name)); if (mf) { if (mf.size > 128 * 1024) throw Error('Manifest too large.'); manifest = JSON.parse(await fs.readFile(mf.path, 'utf8')); }
        const label = String(manifest.name || path.basename(archive).replace(/\.(zip|dll)$/i, '')).slice(0, 128);
        if (data.mods.some(m => m.name.toLowerCase() === label.toLowerCase())) throw Error('A package with this name is already managed. Remove it before replacing it.');
        const mapped = pluginMap(files); await noLinks(p.installDir, folder);
        await fs.mkdir(path.join(p.installDir, folder), { recursive: true });
        try { for (const file of mapped) { const dest = path.join(p.installDir, folder, file.target); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(file.path, dest); }
          data.mods.push({ id: modId, name: label, version: String(manifest.version_number || 'local'), enabled: false, dependencies: Array.isArray(manifest.dependencies) ? manifest.dependencies.map(String).slice(0, 100) : [], importedAt: new Date().toISOString() });
          await atomic(path.join(p.installDir, '.longship-mods.json'), JSON.stringify(data, null, 2));
        } catch (e) { await fs.rm(path.join(p.installDir, folder), { recursive: true, force: true }); throw e; }
        return { name: label, files: mapped.length, dependencies: data.mods.at(-1).dependencies };
      } finally { await fs.rm(stage, { recursive: true, force: true }); }
    });
  }
  async framework(id, p, files) {
    const mapped = frameworkMap(files, this.manager.platform), backup = path.join(this.manager.root, 'mod-backups', id, Date.now() + '-framework');
    const applied = [];
    try { for (const file of mapped) {
      await noLinks(p.installDir, file.target); const dest = path.join(p.installDir, file.target), prior = path.join(backup, file.target);
      let existed = false; try { const stat = await fs.lstat(dest); if (!stat.isFile()) throw Error('Framework target is not a regular file.'); existed = true; await fs.mkdir(path.dirname(prior), { recursive: true }); await fs.copyFile(dest, prior); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      applied.push({ dest, prior, existed }); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(file.path, dest); if (/\.(sh|so)$/i.test(dest)) await fs.chmod(dest, 0o755);
    } return { files: mapped.length, backup };
    } catch (error) { const failures = []; for (const file of applied.reverse()) try { if (file.existed) await fs.copyFile(file.prior, file.dest); else await fs.unlink(file.dest); } catch (e) { failures.push(e.message); } if (failures.length) throw Error(`Installation failed and rollback needs attention. Backup: ${backup}. ${error.message}`); throw error; }
  }
  async toggle(id, modId, enabled) {
    return this.maintenance.perform(id, enabled ? 'Enabling plugin' : 'Disabling plugin', async p => {
      await this.maintenance.offline(id); const data = await registry(p.installDir), mod = data.mods.find(m => m.id === modId);
      if (!mod || !/^[0-9a-f-]{36}$/.test(mod.id)) throw Error('Unknown managed mod.'); if (mod.enabled === enabled) return;
      const from = `${mod.enabled ? 'BepInEx/plugins/Longship' : 'BepInEx/Longship-disabled'}/${mod.id}`, to = `${enabled ? 'BepInEx/plugins/Longship' : 'BepInEx/Longship-disabled'}/${mod.id}`;
      await noLinks(p.installDir, from); await noLinks(p.installDir, to); await fs.mkdir(path.dirname(path.join(p.installDir, to)), { recursive: true }); await fs.rename(path.join(p.installDir, from), path.join(p.installDir, to)); mod.enabled = enabled;
      try { await atomic(path.join(p.installDir, '.longship-mods.json'), JSON.stringify(data, null, 2)); } catch (e) { await fs.rename(path.join(p.installDir, to), path.join(p.installDir, from)); throw e; }
    });
  }
  async remove(id, modId) {
    return this.maintenance.perform(id, 'Removing managed plugin', async p => {
      await this.maintenance.offline(id); const data = await registry(p.installDir), mod = data.mods.find(m => m.id === modId);
      if (!mod || !/^[0-9a-f-]{36}$/.test(mod.id)) throw Error('Unknown managed mod.');
      const relative = `${mod.enabled ? 'BepInEx/plugins/Longship' : 'BepInEx/Longship-disabled'}/${mod.id}`; await noLinks(p.installDir, relative);
      const archive = path.join(this.manager.root, 'mod-archives', id, Date.now() + '-' + mod.id); await copyTree(path.join(p.installDir, relative), archive);
      // Move to an inactive tombstone until registry publication succeeds.
      const tombstone = path.join(p.installDir, 'BepInEx/Longship-removed', mod.id); await fs.mkdir(path.dirname(tombstone), { recursive: true }); await fs.rename(path.join(p.installDir, relative), tombstone);
      data.mods = data.mods.filter(m => m.id !== modId);
      try { await atomic(path.join(p.installDir, '.longship-mods.json'), JSON.stringify(data, null, 2)); } catch (e) { await fs.rename(tombstone, path.join(p.installDir, relative)); throw e; }
      await fs.rm(tombstone, { recursive: true, force: true }); return { archive };
    });
  }
}
async function modEnvironment(p, platform) {
  const env = {};
  if (!p.modsEnabled) { const config=await fs.readFile(path.join(p.installDir,'doorstop_config.ini'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});if(/^\s*(ignore_disable_switch|ignoreDisableSwitch)\s*=\s*true/mi.test(config))throw Error('Doorstop is configured to ignore disabling. Set ignore_disable_switch=false before choosing vanilla launch.');env.DOORSTOP_DISABLE = '1'; env.DOORSTOP_ENABLE = 'FALSE'; env.DOORSTOP_ENABLED = '0'; return env; }
  const preloader = path.join(p.installDir, 'BepInEx/core/BepInEx.Preloader.dll'); await fs.access(preloader);
  env.DOORSTOP_ENABLE = 'TRUE'; env.DOORSTOP_ENABLED = '1'; env.DOORSTOP_INVOKE_DLL_PATH = preloader; env.DOORSTOP_TARGET_ASSEMBLY = preloader;
  if (platform === 'linux') {
    const candidates = [p.doorstopLibrary, path.join(p.installDir, 'libdoorstop_x64.so'), path.join(p.installDir, 'libdoorstop.so'), path.join(p.installDir, 'doorstop_libs/libdoorstop_x64.so')].filter(Boolean);
    let library; for (const file of candidates) if (await fs.stat(file).catch(() => null)) { library = file; break; }
    if (!library) throw Error('Linux Doorstop x64 library is missing. Install a Linux BepInEx package or select the library path.');
    if(!/^[A-Za-z0-9_.-]+\.so$/.test(path.basename(library)))throw Error('Doorstop library filename cannot contain spaces or delimiters.');env.LD_PRELOAD = path.basename(library); env.LD_LIBRARY_PATH = [path.dirname(library), path.join(p.installDir, 'linux64'), p.installDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    const corlib = path.join(p.installDir, 'unstripped_corlib'); if (await fs.stat(corlib).catch(() => null)) { env.DOORSTOP_CORLIB_OVERRIDE_PATH = corlib; env.DOORSTOP_MONO_DLL_SEARCH_PATH_OVERRIDE = corlib; }
  }
  return env;
}
module.exports = { safeName, noLinks, extract, frameworkMap, pluginMap, registry, Mods, modEnvironment, copyTree };

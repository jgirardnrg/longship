const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const BACKUP = /(?:_backup(?:_auto)?[-_]\d{8}[-_]?\d{6}|\.(?:old|bak|tmp|current))(?:$|[._-])/i;
const SKIP = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information', 'backups', 'mod-backups', 'mod-staging']);
const identity = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function defaultSaveRoot(platform = process.platform, home = os.homedir()) {
  if (platform === 'win32') return path.join(home, 'AppData', 'LocalLow', 'IronGate', 'Valheim');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'unity.IronGate.Valheim');
  return path.join(home, '.config', 'unity3d', 'IronGate', 'Valheim');
}
function location(folder, format) {
  const container = format === 'chunked' ? path.dirname(folder) : folder;
  if (/^worlds(?:_local)?$/i.test(path.basename(container))) return { saveDir: path.dirname(container), launchable: true, reason: '' };
  return { saveDir: null, launchable: false, reason: 'Outside a standard worlds_local/worlds directory. Import a stopped copy into a Valheim save root before launching.' };
}
function completeGenerations(entries) {
  const files = new Map(entries.filter(e => e.isFile()).map(e => [e.name.toLowerCase(), e.name]));
  const found = [];
  for (const [lower, real] of files) {
    const m = lower.match(/^_main\.(\d{1,24})\.fwl2$/);
    if (!m) continue;
    const prefix = `_main.${m[1]}`;
    if (['.db2', '.chunks', '.ok'].every(ext => files.has(prefix + ext))) found.push({ generation: m[1], metadataFile: real });
  }
  return found.sort((a, b) => BigInt(a.generation) > BigInt(b.generation) ? -1 : BigInt(a.generation) < BigInt(b.generation) ? 1 : 0);
}
async function discoverWorlds(dir, options = {}) {
  const limits = { maxDepth: 32, maxDirectories: 20000, maxEntries: 300000, maxMs: 15000, ...options };
  const roots = [options.includeDefaults ? defaultSaveRoot(options.platform, options.home) : null, dir].filter(v => typeof v === 'string' && v.trim());
  const seen = new Set(), found = [], warnings = []; let directories = 0, entryCount = 0, truncated = false;
  const deadline = Date.now() + limits.maxMs;
  function warn(message) { if (warnings.length < 20) warnings.push(message); }
  async function walk(folder, depth) {
    if (depth > limits.maxDepth || directories >= limits.maxDirectories || entryCount >= limits.maxEntries || Date.now() > deadline) { truncated = true; return; }
    let canonical;
    try { const stat = await fs.lstat(folder); if (stat.isSymbolicLink()) { warn('Skipped a linked directory: ' + folder); return; } if (!stat.isDirectory()) return; canonical = await fs.realpath(folder); }
    catch (e) { if (e.code !== 'ENOENT') warn(`Cannot inspect ${folder}: ${e.code || e.message}`); return; }
    const key = identity(canonical); if (seen.has(key)) return; seen.add(key); directories++;
    let entries; try { entries = await fs.readdir(canonical, { withFileTypes: true }); }
    catch (e) { warn(`Cannot read ${folder}: ${e.code || e.message}`); return; }
    entryCount += entries.length;
    const complete = completeGenerations(entries);
    if (complete.length) {
      const chosen = complete[0];
      found.push({ name: path.basename(canonical), format: 'chunked', folder: canonical, path: canonical, generation: chosen.generation, size: null, ...location(canonical, 'chunked') });
      return; // Chunk data is one world, not additional worlds to recurse into.
    }
    const byName = new Map(entries.filter(e => e.isFile()).map(e => [e.name.toLowerCase(), e.name]));
    for (const entry of entries) {
      if (!entry.isFile() || !/\.fwl$/i.test(entry.name)) continue;
      const name = entry.name.slice(0, -4); if (BACKUP.test(name)) continue;
      const dbName = byName.get((name + '.db').toLowerCase()); if (!dbName) continue;
      const dbFile = path.join(canonical, dbName), metadataFile = path.join(canonical, entry.name);
      const stat = await fs.lstat(dbFile).catch(() => null); if (!stat?.isFile()) continue;
      found.push({ name, format: 'legacy', folder: canonical, path: metadataFile, metadataFile, dbFile, size: stat.size, ...location(canonical, 'legacy') });
    }
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
      if(entry.isSymbolicLink()){warn('Skipped a linked directory or file: '+path.join(canonical,entry.name));continue;}
      if (!entry.isDirectory() || BACKUP.test(entry.name) || SKIP.has(entry.name.toLowerCase())) continue;
      if (Date.now() > deadline || directories >= limits.maxDirectories || entryCount >= limits.maxEntries) { truncated = true; break; }
      await walk(path.join(canonical, entry.name), depth + 1);
    }
  }
  for (const root of roots) await walk(path.resolve(root), 0);
  // A directly selected world folder still needs its actual Valheim root discovered.
  found.sort((a,b) => a.name.localeCompare(b.name) || a.folder.localeCompare(b.folder) || a.format.localeCompare(b.format));
  if (truncated) warn('Scan limit reached. Choose a narrower folder to find remaining worlds.');
  return { worlds: found, warnings, truncated, directories };
}
async function worlds(dir, options = {}) { return (await discoverWorlds(dir, options)).worlds; }
async function selectedWorld(p, { optional = false } = {}) {
  const result = await discoverWorlds(p.saveDir);
  if (result.truncated || result.warnings.some(w=>/^Cannot (read|inspect)/.test(w))) throw Error('World scan was incomplete; choose a narrower, readable save directory before backup or launch.');
  let matches = result.worlds.filter(w => w.name === p.world);
  if (p.worldPath) {const selected=await fs.realpath(p.worldPath).catch(()=>p.worldPath);matches = matches.filter(w => identity(w.path) === identity(selected));}
  if (matches.length !== 1) {
    if (optional && matches.length === 0 && !p.worldPath) { if(await worldArtifacts(p))throw Error('World files or a world directory exist, but no complete save generation was found. Refusing to create a replacement world.');return null; }
    throw Error(matches.length ? 'Multiple saves share this world name. Select its exact location using Find worlds.' : 'Selected world was not found or has no complete save generation.');
  }
  const world = matches[0];
  if (!world.launchable) throw Error(world.reason);
  const configuredRoot=await fs.realpath(p.saveDir);
  if (identity(world.saveDir) !== identity(configuredRoot)) throw Error('The selected world belongs to a different save root. Select it with Find worlds to correct the save directory.');
  return world;
}
async function worldArtifacts(p) {
  for(const folder of [p.saveDir,path.join(p.saveDir,'worlds_local'),path.join(p.saveDir,'worlds')]) {
    for(const ext of ['.db','.fwl','.db2','.fwl2'])if(await fs.lstat(path.join(folder,p.world+ext)).catch(()=>null))return true;
    const directory=path.join(folder,p.world);const st=await fs.lstat(directory).catch(()=>null);
    if(st?.isSymbolicLink())return true;
    if(st?.isDirectory()&&(await fs.readdir(directory)).length)return true;
  }
  return false;
}
async function copyWorldDirectory(source, destination, state = { count: 0, bytes: 0 }) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw Error('Linked world files cannot be backed up safely.');
  if (++state.count > 200000) throw Error('World backup exceeds the file-count limit.');
  if (stat.isDirectory()) { await fs.mkdir(destination, { recursive: true }); for (const item of await fs.readdir(source)) await copyWorldDirectory(path.join(source,item), path.join(destination,item),state); }
  else if (stat.isFile()) { state.bytes += stat.size; if (state.bytes > 256 * 1024 ** 3) throw Error('World backup exceeds 256 GiB.'); await fs.copyFile(source,destination); }
  else throw Error('World contains an unsupported special file.');
}
module.exports = { BACKUP, defaultSaveRoot, location, completeGenerations, discoverWorlds, worlds, selectedWorld, worldArtifacts, copyWorldDirectory, identity };

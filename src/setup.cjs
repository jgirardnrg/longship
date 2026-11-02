const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { extract, safeName } = require('./mods.cjs');
const { command, SteamClient, installedBuild } = require('./steam.cjs');
const SOURCES = {
  win32: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
  linux: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'
};
async function download(url, file, log) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'error' });
  if (!response.ok || !response.body) throw Error('SteamCMD download failed: HTTP ' + response.status);
  const limit = 32 * 1024 * 1024; let size = 0;
  const handle = await fs.open(file, 'wx', 0o600);
  try { for await (const bytes of response.body) { size += bytes.length; if (size > limit) throw Error('SteamCMD archive exceeded the download limit.'); await handle.writeFile(bytes); } } finally { await handle.close(); }
  log(`Downloaded SteamCMD bootstrap (${Math.ceil(size / 1024)} KiB) from Valve.`);
}
async function extractTar(archive, destination) {
  const bytes = zlib.gunzipSync(await fs.readFile(archive), { maxOutputLength: 128 * 1024 * 1024 });
  let at = 0, count = 0; const seen = new Set();
  const str = b => b.toString('utf8').replace(/\0.*$/s, '');
  while (at + 512 <= bytes.length) {
    const header = bytes.subarray(at, at + 512); at += 512;
    if (header.every(b => b === 0)) return;
    if (++count > 2048) throw Error('Too many SteamCMD archive entries.');
    const number = field => { const text = str(field).trim(); if (!/^[0-7]+$/.test(text)) throw Error('Invalid TAR number.'); return parseInt(text, 8); };
    const checksum = number(header.subarray(148, 156)); let actual = 0;
    for (let i = 0; i < 512; i++) actual += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== actual) throw Error('SteamCMD archive checksum failed.');
    let name = str(header.subarray(0, 100)), prefix = str(header.subarray(345, 500));
    if (prefix) name = prefix + '/' + name;
    name = safeName(name.replace(/^\.\//, ''));
    const size = number(header.subarray(124, 136)), type = header[156];
    if (size > 64 * 1024 * 1024 || at + size > bytes.length) throw Error('Invalid SteamCMD archive size.');
    if (seen.has(name.toLowerCase())) throw Error('Duplicate SteamCMD archive path.'); seen.add(name.toLowerCase());
    if (![0, 48, 53].includes(type)) throw Error('SteamCMD archive contains a link or special file.');
    const target = path.join(destination, name);
    if (type === 53) await fs.mkdir(target, { recursive: true });
    else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes.subarray(at, at + size), { flag: 'wx', mode: number(header.subarray(100, 108)) & 0o111 ? 0o700 : 0o600 }); }
    at += Math.ceil(size / 512) * 512;
  }
  throw Error('Incomplete SteamCMD TAR archive.');
}
async function absent(target) { try { await fs.lstat(target); throw Error('Destination already exists. Select the existing installation or choose a new folder.'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
class Setup {
  constructor(root, { platform = process.platform, run = command, fetchArchive = download, steam = new SteamClient() } = {}) { this.root = root; this.platform = platform; this.run = run; this.download = fetchArchive; this.steam = steam; this.job = { busy: false, phase: 'idle', lines: [] }; this.changed = () => {}; }
  line(text) { this.job.lines.push({ time: new Date().toISOString(), text: String(text).slice(0, 4096) }); this.job.lines = this.job.lines.slice(-300); this.changed(); }
  async perform(phase, fn) { if (this.job.busy) throw Error('Setup is already in progress.'); if (!SOURCES[this.platform]) throw Error('Automatic dedicated-server setup supports Windows x64 and Linux x64.'); this.job = { busy: true, phase, lines: [], error: null }; this.changed(); try { const result = await fn(); this.job.phase = 'complete'; return result; } catch (e) { this.job.phase = 'failed'; this.job.error = e.message; throw e; } finally { this.job.busy = false; this.changed(); } }
  async installSteam() {
    return this.perform('Installing SteamCMD', async () => {
      const destination = path.join(this.root, 'tools/steamcmd'), exe = path.join(destination, this.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');
      try { if ((await fs.stat(exe)).isFile()) return { steamcmdPath: exe, existing: true }; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await absent(destination); await fs.mkdir(path.dirname(destination), { recursive: true });
      const stage = await fs.mkdtemp(path.join(path.dirname(destination), '.steamcmd-'));
      try {
        const archive = path.join(stage, this.platform === 'win32' ? 'download.zip' : 'download.tar.gz'), content = path.join(stage, 'files'); await fs.mkdir(content);
        await this.download(SOURCES[this.platform], archive, text => this.line(text));
        if (this.platform === 'win32') await extract(archive, content); else await extractTar(archive, content);
        const executable = path.join(content, this.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh'); await fs.access(executable);
        this.line('Initializing SteamCMD. Linux needs 32-bit glibc/libstdc++ libraries; Longship never installs system packages as root.');
        for(let attempt=0;attempt<3;attempt++){try{await this.run(executable, ['+quit'], { log: text => this.line(text), timeout: 10 * 60 * 1000 });break;}catch(e){if(this.platform!=='win32'||attempt===2||!/^SteamCMD exited with code 7\./.test(e.message))throw e;this.line('SteamCMD updated its bootstrap; completing initialization.');}}
        await absent(destination); await fs.rename(content, destination);
        return { steamcmdPath: exe };
      } finally { await fs.rm(stage, { recursive: true, force: true }); }
    });
  }
  async installServer(destination, steamcmdPath) {
    return this.perform('Installing Valheim dedicated server', async () => {
      if (!path.isAbsolute(destination || '') || !path.isAbsolute(steamcmdPath || '')) throw Error('Select absolute server and SteamCMD paths.');
      await absent(destination); await fs.mkdir(path.dirname(destination), { recursive: true });
      // A fresh sibling staging folder prevents failed downloads touching existing servers.
      const stage = await fs.mkdtemp(path.join(path.dirname(destination), '.longship-server-'));
      try {
        this.line('Installing public Valheim Dedicated Server (896660), anonymous Steam login. No server will be started.');
        const profile={installDir:stage,steamcmdPath};
        this.line('Loading public server depot configuration.');
        const remote=await this.steam.check(profile,text=>this.line(text));
        const result = await this.steam.apply(profile, remote.latest, text => this.line(text));
        const exe = path.join(stage, this.platform === 'win32' ? 'valheim_server.exe' : 'valheim_server.x86_64');
        if (!(await fs.stat(exe)).isFile()) throw Error('Steam reported success but the server executable is missing.');
        await installedBuild(stage); await absent(destination); await fs.rename(stage, destination);
        this.line('Server installed and verified. Configure its world, password and ports before starting.');
        return { installDir: destination, buildId: result.installed };
      } catch (e) { this.line('Incomplete download preserved at ' + stage); throw Error(e.message + ' Incomplete download: ' + stage); }
    });
  }
}
module.exports = { Setup, download, extractTar, SOURCES };

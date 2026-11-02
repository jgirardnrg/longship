const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parseVdf } = require('./steam.cjs');
const run = promisify(execFile);
async function windowsRoots() {
  const roots = [];
  for (const key of ['HKCU\\Software\\Valve\\Steam', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam']) {
    try { const { stdout } = await run('reg.exe', ['query', key], { windowsHide: true, timeout: 5000 });
      for (const match of stdout.matchAll(/(?:SteamPath|InstallPath)\s+REG_SZ\s+([^\r\n]+)/gi)) roots.push(match[1].trim());
    } catch {} // Optional registry locations; manual browsing remains available.
  }
  return roots;
}
async function runningDirectories(platform) {
  try {
    if(platform==='win32'){
      const script = `@(Get-CimInstance Win32_Process -Filter "Name='valheim_server.exe'" | Select-Object -ExpandProperty ExecutablePath) | ConvertTo-Json -Compress`;
      const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000});
      const data=stdout.trim()?JSON.parse(stdout.replace(/^\uFEFF/,'')):[];return (Array.isArray(data)?data:[data]).filter(p=>typeof p==='string'&&path.win32.isAbsolute(p)).map(p=>path.win32.dirname(p));
    }
    if(platform==='linux'){
      const found=[];for(const pid of (await fs.readdir('/proc')).filter(p=>/^\d+$/.test(p)).slice(0,8192)){try{const file=await fs.readlink('/proc/'+pid+'/exe');if(path.basename(file)==='valheim_server.x86_64')found.push(path.dirname(file));}catch{}}return found;
    }
  }catch{}return [];
}
async function discover({ platform = process.platform, home = os.homedir(), env = process.env, profiles = [], toolRoot = '', roots = null, registry = windowsRoots, processes = runningDirectories } = {}) {
  const p = platform === 'win32' ? path.win32 : path;
  const steam = [], candidates = [], tools = [], warnings = [];
  const add = (list, value) => { if (value && p.isAbsolute(value) && !list.includes(value)) list.push(value); };
  if (roots) for (const root of roots) add(steam, root);
  else if (platform === 'win32') {
    for (const root of await registry()) add(steam, root);
    for (const root of [env['ProgramFiles(x86)'], env.ProgramFiles]) if (root) add(steam, p.join(root, 'Steam'));
    for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') for (const name of ['Steam', 'SteamLibrary']) add(steam, `${drive}:\\${name}`);
  } else {
    for (const root of platform === 'darwin' ? [p.join(home, 'Library/Application Support/Steam')] : [p.join(home, '.steam/steam'), p.join(home, '.local/share/Steam'), p.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam')]) add(steam, root);
  }
  for (const root of [...steam]) {
    try { const file = p.join(root, 'steamapps/libraryfolders.vdf'), stat = await fs.stat(file); if (stat.size > 8 * 1024 * 1024) throw Error('metadata too large');
      const data = parseVdf((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')).libraryfolders || {};
      for (const value of Object.values(data)) add(steam, typeof value === 'string' ? value : value?.path);
    } catch (e) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(e.code)) warnings.push(`Could not read Steam libraries at ${root}: ${e.message}`); }
  }
  for (const root of steam) {
    add(candidates, p.join(root, 'steamapps/common/Valheim dedicated server'));
    add(candidates, p.join(root, 'steamapps/common/Valheim Dedicated Server'));
  }
  if(!roots)for(const root of await processes(platform))add(candidates,root);
  for (const profile of profiles) { add(candidates, profile.installDir); add(tools, profile.steamcmdPath); }
  const toolName = platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh';
  if (toolRoot) add(tools, p.join(toolRoot, toolName));
  const common = platform === 'win32' ? ['C:\\steamcmd', 'C:\\valheimserver', 'C:\\valheimserver2', p.join(home, 'steamcmd'), p.join(home, 'Longship/servers')] : [p.join(home, 'steamcmd'), p.join(home, 'Steam'), p.join(home, 'valheim'), p.join(home, 'valheimserver'), p.join(home, 'Longship/servers'), '/opt/valheim', '/opt/steamcmd', '/srv/valheim'];
  for (const root of [...common, ...steam]) {
    add(candidates, root); add(candidates,p.join(root,'steamapps/common/Valheim dedicated server')); add(tools, p.join(root, toolName));
    // Bounded, one-level lookup finds sibling server copies without crawling disks or saves.
    try { for (const entry of (await fs.readdir(root, { withFileTypes: true })).slice(0, 256)) if (entry.isDirectory() && !entry.isSymbolicLink() && /valheim|server|steamcmd/i.test(entry.name)) { add(candidates, p.join(root, entry.name)); add(tools, p.join(root, entry.name, toolName)); } } catch {}
  }
  for (const root of (env.PATH || '').split(platform === 'win32' ? ';' : ':')) { add(tools, root && p.join(root, toolName)); if (platform === 'linux') add(tools, root && p.join(root, 'steamcmd')); }
  const servers = [], steamcmd = [], seen = new Set();
  for (const [list, paths, executable] of [[servers, candidates, platform === 'win32' ? 'valheim_server.exe' : 'valheim_server.x86_64'], [steamcmd, tools, null]]) for (const item of paths.slice(0, 512)) {
    try { const file = executable ? p.join(item, executable) : item; if (!(await fs.stat(file)).isFile()) continue; const real = await fs.realpath(executable ? item : file), key = (platform === 'win32' ? real.toLowerCase() : real) + ':' + !!executable; if (seen.has(key)) continue; seen.add(key); list.push(executable ? { installDir: real, executable: file } : real); } catch {}
  }
  return { servers, steamcmd, warnings, saveDir: platform === 'win32' ? p.join(env.USERPROFILE || home, 'AppData/LocalLow/IronGate/Valheim') : platform === 'linux' ? p.join(home, '.config/unity3d/IronGate/Valheim') : p.join(home, 'Library/Application Support/IronGate/Valheim') };
}
module.exports = { discover };

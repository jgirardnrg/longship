const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const APP_ID = '896660';
function parseVdf(text) {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) throw Error('Steam metadata exceeds limits.');
  const tokens = text.match(/"(?:\\.|[^"\\])*"|\{|\}|[^\s{}"]+/g) || [];
  let at = 0;
  const word = token => token?.startsWith('"') ? token.slice(1, -1).replace(/\\(["\\])/g, '$1') : token;
  function object(depth = 0, nested = false) {
    if (depth > 32) throw Error('Steam metadata is too deeply nested.');
    const result = Object.create(null);
    while (at < tokens.length) {
      const key = word(tokens[at++]);
      if (key === '}') { if (!nested) throw Error('Unexpected metadata brace.'); return result; }
      if (!key || key === '{') throw Error('Invalid metadata key.');
      if (at >= tokens.length) throw Error('Incomplete Steam metadata.');
      const value = tokens[at++];
      result[key] = value === '{' ? object(depth + 1, true) : word(value);
    }
    if (nested) throw Error('Unclosed Steam metadata object.');
    return result;
  }
  return object();
}
function appBlock(output) {
  const start = output.search(/"896660"\s*\{/);
  if (start < 0) throw Error('SteamCMD returned no Valheim server metadata.');
  let depth = 0, quoted = false, escaped = false, opened = false;
  for (let i = start; i < output.length; i++) {
    const c = output[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') { depth++; opened = true; }
    else if (c === '}' && --depth === 0 && opened) return output.slice(start, i + 1);
  }
  throw Error('Incomplete SteamCMD metadata.');
}
async function installedBuild(installDir) {
  for (const file of [...new Set([
    path.join(installDir, 'steamapps', `appmanifest_${APP_ID}.acf`),
    path.join(installDir, `appmanifest_${APP_ID}.acf`),
    path.resolve(installDir, '..', '..', `appmanifest_${APP_ID}.acf`)
  ])]) {
    try {
      const data = parseVdf(await fs.readFile(file, 'utf8')).AppState;
      if (data?.appid !== APP_ID || !/^\d+$/.test(data.buildid || '')) continue;
      const branch = data.UserConfig?.BetaKey || data.UserConfig?.betakey || 'public';
      if (branch !== 'public') throw Error('This installation uses a beta branch. Longship currently updates only the public branch.');
      return { buildId: data.buildid, file };
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return { buildId: null, file: null };
}
async function command(executable, argv, { log = () => {}, timeout = 120000 } = {}) {
  if (!path.isAbsolute(executable || '')) throw Error('Choose the SteamCMD executable first.');
  await fs.access(executable);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { cwd: path.dirname(executable), shell: false, windowsHide: true });
    let output = '', fragment = '', settled = false;
    const timer = setTimeout(() => { child.kill(); finish(Error('SteamCMD timed out. Server remains stopped if an update was in progress.')); }, timeout);
    function finish(error) { if (settled) return; settled = true; clearTimeout(timer); if (fragment) log(fragment); error ? reject(error) : resolve(output); }
    function receive(bytes) {
      output += bytes.toString();
      if (output.length > 8 * 1024 * 1024) { child.kill(); finish(Error('SteamCMD output exceeded the limit.')); return; }
      const lines = (fragment + bytes.toString()).split(/\r?\n/); fragment = lines.pop().slice(-16384);
      for (const line of lines) log(line);
    }
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.once('error', finish);
    child.once('close', code => finish(code === 0 ? null : Error(`SteamCMD exited with code ${code}. Check the maintenance log.`)));
  });
}
class SteamClient {
  constructor({ run = command } = {}) { this.run = run; this.queue = Promise.resolve(); }
  serial(fn) { const next = this.queue.then(fn, fn); this.queue = next.catch(() => {}); return next; }
  async check(profile, log = () => {}) {
    return this.serial(async () => {
      const installed = await installedBuild(profile.installDir);
      const output = await this.run(profile.steamcmdPath, ['+login', 'anonymous', '+app_info_update', '1', '+app_info_print', APP_ID, '+quit'], { log });
      const remote = parseVdf(appBlock(output))[APP_ID]?.depots?.branches?.public?.buildid;
      if (!/^\d+$/.test(remote || '')) throw Error('SteamCMD did not report a public-branch build ID.');
      return { checkedAt: Date.now(), installed: installed.buildId, latest: remote, available: installed.buildId === null ? null : installed.buildId !== remote };
    });
  }
  async apply(profile, latest, log = () => {}) {
    return this.serial(async () => {
      await installedBuild(profile.installDir); // Reject beta installations before mutation.
      const output = await this.run(profile.steamcmdPath, ['+force_install_dir', profile.installDir, '+login', 'anonymous', '+app_update', APP_ID, 'validate', '+quit'], { log, timeout: 30 * 60 * 1000 });
      if (!/Success!\s+App\s+'?896660'?\s+(?:fully installed|already up to date)/i.test(output)) throw Error('SteamCMD did not confirm a successful server update.');
      const installed = await installedBuild(profile.installDir);
      if (!installed.buildId) throw Error('Updated server manifest is missing. Server left stopped.');
      // The public build may legitimately advance after the initial check; verify against a fresh check afterward.
      return { installed: installed.buildId, previousLatest: latest };
    });
  }
}
module.exports = { APP_ID, parseVdf, appBlock, installedBuild, command, SteamClient };

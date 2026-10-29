const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { checkPorts } = require('./ports.cjs');
const { atomic } = require('./storage.cjs');
const run = promisify(execFile);
const key = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
async function externalServers(installDir) {
  const expected = key(path.join(installDir, process.platform === 'win32' ? 'valheim_server.exe' : 'valheim_server.x86_64'));
  if (process.platform === 'win32') {
    const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='valheim_server.exe'\" | Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress";
    const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 });
    let list = result.stdout.trim() ? JSON.parse(result.stdout) : []; if (!Array.isArray(list)) list = [list];
    if (list.some(p => !p.ExecutablePath)) throw Error('Cannot inspect a running Valheim process. Maintenance refused.');
    return list.filter(p => key(p.ExecutablePath) === expected).map(p => p.ProcessId);
  }
  if (process.platform !== 'linux') return []; // Development host; managed-process checks still apply.
  const found = [];
  for (const name of await fs.readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    let comm; try { comm = (await fs.readFile(`/proc/${name}/comm`, 'utf8')).trim(); } catch (e) { if (['ENOENT', 'ESRCH', 'EACCES'].includes(e.code)) continue; throw e; }
    if (!comm.startsWith('valheim_server')) continue;
    let exe; try { exe = await fs.readlink(`/proc/${name}/exe`); } catch (e) { if (['ENOENT', 'ESRCH'].includes(e.code)) continue; throw Error('Cannot inspect a running Valheim server; maintenance refused.'); }
    if (key(exe.replace(/ \(deleted\)$/, '')) === expected) found.push(Number(name));
  }
  return found;
}
class Maintenance {
  constructor(manager, { inspect = externalServers } = {}) { this.manager = manager; this.inspect = inspect; this.jobs = new Map(); this.locks = new Set(); }
  state(id) { return this.jobs.get(id) || { busy: false, phase: 'idle', lines: [] }; }
  locked(install) { return this.locks.has(key(install)); }
  line(id, text) { const job = this.state(id); job.lines.push({ time: new Date().toISOString(), text: String(text).slice(0, 16384) }); job.lines = job.lines.slice(-1500); this.manager.emit('changed'); }
  async offline(id) {
    const p = this.manager.get(id);
    if (this.manager.profiles.some(q => key(q.installDir) === key(p.installDir) && (this.manager.active(q.id) || this.manager.pendingStarts.has(q.id)))) throw Error('All servers sharing this installation must be fully stopped first.');
    if ((await this.inspect(p.installDir)).length) throw Error('An unmanaged Valheim process uses this installation. Stop it through its existing owner first.');
    await checkPorts(p.port);
  }
  async perform(id, phase, fn) {
    const p = this.manager.get(id), lockKey = key(p.installDir);
    if (this.locked(p.installDir) || this.manager.profiles.some(q => key(q.installDir) === lockKey && this.manager.pendingStarts.has(q.id))) throw Error('This installation already has an operation in progress.');
    this.locks.add(lockKey); const job = { busy: true, phase, started: Date.now(), lines: [], error: null }; this.jobs.set(id, job); this.manager.emit('changed');
    let handle, file = path.join(p.installDir, '.longship-maintenance.lock');
    try { handle = await fs.open(file, 'wx', 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, started: job.started, phase })); const result = await fn(p, job); job.phase = 'complete'; return result; }
    catch (e) { job.error = e.message; job.phase = 'failed';if(e.recoveryRequired)job.recoveryRequired=true; throw e; }
    finally { if (handle) { await handle.close(); if(!job.recoveryRequired)await fs.unlink(file).catch(() => {}); } job.busy = false; this.locks.delete(lockKey); this.manager.emit('changed'); await atomic(path.join(this.manager.root, 'maintenance', id + '.json'), JSON.stringify(job, null, 2)).catch(() => {}); }
  }
  async waitStopped(id, timeout = 120000) {
    const started = Date.now();
    while (this.manager.active(id)) { if (Date.now() - started > timeout) throw Error('Server has not exited after graceful shutdown. Update cancelled; no files patched and no force kill.'); await new Promise(r => setTimeout(r, 100)); }
    if (this.manager.state(id).status !== 'stopped') throw Error('Server exit was not clean; inspect logs before maintenance.');
  }
}
module.exports = { Maintenance, externalServers, key };

const fs = require('node:fs/promises');
const path = require('node:path');
const { key } = require('./maintenance.cjs');
const { backup, selectedWorld } = require('./storage.cjs');
class Updates {
  constructor(manager, maintenance, steam, mods) { this.manager = manager; this.maintenance = maintenance; this.steam = steam; this.mods = mods; this.results = new Map(); this.checking = new Map(); this.attempted = new Map(); }
  state(id) { return { ...(this.results.get(id) || { checkedAt: null, available: null }), checking: this.checking.has(id) }; }
  async check(id) {
    if (this.checking.has(id)) return this.checking.get(id);
    const p = { ...this.manager.get(id) }; if (this.maintenance.locked(p.installDir)) throw Error('Maintenance is in progress.');
    this.attempted.set(id, Date.now());
    const task = this.steam.check(p).then(result => {
      this.results.set(id, result); this.manager.emit('changed'); return result;
    }).catch(error => { const state = { ...(this.results.get(id) || {}), error: error.message, failedAt: Date.now() }; this.results.set(id, state); throw error; }).finally(() => { this.checking.delete(id); this.manager.emit('changed'); });
    this.checking.set(id, task); this.manager.emit('changed'); return task;
  }
  autoCheck() {
    for (const p of this.manager.profiles) {
      if (!p.updateCheckEnabled || !p.steamcmdPath || this.checking.has(p.id) || this.maintenance.locked(p.installDir)) continue;
      const interval = (p.updateCheckHours || 6) * 3600000;
      if (Date.now() - (this.attempted.get(p.id) || 0) >= interval) this.check(p.id).catch(error => this.manager.emit('warning', `${p.label}: update check failed: ${error.message}`));
    }
  }
  async apply(id, { restart = false } = {}) {
    // Metadata must be obtainable before a running server is asked to stop.
    const checked = await this.check(id), p = this.manager.get(id);
    if (checked.available === false) return { unchanged: true, buildId: checked.installed };
    const wasRunning = this.manager.active(id);
    const result = await this.maintenance.perform(id, 'Preparing server update', async (profile, job) => {
      const other = this.manager.profiles.find(q => q.id !== id && key(q.installDir) === key(profile.installDir) && this.manager.active(q.id));
      if (other) throw Error(`Stop ${other.label} first: it uses the same installation.`);
      const allowedPid = this.manager.runs.get(id)?.serverPid || this.manager.runs.get(id)?.child?.pid;
      const external = await this.maintenance.inspect(profile.installDir);
      if (external.some(pid => pid !== allowedPid)) throw Error('An unmanaged server uses this installation. It must be stopped by its existing owner.');
      const log = text => this.maintenance.line(id, text);
      if (wasRunning) { job.phase = 'Saving and gracefully stopping server'; log('Graceful shutdown requested. Waiting for the actual process exit.'); await this.manager.stop(id, false); await this.maintenance.waitStopped(id); }
      await this.maintenance.offline(id);
      job.phase = 'Backing up world and mod configuration';
      const selected = await selectedWorld(profile,{optional:true});let worldBackup=null;
      if(selected){worldBackup=await backup(profile,path.join(this.manager.root,'backups'));log('Stopped-world backup: '+worldBackup);}
      else log('No existing world files for this profile; no world backup required.');
      const modBackup = await this.mods.snapshot(id); log('Mod configuration backup: ' + modBackup);
      await this.maintenance.offline(id); job.phase = 'Applying Steam server patch';
      await this.steam.apply(profile, checked.latest, log);
      job.phase = 'Verifying installed build'; const final = await this.steam.check(profile, log);
      if (final.available !== false) throw Error('Steam public build changed or installation could not be verified. Server left stopped; check again.');
      this.results.set(id, final); log('Verified public server build ' + final.installed + '.');
      return { buildId: final.installed, worldBackup, modBackup };
    });
    // Lock is released before any restart; failed patch/verification never reaches this point.
    if (restart && wasRunning) { try { await this.manager.start(id); result.restarted = true; } catch (e) { result.restartError = e.message; this.maintenance.line(id, 'Update succeeded but restart failed: ' + e.message); } }
    return result;
  }
}
module.exports = { Updates };

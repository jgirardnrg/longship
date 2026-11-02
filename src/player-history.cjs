const fs = require('node:fs/promises');
const path = require('node:path');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v, max) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max) : '';
function normalize(players) {
  if (!Array.isArray(players) || players.length > 256) throw Error('Invalid bridge player list.');
  return players.map(p => ({ name: clean(p?.name, 128), platformId: /^(Steam|Xbox|PlayFab|PSN|Apple)_[A-Za-z0-9:_-]+$/.test(p?.platformId || '') ? p.platformId.slice(0, 256) : null })).filter(p => p.name);
}
function group(players) { const result = new Map(); for (const player of players) { const key = player.platformId || 'name:' + player.name; const list = result.get(key) || []; list.push(player); result.set(key, list); } return result; }
class PlayerHistory {
  constructor(root) { this.root = root; this.sessions = new Map(); this.queue = Promise.resolve(); }
  directory(id) { if (!uuid.test(id)) throw Error('Invalid server profile ID.'); return path.join(this.root, 'player-history', id); }
  async append(id, records) {
    if (!records.length) return;
    const dir = this.directory(id), file = path.join(dir, records[0].time.slice(0, 10) + '.jsonl');
    const task = this.queue.then(async () => { await fs.mkdir(dir, { recursive: true }); await fs.appendFile(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 }); });
    this.queue = task.catch(() => {}); return task;
  }
  async observe(id, session, players, now = new Date()) {
    const current = normalize(players), previous = this.sessions.get(id), records = [], time = now.toISOString();
    const add = (event, p, reason) => records.push({ time, event, name: p?.name || null, platformId: p?.platformId || null, source: 'bridge snapshot', reason });
    if (!previous || previous.session !== session) for (const player of current) add('present', player, 'First successful snapshot; connection time unknown');
    else {
      if (previous.gap) add('monitoring-resumed', null, 'Changes during the interruption may be incomplete');
      const old = group(previous.players), next = group(current);
      for (const [key, list] of next) for (const player of list.slice(old.get(key)?.length || 0)) add('connected', player, previous.gap ? 'Observed after monitoring interruption' : 'Observed entering player list');
      for (const [key, list] of old) for (const player of list.slice(next.get(key)?.length || 0)) add('disconnected', player, previous.gap ? 'Observed after monitoring interruption' : 'Observed leaving player list');
    }
    await this.append(id, records); this.sessions.set(id, { session, players: current, gap: false }); return records;
  }
  async gap(id, session) { const previous = this.sessions.get(id); if (previous?.session !== session || previous.gap) return; await this.append(id, [{ time: new Date().toISOString(), event: 'monitoring-interrupted', name: null, platformId: null, source: 'bridge snapshot', reason: 'Bridge unavailable; no disconnects inferred' }]); previous.gap = true; }
  async end(id, session) { const previous = this.sessions.get(id); if (previous?.session !== session) return; await this.append(id, [{ time: new Date().toISOString(), event: 'server-session-ended', name: null, platformId: null, source: 'launcher', reason: 'Server process exited; exact individual disconnect times unavailable' }]); this.sessions.delete(id); }
  async list(id) {
    await this.queue; const dir = this.directory(id); let names;
    try { names = (await fs.readdir(dir)).filter(n => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse().slice(0, 7); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const records = [];
    for (const name of names) {
      const handle = await fs.open(path.join(dir, name), 'r');
      try { const stat = await handle.stat(), start = Math.max(0, stat.size - 512 * 1024), bytes = Buffer.alloc(stat.size - start); await handle.read(bytes, 0, bytes.length, start); const lines = bytes.toString('utf8').split('\n'); if (start) lines.shift(); for (const line of lines) { if (!line) continue; try { records.push(JSON.parse(line)); } catch {} } } finally { await handle.close(); }
    }
    return records.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 2000);
  }
}
module.exports = { PlayerHistory, normalize };

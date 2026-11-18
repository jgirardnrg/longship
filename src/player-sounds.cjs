const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {atomic} = require('./storage.cjs');

const formats = {'.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4'};
const storedFile = /^[a-f0-9]{64}\.(wav|mp3|ogg|flac|m4a)$/;
function soundSettings(profile, kind) {
  if (!['join', 'depart'].includes(kind)) throw Error('Unknown player sound.');
  return {volume: 0.35, file: null, name: '', ...profile.playerSounds?.[kind]};
}
function validateSounds(settings) {
  if (settings === undefined) return;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('Invalid player sound settings.');
  for (const [kind, value] of Object.entries(settings)) {
    if (!['join', 'depart'].includes(kind) || !value || typeof value !== 'object') throw Error('Invalid player sound settings.');
    if (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1) throw Error('Sound volume must be between 0% and 100%.');
    if (value.file !== null && !storedFile.test(value.file || '')) throw Error('Invalid saved sound file.');
    if (typeof value.name !== 'string' || value.name.length > 256 || /[\x00-\x1f]/.test(value.name)) throw Error('Invalid sound filename.');
  }
}
class SoundLibrary {
  constructor(root) { this.root = root; }
  async prepare(file) {
    const extension = path.extname(file).toLowerCase();
    if (!formats[extension]) throw Error('Choose a WAV, MP3, OGG, FLAC or M4A audio file.');
    const handle = await fs.open(file, 'r');
    let bytes;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > 32 * 1024 * 1024) throw Error('Choose a non-empty sound file up to 32 MB.');
      bytes = await handle.readFile();
    } finally { await handle.close(); }
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    return {file: hash + extension, name: path.basename(file).replace(/[\x00-\x1f]/g, '').slice(0, 256), bytes,
      source: 'data:' + formats[extension] + ';base64,' + bytes.toString('base64')};
  }
  async store(candidate) {
    if (!storedFile.test(candidate.file)) throw Error('Invalid sound selection.');
    await fs.mkdir(this.root, {recursive: true});
    await atomic(path.join(this.root, candidate.file), candidate.bytes);
    return {file: candidate.file, name: candidate.name};
  }
  async source(profile, kind) {
    const settings = soundSettings(profile, kind);
    if (!settings.file) return null;
    if (!storedFile.test(settings.file)) throw Error('Invalid saved sound file.');
    try {
      const candidate = await this.prepare(path.join(this.root, settings.file));
      if (candidate.file !== settings.file) throw Error('Saved sound checksum does not match.');
      return candidate.source;
    } catch (error) {
      if (error.code === 'ENOENT') throw Error('Saved player sound is missing. Choose the file again in Sound settings.');
      throw error;
    }
  }
}
module.exports = {SoundLibrary, soundSettings, validateSounds};

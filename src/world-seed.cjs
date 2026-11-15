const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// Valheim's stable string hash operates on UTF-16 code units.
function seedHash(seed) {
  let even = 5381;
  let odd = 5381;
  for (let i = 0; i < seed.length; i += 2) {
    even = Math.imul(even, 33) ^ seed.charCodeAt(i);
    if (i + 1 < seed.length) odd = Math.imul(odd, 33) ^ seed.charCodeAt(i + 1);
  }
  return (even + Math.imul(odd, 1566083941)) | 0;
}

function saveString(text) {
  const bytes = Buffer.from(text, 'utf8');
  const length = [];
  let remaining = bytes.length;
  while (remaining >= 128) {
    length.push((remaining & 127) | 128);
    remaining >>>= 7;
  }
  length.push(remaining);
  return Buffer.concat([Buffer.from(length), bytes]);
}

function seedMetadata(name, seed, uid = crypto.randomBytes(8)) {
  const version = Buffer.alloc(4);
  version.writeInt32LE(31); // Legacy metadata-only save, migrated by Valheim.
  const properties = Buffer.alloc(17);
  properties.writeInt32LE(seedHash(seed), 0);
  uid.copy(properties, 4);
  properties.writeInt32LE(2, 12); // Current Atlas terrain generation.
  // A fresh world has no database yet.
  const metadata = Buffer.concat([version, saveString(name), saveString(seed), properties]);
  const length = Buffer.alloc(4);
  length.writeInt32LE(metadata.length);
  return Buffer.concat([length, metadata]);
}

async function readWorldSeed(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw Error('Cannot read the existing world seed safely.');
  const bytes = await fs.readFile(file);
  let offset = 8;
  function readString() {
    let length = 0;
    let multiplier = 1;
    for (let i = 0; i < 5 && offset < bytes.length; i++) {
      const byte = bytes[offset++];
      length += (byte & 127) * multiplier;
      if (byte < 128 && length <= bytes.length - offset) {
        const result = new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(offset, offset + length));
        offset += length;
        return result;
      }
      multiplier *= 128;
    }
    throw Error('Cannot read the existing world seed.');
  }
  if (bytes.length < 12 || bytes.readInt32LE(0) !== bytes.length - 4) throw Error('Cannot read the existing world metadata.');
  readString(); // World name
  const seed = readString();
  if (offset + 4 > bytes.length) throw Error('World metadata is missing its numeric seed.');
  return {seed, numericSeed: bytes.readInt32LE(offset)};
}

async function verifyWorldSeed(world, seed) {
  const value = await readWorldSeed(world.metadataFile);
  if (value.seed !== seed || value.numericSeed !== seedHash(seed)) {
    throw Error('An existing world uses a different seed. Clear New world seed to launch that save, or choose a new world name.');
  }
}

async function matchingSeedMetadata(profile) {
  const file = path.join(profile.saveDir, 'worlds_local', profile.world + '.fwl');
  const stat = await fs.lstat(file).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!stat?.isFile()) return null;
  const expected = seedMetadata(profile.world, profile.worldSeed, Buffer.alloc(8));
  if (stat.size !== expected.length) return null;
  const bytes = await fs.readFile(file);
  const uidOffset = expected.length - 13;
  bytes.copy(expected, uidOffset, uidOffset, uidOffset + 8);
  return bytes.equals(expected) ? file : null;
}

async function prepareSeededWorld(folder, name, seed) {
  const container = path.join(folder, 'worlds_local');
  const stat = await fs.lstat(container);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Choose a regular worlds_local directory for a new seeded world.');
  const target = path.join(container, name + '.fwl');
  const temporary = target + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, seedMetadata(name, seed), {flag: 'wx'});
    // Link publishes a complete file and fails if the destination already exists.
    await fs.link(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

module.exports = {seedHash, seedMetadata, readWorldSeed, verifyWorldSeed, matchingSeedMetadata, prepareSeededWorld};

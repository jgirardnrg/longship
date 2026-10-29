const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
function userDataRoot(appData) { return path.join(appData, 'Longship'); }
async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function copy(source, target) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw Error('Cannot migrate a linked configuration file: ' + source);
  if (stat.isDirectory()) { await fs.mkdir(target, {recursive:true,mode:0o700}); for (const name of await fs.readdir(source)) await copy(path.join(source,name),path.join(target,name)); }
  else if (stat.isFile()) { await fs.copyFile(source,target); await fs.chmod(target,0o600); }
  else throw Error('Cannot migrate a special configuration file: ' + source);
}
async function migrateLegacyData(appData, targetRoot = userDataRoot(appData)) {
  const source = path.join(appData,'valheim-harbor','data'), target = path.join(targetRoot,'data');
  // Existing Longship data always wins. Keep the original for rollback/older releases.
  if (await exists(target) || !await exists(source)) return false;
  await fs.mkdir(targetRoot,{recursive:true,mode:0o700});
  const staging=path.join(targetRoot,'.migration-'+crypto.randomUUID());
  try { await copy(source,staging); await fs.rename(staging,target); return true; }
  catch(e) { await fs.rm(staging,{recursive:true,force:true}); throw e; }
}
module.exports={userDataRoot,migrateLegacyData};

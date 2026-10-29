const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
async function atomic(file,bytes){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,bytes,{mode:0o600,flag:'wx'});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
const {worlds,discoverWorlds,selectedWorld,copyWorldDirectory}=require('./worlds.cjs');
async function permissions(dir){const out={};for(const k of ['adminlist','bannedlist','permittedlist'])out[k]=await fs.readFile(path.join(dir,k+'.txt'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});return out;}
async function writePermission(dir,kind,text){if(!['adminlist','bannedlist','permittedlist'].includes(kind))throw Error('Unknown list.');if(typeof text!=='string'||text.length>262144)throw Error('List too large.');for(const row of text.split(/\r?\n/)){const v=row.trim();if(v&&!v.startsWith('//')&&!/^(Steam|Xbox|PlayFab|PSN|Apple)_[A-Za-z0-9:_-]+$/.test(v))throw Error('Use case-sensitive Platform_UserID entries (one per line), or // comments.');}await atomic(path.join(dir,kind+'.txt'),text.trim()+'\n');}
async function backup(p,destination){
 const w=await selectedWorld(p);const folder=path.join(destination,p.id,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8));await fs.mkdir(folder,{recursive:true});
 try{
  if(w.format==='chunked')await copyWorldDirectory(w.folder,path.join(folder,w.name));
  else{await fs.copyFile(w.metadataFile,path.join(folder,path.basename(w.metadataFile)));await fs.copyFile(w.dbFile,path.join(folder,path.basename(w.dbFile)));}
  await atomic(path.join(folder,'manifest.json'),JSON.stringify({world:w.name,format:w.format,generation:w.generation||null,source:w.path,created:new Date().toISOString(),server:p.label},null,2));return folder;
 }catch(e){await fs.rm(folder,{recursive:true,force:true});throw e;}
}

module.exports={atomic,worlds,discoverWorlds,selectedWorld,permissions,writePermission,backup};

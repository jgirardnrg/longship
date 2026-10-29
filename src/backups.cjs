const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {atomic}=require('./storage.cjs');
const {copyWorldDirectory,completeGenerations,identity}=require('./worlds.cjs');
async function stat(file){try{return await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function plain(file,directory=false){const s=await stat(file);if(!s||s.isSymbolicLink()||!(directory?s.isDirectory():s.isFile()))throw Error('Backup contains a missing, linked or unsupported file.');return s;}
function worldLock(p){return path.join(p.saveDir,'.longship-world-'+crypto.createHash('sha256').update(p.world.toLowerCase()).digest('hex').slice(0,16)+'.lock');}
async function container(p){const root=await fs.realpath(p.saveDir);let dir=path.join(root,'worlds_local');if(!p.worldPath){const candidates=[];for(const name of ['worlds_local','worlds']){const folder=path.join(root,name);let found=false;for(const item of [p.world,p.world+'.fwl',p.world+'.db'])if(await stat(path.join(folder,item)))found=true;if(found)candidates.push(folder);}if(candidates.length>1)throw Error('Multiple world locations exist. Select the exact world with Find worlds before restoring.');if(candidates.length===1)dir=candidates[0];}if(p.worldPath){const source=path.resolve(p.worldPath),parent=path.basename(source)===p.world?path.dirname(source):path.basename(source).slice(0,-4)===p.world&&path.basename(source).slice(-4).toLowerCase()==='.fwl'?path.dirname(source):null;if(!parent||!['worlds_local','worlds'].includes(path.basename(parent).toLowerCase()))throw Error('Select a world in a standard Valheim save directory before restoring.');const actualParent=await fs.realpath(parent);if(identity(path.dirname(actualParent))!==identity(root))throw Error('Selected world is outside this save root.');dir=actualParent;}
 const s=await stat(dir);if(s&&(s.isSymbolicLink()||!s.isDirectory()))throw Error('World container must be a real directory.');return dir;}
async function inspect(source,format,name){
 if(format==='chunked'){await plain(source,true);const entries=await fs.readdir(source,{withFileTypes:true});if(!completeGenerations(entries).length)throw Error('No complete chunked save generation.');return;}
 await plain(path.join(source,name+'.fwl'));await plain(path.join(source,name+'.db'));
}
async function listBackups(p,root){
 const records=[];const base=path.join(root,p.id);const s=await stat(base);
 if(s){await plain(base,true);for(const e of await fs.readdir(base,{withFileTypes:true})){if(!e.isDirectory()||e.isSymbolicLink())continue;const folder=path.join(base,e.name);try{if((await plain(path.join(folder,'manifest.json'))).size>1048576)continue;const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));if(manifest.world!==p.world)continue;const format=manifest.format||((await stat(path.join(folder,p.world)))?.isDirectory()?'chunked':'legacy');const actualFormat=manifest.format||format;if(!['legacy','chunked'].includes(actualFormat))continue;let error='';try{await inspect(actualFormat==='chunked'?path.join(folder,p.world):folder,actualFormat,p.world);}catch(e){error=e.message;}records.push({id:'longship:'+e.name,world:p.world,created:manifest.created||null,origin:manifest.reason==='pre-restore'?'Before restore':'Longship',format:actualFormat,available:!error,error,source:actualFormat==='chunked'?path.join(folder,p.world):folder,sourceName:p.world});}catch{} }}
 const dir=await container(p);if(await stat(dir)){const entries=await fs.readdir(dir,{withFileTypes:true});const prefix=p.world+'_backup';for(const e of entries){if(e.isSymbolicLink()||!e.name.startsWith(prefix))continue;const suffix=e.name.slice(p.world.length).replace(/\.(?:fwl|db)$/i,'');if(!/^_backup(?:_auto)?[-_]\d{8}[-_]\d{6}$/i.test(suffix))continue;const isDir=e.isDirectory();if(!isDir&&!/\.fwl$/i.test(e.name))continue;const name=isDir?e.name:e.name.slice(0,-4),source=isDir?path.join(dir,e.name):dir;let error='';try{await inspect(source,isDir?'chunked':'legacy',name);}catch(err){error=err.message;}const info=await stat(path.join(dir,e.name));records.push({id:'valheim:'+e.name,world:p.world,created:info.mtime.toISOString(),origin:'Valheim automatic',format:isDir?'chunked':'legacy',available:!error,error,source,sourceName:name});}}
 return records.sort((a,b)=>String(b.created).localeCompare(String(a.created)));
}
async function getBackup(p,root,id){if(typeof id!=='string'||id.length>300)throw Error('Invalid backup selection.');const record=(await listBackups(p,root)).find(r=>r.id===id);if(!record)throw Error('Backup no longer exists for this world.');if(!record.available)throw Error(record.error);return record;}
async function restoreWorld(p,record,root,{beforeCommit=async()=>{},afterPublish=async()=>{},rename=fs.rename}={}){
 const dir=await container(p);await fs.mkdir(dir,{recursive:true});
 const names=[p.world,p.world+'.fwl',p.world+'.db'];
 const stage=path.join(dir,'.longship-restore-'+crypto.randomUUID());await fs.mkdir(stage,{mode:0o700});
 const prepared=path.join(stage,'prepared'),previous=path.join(stage,'previous');await fs.mkdir(prepared);await fs.mkdir(previous);
 let preBackup=null;const moved=[],published=[];let preserveStage=false;
 try{
  // Validate the staged copy, not just the discovery metadata.
  if(record.format==='chunked'){await copyWorldDirectory(record.source,path.join(prepared,p.world));await inspect(path.join(prepared,p.world),'chunked',p.world);}
  else {for(const ext of ['.fwl','.db']){await plain(path.join(record.source,record.sourceName+ext));await copyWorldDirectory(path.join(record.source,record.sourceName+ext),path.join(prepared,p.world+ext));}await inspect(prepared,'legacy',p.world);}
  const existing=[];for(const name of names)if(await stat(path.join(dir,name)))existing.push(name);
  if(existing.length){preBackup=path.join(root,p.id,new Date().toISOString().replace(/[:.]/g,'-')+'-pre-restore-'+crypto.randomUUID().slice(0,8));await fs.mkdir(preBackup,{recursive:true});try{for(const name of existing)await copyWorldDirectory(path.join(dir,name),path.join(preBackup,name));await atomic(path.join(preBackup,'manifest.json'),JSON.stringify({world:p.world,format:existing.includes(p.world)?'chunked':'legacy',created:new Date().toISOString(),source:dir,server:p.label,reason:'pre-restore'},null,2));}catch(e){await fs.rm(preBackup,{recursive:true,force:true});preBackup=null;throw e;}}
  await beforeCommit();
  try{for(const name of existing){await rename(path.join(dir,name),path.join(previous,name));moved.push(name);}for(const name of await fs.readdir(prepared)){await rename(path.join(prepared,name),path.join(dir,name));published.push(name);}await afterPublish({worldPath:record.format==='chunked'?path.join(dir,p.world):path.join(dir,p.world+'.fwl'),worldFormat:record.format});}
  catch(error){try{for(const name of published)await fs.rm(path.join(dir,name),{recursive:true,force:true});for(const name of moved)await fs.rename(path.join(previous,name),path.join(dir,name));}catch(rollback){preserveStage=true;const recovery=Error('Restore failed and needs recovery. Original files remain at '+previous+'. Pre-restore backup: '+preBackup+'. '+rollback.message);recovery.recoveryRequired=true;throw recovery;}throw error;}
  return {world:p.world,format:record.format,preBackup};
 }finally{if(!preserveStage)await fs.rm(stage,{recursive:true,force:true});}
}
module.exports={worldLock,listBackups,getBackup,restoreWorld,container};

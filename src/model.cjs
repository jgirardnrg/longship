const path = require('node:path');
const crypto = require('node:crypto');
const MODIFIERS = { combat:['veryeasy','easy','hard','veryhard'], deathpenalty:['casual','veryeasy','easy','hard','hardcore'], resources:['muchless','less','more','muchmore','most'], raids:['none','muchless','less','more','muchmore'], portals:['casual','hard','veryhard'] };
const PRESETS=['Normal','Casual','Easy','Hard','Hardcore','Immersive','Hammer'];
const KEYS=['nobuildcost','playerevents','passivemobs','nomap'];
function profile(index=0) { return {id:crypto.randomUUID(),label:`Server ${index+1}`,name:'My Valheim server',installDir:'',saveDir:'',world:'Dedicated',worldPath:'',worldFormat:'',password:'',port:2456+index*10,public:true,crossplay:false,instanceId:crypto.randomBytes(4).toString('hex'),saveInterval:1800,backups:4,backupShort:7200,backupLong:43200,preset:'',modifiers:{},keys:[],restartEnabled:false,restartTime:'04:00',restartWarningSeconds:60,bridgePort:9800+index,bridgeToken:crypto.randomBytes(24).toString('hex'),extraArgs:[],steamcmdPath:'',updateCheckEnabled:false,updateCheckHours:6,modsEnabled:false,doorstopLibrary:'',playerJoinSound:true}; }
function normalizeInstanceId(value){return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value||'')?crypto.createHash('sha256').update(value).digest('hex').slice(0,8):value;}
function integer(v,min,max,label){if(!Number.isInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error(`${label} must be ${min}–${max}.`);}
function validate(p) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id||''))throw Error('Invalid server profile ID.');
 if(typeof p.password!=='string'||typeof p.bridgeToken!=='string'||p.bridgeToken.length<32||p.bridgeToken.length>256||/[\x00-\x1f]/.test(p.bridgeToken))throw Error('A bridge token of 32–256 printable characters is required.');
 if(!p.id||!p.name?.trim()||!p.world?.trim())throw Error('Server name and world are required.');
 if(/[\\/\x00-\x1f]/.test(p.world)||p.world==='.'||p.world==='..')throw Error('World must be a filename, not a path.');
 if((p.password.length>0&&p.password.length<5)||(p.public&&p.password.length<5))throw Error('Server password needs at least 5 characters.');
 if(p.crossplay&&!/^[A-Za-z0-9_-]{1,8}$/.test(p.instanceId||''))throw Error('PlayFab instance ID must be 1–8 letters, digits, underscores or hyphens. Use a short unique ID such as 1.');
 if(p.worldPath&&!path.isAbsolute(p.worldPath))throw Error('Selected world path must be absolute.');
 if(p.worldFormat&&!['legacy','chunked'].includes(p.worldFormat))throw Error('Unsupported world format.');
 if(!path.isAbsolute(p.installDir)||!path.isAbsolute(p.saveDir))throw Error('Choose absolute installation and save directories.');
 integer(p.port,1024,65534,'Game port');integer(p.saveInterval,60,86400,'Save interval');integer(p.backups,1,100,'Backup count');integer(p.backupShort,60,31536000,'Short backup interval');integer(p.backupLong,60,31536000,'Long backup interval');integer(p.bridgePort,1024,65535,'Bridge port');integer(p.restartWarningSeconds,0,3600,'Restart warning');
 if(p.playerJoinSound!==undefined&&typeof p.playerJoinSound!=='boolean')throw Error('Player join sound must be a toggle.');
 if(p.modsEnabled!==undefined&&typeof p.modsEnabled!=='boolean')throw Error('Modded-launch setting must be a toggle.');
 if(p.updateCheckEnabled!==undefined&&typeof p.updateCheckEnabled!=='boolean')throw Error('Update checks setting must be a toggle.');
 if(p.steamcmdPath&&!path.isAbsolute(p.steamcmdPath))throw Error('Choose an absolute SteamCMD executable path.');
 if(p.updateCheckHours!==undefined)integer(p.updateCheckHours,1,168,'Update check interval');
 if(p.doorstopLibrary&&!path.isAbsolute(p.doorstopLibrary))throw Error('Choose an absolute Doorstop library path.');
 if(p.preset&&!PRESETS.includes(p.preset))throw Error('Unknown preset.');
 for(const [k,v] of Object.entries(p.modifiers||{}))if(!MODIFIERS[k]?.includes(v))throw Error('Unknown world modifier.');
 if((p.keys||[]).some(k=>!KEYS.includes(k)))throw Error('Unknown world key.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.restartTime))throw Error('Restart time must be HH:MM.');
 if(!Array.isArray(p.extraArgs)||p.extraArgs.some(a=>typeof a!=='string'||/[\x00\r\n]/.test(a)))throw Error('Extra arguments must be a JSON array of single arguments.');
 const reserved=['-name','-world','-password','-port','-savedir','-logfile','-saveinterval','-backups','-backupshort','-backuplong','-instanceid','-public','-crossplay','-preset','-modifier','-setkey'];
 if(p.extraArgs.some(a=>reserved.includes(a.toLowerCase())))throw Error('Use the dedicated fields for managed options.');
 return p;
}
function args(p,logFile) { validate(p);const a=['-nographics','-batchmode','-name',p.name,'-port',String(p.port),'-world',p.world,'-savedir',p.saveDir,'-public',p.public?'1':'0','-logFile',logFile,'-saveinterval',String(p.saveInterval),'-backups',String(p.backups),'-backupshort',String(p.backupShort),'-backuplong',String(p.backupLong)];if(p.password)a.push('-password',p.password);if(p.crossplay)a.push('-crossplay','-instanceid',p.instanceId);if(p.preset)a.push('-preset',p.preset.toLowerCase());for(const [k,v]of Object.entries(p.modifiers||{}))a.push('-modifier',k,v);for(const k of p.keys||[])a.push('-setkey',k);return a.concat(p.extraArgs); }
function conflict(p,active) {for(const q of active){if(p.id===q.id)continue;if(p.crossplay&&q.crossplay&&p.instanceId===q.instanceId)throw Error(`PlayFab instance ID is already used by ${q.label}. Choose a different short ID.`);if(Math.abs(Number(p.port)-Number(q.port))<2)throw Error(`Port range overlaps ${q.label}.`);const canonical=v=>process.platform==='win32'?path.resolve(v).toLowerCase():path.resolve(v);const name=v=>process.platform==='win32'?v.toLowerCase():v;if((p.worldPath&&q.worldPath&&canonical(p.worldPath)===canonical(q.worldPath))||(canonical(p.saveDir)===canonical(q.saveDir)&&name(p.world)===name(q.world)))throw Error(`World is already used by ${q.label}; never run two processes against the same save.`);if(Number(p.bridgePort)===Number(q.bridgePort))throw Error(`Bridge port overlaps ${q.label}.`);}}
function nextRestart(p,now=new Date()) {if(!p.restartEnabled)return null;const [h,m]=p.restartTime.split(':').map(Number);const d=new Date(now);d.setHours(h,m,0,0);if(d<=now)d.setDate(d.getDate()+1);return d.getTime();}
module.exports={profile,normalizeInstanceId,validate,args,conflict,nextRestart,MODIFIERS,PRESETS,KEYS};

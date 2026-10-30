const path=require('node:path');
function createTray({Tray,Menu,nativeImage,win,app,manager}){
 let tray;
 const show=()=>{if(win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();};
 try{const icon=nativeImage.createFromPath(path.join(__dirname,'../resources/icons/32x32.png')).resize({width:24,height:24});tray=new Tray(icon);tray.setToolTip('Longship');if(tray.isDestroyed())return null;}catch{return null;}
 const hide=()=>{if(tray.isDestroyed())return false;win.hide();return true;};
 const update=()=>{if(tray.isDestroyed())return;const profiles=manager.snapshot();tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Longship',click:show},{type:'separator'},...profiles.map(p=>({label:`${p.label}: ${p.runtime?.status||'stopped'}`,enabled:false})),...(profiles.length?[{type:'separator'}]:[]),{label:'Quit Longship',click:()=>{show();win.close();}}]));};
 tray.on('click',show);tray.on('double-click',show);win.on('minimize',event=>{if(!tray.isDestroyed()){event.preventDefault();hide();}});manager.on('changed',update);app.on('will-quit',()=>{if(!tray.isDestroyed())tray.destroy();});update();return {show,hide,tray};
}
module.exports={createTray};

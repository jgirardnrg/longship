const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'longship-package-'));let app;try{
 app=await electron.launch({executablePath:path.resolve(process.env.LONGSHIP_APP),args:['--user-data-dir='+path.join(temp,'app')]});
 assert.equal(await app.evaluate(({app})=>app.isPackaged),true);const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Add your first server'}).click();await page.locator('#findInstalls').waitFor();await page.waitForFunction(()=>!document.getElementById('findInstalls').disabled);
 assert.equal(await page.locator('#autoSteam').isEnabled(),true);await page.locator('#installDir').fill(path.join(temp,'server'));await page.locator('#saveDir').fill(path.join(temp,'saves'));await page.locator('#password').fill('fixture-only');await page.getByLabel('New world seed (optional)',{exact:true}).fill('MiddleEarth');await page.getByRole('button',{name:'Save configuration',exact:true}).click();await page.getByText('Profile saved.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=> (await window.longship.profiles())[0].worldSeed),'MiddleEarth');
 await page.getByRole('button',{name:'Players & access',exact:false}).click();await page.getByText('No connection events recorded yet.',{exact:true}).waitFor();// Exercise the real audio decoder and ended events while the window is hidden.
 const throttled=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.backgroundThrottling);
 assert.equal(throttled,false);
 await page.evaluate(()=>{window.audioEnded=[];const OriginalAudio=window.Audio;window.Audio=function(file){const audio=new OriginalAudio(file);audio.addEventListener('ended',()=>window.audioEnded.push(file.split('/').pop()));return audio;};});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
 const server=(await page.evaluate(()=>window.longship.profiles()))[0];
 await app.evaluate(({BrowserWindow},id)=>{const contents=BrowserWindow.getAllWindows()[0].webContents;contents.send('playerJoined',{id,count:1});contents.send('playerDeparted',{id,count:1});contents.send('playerJoined',{id,count:1});},server.id);
 await page.waitForFunction(()=>window.audioEnded.length===3,null,{timeout:20000});
 assert.deepEqual(await page.evaluate(()=>window.audioEnded),['player-join.wav','player-depart.wav','player-join.wav']);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
 assert.deepEqual(errors,[]);await page.screenshot({path:path.resolve('release/packaged-smoke.png')});console.log('Packaged startup, preload, setup/discovery and history passed. No servers started.');
}finally{if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

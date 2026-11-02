const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'longship-package-'));let app;try{
 app=await electron.launch({executablePath:path.resolve(process.env.LONGSHIP_APP),args:['--user-data-dir='+path.join(temp,'app')]});
 assert.equal(await app.evaluate(({app})=>app.isPackaged),true);const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Add your first server'}).click();await page.locator('#findInstalls').waitFor();await page.waitForFunction(()=>!document.getElementById('findInstalls').disabled);
 assert.equal(await page.locator('#autoSteam').isEnabled(),true);await page.locator('#installDir').fill(path.join(temp,'server'));await page.locator('#saveDir').fill(path.join(temp,'saves'));await page.locator('#password').fill('fixture-only');await page.getByRole('button',{name:'Save configuration',exact:true}).click();await page.getByText('Profile saved.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Players & access',exact:false}).click();await page.getByText('No connection events recorded yet.',{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.screenshot({path:path.resolve('release/packaged-smoke.png')});console.log('Packaged startup, preload, setup/discovery and history passed. No servers started.');
}finally{if(app)await app.close();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

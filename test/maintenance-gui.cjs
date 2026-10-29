const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..'), data = await fs.mkdtemp(path.join(os.tmpdir(), 'longship-ui-'));
  let app;
  try {
    const install = path.join(data, 'server'), saves = path.join(data, 'worlds');
    await fs.mkdir(path.join(install, 'steamapps'), { recursive: true }); await fs.mkdir(path.join(saves, 'worlds_local'), { recursive: true });
    await fs.writeFile(path.join(saves, 'worlds_local/Meadows.db'), 'world-before-patch'); await fs.writeFile(path.join(saves, 'worlds_local/Meadows.fwl'), 'metadata');
    const manifest = path.join(install, 'steamapps/appmanifest_896660.acf');
    await fs.writeFile(manifest, '"AppState" { "appid" "896660" "buildid" "100" }');
    const steamcmd = path.join(install, 'steamcmd-fixture');
    await fs.writeFile(steamcmd, `#!${process.execPath}\nconst fs=require('fs'),path=require('path');if(process.argv.includes('+app_update')){fs.writeFileSync(path.join(__dirname,'steamapps/appmanifest_896660.acf'),'"AppState" { "appid" "896660" "buildid" "200" }');console.log("Success! App '896660' fully installed.");}else console.log('"896660" { "depots" { "branches" { "public" { "buildid" "200" } } } }');\n`, { mode: 0o700 });
    const plugin = path.join(data, 'TestPlugin.dll'); await fs.writeFile(plugin, 'test fixture - not executable');
    await fs.mkdir(path.join(install, 'BepInEx/core'), {recursive:true});await fs.writeFile(path.join(install,'BepInEx/core/BepInEx.dll'),'fixture core');await fs.writeFile(path.join(install,'BepInEx/core/BepInEx.Preloader.dll'),'fixture preloader');await fs.mkdir(path.join(install, 'BepInEx/config'), { recursive: true }); await fs.writeFile(path.join(install, 'BepInEx/config/Test.cfg'), 'Enabled = false');
    app = await electron.launch({ executablePath: require('electron'), args: [root, '--user-data-dir=' + path.join(data, 'app')] });
    const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, plugin);
    await page.getByRole('button', { name: 'Add your first server' }).click();
    for (const [id, value] of Object.entries({ label: 'Longship integration fixture', name: 'Fixture', installDir: install, saveDir: saves, password: 'fixture-pass', world: 'Meadows' })) await page.locator('#' + id).fill(value);
    await page.getByRole('button', { name: 'Save configuration' }).click();
    await page.getByRole('button', { name: 'Updates', exact: false }).click(); await page.locator('#steamcmdPath').fill(steamcmd); await page.getByRole('button', { name: 'Save configuration' }).click();
    await page.getByRole('button', { name: 'Check for updates', exact: true }).click(); await page.locator('#updateStatus').filter({ hasText: 'Patch available' }).waitFor();
    await page.getByRole('button', { name: 'Apply patch…', exact: true }).click(); await page.getByText('Patch verified: build 200. Server left stopped for review.', { exact: true }).waitFor({timeout:12000}).catch(async e=>{console.error('PATCH_GUI_DIAGNOSTIC',await page.locator('#message').textContent(),await page.locator('#maintenancePhase').textContent());throw e;});
    assert.match(await fs.readFile(manifest, 'utf8'), /200/); assert.equal(await page.locator('#status').textContent(), 'Stopped');
    await page.getByRole('button', { name: 'Mods', exact: false }).click(); await page.getByRole('button', { name: 'Import plugin ZIP / DLL…', exact: true }).click();
    await page.locator('#modList').getByText('TestPlugin', { exact: true }).waitFor(); await page.locator('#modList').getByRole('button', { name: 'Enable', exact: true }).click(); await page.locator('#modList').getByRole('button', { name: 'Disable', exact: true }).waitFor();
    await page.locator('#modList').getByRole('button', { name: 'Disable', exact: true }).click(); await page.locator('#modList').getByRole('button', { name: 'Enable', exact: true }).waitFor();
    await page.locator('#modConfigName').selectOption('Test.cfg'); await page.locator('#modConfigText').fill('Enabled = true'); await page.getByRole('button', { name: 'Back up & save configuration', exact: true }).click(); await page.getByText('Configuration saved; prior bytes backed up.', { exact: true }).waitFor();
    assert.equal(await fs.readFile(path.join(install, 'BepInEx/config/Test.cfg'), 'utf8'), 'Enabled = true');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(root, 'build/longship-mods.png'), fullPage: true });
    await page.getByRole('button', { name: 'Updates', exact: false }).click(); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(root, 'build/longship-updates.png'), fullPage: true });
    assert.deepEqual(errors, []); console.log('GUI MAINTENANCE PASS: fake SteamCMD check/apply/verify + offline backup, plugin import/enable/disable, backed-up config edit. No real servers or Steam files changed.');
  } finally { if (app) await app.close(); await fs.rm(data, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

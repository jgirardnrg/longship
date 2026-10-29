# Longship 0.2.8 alpha

Valheim dedicated server command center for Windows and Linux, written from scratch.

## Included

- Multiple tabbed server profiles, launch settings, daily restarts, logs and stopped-world backups.
- Recursive world discovery for legacy pairs and modern chunked saves; selecting a world corrects its save root.
- SteamCMD update checks and manual graceful stop/backup/patch/verify workflow.
- Local BepInEx framework/plugin management and backed-up config editing.
- Overview status colors, public IP and game port, live crossplay join code, and connected-player count through the optional companion bridge.
- Longship application icons and config paths, with migration from the original Valheim Harbor data folder.
- Private passwordless launches omit the password switch. Short PlayFab instance IDs avoid the observed login-ID length rejection; old generated GUIDs are shortened on load.

## New in 0.2.8

**Restarts & backups → World backups** browses this world's Longship backups and Valheim automatic backups. Stop the server, select a dated backup, then confirm Restore. The current world is preserved in a Before restore backup. Legacy pairs and whole chunked world folders are supported; the server stays stopped. Ordinary replacement/config-write failures roll back the prior world, with recovery data and locks retained if recovery needs attention.

## Downloads

- `Longship Setup 0.2.8.exe`: Windows x64 installer.
- `Longship 0.2.8.exe`: Windows x64 portable launcher.
- `longship-0.2.8-linux-x64.tar.gz`: Linux x64 application archive.
- `Longship-0.2.8-source.zip`: source snapshot; also available in this repository.
- `LongshipBridge-0.2.8.dll`: optional original BepInEx companion plugin. It retains its original internal plugin identity. Installation/enabling requires an appropriate stopped-server maintenance window.
- `SHA256SUMS`: checksums for the files above.

Installer and portable versions share `%APPDATA%\Longship\data` on Windows. Linux uses the user's config directory under `Longship/data`. The portable executable does not store profiles beside itself.

## Validation and limits

53 local tests passed. Windows restore fixtures: 10 passed, one symlink fixture skipped. Desktop acceptance verified browse/cancel/confirm/restore with a temporary world and retained pre-restore backup. No live world was restored during development.

Unsigned development builds may trigger OS reputation warnings. Native Linux desktop acceptance, a real Steam patch, and live companion-plugin administration have not been certified. Save structure checks do not certify game-file contents. Interrupted restores may retain staging and locks for recovery. Mods and access lists are not restored with world backups. See README and validation documents for details.

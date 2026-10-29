# Longship

**Valheim dedicated server command center** - an independent Windows/Linux desktop launcher, written from scratch. Longship 0.2.8 keeps the original gold rune logo and upgrades the application formerly named Valheim Harbor. No source code from the feature-reference application was copied.

## What is included

- Tabbed server profiles, individual installation/save roots, existing-world discovery and all launch settings documented in the installed Valheim manual.
- Start, graceful stop/restart, private Windows Ctrl+C host, readiness, UDP conflict checks, daily restarts, native save/backup settings, stopped-world manual backups and logs.
- Atomic admin/ban/whitelist editing; optional original companion plugin for live players, kicking and explicit world saves.
- **Server updates:** installed/public Steam build comparison through SteamCMD, optional periodic checks, and an explicitly confirmed stop/back-up/patch/verify workflow. No unattended patching.
- **Mods:** local BepInEx 5 ZIP installation, plugin ZIP/DLL import, enable/disable/removal, unmanaged-plugin inventory and backed-up `.cfg` editing with external-change detection.

## Downloads

[Longship 0.2.8 alpha releases](https://github.com/jgirardnrg/longship/releases/tag/v0.2.8) include the Windows installer, Windows portable launcher, Linux x64 archive, source archive and optional companion plugin. This repository and its downloads are private; GitHub access is required. See [release notes](docs/RELEASE-NOTES-0.2.8.md) and the published SHA256SUMS file.

## Install and run

Use the Windows installer or portable executable, or extract the Linux x64 archive and run `./longship` as a regular desktop user. Builds are unsigned development releases. Linux needs Electron's desktop dependencies and Valheim's own server libraries. No Steam/Valheim binaries or BepInEx distribution are bundled.

From source with Node.js 24:

```
npm ci
npm start
npm test
```

If npm blocks Electron's official runtime installer, allow its hook according to local npm policy or run `node node_modules/electron/install.js`. Do not run as root. CI covers Windows/Linux core tests; desktop GUI testing requires Playwright (`PLAYWRIGHT_MODULE` can point to an existing installation).

## Configuration location and migration

Installer and portable builds use the same **Longship** user-data folder:

- Windows: `%APPDATA%\Longship\data\profiles.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/Longship/data/profiles.json`
- macOS source runs: `~/Library/Application Support/Longship/data/profiles.json`

On first launch, existing `valheim-harbor/data` is copied into Longship if Longship has no data directory. Profiles, credentials, logs and backups are preserved; the old folder remains for rollback. Existing Longship data is never overwritten or merged automatically. A failed migration stops startup and reports the problem. Explicit `--user-data-dir` launches stay isolated and do not migrate personal settings. The installer application ID remains stable so upgrades retain their installation identity.

## Configure a server

Choose an install directory containing `valheim_server.exe` or `valheim_server.x86_64`, a save root and a world name. **Find worlds** scans subfolders and the host's default Valheim save location. It recognizes legacy `.db`/`.fwl` pairs and modern chunked world directories with a complete matching `_main.<generation>.fwl2`, `.db2`, `.chunks` and `.ok` set. Backup saves are excluded. Selecting a world sets its name and correct parent save root; no world files are moved or converted. Nonstandard library layouts are shown as requiring import. Steam Cloud worlds must first be made local in Valheim. Scan limits and unreadable locations are reported.

Distinct worlds may share a save root and its permission lists. Do not launch two processes against one world. Longship does not adopt unmanaged running processes. It rejects overlapping managed game-port pairs and the same active world, probes ports before launch, and checks external process ownership before maintenance. These safeguards cannot control unrelated tools that ignore the same ownership rules.

Windows' original C# helper compiles once per source hash using the installed .NET Framework compiler. It allocates a private hidden console and requests Valheim's Ctrl+C save/exit path. It waits for actual exit before relaunch. Compiler failure blocks startup; there is no automatic force kill. Force stop is a separate confirmed action.

## Server patches

1. Install SteamCMD separately from Valve. In **Updates**, choose `steamcmd.exe` on Windows or an executable `steamcmd.sh`/`steamcmd` on Linux, then save the profile.
2. **Check for updates** compares app 896660's installed manifest with the public-branch build reported by SteamCMD. An absent manifest is shown as unknown, not falsely up to date. Beta installations are rejected; beta switching is not implemented.
3. Optional periodic checks run only while Longship is open. Their default is OFF. A check never patches or stops a server. SteamCMD can maintain its own cache/runtime during checks.
4. **Apply patch** asks for confirmation. For a Longship-owned running server it requests graceful shutdown and waits up to two minutes. Unmanaged servers and other active profiles using the same installation must be stopped by their owner. No files are patched if clean shutdown cannot be verified.
5. Longship backs up the complete selected legacy file pair or entire chunked world directory and the mod configuration/registry/loader config, then runs `+force_install_dir ... +login anonymous +app_update 896660 validate +quit` without a shell. An incomplete selected world blocks the patch. A never-created world has nothing to back up and is explicitly reported.
6. A successful SteamCMD result must be followed by installed/public build verification. Failure leaves the server stopped. Restart after verification is optional and defaults OFF. It restarts only a server that was running before the operation.

**Updates are not full binary rollback transactions.** SteamCMD may leave a partial installation on failure. World/config backups are retained; inspect and repair the game installation before starting it. A new public patch arriving mid-operation can require another check. Mods may be incompatible with a game patch; review them before restarting. Shared-install and operation locks block simultaneous Longship launch/mod/patch mutations.

A `.longship-maintenance.lock` file protects against another manager instance. After a crash it may intentionally remain: verify that no manager, updater or server is using that installation before manually clearing the stale lock. Longship does not automatically steal it.

## Mod support

### Framework

Download the correct trusted **BepInEx 5 x64** archive for the host OS. Stop every server using that installation. In **Mods**, choose **Install BepInEx ZIP**. Archive paths, sizes, duplicates and special-file/link entries are validated before applying an allowlisted loader/core overlay. Existing replaced files are backed up; a failed overlay attempts to restore them and reports any rollback needing attention.

Enable **Launch this server with BepInEx enabled**, then save. On Windows, the distribution supplies its winhttp proxy. On Linux, Longship sets legacy/current Doorstop variables and library paths, supporting both `libdoorstop.so` and `libdoorstop_x64.so`; an explicit library override is available. No shell wrapper is generated or executed. Vanilla launch sets loader-disable variables and rejects a loader configuration that explicitly ignores disabling.

### Plugins

Import a local `.dll` or plugin ZIP. Recognized ZIP layouts are `BepInEx/plugins/...`, `plugins/...`, or top-level DLLs with their support assets. Scripts, patchers, framework updates and arbitrary root-file replacements are not accepted as plugin-only packages.

**Imports start disabled.** Read the displayed manifest dependencies and the author's server/client requirements, then explicitly enable. Dependencies are listed but **not downloaded/resolved automatically**; there is no Thunderstore catalog or mod-update service in this release. Install prerequisite plugins yourself from trusted sources. Mod compatibility is not certified by import success.

Longship-managed plugins live under `BepInEx/plugins/Longship/<id>` when enabled and outside the loader's plugin tree under `BepInEx/Longship-disabled/<id>` when disabled. Removal archives their files in app data; generated configuration remains. Existing unmanaged plugins are shown read-only and are never automatically moved or removed.

### Configuration

Select a generated `.cfg` file. Edits require the server installation to be offline, back up the exact prior bytes and check that the file has not changed since it was read. Reload after an external edit. Config syntax and mod-specific values are not semantically validated; review the mod's documentation. Symlink targets are rejected.

## Original companion plugin

`bridge/ValheimHarborBridge.dll` retains its original internal identity for compatibility. It provides authenticated loopback player snapshots, exact-name kicking and explicit saves. Install it only during an approved restart window into a compatible BepInEx 5 server. It is an ordinary optional plugin and can be imported through Longship, then enabled. Main-thread game API signatures are checked; unknown versions fail rather than guessing. Platform IDs come from the game, not display-name inference. No arbitrary remote console endpoint is provided.

The earlier two-server inspection is in `docs/WINDOWS-SERVER-INVENTORY.md`. Neither original server was patched, restarted or modded to develop these features. A live companion-plugin load/kick/save test remains a separate maintenance operation.

## Restarts, backups and logs

Daily schedules use the host's local timezone and require Longship to remain open. Countdown notices appear in the launcher, not in-game. Restarts missed by more than 15 minutes after sleep are skipped. Valheim owns automatic live saves/backups; Longship's manual backups require a stopped world. Manual backups are not automatically deleted.

Per-run Unity log files are stored on disk. The viewer keeps the latest 3,000 lines, supports filtering and exports that retained history. Raw logs have no automatic rotation or quota. No background service, automatic crash restart or remote SSH management UI is included.

## Restore a world

Open **Restarts & backups → World backups**, refresh the list, select a dated backup and choose **Restore selected backup**. The browser includes this world's Longship backups and Valheim automatic backup folders/file pairs in its selected save container. Incomplete backups are shown disabled. Confirm the world name and date before proceeding.

The server must be fully stopped. Managed/shared-world and unmanaged-server checks run before replacement. Longship stages a copy, checks the complete save structure, and preserves the current world in an automatic **Before restore** backup. Chunked worlds are replaced as whole directories; legacy metadata/database files stay together. No save conversion is performed. Restoring across legacy/chunked formats updates the profile's selected world path. The server remains stopped afterward.

Ordinary publication or profile-write failures roll back the previous world. If rollback itself fails, recovery files and a world lock are retained and their locations are reported. A process/power interruption can also leave restore/maintenance locks: review the retained world, pre-restore backup and staging data before recovery; do not blindly clear those locks. Structural validation is not a game-format corruption audit. World backups do not restore plugins, permissions or server settings.

## Privacy

Profiles and bridge tokens remain local plaintext in the existing user data location (Unix files use mode 0600 where supported). Passwords/tokens are hidden in the UI and redacted from retained viewer/export text; raw Valheim logs and OS process command lines are outside that guarantee. Protect the user account and backups. OS-keychain encryption is not implemented.

## Builds and validation

```
npm run dist:win
npm run dist:linux
```

See `docs/VALIDATION-0.2.1.md` for world discovery validation and `docs/VALIDATION-0.2.md` for maintenance features and `docs/VALIDATION.md` for original baseline evidence. Windows packages are installer + portable; Linux distribution is a tar.gz archive. Source is included separately. Compilation/unit fixtures do not establish real Steam patch success or third-party mod compatibility. Linux native desktop acceptance and real-server maintenance remain explicit limits.

Sources: [Valve SteamCMD documentation](https://developer.valvesoftware.com/wiki/SteamCMD), [Iron Gate dedicated-server guide](https://www.valheimgame.com/support/a-guide-to-dedicated-servers/), [BepInEx installation](https://docs.bepinex.dev/articles/user_guide/installation/index.html). Feature reference only: [ValheimServerGUI](https://github.com/runeberry/ValheimServerGUI).

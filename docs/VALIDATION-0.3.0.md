# Longship 0.3.0 validation

- Original checkout regression suite: 120 tests; 119 pass, one Windows-only JSON compiler test skipped on Intel macOS.
- Clean launcher-only checkout (without Atlas): 72 tests; 71 pass, one Windows-only test skipped on Intel macOS.
- Windows-specific installer/discovery/history/sound regression run: 11/11 pass on Node 24 in an isolated test workspace.
- GUI fixture using Electron 45.2.1: auto-detection populates a new profile, installation results remain selected without extra saves, history shows name/ID, no renderer errors. Screenshots in ignored `build/longship-setup.png` and `build/longship-player-history.png`.
- Actual SteamCMD bootstrapping and a fresh public Valheim Dedicated Server installation passed on Windows x64 and Linux x64. Both reported public build 26266951, a server executable and a valid manifest. No game server was launched.
- Windows used `C:\Users\Jason\AppData\Local\Longship-Setup-Validation\20261101`, independent of `C:\valheimserver` and `C:\valheimserver2`. Existing servers and worlds were not modified or stopped.
- Linux used a disposable local Docker container with 32-bit SteamCMD dependencies and an ignored `build/setup-validation` mount. No host system packages installed.
- Real download tests exposed and fixed the Windows bootstrap self-update exit (7) and missing initial Steam depot configuration on a fresh installation.
- New tests cover installation staging/failure preservation, refusal of existing targets, unsafe archives, bootstrap retries, read-only library discovery, persistent names/IDs, reconnects, renames, baseline players, and monitoring interruptions.

Connection history is an observed snapshot history, not an exact packet-level audit. It requires Longship and its optional bridge; sessions entirely between 2-second polls can be missed. No live player connection was forced on either existing server for validation. Unsigned launcher packages and server runtime compatibility remain alpha-level claims.

# Validation record - 2026-10-29

- 7 initial core tests passed on the Mac development host and on the actual Windows PC using the packaged Electron Node runtime.
- Desktop UI automation passed on the development host: two independent profile tabs, world discovery, schedule edit/persistence, administrator-file edit and no renderer errors. Only dummy world files were used; no server was started in the GUI test.
- Windows dummy-server lifecycle test passed after two console fixes: source-hashed helper compilation, path with spaces, readiness detection, duplicate-start rejection, Ctrl+C acknowledgement, save marker and clean exit. Earlier failed fixture runs exposed console attachment and inherited Ctrl+C-ignore state; those were corrected rather than bypassed with force termination.
- Optional companion plugin compiled using official BepInEx 5.4.23.6 reference and read-only installed Unity references. Game metadata was inspected without running game APIs: this installed version uses Save(sync, optional saveOtherPlayerProfiles=false, optional waitForNextFrame=false), GetPlayerList(), Kick(string), IsServer(), and PlayerInfo.m_userInfo.m_id. The bridge supports that signature and the older one-bool Save signature; unknown signatures fail.
- The official manual copied read-only from C:\valheimserver was checked. All documented launch settings are represented, with extra arguments for future/version-specific flags.
- PIDs 21792 and 15876 remained the two original running real servers after Windows fixture validation. No plugin was installed, permission file edited, world saved/restored, or live server stopped/restarted by these checks.

Not accepted yet: live BepInEx loading, live player-list accuracy, actual player kick, real Valheim save/exit behavior, a Linux desktop session, or installer-signing/trust acceptance. Those require separately controlled real-world tests. Compilation/metadata validation is not end-to-end gameplay validation.

Expanded checks: 9/9 core/POSIX tests passed on the development host, including UDP conflict detection and an actual dummy-process daily restart/save/stop sequence. Windows' loopback/wildcard socket binding behavior exposed a false-negative in bind-only preflight; the Windows path was corrected to query the active endpoint table before binding. This is why Linux-style bind checks alone are not treated as cross-platform proof.

Final Windows results: 8 core tests passed, 0 failed, 1 POSIX-only test skipped; the separate native Windows console lifecycle fixture also passed. The runtime used for these tests was the Windows application's own packaged Electron Node engine, not a preinstalled Node dependency. Linux packaging was produced, but no Linux desktop host was available for native GUI acceptance.

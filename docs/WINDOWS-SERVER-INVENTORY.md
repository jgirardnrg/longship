# Read-only live-server inventory

Inspected 2026-10-29 over the existing SSH connection to 10.0.10.17 (DESKTOP-00UTAD2).

| Server | World | Install path | Port | Backend |
|---|---|---|---|---|
| WZNRG2 | Akita | C:\valheimserver2 | 2463 | Crossplay |
| WZNRG Playground | Charlie | C:\valheimserver | 2456 | Crossplay; public=0; instanceid=1 |

Passwords were redacted on the remote machine. Neither process was stopped, restarted, signalled or adopted. No world, permission list, startup script, executable or mod directory was modified. Neither installation currently has BepInEx. The bundled dedicated-server manual was read to verify supported switches.

Harbor will not adopt these processes. At a separately approved maintenance window, stop them through their existing owner, configure Harbor profiles with the correct save roots, and launch them through Harbor. Do not run duplicate instances against active world files. Bridge installation and live administrative validation require a separately planned restart; no server-side mod was installed during this session.

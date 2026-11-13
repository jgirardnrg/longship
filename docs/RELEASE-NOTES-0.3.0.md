# Longship 0.3.0 alpha.2

- Replaced the native title bar with a draggable Longship header and controls for minimize, maximize, restore, and close.
- Styled the BepInEx and plugin import confirmation to match Longship and show the selected filename.

- Added automatic SteamCMD download and initialization on Windows x64 and Linux x64.
- Added automatic public Valheim Dedicated Server installation into a new folder, using anonymous Steam login. Installation leaves the server stopped and preserves existing installations/worlds.
- Added read-only discovery of Steam libraries, known/common server installations, running-server executable directories and SteamCMD locations. New profiles fill a single match automatically; multiple matches are selectable.
- Added persistent player connection history with names and exact supplied platform IDs, local-time display and JSON export. Bridge snapshots are checked every 2 seconds while Longship is managing the server. First snapshots, outages and server exit are marked separately; very short sessions between snapshots may be missed. IDs are never guessed.
- Updated the bundled Electron runtime to 45.2.1.

Linux automatic setup requires SteamCMD's 32-bit runtime libraries (`lib32gcc-s1 lib32stdc++6` on Debian/Ubuntu). Longship does not install system packages or request root access. BepInEx/Longship Bridge remains optional for basic server hosting and is required for authoritative player snapshots.

Unsigned alpha builds. Back up important worlds. Source and launcher packages contain no Valve/Iron Gate game binaries. SteamCMD and server files are downloaded from Valve when requested.

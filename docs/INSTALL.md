# Player lists and join sounds

1. Select your server in Longship and open **Mods**.
2. Click **Download BepInEx ↗**, or visit the [Valheim BepInEx pack](https://thunderstore.io/c/valheim/p/denikson/BepInExPack_Valheim/). Download the ZIP from that page.
3. Stop every server sharing this installation. In Longship, choose **Install BepInEx ZIP…** and select the downloaded ZIP. Longship installs and enables the framework automatically.
4. Choose **Install Longship Bridge**. It is bundled with Longship and enabled automatically. If you already have it, choose **Update Longship Bridge** instead. Previous managed files are backed up. If an unmanaged copy is detected, resolve that duplicate before proceeding.
5. Start the server through Longship. Open **Overview** or **Players** to see connected players. No manual Save is needed between these steps.

Do not copy framework DLLs beside the server executable by hand. Longship handles the archive layout. Linux uses the supplied Doorstop library; if detection fails, select its path in Mods.

The bridge runs on the server. Players do not install it. Other mods may have client requirements or affect crossplay; check each mod author’s instructions before enabling them.

## Join sound

The speaker button beside **Connected players** enables or mutes the chime for this server. The preference is saved immediately. Sounds require Longship to stay open and a working bridge. Checks occur about every 2 seconds. Players already online at the first successful check are a silent baseline; later arrivals trigger the chime. Recovery from a bridge outage also starts a silent baseline.

## Other plugins

Use **Import plugin ZIP / DLL…**, then **Enable** after checking its requirements. Imports start disabled. Enabling a plugin also enables BepInEx. Install, enable, disable and launch-toggle changes save automatically. Configuration-file edits still have an explicit Save button.

## Updating

Stop the server before installing an updated bridge or framework. Choose **Update Longship Bridge**, then start the server through Longship. An already running server keeps its loaded plugin until restarted. World files are not changed by bridge installation.

## Automatic server setup (0.3.0)

In **Server settings**, Longship searches known profiles, Steam libraries (including extra libraries), common server folders and SteamCMD locations. A new profile fills in a single detected server automatically. If multiple servers are found, select the correct directory from **Detected servers**. Browse remains available for unusual locations. Discovery is read-only: it does not adopt running processes or execute old start scripts.

- **Install SteamCMD** downloads Valve's bootstrap and initializes it in Longship's data folder under `data/tools/steamcmd`. No Steam account/password is needed.
- **Install new Valheim server…** installs SteamCMD first if needed, then installs public app **896660** using anonymous login. The default destination is Longship's `data/servers/<profile-id>`; you can enter a different new folder. Existing destinations are refused. Downloads are staged and the installation is published only after Steam success, manifest and executable checks. Failed server downloads remain in a named `.longship-server-*` staging folder for diagnosis; the final destination stays untouched.
- Configure the world, password, ports and save root, save the profile and then start it. Installation never starts a game server.

Automatic installation supports **Windows x64 and Linux x64**. Linux needs SteamCMD's 32-bit runtime libraries (Debian/Ubuntu: `lib32gcc-s1 lib32stdc++6`) and Valheim's usual dedicated-server libraries. Longship reports errors but does not elevate privileges or install operating-system packages. SteamCMD requires an internet connection and sufficient disk space. Downloads come from Valve over HTTPS; Valve's bootstrap is updated upstream rather than a version pinned by Longship.

## Player connection history (0.3.0)

Open **Players & access → Connection history**. While a server is managed by Longship and its bridge is enabled, player-list changes are checked every **2 seconds**. Records include local display time, event, player name and the exact platform ID supplied by Valheim (Steam/Xbox/PlayFab/etc.). Missing IDs are explicitly marked; they are never derived from names.

History persists in `data/player-history/<profile-id>/YYYY-MM-DD.jsonl`, using UTC timestamps on disk and this computer's local time in the viewer. The viewer/export shows up to 2,000 recent records from the latest seven recorded days; older daily files remain on disk. The first successful snapshot marks existing players **present**, because their connection time is unknown. Bridge outages and server exit are separate events, not fabricated individual disconnects. Very short connections entirely between polls can be missed. Logging requires Longship to remain open; historical activity before monitoring cannot be reconstructed reliably from player names alone.

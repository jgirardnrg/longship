# Player lists and join sounds

1. Select your server in Longship and open **Mods**.
2. Click **Download BepInEx ↗**, or visit the [Valheim BepInEx pack](https://thunderstore.io/c/valheim/p/denikson/BepInExPack_Valheim/). Download the ZIP from that page.
3. Stop every server sharing this installation. In Longship, choose **Install BepInEx ZIP…** and select the downloaded ZIP. Longship installs and enables the framework automatically.
4. Choose **Install Longship Bridge**. It is bundled with Longship and enabled automatically. If you already have it, choose **Update Longship Bridge** instead. Previous managed files are backed up. If an unmanaged copy is detected, resolve that duplicate before proceeding.
5. Start the server through Longship. Open **Overview** or **Players** to see connected players. No manual Save is needed between these steps.

Do not copy framework DLLs beside the server executable by hand. Longship handles the archive layout. Linux uses the supplied Doorstop library; if detection fails, select its path in Mods.

The bridge runs on the server. Players do not install it. Other mods may have client requirements or affect crossplay; check each mod author’s instructions before enabling them.

## Join sound

The speaker button beside **Connected players** enables or mutes the chime for this server. The preference is saved immediately. Sounds require Longship to stay open and a working bridge. Checks occur about every 10 seconds. Players already online at the first successful check are a silent baseline; later arrivals trigger the chime. Recovery from a bridge outage also starts a silent baseline.

## Other plugins

Use **Import plugin ZIP / DLL…**, then **Enable** after checking its requirements. Imports start disabled. Enabling a plugin also enables BepInEx. Install, enable, disable and launch-toggle changes save automatically. Configuration-file edits still have an explicit Save button.

## Updating

Stop the server before installing an updated bridge or framework. Choose **Update Longship Bridge**, then start the server through Longship. An already running server keeps its loaded plugin until restarted. World files are not changed by bridge installation.

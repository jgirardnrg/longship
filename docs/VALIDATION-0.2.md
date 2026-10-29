# Longship 0.2 validation - 2026-10-29

Original Valheim Harbor 0.1 behavior and tests are retained; this increment renames the app while keeping its rune mark, installer identity, original user-data location and companion plugin identity.

Validated in isolated fixtures:

- Structured Steam metadata parsing; unknown/current/outdated build states; beta-branch rejection; exact SteamCMD argument construction and success/manifest requirements.
- Graceful-stop -> backup -> patch -> independent build verification -> optional restart sequencing. Patch failure never restarts and leaves original world/config backups. Shared/unmanaged servers and operation locks block mutation/start.
- ZIP traversal, absolute paths, special files/symlinks, duplicate/case-colliding names and package-layout rejection.
- Disabled-first plugin import, enable/disable movement outside the loader path, archived removal, backed-up config edits, external-file conflict rejection and framework overlay rollback.
- Existing profile migration preserves IDs, password and bridge token; update checks remain opt-in.
- Both modern and legacy Linux loader names and explicit environment paths, including space-containing install roots; vanilla disable guard.
- GUI automation with a fake SteamCMD and inert DLL exercises check/apply/verify, plugin import/toggle, backed-up configuration edit and the new branding. Only temporary dummy data is used.

Not claimed: actual public Steam patch downloads, a running production mod deployment, arbitrary mod/dependency compatibility, automatic catalog/dependency resolution, or native Linux desktop acceptance. No live server is patched or modified for these tests.

Final results: 21/21 core/POSIX tests passed on the development host; Windows 20 passed, 0 failed, 1 POSIX-only test skipped. The separate Windows private-console shutdown fixture also passed. GUI workflow tests passed with a fake updater and inert plugin data. The real Windows server PIDs remained 21792 and 15876.

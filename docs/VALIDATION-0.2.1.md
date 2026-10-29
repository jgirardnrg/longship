# Longship 0.2.1 world discovery

Validated 2026-10-29.

- Recursive metadata-only discovery recognizes legacy file pairs and modern chunked world directories. Complete generation markers are required; this is not a binary integrity audit.
- Regression fixtures cover recursive/default-root discovery, backup exclusion, interrupted generations, exact duplicate-name selection, bounded scans, symlink avoidance, full-directory backup byte preservation, and distinct worlds sharing one save root.
- Windows isolated tests: 29 tests, 28 passed, one POSIX-only lifecycle test skipped, zero failures.
- Desktop acceptance: Akita fixture discovered and selectable from a nested worlds_local directory; selecting it corrects the parent save root, persists exact world identity and generates correct launch arguments. No game process launched.
- Actual Windows Akita verified read-only from Valheim root, worlds_local, and Akita directory: chunked generation 1725 recognized, launchable with the Valheim parent save root. No world file was copied, converted or changed. No real server was stopped, restarted or updated.
- Manual and pre-update backups now copy the entire selected chunked directory, including chunks and generation markers. Fixtures verify this behavior; no real-world backup or Steam update was performed.

Linux native desktop acceptance remains untested. Windows packaging does not establish live server/game compatibility; no save conversion is attempted.

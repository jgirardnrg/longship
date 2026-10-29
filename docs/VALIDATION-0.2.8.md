# Longship 0.2.8 backup restore

Verified 2026-10-29 against temporary fixture worlds only. No real Valheim server was launched, stopped or restored.

- Local suite: 53 passed, zero failures.
- Windows restore suite: 10 passed, one symlink fixture skipped, zero failures.
- Desktop acceptance: browser shows saved backups; cancellation preserves current bytes; confirmed restore recovers the fixture, creates a Before restore backup and leaves the server stopped.
- Fixtures cover legacy pairs, whole chunked directory replacement without stale-chunk merging, Valheim automatic backups, format/path updates, invalid/traversal selections, incomplete current save preservation, publish failure rollback, profile-persistence failure rollback, shared/active/unmanaged server guards, recovery locks, and older worlds-container layouts.

Limits: complete-generation/file structure checks do not decode or certify game-file contents. Power/process interruption can retain restore staging and maintenance/world locks for recovery; ordinary-error rollback is tested, full crash-recovery automation is not claimed. Native Linux desktop restore was not tested. Restore affects world files and selected-world profile fields, not game binaries, mods or access lists.

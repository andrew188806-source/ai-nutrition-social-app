# Phase 2U-C-B Development risk acceptance

The user explicitly accepts the Development-only compatibility risk for N3 under these conditions:

- The user is the sole developer.
- There are no external users.
- There are no contractors or other known developers depending on raw/internal nutrition objects.
- No known third-party tool or team depends on these objects.
- Unknown legacy Development clients or personal tools may break after N3, and that risk is accepted.
- Production is outside this approval.

Forced sign-out does not restore revoked object privileges. Session renewal likewise cannot restore privileges removed from the database roles.

An exact emergency rollback is available in `rollback-plan.md`. It restores only the four prior role/object `SELECT` combinations and also re-exposes internal metadata, so it must be used only for emergency Development recovery.

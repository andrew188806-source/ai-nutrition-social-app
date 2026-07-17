# Phase 2W-C Local Validation Plan

## Static guard

The guard verifies the exact local change boundary, empty staged diff, unchanged migrations and lockfile, frozen migration count/hash, no UI/navigation or fixture changes, injected source composition, absence of owner filters and ownership RPC arguments, approved RPC names, runtime response mapping, no direct DML, and required documentation/package scripts.

## In-memory contract smoke

The fake client performs no network request. Tests cover restaurant and menu-item reads, nullable branches, missing rows, current-only combined list behavior, discriminators, exact RPC names and arguments, optional linkage and structured feedback, response-target consistency, malformed payloads, typed auth/permission/database/transport failures, explicit source selection, missing dependency failure, invalid-source failure, and mock/disabled defaults.

## Regression and repository validation

- `node --check` for both Phase 2W-C scripts.
- Phase 2W-C guard and contract smoke.
- Phase 2W-A contract regression.
- Phase 2W-B guard baseline evidence and final contract regression.
- Root and Mobile typechecks.
- Canonical data audit.
- `npm ls --depth=0` only; `npm ls --all` and `P2W-A-DEP-001` remain deferred.
- `git diff --check`, migration inventory/hash/diff, package-lock diff, staged diff, artifact and secret scans.

The deterministic validation suite above is local and credential-free. It excludes UI cutover, migration work, and Phase 2W-C Freeze.

## Development evidence and Freeze candidate

The separately authorized credential-backed adapter smoke completed with native exit code `0`. Its sanitized two-actor, RLS, RPC, denial, logout, and cleanup evidence is recorded in `phase-2w-c-development-validation-record.md`. The Freeze contract is recorded in `phase-2w-c-freeze-record.md`; UI cutover, Production, migration work, N4, and the next phase remain excluded.

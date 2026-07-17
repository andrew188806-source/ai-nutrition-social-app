# Phase 2W-A Validation Plan

## Static guard

The Phase 2W-A guard verifies the approved file boundary, required files, source-mode defaults, typed errors, current-user-only ports, deterministic mock implementation, disabled behavior, absence of transport/database identifiers, unchanged screens and migrations, the future authenticated atomic RPC decision, and an empty staged diff.

## Contract smoke

The local smoke compiles the isolated TypeScript package to an operating-system temporary directory and verifies:

- restaurant and menu-item reads;
- missing lookup;
- deterministic list order;
- current-row replacement and retained history;
- restaurant/menu-item target isolation;
- invalid rating values and ownership-field rejection;
- disabled read/write results;
- invalid-source rejection with no fallback;
- authentication gate;
- factory source selection and typed errors.

The temporary output is deleted after the smoke. Nothing is emitted beside the source tree.

## Required local commands

- `node --check` for both Phase 2W-A scripts.
- Phase 2W-A guard and contract smoke.
- Root and Mobile typechecks.
- Canonical-data audit.
- Dependency-tree validation.
- `git diff --check` and final Git inventory.

No remote, credential-backed, database, N4, public-hosting, or Production validation belongs to Phase 2W-A.

# Phase 2W-B Validation Plan

Status: local static validation and separately authorized Development validation complete; repository evidence recorded for Freeze-candidate review.

## Static guard

The guard verifies the approved file boundary, one new migration, unchanged prior migrations, migration ordering, RPC signatures without ownership parameters, `auth.uid()` ownership, finite 0–5 validation, linkage ownership and target checks, advisory transaction locks, update-before-insert replacement, safe search paths, exact table/RPC ACL shape, comments, no UI/dependency/fixture changes, and an empty staged diff.

## Contract smoke

The smoke parses the migration contract and runs an in-memory behavioral model for:

- valid and invalid rating values, including non-finite values;
- signed-out and cross-owner denial;
- restaurant meal-target mismatch denial;
- menu-item restaurant/branch/menu mismatch denial;
- replacement history with exactly one current row;
- restaurant/menu-item target isolation;
- authenticated-only read and RPC permissions.

The smoke does not connect to a database, invoke an RPC, or read credentials.

## Required local commands

- `node --check` for Phase 2W-B scripts.
- Phase 2W-B guard and contract smoke.
- Root and Mobile workspace typechecks.
- Consumer schema static validator and canonical-data audit when compatible.
- `npm ls --depth=0`; do not remediate accepted `P2W-A-DEP-001` in this phase.
- `git diff --check`, migration inventory, artifact scan, final status, and staged-diff verification.

## Not validated here

This Codex evidence-recording run did not reconnect to Development or repeat migration, SQL, RPC, or HTTP validation. The accepted Development evidence is recorded in `phase-2w-b-development-validation-record.md`. Live repository behavior, UI cutover, Production, N4, and Phase 2V HTTP routes remain outside this run.

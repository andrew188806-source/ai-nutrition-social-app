# Phase 2X Validation Plan

## Phase 2X-A local validation

The Phase 2X-A guard verifies:

- required documents and package script;
- baseline branch/HEAD and staged-empty state;
- authorized candidate file scope only;
- unchanged migrations, package lock, Mobile UI, and Frozen Phase 2W implementation;
- schema evidence for exactly restaurant/menu-item targets, soft removal, active uniqueness, and owner RLS;
- absence of Favorites runtime implementation, deployment commands, credentials, generated artifacts, or later-phase implementation;
- canonical order 2W → 2X → 2Y → 2Z;
- current-user/private-by-default, no-owner-input, target identity, idempotent add/remove, and direct-DML-denial decisions.

Also run `node --check`, the local guard, documentation consistency checks within the guard, `git diff --check`, candidate scope and secret audits, migration/package-lock diff checks, and staged-diff verification.

## Later local contract validation

Phase 2X-B contract smoke must cover deterministic disabled/mock behavior, target discrimination, owner-field rejection, active-only reads, ordering/cursor behavior, idempotent add/remove, source selection, invalid-source fail-closed behavior, no network, and no silent fallback.

## Later Development validation

Phase 2X-C/D require separate approval and credential-backed evidence for effective ACLs, two-actor isolation, anon/PUBLIC denial, exact target validation, authenticated atomic writes, duplicate/concurrent add, remove missing, rollback, cleanup, direct-DML denial, and zero persistent test data.

Phase 2X-A authorizes no Supabase command, HTTP, SQL, migration execution, Development/Production operation, privileged credential, N4 execution, Mobile cutover, Phase 2Y implementation, stage, commit, or push.

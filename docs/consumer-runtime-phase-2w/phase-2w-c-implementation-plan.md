# Phase 2W-C Local Implementation Plan

Phase: Consumer Runtime Phase 2W-C — Ratings Supabase Repository Adapter and Source-Mode Integration

## Baseline and state

- Starting branch: `main`.
- Starting HEAD: `3f84e54992e5f21cf1260de1eeea4daf54c02b09`.
- Phase 2W-A and Phase 2W-B: FROZEN.
- The Phase 2W-B migration is immutable and already Development-validated.
- The local prepared adapter and credential-backed Development validation are complete. Phase 2W-C is a Freeze candidate but is not Frozen before an authorized commit.

## Local implementation

1. Add a minimal injected Supabase-client contract for the two ratings tables and two approved write RPCs.
2. Map database snake_case rows and RPC JSON into the Frozen camelCase Consumer Rating records.
3. Validate every returned row and RPC payload at runtime before exposing it.
4. Add one explicit `supabase` read/write source selected only by flags and dependency injection.
5. Preserve `mock` as the default read source and `disabled` as the default write source.
6. Exercise the adapter with an in-memory fake client; no network or database connection is allowed.

## Explicit exclusions

- No UI or navigation cutover.
- No Development or Production connection, HTTP, SQL, or migration execution.
- No global Supabase singleton, credential lookup, service-role use, or silent mock fallback.
- No fixture, migration, dependency, lockfile, N4, Phase 2V-F, or next-phase work.

Credential-backed Development smoke completed successfully and is recorded in `phase-2w-c-development-validation-record.md`. Defaults and UI remain unchanged; the candidate does not become Frozen until an authorized commit succeeds.

# Phase 2V-E Preflight Implementation Plan

Status: **local preflight complete; N4 remains blocked**

Phase 2V-E preflight closes the dormant raw Restaurant Web dependency, defines the future N4 privilege boundary, prepares Development actor validation (DV-001), and supplies a read-only query-plan audit pack. It does not draft or execute N4.

## Baseline

- Branch: `main`
- Frozen HEAD: `3d5340f489cc6fb29fa77da6d1d32f38e22c16e8`
- Local migrations: 33
- Latest migration: `20260716060000_restore_restaurant_internal_reader_set_option.sql`
- Phase 2V-D: frozen in Development
- Production: excluded

## Work package

1. Prove the old raw REST repository has no active importer, caller, factory branch, service reference, type-only consumer, or dynamic import.
2. Remove that dormant repository and its exclusive row, mapper, and allowlist surface while retaining the public nutrition transport; preserve frozen historical scripts byte-for-byte and classify them outside the active runtime graph.
3. Define the exact N4 revoke/preserve inventory without writing migration SQL.
4. Prepare fixture-free DV-001 actor, session, route, and tenant-isolation validation.
5. Document RPC query shapes, request budgets, local index evidence, and Development EXPLAIN evidence requirements.
6. Keep N4 blocked until Development catalog, actor, payload, and query-plan evidence has been reviewed.

## Boundaries

No remote command, database connection, migration, privilege change, fixture, Auth operation, dependency upgrade, Restaurant write, stage, commit, push, or Production operation is part of this package. Frozen Phase 2V-A/B/C/D documents and every existing migration remain unchanged.

## Completion conditions

- Restaurant Web source contains no active direct read of an internal restaurant/menu/nutrition object.
- Exactly seven approved owner/internal RPC names remain in the live repository.
- The server-only REST transport allowlists only `restaurant_public_published_nutrition_v1`.
- Explicit mock mode and disabled fail-closed behavior remain available.
- DV-001, remote catalog inventory, and performance evidence remain explicit hard gates before N4 drafting.

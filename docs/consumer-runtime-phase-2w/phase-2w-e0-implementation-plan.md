# Phase 2W-E0 Canonical Restaurant/Menu Intake & Governance Foundation

Status: local foundation implemented; Freeze candidate, not Frozen. Phase 2W-E Mobile cutover and Phase 2X are not started.

## Placement

The contract belongs to `@haocu/shared` because Mobile, Restaurant Web, and Admin already consume its canonical restaurant domain. E0 adds an isolated `CanonicalRestaurantMenuGovernance` namespace with types, pure policies, and ports. It does not replace the frozen `RestaurantDomain` mock structures.

## Deliverables

1. Separate observations from server-identified canonical/provisional entities.
2. Define resolution, lifecycle, evidence, badge, trust, report/reward, and partner-queue contracts.
3. Define implementation-neutral ports only; no adapter, database, HTTP, or queue backend.
4. Add static guard and in-memory contract smoke.

## Boundaries

No UI/navigation, rating runtime, Favorites, recommendation-feedback runtime, migration, table, RPC, credential, Supabase command, Development/Production operation, N4, stage, commit, or push is included.

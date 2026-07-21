# P2V-SCHEMA-BASELINE-002 Formal Restaurant Baseline Repair

## Status and authority

The seven restaurant platform tables historically reached Development through an out-of-band activation. The tracked Development migration history therefore matched the Repository while still lacking the migration that creates the restaurant baseline on a fresh database.

P2V-SCHEMA-BASELINE-001 reconciled the Development catalog against `docs/supabase-runtime-integration/development-public-read-activation-pack.sql`, including baseline columns, constraints, indexes, policies, views, and grants. That file remains historical evidence and is not future schema authority. Formal authority now begins with `supabase/migrations/20260712120000_create_restaurant_platform_baseline.sql`.

The new migration has not been deployed to Development. Production remains untouched. N4 and Phase 2V-F are not executed. P2V-PERF-001 remains blocked pending its separately authorized query-plan and representative-scale work.

## Three safe modes

The migration counts the seven baseline tables before any schema operation.

- Exactly zero tables selects empty bootstrap mode. It creates the exact pre-`20260715010000` tables, baseline constraints, current-nutrition partial unique index, RLS policies, original sixteen-column views, and original read grants. It creates no fixture or business row.
- Exactly seven tables selects existing registration mode. That branch runs read-only catalog assertions for required baseline columns, types, RLS, policies, views, uniqueness, and the current-nutrition index. It permits later tracked migrations to add columns, constraints, policies, view columns, functions, and privilege revocations.
- One through six tables raises `restaurant baseline partial schema rejected` before any baseline object is created or changed.

## Late-registration safety

Existing registration contains no `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, or business DML. It cannot restore direct `anon`/`authenticated` access to `menu_item_nutrition`, cannot replace the evolved eighteen-column `current_published_menu_item_nutrition` view, and cannot change later composite integrity constraints, internal RLS policy pairs, or `restaurant_internal_*_v1` RPCs.

The normal fresh-database path applies the formal baseline first and then all later migrations in filename order. The later raw-nutrition revocation remains authoritative for browser direct-read removal.

## Local validation boundary

Validation uses an isolated PostgreSQL 17.6 runtime bound only to localhost in a Repository-external temporary directory. It reconstructs all forty-one migrations twice, compares complete before/after metadata for late registration, and verifies partial-state transactional failure. No Development or Production connection, credential, service-role capability, seed, or remote migration operation belongs to this validation.

-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table legacy_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_dataset_version text not null,
  source_entity_type text not null,
  legacy_id text not null,
  canonical_uuid uuid not null,
  target_table text not null,
  import_batch_id text,
  source_row_checksum text,
  import_status text not null default 'mapped' check (import_status in ('mapped', 'imported', 'skipped', 'rolled_back')),
  rollback_batch_id text,
  migrated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_system, source_dataset_version, source_entity_type, legacy_id),
  unique (target_table, canonical_uuid)
);

create index legacy_entity_mappings_lookup_idx
  on legacy_entity_mappings(source_system, source_dataset_version, source_entity_type, legacy_id);

-- Import strategy draft:
-- 1. Upsert each canonical mock record into its production table using deterministic generated UUIDs
--    or precomputed UUIDs stored in legacy_entity_mappings.
-- 2. Insert legacy_entity_mappings before child rows so references can be resolved idempotently.
--    source_dataset_version should identify the shared mock dataset release or commit being imported.
--    source_row_checksum lets retries detect changed source rows without relying on display names.
-- 3. Resolve restaurant, branch, menu item, alias, nutrition, analytics, recommendation, and governance
--    references through this table rather than by display names.
-- 4. Re-running an import must use ON CONFLICT(source_system, source_dataset_version, source_entity_type, legacy_id)
--    DO UPDATE only for non-destructive metadata, never blindly replacing production-owned rows.

-- Example shape only:
-- insert into legacy_entity_mappings(source_system, source_dataset_version, source_entity_type, legacy_id, canonical_uuid, target_table, import_batch_id)
-- values ('shared_mock_restaurant_platform', '2026-07-freeze-candidate', 'restaurant', 'restaurant-haochu-bowl', gen_random_uuid(), 'restaurants', '2026-07-schema-prep')
-- on conflict (source_system, source_dataset_version, source_entity_type, legacy_id) do nothing;

-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 011: change logs and legacy ID mapping.
-- Requires human DB/security review before execution.

create table consumer_data_change_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  change_type text not null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table legacy_consumer_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  legacy_id text not null,
  canonical_uuid uuid not null,
  source_system text not null default 'mobile_mock',
  source_dataset_version text not null,
  source_row_checksum text,
  import_batch_id text,
  import_status consumer_import_status not null default 'pending',
  retry_count integer not null default 0,
  rollback_batch_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legacy_consumer_entity_mappings_unique unique (entity_type, legacy_id, source_dataset_version)
);
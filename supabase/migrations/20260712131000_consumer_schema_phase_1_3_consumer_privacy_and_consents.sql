-- Consumer Schema Phase 1.3 formal migration 010.
-- Promoted from docs/supabase-consumer-schema-drafts/010_consumer_privacy_and_consents.sql.
-- No seed, fixture, Auth user, remote execution, or production credential is included.

create table consumer_data_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source_surface text,
  locale text not null default 'zh-TW',
  created_at timestamptz not null default now(),
  constraint consumer_data_consents_unique_version unique (user_id, consent_type, policy_version)
);

create table consumer_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_status text not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  anonymization_batch_id text,
  note text
);

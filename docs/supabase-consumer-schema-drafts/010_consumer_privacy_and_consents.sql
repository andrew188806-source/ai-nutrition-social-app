-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 010: privacy, consents, and deletion requests.
-- Requires human DB/security review before execution.

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
-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 006: consumption adjustments and sharing allocations.
-- Requires human DB/security review before execution.

create table meal_consumption_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_record_id uuid not null references meal_records(id) on delete cascade,
  completion_status consumption_completion_status not null,
  completion_ratio numeric not null,
  unfinished_reason text,
  actual_nutrition_snapshot jsonb not null default '{}'::jsonb,
  post_meal_photo_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint meal_consumption_adjustments_ratio_range check (completion_ratio >= 0 and completion_ratio <= 1)
);

create table meal_sharing_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_record_id uuid references meal_records(id) on delete set null,
  group_table_id text,
  sharing_session_id text,
  participant_count integer not null,
  allocation_ratio numeric not null,
  allocated_nutrition_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint meal_sharing_allocations_participants_positive check (participant_count > 0),
  constraint meal_sharing_allocations_ratio_range check (allocation_ratio >= 0 and allocation_ratio <= 1)
);
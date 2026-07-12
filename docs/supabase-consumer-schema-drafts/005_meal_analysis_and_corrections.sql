-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 005: AI meal analysis and corrections.
-- Requires human DB/security review before execution.

create table meal_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_record_id uuid references meal_records(id) on delete set null,
  source_photo_ids text[] not null default '{}',
  model_name text not null,
  model_version text not null,
  estimated_nutrition jsonb not null default '{}'::jsonb,
  detected_items jsonb not null default '[]'::jsonb,
  confidence_score numeric,
  analysis_status text not null default 'completed',
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint meal_analyses_confidence_range check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1))
);

create table meal_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_analysis_id uuid not null references meal_analyses(id) on delete cascade,
  meal_record_item_id uuid references meal_record_items(id) on delete set null,
  correction_type text not null,
  before_value jsonb,
  after_value jsonb not null,
  correction_reason text,
  note text,
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
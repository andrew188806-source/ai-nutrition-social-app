-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 007: planned meals and daily nutrition summaries.
-- Requires human DB/security review before execution.

create table planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_for date not null,
  meal_type meal_type not null,
  restaurant_id text,
  branch_id text,
  menu_item_id text,
  display_name_snapshot text not null,
  planned_nutrition_snapshot jsonb not null default '{}'::jsonb,
  status planned_meal_status not null default 'planned',
  converted_meal_record_id uuid references meal_records(id) on delete set null,
  conversion_idempotency_key text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_meals_conversion_consistency check (
    (status = 'converted' and converted_meal_record_id is not null) or
    (status <> 'converted' and converted_meal_record_id is null)
  )
);

create table daily_nutrition_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null default 'Asia/Taipei',
  calculation_version text not null default 'consumer-daily-summary-v1',
  total_calories numeric not null default 0,
  total_protein_g numeric not null default 0,
  total_carbohydrates_g numeric not null default 0,
  total_fat_g numeric not null default 0,
  total_fiber_g numeric,
  meal_count integer not null default 0,
  source_cutoff_at timestamptz not null default now(),
  recalculated_at timestamptz not null default now(),
  is_current boolean not null default true,
  constraint daily_nutrition_summaries_non_negative check (
    total_calories >= 0 and total_protein_g >= 0 and total_carbohydrates_g >= 0 and total_fat_g >= 0 and meal_count >= 0
  )
);
-- Consumer Schema Phase 1.3 formal migration 004.
-- Promoted from docs/supabase-consumer-schema-drafts/004_meal_records.sql.
-- No seed, fixture, Auth user, remote execution, or production credential is included.

create table meal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type meal_type not null,
  occurred_at timestamptz not null,
  meal_date date not null,
  timezone text not null default 'Asia/Taipei',
  title text,
  note text,
  source meal_source_type not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table meal_record_items (
  id uuid primary key default gen_random_uuid(),
  meal_record_id uuid not null references meal_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id text,
  branch_id text,
  menu_id text,
  menu_item_id text,
  display_name_snapshot text not null,
  user_entered_name text,
  ai_detected_name text,
  normalized_name text,
  portion_snapshot text,
  nutrition_snapshot jsonb not null default '{}'::jsonb,
  nutrition_source nutrition_source_type not null default 'manual',
  nutrition_schema_version text not null default 'consumer-nutrition-snapshot-v1',
  source_entity_version text,
  occurred_at timestamptz not null,
  timezone text not null default 'Asia/Taipei',
  confidence_score numeric,
  consumed_ratio numeric not null default 1,
  correction_status meal_correction_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_record_items_consumed_ratio_range check (consumed_ratio >= 0 and consumed_ratio <= 1),
  constraint meal_record_items_confidence_range check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  constraint meal_record_items_name_not_empty check (length(display_name_snapshot) > 0)
);

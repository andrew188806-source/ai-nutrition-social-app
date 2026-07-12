-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 003: preferences, taste, restrictions, goals, and entitlement snapshots.
-- Requires human DB/security review before execution.

create table consumer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  locale text not null default 'zh-TW',
  timezone text not null default 'Asia/Taipei',
  energy_unit text not null default 'kcal',
  weight_unit text not null default 'kg',
  profile_visibility profile_visibility not null default 'public',
  meal_reminders_enabled boolean not null default false,
  recommendation_notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table taste_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  preferred_cuisine_tags text[] not null default '{}',
  preferred_meal_types meal_type[] not null default '{}',
  disliked_tastes text[] not null default '{}',
  spice_preference text,
  dining_style text,
  payment_preference text,
  favorite_restaurant_ids text[] not null default '{}',
  favorite_menu_item_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dietary_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restriction_type text not null,
  label text not null,
  severity text not null default 'preference',
  visibility profile_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dietary_restrictions_unique_label unique (user_id, restriction_type, label)
);

create table nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_label text not null,
  daily_calories_target numeric,
  protein_target_g numeric,
  carbohydrates_target_g numeric,
  fat_target_g numeric,
  fiber_target_g numeric,
  starts_on date not null default current_date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_goals_non_negative check (
    (daily_calories_target is null or daily_calories_target >= 0) and
    (protein_target_g is null or protein_target_g >= 0) and
    (carbohydrates_target_g is null or carbohydrates_target_g >= 0) and
    (fat_target_g is null or fat_target_g >= 0) and
    (fiber_target_g is null or fiber_target_g >= 0)
  )
);

create table subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  entitlement_source text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status entitlement_status not null default 'active',
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_entitlements_valid_range check (valid_until is null or valid_until >= valid_from)
);
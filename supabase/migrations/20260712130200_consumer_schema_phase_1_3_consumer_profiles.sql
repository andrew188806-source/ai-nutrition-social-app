-- Consumer Schema Phase 1.3 formal migration 002.
-- Promoted from docs/supabase-consumer-schema-drafts/002_consumer_profiles.sql.
-- No seed, fixture, Auth user, remote execution, or production credential is included.

create table consumer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null unique,
  display_name text not null,
  anonymous_display_name text not null,
  mascot_avatar_key text not null,
  real_avatar_url text,
  public_bio text,
  diet_summary text,
  recent_meal_style text,
  nutrition_goal_summary text,
  willing_to_chat boolean not null default false,
  verification_status text not null default 'unverified',
  visibility profile_visibility not null default 'public',
  status consumer_profile_status not null default 'active',
  locale text not null default 'zh-TW',
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint consumer_profiles_profile_id_not_empty check (length(profile_id) > 0),
  constraint consumer_profiles_display_name_not_empty check (length(display_name) > 0)
);

create table consumer_private_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  profile_id text not null references consumer_profiles(profile_id) on delete cascade,
  birthdate date,
  age_years integer,
  gender text,
  health_notes text,
  private_diet_notes text,
  medical_sensitivity_notes text,
  data_export_requested_at timestamptz,
  deletion_requested_at timestamptz,
  anonymized_at timestamptz,
  terms_version text,
  privacy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumer_private_profiles_age_valid check (age_years is null or age_years between 0 and 130)
);

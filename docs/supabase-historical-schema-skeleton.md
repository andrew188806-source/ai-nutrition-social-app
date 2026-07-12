# Historical Supabase Schema Skeleton

Last archived: 2026-07-11

This file preserves the early Phase 1 Supabase schema skeleton that previously lived in `supabase/schema.sql`. It is historical reference only and must not be executed as an active migration. The current restaurant-platform schema review baseline is:

- `docs/supabase-schema-mapping.md`
- `docs/supabase-schema-drafts/*.sql`
- `docs/supabase-schema-decision-register.md`
- `docs/supabase-schema-freeze-manifest.md`

```sql
-- DEPRECATED HISTORICAL SKELETON - DO NOT USE AS ACTIVE MIGRATION.
-- Current Supabase restaurant-platform mapping authority lives in docs/supabase-schema-mapping.md
-- and docs/supabase-schema-drafts/*.sql. This file is retained only as an early Phase 1
-- handoff reference until humans decide whether to archive, replace, or merge it.
-- Phase 1 schema skeleton for engineer handoff.
-- This is intentionally documentation-oriented and not a production migration yet.
-- Future phases should add constraints, indexes, RLS policies, storage buckets, and triggers.

create table if not exists users (
  id uuid primary key,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,
  user_id uuid references users(id),
  display_name text not null,
  is_anonymous_preview boolean not null default true,
  subscription_tier text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key,
  user_id uuid references users(id),
  tier text not null default 'free',
  status text not null default 'mock_active',
  created_at timestamptz not null default now()
);

create table if not exists meals (
  id uuid primary key,
  user_id uuid references users(id),
  image_url text,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists meal_logs (
  id uuid primary key,
  user_id uuid references users(id),
  meal_id uuid references meals(id),
  logged_at timestamptz not null default now()
);

create table if not exists nutrition_estimates (
  id uuid primary key,
  meal_id uuid references meals(id),
  calories integer,
  protein_grams numeric,
  carbs_grams numeric,
  fat_grams numeric,
  confidence text not null default 'mock',
  created_at timestamptz not null default now()
);

create table if not exists recommendations (
  id uuid primary key,
  user_id uuid references users(id),
  title text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists social_matches (
  id uuid primary key,
  user_id uuid references users(id),
  matched_user_id uuid references users(id),
  compatibility_score integer not null default 0,
  is_unlocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists social_unlocks (
  id uuid primary key,
  user_id uuid references users(id),
  unlocked_user_id uuid references users(id),
  unlocked_at timestamptz not null default now()
);

create table if not exists restaurants (
  id uuid primary key,
  owner_user_id uuid references users(id),
  name text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key,
  restaurant_id uuid references restaurants(id),
  name text not null,
  price_twd integer,
  created_at timestamptz not null default now()
);

create table if not exists restaurant_verification_requests (
  id uuid primary key,
  restaurant_id uuid references restaurants(id),
  status text not null default 'draft',
  submitted_at timestamptz
);

create table if not exists ads (
  id uuid primary key,
  title text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists sponsored_recommendations (
  id uuid primary key,
  ad_id uuid references ads(id),
  restaurant_id uuid references restaurants(id),
  created_at timestamptz not null default now()
);

create table if not exists consents (
  id uuid primary key,
  user_id uuid references users(id),
  consent_type text not null,
  granted boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists data_access_logs (
  id uuid primary key,
  actor_id uuid references users(id),
  target_user_id uuid references users(id),
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key,
  actor_id uuid references users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists platform_settings (
  id uuid primary key,
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists tags (
  id uuid primary key,
  category text not null,
  label text not null,
  slug text not null unique,
  description text
);

create table if not exists user_tags (
  id uuid primary key,
  user_id uuid references users(id),
  tag_id uuid references tags(id)
);

create table if not exists meal_tags (
  id uuid primary key,
  meal_id uuid references meals(id),
  tag_id uuid references tags(id)
);

create table if not exists restaurant_tags (
  id uuid primary key,
  restaurant_id uuid references restaurants(id),
  tag_id uuid references tags(id)
);

create table if not exists menu_item_tags (
  id uuid primary key,
  menu_item_id uuid references menu_items(id),
  tag_id uuid references tags(id)
);

```

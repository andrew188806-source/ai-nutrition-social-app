-- REVIEW ONLY - assembled frozen schema baseline for disposable DB review.
-- Do not run against production or shared development databases.
-- Source: docs/supabase-schema-drafts/001-015.
-- Generated at: 2026-07-11T09:01:00.421Z

-- ============================================================
-- Source file: docs/supabase-schema-drafts/001_extensions.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.uid()::text, '')::uuid;
$$;


-- ============================================================
-- Source file: docs/supabase-schema-drafts/002_enums_and_lookup_tables.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create type restaurant_status as enum ('draft', 'active', 'paused', 'archived');
create type branch_status as enum ('draft', 'active', 'inactive', 'temporarily_closed', 'archived');
create type menu_status as enum ('draft', 'published', 'paused', 'archived');
create type menu_item_status as enum ('draft', 'active', 'archived');
create type branch_menu_item_availability as enum ('available', 'limited', 'unavailable');
create type branch_menu_item_status as enum ('available', 'hidden', 'discontinued');
create type alias_source_type as enum ('restaurant', 'user_input', 'ai_detected', 'admin', 'imported', 'legacy');
create type alias_status as enum ('pending', 'approved', 'rejected', 'merged');
create type pending_menu_item_status as enum ('pending', 'matched_existing_item', 'confirmed_new_item', 'rejected', 'needs_more_information');
create type nutrition_source as enum ('restaurant_submitted', 'restaurant_verified', 'admin_verified', 'ai_estimated', 'pending');
create type nutrition_badge_status as enum ('approved', 'ai_estimated', 'pending_review', 'missing');
create type nutrition_verification_status as enum ('verified', 'ai_estimated', 'pending_review', 'rejected');
create type nutrition_review_status as enum ('pending', 'approved', 'rejected', 'needs_changes', 'partially_approved');
create type employee_status as enum ('active', 'inactive', 'suspended');
create type user_login_status as enum ('enabled', 'disabled');
create type access_scope as enum ('platform', 'restaurant', 'branch', 'self');
create type analytics_source as enum ('my_city', 'ai_recommendation', 'search', 'meal_buddy', 'favorite', 'direct', 'restaurant_page', 'manual_input', 'admin');
create type recommendation_anomaly_status as enum ('open', 'ignored', 'investigation_draft_created', 'resolved');
create type admin_action_draft_status as enum ('draft', 'confirmed', 'cancelled', 'expired');
create type review_request_status as enum ('pending', 'approved', 'returned', 'rejected');
create type data_quality_severity as enum ('info', 'warning', 'critical');

-- Use lookup table instead of PostgreSQL enum for analytics_event_type because it is expected
-- to expand frequently with product instrumentation.
create table analytics_event_types (
  event_type text primary key,
  description text not null,
  is_order_reserved boolean not null default false,
  created_at timestamptz not null default now()
);

insert into analytics_event_types (event_type, description, is_order_reserved) values
  ('menu_item_impression', 'Menu item appeared in a list or recommendation surface.', false),
  ('menu_item_view', 'User viewed a menu item detail or equivalent card.', false),
  ('menu_item_favorite', 'User favorited or unfavorited a menu item.', false),
  ('menu_item_add_to_cart', 'Reserved for future cart conversion.', true),
  ('menu_item_order', 'Reserved for future order conversion.', true),
  ('nutrition_badge_enabled', 'Nutrition badge was enabled for a menu item.', false),
  ('nutrition_badge_disabled', 'Nutrition badge was disabled for a menu item.', false),
  ('recommendation_impression', 'Recommendation was shown.', false),
  ('recommendation_click', 'Recommendation was clicked.', false),
  ('restaurant_page_view', 'Restaurant page was viewed.', false),
  ('pending_menu_item_submitted', 'Unresolved menu input was submitted.', false),
  ('pending_menu_item_resolved', 'Pending menu item was resolved.', false),
  ('employee_transferred', 'Employee branch transfer occurred.', false),
  ('employee_role_changed', 'Employee role assignment changed.', false)
on conflict (event_type) do nothing;

create table restaurant_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references restaurant_roles(id) on delete cascade,
  permission_key text not null,
  scope access_scope not null,
  created_at timestamptz not null default now(),
  unique (role_id, permission_key, scope)
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/003_restaurants_and_branches.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  city text not null,
  category text not null,
  tags text[] not null default '{}',
  plan text not null default 'starter',
  status restaurant_status not null default 'draft',
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create table restaurant_branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  name text not null,
  district text not null,
  address text not null,
  status branch_status not null default 'draft',
  latitude numeric(9,6),
  longitude numeric(9,6),
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name),
  check (length(trim(name)) > 0)
);

create table branch_business_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references restaurant_branches(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, day_of_week),
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table branch_special_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references restaurant_branches(id) on delete cascade,
  date date not null,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, date)
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/004_restaurant_users_and_staff.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table restaurant_employees (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  name text not null,
  title text not null,
  phone text,
  status employee_status not null default 'active',
  default_branch_id uuid references restaurant_branches(id) on delete set null,
  effective_date date not null default current_date,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table restaurant_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  employee_id uuid references restaurant_employees(id) on delete set null,
  email citext not null unique,
  display_name text not null,
  login_status user_login_status not null default 'enabled',
  permission_scope access_scope not null default 'self',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table restaurant_memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  restaurant_user_id uuid not null references restaurant_users(id) on delete cascade,
  role_id uuid not null references restaurant_roles(id) on delete restrict,
  status employee_status not null default 'active',
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, restaurant_user_id, role_id)
);

create table employee_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references restaurant_employees(id) on delete cascade,
  branch_id uuid not null references restaurant_branches(id) on delete cascade,
  effective_date date not null default current_date,
  ended_at date,
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, branch_id, effective_date)
);

create table employee_role_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references restaurant_employees(id) on delete cascade,
  role_id uuid not null references restaurant_roles(id) on delete restrict,
  scope access_scope not null,
  restaurant_id uuid references restaurants(id) on delete cascade,
  branch_id uuid references restaurant_branches(id) on delete cascade,
  effective_date date not null default current_date,
  ended_at date,
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (scope = 'restaurant' and restaurant_id is not null and branch_id is null)
    or (scope = 'branch' and branch_id is not null)
    or (scope in ('platform', 'self'))
  )
);

create table employee_transfer_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references restaurant_employees(id) on delete restrict,
  from_branch_id uuid references restaurant_branches(id) on delete set null,
  to_branch_id uuid not null references restaurant_branches(id) on delete restrict,
  operator_user_id uuid references restaurant_users(id) on delete set null,
  effective_date date not null,
  note text,
  created_at timestamptz not null default now()
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/005_menus_and_menu_items.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  name text not null,
  status menu_status not null default 'draft',
  deleted_at timestamptz,
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references menus(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_id, name)
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  name text not null,
  description text not null default '',
  image_url text,
  tag_ids text[] not null default '{}',
  allergens text[] not null default '{}',
  status menu_item_status not null default 'draft',
  nutrition_badge_status nutrition_badge_status not null default 'missing',
  badge_enabled boolean not null default false,
  deleted_at timestamptz,
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_category_items (
  id uuid primary key default gen_random_uuid(),
  menu_category_id uuid not null references menu_categories(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (menu_category_id, menu_item_id)
);

create table branch_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  branch_id uuid not null references restaurant_branches(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  price numeric(10,2) not null check (price >= 0),
  availability branch_menu_item_availability not null default 'available',
  sold_out boolean not null default false,
  branch_specific_name text,
  branch_specific_description text,
  branch_specific_status branch_menu_item_status not null default 'available',
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, menu_item_id)
);

create table menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  price_delta numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, name)
);

create table option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  min_select integer not null default 0,
  max_select integer not null default 1,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name),
  check (min_select >= 0 and max_select >= min_select)
);

create table option_items (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references option_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_group_id, name)
);

create table menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  option_group_id uuid not null references option_groups(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (menu_item_id, option_group_id)
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/006_ingredients_and_nutrition.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_unit text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingredient_nutrition (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  calories numeric(10,2) not null,
  protein numeric(10,2) not null,
  carbohydrates numeric(10,2) not null,
  fat numeric(10,2) not null,
  fiber numeric(10,2),
  sugar numeric(10,2),
  sodium numeric(10,2),
  saturated_fat numeric(10,2),
  per_unit text not null,
  source nutrition_source not null default 'admin_verified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  amount numeric(10,2) not null default 0,
  unit text not null,
  preparation_method text,
  source nutrition_source not null,
  status text not null default 'complete' check (status in ('complete', 'missing_ingredients', 'missing_portion', 'ai_outlier')),
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, ingredient_id, preparation_method)
);

-- Current official or current reviewed nutrition row. AI estimates are kept separately.
create table menu_item_nutrition (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  calories numeric(10,2),
  protein numeric(10,2),
  carbohydrates numeric(10,2),
  fat numeric(10,2),
  fiber numeric(10,2),
  sugar numeric(10,2),
  sodium numeric(10,2),
  saturated_fat numeric(10,2),
  serving_size text,
  source nutrition_source not null,
  confidence_score numeric(5,4) not null default 0 check (confidence_score between 0 and 1),
  verified_status nutrition_verification_status not null default 'pending_review',
  is_current boolean not null default true,
  reviewed_by uuid references restaurant_users(id) on delete set null,
  updated_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index menu_item_nutrition_one_current_per_item
  on menu_item_nutrition(menu_item_id)
  where is_current;

create table nutrition_estimates (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  calories numeric(10,2),
  protein numeric(10,2),
  carbohydrates numeric(10,2),
  fat numeric(10,2),
  fiber numeric(10,2),
  sugar numeric(10,2),
  sodium numeric(10,2),
  saturated_fat numeric(10,2),
  confidence_score numeric(5,4) not null default 0 check (confidence_score between 0 and 1),
  model_version text not null,
  input_fingerprint text,
  created_at timestamptz not null default now()
);

create table nutrition_reviews (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  nutrition_id uuid references menu_item_nutrition(id) on delete set null,
  estimate_id uuid references nutrition_estimates(id) on delete set null,
  status nutrition_review_status not null default 'pending',
  note text,
  reviewer_id uuid references restaurant_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nutrition_change_logs (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  nutrition_id uuid references menu_item_nutrition(id) on delete set null,
  changed_by uuid references restaurant_users(id) on delete set null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/007_aliases_and_pending_items.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table menu_item_aliases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  branch_id uuid references restaurant_branches(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  alias_name text not null,
  normalized_alias_name text not null,
  source_type alias_source_type not null,
  confidence_score numeric(5,4) not null default 0 check (confidence_score between 0 and 1),
  status alias_status not null default 'pending',
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index menu_item_aliases_unique_restaurant_scope
  on menu_item_aliases(restaurant_id, normalized_alias_name)
  where branch_id is null and status in ('pending', 'approved');

create unique index menu_item_aliases_unique_branch_scope
  on menu_item_aliases(restaurant_id, branch_id, normalized_alias_name)
  where branch_id is not null and status in ('pending', 'approved');

create table pending_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  branch_id uuid references restaurant_branches(id) on delete set null,
  user_id uuid,
  user_input_name text not null,
  normalized_input_name text not null,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  photo_url text,
  ai_category_guess text,
  ai_suggested_menu_item_id uuid references menu_items(id) on delete set null,
  similarity numeric(5,4) not null default 0 check (similarity between 0 and 1),
  status pending_menu_item_status not null default 'pending',
  duplicate_key text generated always as (restaurant_id::text || ':' || coalesce(branch_id::text, 'restaurant') || ':' || normalized_input_name) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index pending_menu_items_duplicate_suppression
  on pending_menu_items(duplicate_key)
  where status in ('pending', 'needs_more_information');

create table pending_menu_item_candidates (
  id uuid primary key default gen_random_uuid(),
  pending_menu_item_id uuid not null references pending_menu_items(id) on delete cascade,
  candidate_menu_item_id uuid not null references menu_items(id) on delete cascade,
  similarity numeric(5,4) not null check (similarity between 0 and 1),
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  unique (pending_menu_item_id, candidate_menu_item_id)
);

create table pending_menu_item_actions (
  id uuid primary key default gen_random_uuid(),
  pending_menu_item_id uuid not null references pending_menu_items(id) on delete cascade,
  action_type text not null check (action_type in ('map_to_existing', 'create_new_draft', 'reject', 'request_more_information', 'create_alias')),
  target_menu_item_id uuid references menu_items(id) on delete set null,
  actor_user_id uuid references restaurant_users(id) on delete set null,
  note text,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/008_recommendations.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table recommendation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  branch_id uuid not null references restaurant_branches(id) on delete restrict,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  score numeric(6,4) not null check (score between 0 and 1),
  nutrition_fit_score numeric(6,4) not null check (nutrition_fit_score between 0 and 1),
  taste_fit_score numeric(6,4) not null check (taste_fit_score between 0 and 1),
  distance_score numeric(6,4) not null check (distance_score between 0 and 1),
  availability_score numeric(6,4) not null check (availability_score between 0 and 1),
  model_version text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table recommendation_reasons (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendation_results(id) on delete cascade,
  reason_code text not null,
  weight numeric(6,4),
  explanation text,
  created_at timestamptz not null default now(),
  unique (recommendation_id, reason_code)
);

create table recommendation_anomalies (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendation_results(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  branch_id uuid not null references restaurant_branches(id) on delete restrict,
  anomaly_reason text not null,
  status recommendation_anomaly_status not null default 'open',
  created_by uuid references restaurant_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/009_analytics_events.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null references analytics_event_types(event_type) on delete restrict,
  user_id uuid,
  anonymous_id text,
  restaurant_id uuid references restaurants(id) on delete set null,
  branch_id uuid references restaurant_branches(id) on delete set null,
  menu_id uuid references menus(id) on delete set null,
  menu_item_id uuid references menu_items(id) on delete set null,
  recommendation_id uuid references recommendation_results(id) on delete set null,
  session_id text,
  source analytics_source not null,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'server', 'unknown')),
  device_type text not null default 'unknown' check (device_type in ('phone', 'tablet', 'desktop', 'server', 'unknown')),
  schema_version integer not null default 1 check (schema_version > 0),
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  event_idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_idempotency_key)
);

alter table analytics_events add constraint analytics_event_reference_requirements check (
  (event_type = 'restaurant_page_view' and restaurant_id is not null)
  or (event_type like 'menu_item_%' and restaurant_id is not null and menu_item_id is not null)
  or (event_type like 'nutrition_badge_%' and menu_item_id is not null)
  or (event_type like 'recommendation_%' and recommendation_id is not null)
  or (event_type like 'pending_menu_item_%' and restaurant_id is not null)
  or (event_type like 'employee_%' and restaurant_id is not null)
);

alter table analytics_events add constraint analytics_event_actor_context check (
  user_id is not null or anonymous_id is not null or source = 'admin'
);

create table menu_item_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  branch_id uuid references restaurant_branches(id) on delete set null,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  is_favorite boolean not null default false,
  finished boolean not null default false,
  private_rating numeric(3,2) check (private_rating between 0 and 5),
  dislike_reasons text[] not null default '{}',
  taste_feeling text,
  portion_feeling text,
  price_feeling text,
  repurchase_intent text check (repurchase_intent in ('yes', 'maybe', 'no')),
  visibility text not null default 'private' check (visibility in ('private', 'anonymous_aggregate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, menu_item_id)
);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/010_governance_and_audit.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table admin_action_drafts (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_type text not null,
  target_id uuid,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  reason text,
  status admin_action_draft_status not null default 'draft',
  created_by uuid references restaurant_users(id) on delete set null,
  confirmed_by uuid references restaurant_users(id) on delete set null,
  confirmed_at timestamptz,
  audit_log_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table restaurant_change_requests (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('restaurant', 'branch')),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  branch_id uuid references restaurant_branches(id) on delete cascade,
  submitted_by uuid references restaurant_users(id) on delete set null,
  reviewer_id uuid references restaurant_users(id) on delete set null,
  status review_request_status not null default 'pending',
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_item_merge_candidates (
  id uuid primary key default gen_random_uuid(),
  canonical_menu_item_id uuid not null references menu_items(id) on delete cascade,
  suspected_duplicate_menu_item_id uuid,
  pending_menu_item_id uuid references pending_menu_items(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  branch_id uuid references restaurant_branches(id) on delete set null,
  similarity_score numeric(5,4) not null check (similarity_score between 0 and 1),
  usage_count integer not null default 0,
  recommendation_reference_count integer not null default 0,
  meal_record_reference_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'draft_created', 'kept_separate', 'ignored')),
  suggested_action text not null check (suggested_action in ('merge', 'keep_separate', 'create_alias', 'request_more_information', 'ignore')),
  merged_into_menu_item_id uuid references menu_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table alias_reviews (
  id uuid primary key default gen_random_uuid(),
  alias_id uuid not null references menu_item_aliases(id) on delete cascade,
  suggested_menu_item_id uuid not null references menu_items(id) on delete restrict,
  usage_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'target_changed', 'rejected', 'merged', 'typo', 'wrong_restaurant')),
  note text,
  reviewer_id uuid references restaurant_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('analytics_event', 'recommendation', 'pending_menu_item', 'nutrition', 'menu_item')),
  source_id uuid,
  severity data_quality_severity not null,
  issue_code text not null,
  message text not null,
  resolved boolean not null default false,
  resolved_by uuid references restaurant_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_name text,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  result text not null,
  reason text,
  confirmation_status text,
  created_at timestamptz not null default now()
);

alter table admin_action_drafts
  add constraint admin_action_drafts_audit_log_fk
  foreign key (audit_log_id) references audit_logs(id) on delete set null;


-- ============================================================
-- Source file: docs/supabase-schema-drafts/011_indexes.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create index restaurants_status_idx on restaurants(status) where deleted_at is null;
create index branches_restaurant_status_idx on restaurant_branches(restaurant_id, status) where deleted_at is null;
create index menus_restaurant_status_idx on menus(restaurant_id, status) where deleted_at is null;
create index menu_categories_menu_sort_idx on menu_categories(menu_id, sort_order) where deleted_at is null;
create index menu_items_restaurant_status_idx on menu_items(restaurant_id, status) where deleted_at is null;
create index menu_category_items_category_sort_idx on menu_category_items(menu_category_id, sort_order);
create index branch_menu_items_branch_availability_idx on branch_menu_items(branch_id, availability, sold_out);
create index branch_menu_items_menu_item_idx on branch_menu_items(menu_item_id);
create index menu_item_aliases_normalized_idx on menu_item_aliases(restaurant_id, normalized_alias_name, status);
create index pending_menu_items_restaurant_status_idx on pending_menu_items(restaurant_id, status, last_seen_at desc);
create index menu_item_nutrition_menu_status_idx on menu_item_nutrition(menu_item_id, verified_status) where is_current;
create index nutrition_estimates_menu_item_created_idx on nutrition_estimates(menu_item_id, created_at desc);
create index nutrition_reviews_status_idx on nutrition_reviews(status, created_at);
create index recommendation_results_user_created_idx on recommendation_results(user_id, generated_at desc);
create index recommendation_results_item_idx on recommendation_results(menu_item_id, branch_id);
create index analytics_events_occurred_idx on analytics_events(occurred_at desc);
create index analytics_events_restaurant_time_idx on analytics_events(restaurant_id, occurred_at desc);
create index analytics_events_item_time_idx on analytics_events(menu_item_id, occurred_at desc) where menu_item_id is not null;
create index analytics_events_menu_time_idx on analytics_events(menu_id, occurred_at desc) where menu_id is not null;
create index analytics_events_recommendation_idx on analytics_events(recommendation_id) where recommendation_id is not null;
create index analytics_events_session_time_idx on analytics_events(session_id, occurred_at desc) where session_id is not null;
create index restaurant_users_auth_user_idx on restaurant_users(auth_user_id) where auth_user_id is not null;
create index memberships_user_restaurant_idx on restaurant_memberships(restaurant_user_id, restaurant_id);
create index employee_assignments_branch_idx on employee_branch_assignments(branch_id, effective_date);
create index audit_logs_target_idx on audit_logs(target_type, target_id, created_at desc);
create index admin_action_drafts_status_idx on admin_action_drafts(status, created_at);


-- ============================================================
-- Source file: docs/supabase-schema-drafts/012_views.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create view published_branch_menu_items as
select distinct
  bmi.id as branch_menu_item_id,
  r.id as restaurant_id,
  b.id as branch_id,
  m.id as menu_item_id,
  coalesce(bmi.branch_specific_name, m.name) as display_name,
  coalesce(bmi.branch_specific_description, m.description) as display_description,
  bmi.price,
  bmi.availability,
  bmi.sold_out,
  bmi.branch_specific_status,
  m.tag_ids,
  m.allergens,
  m.badge_enabled,
  m.nutrition_badge_status
from branch_menu_items bmi
join restaurants r on r.id = bmi.restaurant_id
join restaurant_branches b on b.id = bmi.branch_id
join menu_items m on m.id = bmi.menu_item_id
join menu_category_items mci on mci.menu_item_id = m.id
join menu_categories mc on mc.id = mci.menu_category_id
join menus menu on menu.id = mc.menu_id
where r.status = 'active'
  and b.status = 'active'
  and menu.status = 'published'
  and m.status = 'active'
  and bmi.branch_specific_status = 'available'
  and r.deleted_at is null;

create view current_menu_item_nutrition as
select *
from menu_item_nutrition
where is_current;

create materialized view restaurant_exposure_summary as
select
  restaurant_id,
  source,
  date_trunc('day', occurred_at) as bucket_day,
  count(*) as event_count,
  sum(coalesce((metadata->>'count')::numeric, 1)) as exposure_count
from analytics_events
where restaurant_id is not null
group by restaurant_id, source, date_trunc('day', occurred_at);

create materialized view nutrition_badge_performance as
select
  menu_item_id,
  metadata->>'period' as period,
  count(*) filter (where event_type = 'menu_item_view') as view_events,
  count(*) filter (where event_type = 'menu_item_favorite') as favorite_events,
  count(*) filter (where event_type = 'menu_item_add_to_cart') as cart_events
from analytics_events
where menu_item_id is not null
group by menu_item_id, metadata->>'period';

create materialized view menu_item_performance as
select
  restaurant_id,
  branch_id,
  menu_item_id,
  date_trunc('day', occurred_at) as bucket_day,
  count(*) as event_count
from analytics_events
where menu_item_id is not null
group by restaurant_id, branch_id, menu_item_id, date_trunc('day', occurred_at);

create view unresolved_pending_menu_items as
select *
from pending_menu_items
where status in ('pending', 'needs_more_information');

create view restaurant_staff_access_scope as
select
  ru.id as restaurant_user_id,
  ru.auth_user_id,
  rm.restaurant_id,
  era.branch_id,
  rr.role_key,
  era.scope
from restaurant_users ru
join restaurant_memberships rm on rm.restaurant_user_id = ru.id and rm.status = 'active'
join restaurant_roles rr on rr.id = rm.role_id
left join restaurant_employees e on e.id = ru.employee_id
left join employee_role_assignments era on era.employee_id = e.id and era.ended_at is null;

create view analytics_event_quality_issues as
select
  ae.id as analytics_event_id,
  ae.event_type,
  case
    when ae.event_type like 'recommendation_%' and ae.recommendation_id is null then 'MISSING_RECOMMENDATION_ID'
    when ae.event_type like 'menu_item_%' and ae.menu_item_id is null then 'MISSING_MENU_ITEM_ID'
    when ae.restaurant_id is null then 'MISSING_RESTAURANT_ID'
    else null
  end as issue_code
from analytics_events ae
where
  (ae.event_type like 'recommendation_%' and ae.recommendation_id is null)
  or (ae.event_type like 'menu_item_%' and ae.menu_item_id is null)
  or ae.restaurant_id is null;


-- ============================================================
-- Source file: docs/supabase-schema-drafts/013_rls_policy_drafts.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- RLS policies are pseudocode-quality SQL drafts and require security review before use.

alter table restaurants enable row level security;
alter table restaurant_branches enable row level security;
alter table menus enable row level security;
alter table menu_items enable row level security;
alter table branch_menu_items enable row level security;
alter table menu_item_nutrition enable row level security;
alter table analytics_events enable row level security;
alter table pending_menu_items enable row level security;
alter table restaurant_users enable row level security;
alter table restaurant_employees enable row level security;
alter table admin_action_drafts enable row level security;
alter table audit_logs enable row level security;

-- Helper draft. Production should harden this with SECURITY DEFINER and search_path review.
create or replace function public.has_restaurant_scope(target_restaurant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from restaurant_users ru
    join restaurant_memberships rm on rm.restaurant_user_id = ru.id
    where ru.auth_user_id = auth.uid()
      and rm.restaurant_id = target_restaurant_id
      and rm.status = 'active'
      and ru.login_status = 'enabled'
  );
$$;

create or replace function public.has_branch_scope(target_branch_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from restaurant_users ru
    join restaurant_employees e on e.id = ru.employee_id
    join employee_branch_assignments eba on eba.employee_id = e.id
    where ru.auth_user_id = auth.uid()
      and eba.branch_id = target_branch_id
      and eba.ended_at is null
      and ru.login_status = 'enabled'
  );
$$;

-- Mobile consumers may read approved public restaurant data.
create policy consumer_read_active_restaurants on restaurants
  for select using (status = 'active' and deleted_at is null);

create policy consumer_read_active_branches on restaurant_branches
  for select using (status = 'active' and deleted_at is null);

create policy consumer_read_active_menu_items on menu_items
  for select using (status = 'active' and deleted_at is null);

create policy consumer_read_available_branch_menu_items on branch_menu_items
  for select using (availability in ('available', 'limited') and sold_out = false and branch_specific_status = 'available');

create policy consumer_read_approved_nutrition on menu_item_nutrition
  for select using (is_current = true and verified_status = 'verified');

-- Mobile consumers can create unresolved menu-item input directly only if product/security review allows it.
-- Production analytics ingestion should use an RPC, Edge Function, or ingestion service that validates
-- schema_version, idempotency, actor context, and entity references before inserting analytics_events.
-- Do not promote a direct consumer_insert_analytics policy without security review.

create policy consumer_insert_pending_menu_items on pending_menu_items
  for insert with check (auth.uid() is not null);

-- Restaurant users can manage scoped restaurant/branch data through allowed roles.
create policy restaurant_user_read_own_restaurant on restaurants
  for select using (has_restaurant_scope(id));

create policy restaurant_user_update_own_restaurant on restaurants
  for update using (has_restaurant_scope(id)) with check (has_restaurant_scope(id));

create policy restaurant_user_manage_branch_menu_items on branch_menu_items
  for all using (has_restaurant_scope(restaurant_id) or has_branch_scope(branch_id))
  with check (has_restaurant_scope(restaurant_id) or has_branch_scope(branch_id));

create policy restaurant_user_read_staff_scope on restaurant_employees
  for select using (has_restaurant_scope(restaurant_id));

-- Admin/platform policies should be tied to platform roles, not ordinary restaurant roles.
-- Replace the metadata check with a production reviewed admin claim strategy.
create policy platform_admin_all_admin_drafts on admin_action_drafts
  for all using ((auth.jwt() ->> 'app_role') in ('platform_admin', 'platform_reviewer'))
  with check ((auth.jwt() ->> 'app_role') in ('platform_admin', 'platform_reviewer'));

create policy platform_admin_read_audit_logs on audit_logs
  for select using ((auth.jwt() ->> 'app_role') in ('platform_admin', 'platform_reviewer', 'governance_auditor'));

-- Service role bypasses RLS in Supabase; use it only for trusted imports, scheduled jobs,
-- analytics aggregation, and migration backfills.


-- ============================================================
-- Source file: docs/supabase-schema-drafts/014_seed_mapping_strategy.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create table legacy_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_dataset_version text not null,
  source_entity_type text not null,
  legacy_id text not null,
  canonical_uuid uuid not null,
  target_table text not null,
  import_batch_id text,
  source_row_checksum text,
  import_status text not null default 'mapped' check (import_status in ('mapped', 'imported', 'skipped', 'rolled_back')),
  rollback_batch_id text,
  migrated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_system, source_dataset_version, source_entity_type, legacy_id),
  unique (target_table, canonical_uuid)
);

create index legacy_entity_mappings_lookup_idx
  on legacy_entity_mappings(source_system, source_dataset_version, source_entity_type, legacy_id);

-- Import strategy draft:
-- 1. Upsert each canonical mock record into its production table using deterministic generated UUIDs
--    or precomputed UUIDs stored in legacy_entity_mappings.
-- 2. Insert legacy_entity_mappings before child rows so references can be resolved idempotently.
--    source_dataset_version should identify the shared mock dataset release or commit being imported.
--    source_row_checksum lets retries detect changed source rows without relying on display names.
-- 3. Resolve restaurant, branch, menu item, alias, nutrition, analytics, recommendation, and governance
--    references through this table rather than by display names.
-- 4. Re-running an import must use ON CONFLICT(source_system, source_dataset_version, source_entity_type, legacy_id)
--    DO UPDATE only for non-destructive metadata, never blindly replacing production-owned rows.

-- Example shape only:
-- insert into legacy_entity_mappings(source_system, source_dataset_version, source_entity_type, legacy_id, canonical_uuid, target_table, import_batch_id)
-- values ('shared_mock_restaurant_platform', '2026-07-freeze-candidate', 'restaurant', 'restaurant-haochu-bowl', gen_random_uuid(), 'restaurants', '2026-07-schema-prep')
-- on conflict (source_system, source_dataset_version, source_entity_type, legacy_id) do nothing;


-- ============================================================
-- Source file: docs/supabase-schema-drafts/015_validation_queries.sql
-- ============================================================
-- DRAFT ONLY - Supabase schema mapping preparation.
-- Read-only validation queries aligned with scripts/audit-canonical-data.mjs checks.

-- Orphan branch references.
select b.id, b.restaurant_id
from restaurant_branches b
left join restaurants r on r.id = b.restaurant_id
where r.id is null;

-- Orphan menu-item references.
select mi.id, mi.restaurant_id
from menu_items mi
left join restaurants r on r.id = mi.restaurant_id
where r.id is null;

-- Duplicate canonical menu items within a restaurant by normalized name.
select restaurant_id, lower(trim(name)) as normalized_name, count(*)
from menu_items
where deleted_at is null
group by restaurant_id, lower(trim(name))
having count(*) > 1;

-- Duplicate aliases within active resolution scope.
select restaurant_id, branch_id, normalized_alias_name, count(*)
from menu_item_aliases
where status in ('pending', 'approved')
group by restaurant_id, branch_id, normalized_alias_name
having count(*) > 1;

-- Aliases pointing to missing menu items.
select a.id, a.menu_item_id
from menu_item_aliases a
left join menu_items mi on mi.id = a.menu_item_id
where mi.id is null;

-- Branch menu items pointing to missing branches or menu items.
select bmi.id, bmi.branch_id, bmi.menu_item_id
from branch_menu_items bmi
left join restaurant_branches b on b.id = bmi.branch_id
left join menu_items mi on mi.id = bmi.menu_item_id
where b.id is null or mi.id is null;

-- Multiple current official nutrition rows.
select menu_item_id, count(*)
from menu_item_nutrition
where is_current
group by menu_item_id
having count(*) > 1;

-- Invalid analytics event references.
select ae.id, ae.event_type, ae.restaurant_id, ae.branch_id, ae.menu_id, ae.menu_item_id, ae.recommendation_id
from analytics_events ae
left join restaurants r on r.id = ae.restaurant_id
left join restaurant_branches b on b.id = ae.branch_id
left join menus m on m.id = ae.menu_id
left join menu_items mi on mi.id = ae.menu_item_id
left join recommendation_results rr on rr.id = ae.recommendation_id
where (ae.restaurant_id is not null and r.id is null)
   or (ae.branch_id is not null and b.id is null)
   or (ae.menu_id is not null and m.id is null)
   or (ae.menu_item_id is not null and mi.id is null)
   or (ae.recommendation_id is not null and rr.id is null);

-- Missing analytics actor context.
select id, event_type, user_id, anonymous_id, source
from analytics_events
where user_id is null and anonymous_id is null and source <> 'admin';

-- Duplicate event idempotency keys.
select event_idempotency_key, count(*)
from analytics_events
where event_idempotency_key is not null
group by event_idempotency_key
having count(*) > 1;

-- Invalid recommendation references.
select rr.id, rr.restaurant_id, rr.branch_id, rr.menu_item_id
from recommendation_results rr
left join restaurants r on r.id = rr.restaurant_id
left join restaurant_branches b on b.id = rr.branch_id
left join menu_items mi on mi.id = rr.menu_item_id
where r.id is null or b.id is null or mi.id is null;

-- Pending items with invalid restaurant or branch IDs.
select p.id, p.restaurant_id, p.branch_id
from pending_menu_items p
left join restaurants r on r.id = p.restaurant_id
left join restaurant_branches b on b.id = p.branch_id
where r.id is null or (p.branch_id is not null and b.id is null);

-- Employees with invalid assignments.
select eba.id, eba.employee_id, eba.branch_id
from employee_branch_assignments eba
left join restaurant_employees e on e.id = eba.employee_id
left join restaurant_branches b on b.id = eba.branch_id
where e.id is null or b.id is null;

-- Memberships exceeding expected scope: branch role without branch assignment.
select era.id, era.employee_id, era.scope, era.branch_id
from employee_role_assignments era
where era.scope = 'branch' and era.branch_id is null;


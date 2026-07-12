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

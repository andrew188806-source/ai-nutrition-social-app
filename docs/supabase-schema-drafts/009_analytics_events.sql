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

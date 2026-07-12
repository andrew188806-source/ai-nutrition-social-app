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

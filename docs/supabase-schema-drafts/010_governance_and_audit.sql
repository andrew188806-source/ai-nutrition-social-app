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

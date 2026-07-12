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

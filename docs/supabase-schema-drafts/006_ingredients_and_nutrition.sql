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

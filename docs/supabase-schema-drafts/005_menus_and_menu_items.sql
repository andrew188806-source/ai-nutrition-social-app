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

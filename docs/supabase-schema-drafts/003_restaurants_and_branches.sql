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

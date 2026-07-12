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

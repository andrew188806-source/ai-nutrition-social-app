-- RA-2H-P1: governed Restaurant branch temporal authority. Per-branch IANA timezone, weekly
-- wall-clock hours, local-date special overrides, absolute operational closure windows, and one
-- canonical OPEN/CLOSED/UNKNOWN evaluator. See docs/restaurant-owner-branch-temporal-foundation-
-- ra-2h-p0.md for the frozen product/architecture contract this migration implements exactly.
--
-- Admin lifecycle (restaurant_branches.status, RA-1C) remains the sole superior authority. Owner
-- operational closure is a SEPARATE concern and never writes status/status_version and can never
-- reopen an Admin-blocked branch. RA-2A-F columns (sold_out, availability, price, visibility,
-- display names) are untouched by every temporal writer.

begin;

-- =================================================================================================
-- 0. Assert the frozen predecessors this migration depends on are exactly as expected.
-- =================================================================================================
do $$
declare
  v_count integer;
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'platform_admin_branch_status_authority') then
    raise exception 'RA-2H-P1: RA-1C sealed role is missing';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurant_branches' and column_name = 'status_version') then
    raise exception 'RA-2H-P1: RA-1C status_version column is missing';
  end if;
  select pg_catalog.count(*) into v_count from pg_catalog.pg_roles
    where rolname in (
      'restaurant_owner_branch_menu_item_write_authority',
      'restaurant_owner_branch_menu_item_availability_write_authority',
      'restaurant_owner_branch_menu_item_price_write_authority',
      'restaurant_owner_branch_menu_item_visibility_write_authority',
      'restaurant_owner_branch_display_name_write_authority',
      'restaurant_owner_branch_menu_item_display_name_write_authority'
    );
  if v_count <> 6 then
    raise exception 'RA-2H-P1: expected all 6 RA-2A-F sealed writers present, found %', v_count;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'branch_menu_items' and column_name = 'branch_specific_name_version') then
    raise exception 'RA-2H-P1: RA-2F-P1 branch_specific_name_version column is missing';
  end if;
end
$$;

-- =================================================================================================
-- 1. Per-branch IANA timezone. Nullable add, evidence-backed one-time backfill, then NOT NULL.
--    No database default: every future insert must supply an explicit, validated zone.
-- =================================================================================================
alter table public.restaurant_branches add column timezone_name text;

create function restaurant_internal.restaurant_branch_timezone_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.timezone_name is not distinct from old.timezone_name then
    return new;
  end if;
  if new.timezone_name is null then
    return new; -- allows the nullable backfill window; NOT NULL is enforced by the column itself later
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone_name) then
    raise exception 'RA-2H-P1: % is not a recognized IANA timezone', new.timezone_name;
  end if;
  return new;
end;
$$;

create trigger restaurant_branches_timezone_validate
  before insert or update on public.restaurant_branches
  for each row execute function restaurant_internal.restaurant_branch_timezone_validate();

comment on function restaurant_internal.restaurant_branch_timezone_validate() is
  'RA-2H-P1. Exact-name validation against pg_catalog.pg_timezone_names on insert and on change of timezone_name only. No hand-written allowlist.';

update public.restaurant_branches set timezone_name = 'Asia/Taipei' where timezone_name is null;

do $$
declare
  v_unset integer;
begin
  select pg_catalog.count(*) into v_unset from public.restaurant_branches where timezone_name is null;
  if v_unset <> 0 then
    raise exception 'RA-2H-P1: % branch rows still lack a timezone after backfill', v_unset;
  end if;
end
$$;

alter table public.restaurant_branches alter column timezone_name set not null;

comment on column public.restaurant_branches.timezone_name is
  'RA-2H-P1. Explicit IANA zone, exact-name validated against pg_catalog.pg_timezone_names. Asia/Taipei is a one-time backfill value for the existing Taiwan dataset, not a runtime default. Not writable by any Owner temporal mutation; a future governed timezone-change authority is separate.';

-- =================================================================================================
-- 2. One temporal-state row per branch. Auto-created atomically with every branch insert so new
--    branch creation (any current or future path) never has to remember a second call.
-- =================================================================================================
create table public.restaurant_branch_temporal_state (
  branch_id text not null,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  weekly_hours_configured boolean not null default false,
  weekly_hours_version bigint not null default 0,
  special_hours_version bigint not null default 0,
  operational_closure_version bigint not null default 0,
  constraint restaurant_branch_temporal_state_pkey primary key (branch_id),
  constraint restaurant_branch_temporal_state_branch_fkey
    foreign key (branch_id) references public.restaurant_branches(id) on delete cascade,
  constraint restaurant_branch_temporal_state_versions_non_negative check (
    weekly_hours_version >= 0 and special_hours_version >= 0 and operational_closure_version >= 0
  )
);
create index restaurant_branch_temporal_state_restaurant_idx
  on public.restaurant_branch_temporal_state (restaurant_id);

comment on table public.restaurant_branch_temporal_state is
  'RA-2H-P1. One row per branch. Three independent version tokens; changing one dimension never advances a sibling.';

create function restaurant_internal.restaurant_branch_temporal_state_seed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.restaurant_branch_temporal_state (branch_id, restaurant_id)
  values (new.id, new.restaurant_id);
  return new;
end;
$$;

create trigger restaurant_branches_temporal_state_seed
  after insert on public.restaurant_branches
  for each row execute function restaurant_internal.restaurant_branch_temporal_state_seed();

comment on function restaurant_internal.restaurant_branch_temporal_state_seed() is
  'RA-2H-P1. Every new branch atomically receives a zeroed temporal-state row (configured=false, all versions 0). No weekly interval, special override, or closure is ever manufactured.';

insert into public.restaurant_branch_temporal_state (branch_id, restaurant_id)
select b.id, b.restaurant_id from public.restaurant_branches b
where not exists (
  select 1 from public.restaurant_branch_temporal_state t where t.branch_id = b.id
);

do $$
declare
  v_branches integer;
  v_states integer;
  v_bad integer;
begin
  select pg_catalog.count(*) into v_branches from public.restaurant_branches;
  select pg_catalog.count(*) into v_states from public.restaurant_branch_temporal_state;
  if v_branches <> v_states then
    raise exception 'RA-2H-P1: temporal-state backfill mismatch (% branches, % states)', v_branches, v_states;
  end if;
  -- verified here, before RLS is enabled on this table later in this migration (section 10):
  -- once forced, a direct row-read as the non-BYPASSRLS migration runner would see zero rows.
  select pg_catalog.count(*) into v_bad from public.restaurant_branch_temporal_state t
    where t.weekly_hours_version <> 0 or t.special_hours_version <> 0
       or t.operational_closure_version <> 0 or t.weekly_hours_configured <> false;
  if v_bad <> 0 then
    raise exception 'RA-2H-P1: % temporal-state rows are not zeroed/unconfigured at migration time', v_bad;
  end if;
end
$$;

-- =================================================================================================
-- 3. Weekly interval facts. ISO weekday 1..7. Half-open [start,end); end_day_offset in {0,1}. The
--    ONLY canonical 24h encoding is 00:00:00 -> 00:00:00 offset 1; every other equal-time pair, and
--    every offset-1 pair with start earlier than end, is invalid.
-- =================================================================================================
create table public.restaurant_branch_weekly_hour_intervals (
  id uuid not null default pg_catalog.gen_random_uuid(),
  branch_id text not null references public.restaurant_branches(id) on delete cascade,
  weekday smallint not null,
  start_local_time time without time zone not null,
  end_local_time time without time zone not null,
  end_day_offset smallint not null,
  constraint restaurant_branch_weekly_hour_intervals_pkey primary key (id),
  constraint restaurant_branch_weekly_hour_intervals_unique
    unique (branch_id, weekday, start_local_time, end_day_offset, end_local_time),
  constraint restaurant_branch_weekly_hour_intervals_weekday_check check (weekday between 1 and 7),
  constraint restaurant_branch_weekly_hour_intervals_offset_check check (end_day_offset in (0, 1)),
  constraint restaurant_branch_weekly_hour_intervals_shape_check check (
    (end_day_offset = 0 and start_local_time < end_local_time)
    or (end_day_offset = 1 and start_local_time > end_local_time)
    or (end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')
  )
);
create index restaurant_branch_weekly_hour_intervals_branch_idx
  on public.restaurant_branch_weekly_hour_intervals (branch_id, weekday);

comment on table public.restaurant_branch_weekly_hour_intervals is
  'RA-2H-P1. Normalized weekly wall-clock intervals. time without time zone only -- never a fake UTC timestamp.';

-- Defense-in-depth: an overlapping stored set is unreachable outside the RPC. Deferred so the
-- RPC's delete-then-insert whole-week replace is validated once, against the FINAL row set, at
-- commit-check time. Circular: Sunday overnight is also compared shifted by one week.
create function restaurant_internal.restaurant_branch_weekly_hours_overlap_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict boolean;
begin
  select exists (
    select 1
    from public.restaurant_branch_weekly_hour_intervals a
    join public.restaurant_branch_weekly_hour_intervals b
      on a.branch_id = b.branch_id and a.id < b.id
    cross join (values (-10080), (0), (10080)) as shift(s)
    where a.branch_id = new.branch_id
      and (a.weekday - 1) * 1440 + pg_catalog.date_part('epoch', a.start_local_time)::integer / 60
        < (b.weekday - 1) * 1440 + pg_catalog.date_part('epoch', b.end_local_time)::integer / 60
          + b.end_day_offset * 1440 + shift.s
      and (b.weekday - 1) * 1440 + pg_catalog.date_part('epoch', b.start_local_time)::integer / 60 + shift.s
        < (a.weekday - 1) * 1440 + pg_catalog.date_part('epoch', a.end_local_time)::integer / 60
          + a.end_day_offset * 1440
  ) into v_conflict;
  if v_conflict then
    raise exception 'RA-2H-P1: weekly interval set for branch % contains an effective overlap', new.branch_id;
  end if;
  return null;
end;
$$;

-- NOT deferred: the sole writer RPC is a single SECURITY DEFINER statement whose elevated privilege
-- ends when it returns, before a COMMIT-deferred trigger would fire. An AFTER ROW trigger (fired at
-- end of statement, same privilege context) still sees the complete final row set from one
-- INSERT...SELECT, which is all this RPC ever issues.
create trigger restaurant_branch_weekly_hour_intervals_overlap_guard
  after insert or update on public.restaurant_branch_weekly_hour_intervals
  for each row execute function restaurant_internal.restaurant_branch_weekly_hours_overlap_guard();

comment on function restaurant_internal.restaurant_branch_weekly_hours_overlap_guard() is
  'RA-2H-P1. Re-validates the full stored weekly interval set for the affected branch has no effective overlap, including circular Sunday-to-Monday wraparound, at end of the writing statement.';

-- =================================================================================================
-- 4. Special-date model. Exactly one closed|custom override per (branch, local_date). A special
--    override fully REPLACES weekly for its starting local date; it never merges. `closed` has zero
--    children; `custom` has 1..8 canonical children using the same interval contract as weekly.
-- =================================================================================================
create table public.restaurant_branch_special_hour_overrides (
  id uuid not null default pg_catalog.gen_random_uuid(),
  branch_id text not null references public.restaurant_branches(id) on delete cascade,
  local_date date not null,
  mode text not null,
  constraint restaurant_branch_special_hour_overrides_pkey primary key (id),
  constraint restaurant_branch_special_hour_overrides_unique unique (branch_id, local_date),
  constraint restaurant_branch_special_hour_overrides_mode_check check (mode in ('closed', 'custom'))
);
create index restaurant_branch_special_hour_overrides_branch_idx
  on public.restaurant_branch_special_hour_overrides (branch_id, local_date);

comment on table public.restaurant_branch_special_hour_overrides is
  'RA-2H-P1. One closed|custom override per branch local date. Clear removes the row entirely and restores weekly authority for that date.';

create table public.restaurant_branch_special_hour_intervals (
  id uuid not null default pg_catalog.gen_random_uuid(),
  override_id uuid not null references public.restaurant_branch_special_hour_overrides(id) on delete cascade,
  start_local_time time without time zone not null,
  end_local_time time without time zone not null,
  end_day_offset smallint not null,
  constraint restaurant_branch_special_hour_intervals_pkey primary key (id),
  constraint restaurant_branch_special_hour_intervals_unique
    unique (override_id, start_local_time, end_day_offset, end_local_time),
  constraint restaurant_branch_special_hour_intervals_offset_check check (end_day_offset in (0, 1)),
  constraint restaurant_branch_special_hour_intervals_shape_check check (
    (end_day_offset = 0 and start_local_time < end_local_time)
    or (end_day_offset = 1 and start_local_time > end_local_time)
    or (end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')
  )
);
create index restaurant_branch_special_hour_intervals_override_idx
  on public.restaurant_branch_special_hour_intervals (override_id);

comment on table public.restaurant_branch_special_hour_intervals is
  'RA-2H-P1. Children of a custom special override. Same interval shape/overlap contract as weekly, scoped to one date (no circular wraparound).';

-- Defense-in-depth: an overlapping stored set within one override is unreachable outside the RPC.
create function restaurant_internal.restaurant_branch_special_hours_overlap_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict boolean;
begin
  select exists (
    select 1
    from public.restaurant_branch_special_hour_intervals a
    join public.restaurant_branch_special_hour_intervals b
      on a.override_id = b.override_id and a.id < b.id
    where a.override_id = new.override_id
      and pg_catalog.date_part('epoch', a.start_local_time)::integer / 60
        < pg_catalog.date_part('epoch', b.end_local_time)::integer / 60 + b.end_day_offset * 1440
      and pg_catalog.date_part('epoch', b.start_local_time)::integer / 60
        < pg_catalog.date_part('epoch', a.end_local_time)::integer / 60 + a.end_day_offset * 1440
  ) into v_conflict;
  if v_conflict then
    raise exception 'RA-2H-P1: special interval set for override % contains an effective overlap', new.override_id;
  end if;
  return null;
end;
$$;

create trigger restaurant_branch_special_hour_intervals_overlap_guard
  after insert or update on public.restaurant_branch_special_hour_intervals
  for each row execute function restaurant_internal.restaurant_branch_special_hours_overlap_guard();

-- =================================================================================================
-- 5. Operational closure. Absolute, history-preserving, half-open [starts_at, ends_at) windows.
--    ends_at IS NULL means indefinite. A partial GiST exclusion prevents overlapping non-cancelled
--    windows per branch; btree_gist is required for the equality-comparable branch_id term.
-- =================================================================================================
create extension if not exists btree_gist;

create table public.restaurant_branch_operational_closures (
  id uuid not null default pg_catalog.gen_random_uuid(),
  branch_id text not null references public.restaurant_branches(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint restaurant_branch_operational_closures_pkey primary key (id),
  constraint restaurant_branch_operational_closures_window_check
    check (ends_at is null or ends_at > starts_at),
  constraint restaurant_branch_operational_closures_no_overlap
    exclude using gist (
      branch_id with =,
      pg_catalog.tstzrange(starts_at, ends_at, '[)') with &&
    ) where (cancelled_at is null)
);
create index restaurant_branch_operational_closures_branch_idx
  on public.restaurant_branch_operational_closures (branch_id, starts_at desc);
create index restaurant_branch_operational_closures_effective_idx
  on public.restaurant_branch_operational_closures (branch_id, ends_at)
  where cancelled_at is null;

comment on table public.restaurant_branch_operational_closures is
  'RA-2H-P1. History-preserving absolute closure windows. Never recalculated after a timezone change. At most one non-cancelled window is effective at any instant per branch.';

-- =================================================================================================
-- 6. Typed, append-only audit. Normalized children, not freeform JSON. RLS forced; no update/delete
--    policy for any role; no client/runtime relation privilege exists anywhere in this section.
-- =================================================================================================
create table restaurant_internal.branch_weekly_hours_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  operation text not null,
  previous_configured boolean not null,
  next_configured boolean not null,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_weekly_hours_audit_log_pkey primary key (id),
  constraint branch_weekly_hours_audit_log_operation_check
    check (operation in ('REPLACE_WEEKLY_SCHEDULE', 'CLEAR_WEEKLY_SCHEDULE')),
  constraint branch_weekly_hours_audit_log_version_advance_check check (next_version = previous_version + 1),
  constraint branch_weekly_hours_audit_log_version_non_negative_check check (previous_version >= 0)
);
create index branch_weekly_hours_audit_log_branch_idx
  on restaurant_internal.branch_weekly_hours_audit_log (branch_id, created_at desc);

create table restaurant_internal.branch_weekly_hours_audit_intervals (
  id uuid not null default pg_catalog.gen_random_uuid(),
  audit_log_id uuid not null references restaurant_internal.branch_weekly_hours_audit_log(id) on delete cascade,
  side text not null,
  weekday smallint not null,
  start_local_time time without time zone not null,
  end_local_time time without time zone not null,
  end_day_offset smallint not null,
  constraint branch_weekly_hours_audit_intervals_pkey primary key (id),
  constraint branch_weekly_hours_audit_intervals_side_check check (side in ('previous', 'next')),
  constraint branch_weekly_hours_audit_intervals_weekday_check check (weekday between 1 and 7),
  constraint branch_weekly_hours_audit_intervals_offset_check check (end_day_offset in (0, 1))
);
create index branch_weekly_hours_audit_intervals_log_idx
  on restaurant_internal.branch_weekly_hours_audit_intervals (audit_log_id, side);

create table restaurant_internal.branch_special_hours_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  local_date date not null,
  operation text not null,
  previous_mode text,
  next_mode text,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_special_hours_audit_log_pkey primary key (id),
  constraint branch_special_hours_audit_log_operation_check
    check (operation in ('SET_CLOSED', 'SET_CUSTOM_HOURS', 'CLEAR_OVERRIDE')),
  constraint branch_special_hours_audit_log_previous_mode_check check (previous_mode in ('closed', 'custom')),
  constraint branch_special_hours_audit_log_next_mode_check check (next_mode in ('closed', 'custom')),
  constraint branch_special_hours_audit_log_version_advance_check check (next_version = previous_version + 1),
  constraint branch_special_hours_audit_log_version_non_negative_check check (previous_version >= 0)
);
create index branch_special_hours_audit_log_branch_idx
  on restaurant_internal.branch_special_hours_audit_log (branch_id, local_date, created_at desc);

create table restaurant_internal.branch_special_hours_audit_intervals (
  id uuid not null default pg_catalog.gen_random_uuid(),
  audit_log_id uuid not null references restaurant_internal.branch_special_hours_audit_log(id) on delete cascade,
  side text not null,
  start_local_time time without time zone not null,
  end_local_time time without time zone not null,
  end_day_offset smallint not null,
  constraint branch_special_hours_audit_intervals_pkey primary key (id),
  constraint branch_special_hours_audit_intervals_side_check check (side in ('previous', 'next')),
  constraint branch_special_hours_audit_intervals_offset_check check (end_day_offset in (0, 1))
);
create index branch_special_hours_audit_intervals_log_idx
  on restaurant_internal.branch_special_hours_audit_intervals (audit_log_id, side);

create table restaurant_internal.branch_operational_closure_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  closure_id uuid not null,
  operation text not null,
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  previous_cancelled_at timestamptz,
  next_starts_at timestamptz,
  next_ends_at timestamptz,
  next_cancelled_at timestamptz,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_operational_closure_audit_log_pkey primary key (id),
  constraint branch_operational_closure_audit_log_operation_check check (operation in (
    'CLOSE_NOW_INDEFINITE', 'CLOSE_NOW_UNTIL', 'SCHEDULE_CLOSURE', 'REOPEN_NOW', 'CANCEL_FUTURE_CLOSURE'
  )),
  constraint branch_operational_closure_audit_log_version_advance_check check (next_version = previous_version + 1),
  constraint branch_operational_closure_audit_log_version_non_negative_check check (previous_version >= 0)
);
create index branch_operational_closure_audit_log_branch_idx
  on restaurant_internal.branch_operational_closure_audit_log (branch_id, created_at desc);

alter table restaurant_internal.branch_weekly_hours_audit_log enable row level security;
alter table restaurant_internal.branch_weekly_hours_audit_log force row level security;
alter table restaurant_internal.branch_weekly_hours_audit_intervals enable row level security;
alter table restaurant_internal.branch_weekly_hours_audit_intervals force row level security;
alter table restaurant_internal.branch_special_hours_audit_log enable row level security;
alter table restaurant_internal.branch_special_hours_audit_log force row level security;
alter table restaurant_internal.branch_special_hours_audit_intervals enable row level security;
alter table restaurant_internal.branch_special_hours_audit_intervals force row level security;
alter table restaurant_internal.branch_operational_closure_audit_log enable row level security;
alter table restaurant_internal.branch_operational_closure_audit_log force row level security;

-- =================================================================================================
-- 7. The permission vocabulary: three new Owner-only, restaurant-scoped keys.
-- =================================================================================================
alter table public.role_permissions drop constraint role_permissions_permission_key_check;

alter table public.role_permissions
  add constraint role_permissions_permission_key_check
  check (permission_key in (
    'access_context.read',
    'restaurant.read',
    'branch.read',
    'menu.read',
    'nutrition.read',
    'branch_menu_item.sold_out.write',
    'branch_menu_item.availability.write',
    'branch_menu_item.price.write',
    'branch_menu_item.visibility.write',
    'branch.profile.display_name.write',
    'branch_menu_item.display_name.write',
    'branch.hours.weekly.write',
    'branch.hours.special.write',
    'branch.operational_closure.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, permission_key, 'restaurant'
from public.restaurant_roles as role
cross join (values
  ('branch.hours.weekly.write'),
  ('branch.hours.special.write'),
  ('branch.operational_closure.write')
) as new_permission(permission_key)
where role.role_key = 'owner';

do $$
declare
  v_total integer;
  v_predecessors integer;
begin
  select pg_catalog.count(*) into v_total
  from public.role_permissions as permission
  where permission.permission_key in
    ('branch.hours.weekly.write', 'branch.hours.special.write', 'branch.operational_closure.write');
  if v_total <> 3 then
    raise exception 'RA-2H-P1: expected exactly 3 temporal permission rows, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_predecessors
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key in
      ('branch_menu_item.sold_out.write', 'branch_menu_item.availability.write',
       'branch_menu_item.price.write', 'branch_menu_item.visibility.write',
       'branch.profile.display_name.write', 'branch_menu_item.display_name.write')
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_predecessors <> 6 then
    raise exception 'RA-2H-P1: a frozen predecessor permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- =================================================================================================
-- 8. Four sealed roles: three narrow writers plus one DML-free reader/evaluator.
-- =================================================================================================
create role restaurant_owner_branch_weekly_hours_write_authority nologin noinherit nobypassrls;
create role restaurant_owner_branch_special_hours_write_authority nologin noinherit nobypassrls;
create role restaurant_owner_branch_operational_closure_write_authority nologin noinherit nobypassrls;
create role restaurant_branch_temporal_context_reader nologin noinherit nobypassrls;

comment on role restaurant_owner_branch_weekly_hours_write_authority is
  'RA-2H-P1. Owns weekly-hours preview-independent mutation. UPDATE(weekly_hours_configured, weekly_hours_version) on temporal_state; full DML on weekly_hour_intervals; insert-only on weekly audit. Cannot touch special/closure tables, restaurant_branches, or any RA-2A-F/RA-1C column.';
comment on role restaurant_owner_branch_special_hours_write_authority is
  'RA-2H-P1. Owns special-date mutation. UPDATE(special_hours_version) on temporal_state; full DML on special override/interval tables; insert-only on special audit. Cannot touch weekly/closure tables.';
comment on role restaurant_owner_branch_operational_closure_write_authority is
  'RA-2H-P1. Owns operational-closure mutation. UPDATE(operational_closure_version) on temporal_state; full DML on operational_closures; insert-only on closure audit; read-only on restaurant_branches.status/restaurants.status for the lifecycle gate. Cannot write status/status_version and cannot touch weekly/special tables.';
comment on role restaurant_branch_temporal_context_reader is
  'RA-2H-P1. Read-only across all temporal relations plus restaurant_branches.timezone_name/status and restaurants.status. Owns preview and the canonical evaluator. Zero DML privilege anywhere.';

grant restaurant_owner_branch_weekly_hours_write_authority to postgres with admin false, inherit false, set true;
grant restaurant_owner_branch_special_hours_write_authority to postgres with admin false, inherit false, set true;
grant restaurant_owner_branch_operational_closure_write_authority to postgres with admin false, inherit false, set true;
grant restaurant_branch_temporal_context_reader to postgres with admin false, inherit false, set true;

grant usage on schema restaurant_internal to restaurant_owner_branch_weekly_hours_write_authority;
grant usage on schema restaurant_internal to restaurant_owner_branch_special_hours_write_authority;
grant usage on schema restaurant_internal to restaurant_owner_branch_operational_closure_write_authority;
grant usage on schema restaurant_internal to restaurant_branch_temporal_context_reader;

create policy branch_weekly_hours_audit_log_writer_select
  on restaurant_internal.branch_weekly_hours_audit_log
  for select to restaurant_owner_branch_weekly_hours_write_authority using (true);
create policy branch_weekly_hours_audit_log_writer_insert
  on restaurant_internal.branch_weekly_hours_audit_log
  for insert to restaurant_owner_branch_weekly_hours_write_authority with check (true);
create policy branch_weekly_hours_audit_intervals_writer_select
  on restaurant_internal.branch_weekly_hours_audit_intervals
  for select to restaurant_owner_branch_weekly_hours_write_authority using (true);
create policy branch_weekly_hours_audit_intervals_writer_insert
  on restaurant_internal.branch_weekly_hours_audit_intervals
  for insert to restaurant_owner_branch_weekly_hours_write_authority with check (true);

create policy branch_special_hours_audit_log_writer_select
  on restaurant_internal.branch_special_hours_audit_log
  for select to restaurant_owner_branch_special_hours_write_authority using (true);
create policy branch_special_hours_audit_log_writer_insert
  on restaurant_internal.branch_special_hours_audit_log
  for insert to restaurant_owner_branch_special_hours_write_authority with check (true);
create policy branch_special_hours_audit_intervals_writer_select
  on restaurant_internal.branch_special_hours_audit_intervals
  for select to restaurant_owner_branch_special_hours_write_authority using (true);
create policy branch_special_hours_audit_intervals_writer_insert
  on restaurant_internal.branch_special_hours_audit_intervals
  for insert to restaurant_owner_branch_special_hours_write_authority with check (true);

create policy branch_operational_closure_audit_log_writer_select
  on restaurant_internal.branch_operational_closure_audit_log
  for select to restaurant_owner_branch_operational_closure_write_authority using (true);
create policy branch_operational_closure_audit_log_writer_insert
  on restaurant_internal.branch_operational_closure_audit_log
  for insert to restaurant_owner_branch_operational_closure_write_authority with check (true);

-- =================================================================================================
-- 9. Least-privilege grants. Every role receives only the tenant-chain columns, temporal columns,
--    and audit insert path its own operation needs.
-- =================================================================================================
grant select (id, auth_user_id, login_status) on table public.restaurant_users
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_owner_branch_special_hours_write_authority,
     restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader;
grant select (id, restaurant_user_id, restaurant_id, role_id, status) on table public.restaurant_memberships
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_owner_branch_special_hours_write_authority,
     restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader;
grant select (id, role_key, status) on table public.restaurant_roles
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_owner_branch_special_hours_write_authority,
     restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader;
grant select (role_id, permission_key, permission_scope) on table public.role_permissions
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_owner_branch_special_hours_write_authority,
     restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader;

-- weekly writer
grant select (branch_id, restaurant_id, weekly_hours_configured, weekly_hours_version),
      update (weekly_hours_configured, weekly_hours_version)
  on table public.restaurant_branch_temporal_state to restaurant_owner_branch_weekly_hours_write_authority;
grant select, insert, delete on table public.restaurant_branch_weekly_hour_intervals
  to restaurant_owner_branch_weekly_hours_write_authority;
grant select, insert on table restaurant_internal.branch_weekly_hours_audit_log
  to restaurant_owner_branch_weekly_hours_write_authority;
grant select, insert on table restaurant_internal.branch_weekly_hours_audit_intervals
  to restaurant_owner_branch_weekly_hours_write_authority;

-- special writer
grant select (branch_id, restaurant_id, special_hours_version),
      update (special_hours_version)
  on table public.restaurant_branch_temporal_state to restaurant_owner_branch_special_hours_write_authority;
grant select, insert, delete on table public.restaurant_branch_special_hour_overrides
  to restaurant_owner_branch_special_hours_write_authority;
grant select, insert, delete on table public.restaurant_branch_special_hour_intervals
  to restaurant_owner_branch_special_hours_write_authority;
grant select, insert on table restaurant_internal.branch_special_hours_audit_log
  to restaurant_owner_branch_special_hours_write_authority;
grant select, insert on table restaurant_internal.branch_special_hours_audit_intervals
  to restaurant_owner_branch_special_hours_write_authority;

-- operational closure writer
grant select (branch_id, restaurant_id, operational_closure_version),
      update (operational_closure_version)
  on table public.restaurant_branch_temporal_state to restaurant_owner_branch_operational_closure_write_authority;
grant select, insert, update on table public.restaurant_branch_operational_closures
  to restaurant_owner_branch_operational_closure_write_authority;
grant select, insert on table restaurant_internal.branch_operational_closure_audit_log
  to restaurant_owner_branch_operational_closure_write_authority;
grant select (id, restaurant_id, status, timezone_name) on table public.restaurant_branches
  to restaurant_owner_branch_operational_closure_write_authority;
grant select (id, status) on table public.restaurants
  to restaurant_owner_branch_operational_closure_write_authority;

-- reader / evaluator (zero DML anywhere)
grant select on table public.restaurant_branch_temporal_state to restaurant_branch_temporal_context_reader;
grant select on table public.restaurant_branch_weekly_hour_intervals to restaurant_branch_temporal_context_reader;
grant select on table public.restaurant_branch_special_hour_overrides to restaurant_branch_temporal_context_reader;
grant select on table public.restaurant_branch_special_hour_intervals to restaurant_branch_temporal_context_reader;
grant select on table public.restaurant_branch_operational_closures to restaurant_branch_temporal_context_reader;
grant select (id, restaurant_id, timezone_name, status) on table public.restaurant_branches
  to restaurant_branch_temporal_context_reader;
grant select (id, status) on table public.restaurants to restaurant_branch_temporal_context_reader;

-- =================================================================================================
-- 10. Row level security. Permissive pair grants; RESTRICTIVE pair narrows via the tenant chain.
--     Permissive policies OR; restrictive-alone grants nothing; the RPC additionally re-proves the
--     chain and holds the temporal_state row FOR UPDATE before any write.
-- =================================================================================================

-- RLS is not active on ANY table until explicitly enabled (and not immune for the owning role
-- until explicitly forced); every business relation below gets both before its first policy.
alter table public.restaurant_branch_temporal_state enable row level security;
alter table public.restaurant_branch_temporal_state force row level security;
alter table public.restaurant_branch_weekly_hour_intervals enable row level security;
alter table public.restaurant_branch_weekly_hour_intervals force row level security;
alter table public.restaurant_branch_special_hour_overrides enable row level security;
alter table public.restaurant_branch_special_hour_overrides force row level security;
alter table public.restaurant_branch_special_hour_intervals enable row level security;
alter table public.restaurant_branch_special_hour_intervals force row level security;
alter table public.restaurant_branch_operational_closures enable row level security;
alter table public.restaurant_branch_operational_closures force row level security;

-- --- restaurant_branch_temporal_state --------------------------------------------------------------
create policy restaurant_branch_temporal_state_weekly_select
  on public.restaurant_branch_temporal_state for select
  to restaurant_owner_branch_weekly_hours_write_authority using (true);
create policy restaurant_branch_temporal_state_weekly_update
  on public.restaurant_branch_temporal_state for update
  to restaurant_owner_branch_weekly_hours_write_authority using (true) with check (true);
create policy restaurant_branch_temporal_state_special_select
  on public.restaurant_branch_temporal_state for select
  to restaurant_owner_branch_special_hours_write_authority using (true);
create policy restaurant_branch_temporal_state_special_update
  on public.restaurant_branch_temporal_state for update
  to restaurant_owner_branch_special_hours_write_authority using (true) with check (true);
create policy restaurant_branch_temporal_state_closure_select
  on public.restaurant_branch_temporal_state for select
  to restaurant_owner_branch_operational_closure_write_authority using (true);
create policy restaurant_branch_temporal_state_closure_update
  on public.restaurant_branch_temporal_state for update
  to restaurant_owner_branch_operational_closure_write_authority using (true) with check (true);
create policy restaurant_branch_temporal_state_reader_select
  on public.restaurant_branch_temporal_state for select
  to restaurant_branch_temporal_context_reader using (true);

create policy restaurant_branch_temporal_state_tenant_select
  on public.restaurant_branch_temporal_state as restrictive for select
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_owner_branch_special_hours_write_authority,
     restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branch_temporal_state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );
create policy restaurant_branch_temporal_state_tenant_update
  on public.restaurant_branch_temporal_state as restrictive for update
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_owner_branch_special_hours_write_authority,
     restaurant_owner_branch_operational_closure_write_authority
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branch_temporal_state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branch_temporal_state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

-- --- restaurant_branch_weekly_hour_intervals -------------------------------------------------------
create policy restaurant_branch_weekly_hour_intervals_writer_all
  on public.restaurant_branch_weekly_hour_intervals for all
  to restaurant_owner_branch_weekly_hours_write_authority using (true) with check (true);
create policy restaurant_branch_weekly_hour_intervals_reader_select
  on public.restaurant_branch_weekly_hour_intervals for select
  to restaurant_branch_temporal_context_reader using (true);

create policy restaurant_branch_weekly_hour_intervals_tenant_all
  on public.restaurant_branch_weekly_hour_intervals as restrictive for all
  to restaurant_owner_branch_weekly_hours_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_branch_temporal_state as state
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where state.branch_id = restaurant_branch_weekly_hour_intervals.branch_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_branch_temporal_state as state
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where state.branch_id = restaurant_branch_weekly_hour_intervals.branch_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

-- --- restaurant_branch_special_hour_overrides / _intervals ------------------------------------------
create policy restaurant_branch_special_hour_overrides_writer_all
  on public.restaurant_branch_special_hour_overrides for all
  to restaurant_owner_branch_special_hours_write_authority using (true) with check (true);
create policy restaurant_branch_special_hour_overrides_reader_select
  on public.restaurant_branch_special_hour_overrides for select
  to restaurant_branch_temporal_context_reader using (true);

create policy restaurant_branch_special_hour_overrides_tenant_all
  on public.restaurant_branch_special_hour_overrides as restrictive for all
  to restaurant_owner_branch_special_hours_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_branch_temporal_state as state
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where state.branch_id = restaurant_branch_special_hour_overrides.branch_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_branch_temporal_state as state
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where state.branch_id = restaurant_branch_special_hour_overrides.branch_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

create policy restaurant_branch_special_hour_intervals_writer_all
  on public.restaurant_branch_special_hour_intervals for all
  to restaurant_owner_branch_special_hours_write_authority using (true) with check (true);
create policy restaurant_branch_special_hour_intervals_reader_select
  on public.restaurant_branch_special_hour_intervals for select
  to restaurant_branch_temporal_context_reader using (true);

create policy restaurant_branch_special_hour_intervals_tenant_all
  on public.restaurant_branch_special_hour_intervals as restrictive for all
  to restaurant_owner_branch_special_hours_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_branch_special_hour_overrides as parent
      join public.restaurant_branch_temporal_state as state on state.branch_id = parent.branch_id
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where parent.id = restaurant_branch_special_hour_intervals.override_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_branch_special_hour_overrides as parent
      join public.restaurant_branch_temporal_state as state on state.branch_id = parent.branch_id
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where parent.id = restaurant_branch_special_hour_intervals.override_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

-- --- restaurant_branch_operational_closures ---------------------------------------------------------
create policy restaurant_branch_operational_closures_writer_all
  on public.restaurant_branch_operational_closures for all
  to restaurant_owner_branch_operational_closure_write_authority using (true) with check (true);
create policy restaurant_branch_operational_closures_reader_select
  on public.restaurant_branch_operational_closures for select
  to restaurant_branch_temporal_context_reader using (true);

create policy restaurant_branch_operational_closures_tenant_all
  on public.restaurant_branch_operational_closures as restrictive for all
  to restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_branch_temporal_state as state
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where state.branch_id = restaurant_branch_operational_closures.branch_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_branch_temporal_state as state
      join public.restaurant_users as caller on true
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where state.branch_id = restaurant_branch_operational_closures.branch_id
        and caller.auth_user_id = (
            coalesce(
              nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
              (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
            )
          )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = state.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

-- restaurant_branches / restaurants: every existing permissive policy on these tables is scoped to
-- an earlier round's own role only (RLS policies do not apply across roles they do not name), so
-- the closure writer and reader each need their own narrow permissive + restrictive pair here too.
create policy restaurant_branches_temporal_select
  on public.restaurant_branches for select
  to restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader
  using (true);
create policy restaurant_branches_temporal_tenant_select
  on public.restaurant_branches as restrictive for select
  to restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

create policy restaurants_temporal_select
  on public.restaurants for select
  to restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader
  using (true);
create policy restaurants_temporal_tenant_select
  on public.restaurants as restrictive for select
  to restaurant_owner_branch_operational_closure_write_authority, restaurant_branch_temporal_context_reader
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurants.id
        and role.status = 'active'
        and role.role_key = 'owner'
    )
  );

grant create on schema public to restaurant_owner_branch_weekly_hours_write_authority;
grant create on schema public to restaurant_owner_branch_special_hours_write_authority;
grant create on schema public to restaurant_owner_branch_operational_closure_write_authority;
grant create on schema public to restaurant_branch_temporal_context_reader;

-- =================================================================================================
-- 11. Reusable civil-datetime -> instant resolution primitive. Enumerates every candidate instant
--     whose round-trip through the branch zone equals the submitted local datetime, rather than
--     trusting PostgreSQL's own silent gap/fold resolution. Returns a status, never raises, so every
--     caller maps the outcome to a bounded business error.
-- =================================================================================================
create function restaurant_internal.resolve_branch_local_datetime_v1(
  p_timezone text,
  p_local_datetime timestamp without time zone,
  p_fold text
)
returns table (status text, instant timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base timestamptz;
  v_step interval;
  v_probe timestamptz;
  v_distinct timestamptz[] := '{}';
begin
  if p_fold is not null and p_fold not in ('earlier', 'later') then
    return query select 'invalid_fold', null::timestamptz;
    return;
  end if;

  v_base := p_local_datetime at time zone p_timezone;

  for v_step in
    select unnest(array[
      interval '-3 hours', interval '-2 hours', interval '-1 hour', interval '-45 minutes',
      interval '-30 minutes', interval '-15 minutes', interval '0',
      interval '15 minutes', interval '30 minutes', interval '45 minutes',
      interval '1 hour', interval '2 hours', interval '3 hours'
    ])
  loop
    v_probe := v_base + v_step;
    if (v_probe at time zone p_timezone) = p_local_datetime and not (v_probe = any (v_distinct)) then
      v_distinct := array_append(v_distinct, v_probe);
    end if;
  end loop;

  v_distinct := array(select unnest(v_distinct) order by 1);

  if array_length(v_distinct, 1) is null then
    return query select 'nonexistent', null::timestamptz;
  elsif array_length(v_distinct, 1) = 1 then
    if p_fold is not null then
      return query select 'unambiguous_fold_not_allowed', null::timestamptz;
    else
      return query select 'resolved', v_distinct[1];
    end if;
  else
    if p_fold is null then
      return query select 'ambiguous_fold_required', null::timestamptz;
    elsif p_fold = 'earlier' then
      return query select 'resolved', v_distinct[1];
    else
      return query select 'resolved', v_distinct[array_length(v_distinct, 1)];
    end if;
  end if;
end;
$$;

comment on function restaurant_internal.resolve_branch_local_datetime_v1(text, timestamp, text) is
  'RA-2H-P1. Round-trip enumeration, not PostgreSQL''s implicit resolution. status in (resolved, nonexistent, ambiguous_fold_required, unambiguous_fold_not_allowed, invalid_fold).';

grant execute on function restaurant_internal.resolve_branch_local_datetime_v1(text, timestamp, text)
  to restaurant_owner_branch_operational_closure_write_authority;

-- =================================================================================================
-- 12. The canonical OPEN/CLOSED/UNKNOWN evaluator. One statement-stable p_at input. Precedence:
--     Restaurant publication -> Admin lifecycle -> active operational closure -> previous-date
--     spillover -> current-date special override -> current-date weekly schedule -> UNKNOWN.
-- =================================================================================================
create function restaurant_internal.evaluate_branch_temporal_state_v1(
  p_branch_id text,
  p_at timestamptz
)
returns table (state text, reason text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_restaurant_id text;
  v_branch_status text;
  v_restaurant_status text;
  v_timezone text;
  v_closure_active boolean;
  v_local_date date;
  v_local_time time without time zone;
  v_weekday smallint;
  v_prev_date date;
  v_prev_weekday smallint;
  v_prev_mode text;
  v_prev_has_source boolean;
  v_spillover boolean;
  v_configured boolean;
  v_today_mode text;
  v_today_has_override boolean;
  v_today_open boolean;
begin
  select b.restaurant_id, b.status, b.timezone_name
    into v_restaurant_id, v_branch_status, v_timezone
  from public.restaurant_branches b where b.id = p_branch_id;

  if v_restaurant_id is null then
    return query select 'UNKNOWN'::text, 'HOURS_UNKNOWN'::text;
    return;
  end if;

  select r.status into v_restaurant_status from public.restaurants r where r.id = v_restaurant_id;

  if v_restaurant_status is distinct from 'active' or v_branch_status is distinct from 'active' then
    return query select 'CLOSED'::text, 'ADMIN_LIFECYCLE_BLOCKED'::text;
    return;
  end if;

  select exists (
    select 1 from public.restaurant_branch_operational_closures c
    where c.branch_id = p_branch_id and c.cancelled_at is null
      and c.starts_at <= p_at and (c.ends_at is null or c.ends_at > p_at)
  ) into v_closure_active;

  if v_closure_active then
    return query select 'CLOSED'::text, 'OPERATIONALLY_CLOSED'::text;
    return;
  end if;

  v_local_date := (p_at at time zone v_timezone)::date;
  v_local_time := (p_at at time zone v_timezone)::time;
  v_weekday := pg_catalog.date_part('isodow', v_local_date)::smallint;
  v_prev_date := v_local_date - 1;
  v_prev_weekday := pg_catalog.date_part('isodow', v_prev_date)::smallint;

  -- previous-date source: special override for prev_date wins over weekly for prev_weekday.
  select o.mode into v_prev_mode
    from public.restaurant_branch_special_hour_overrides o
    where o.branch_id = p_branch_id and o.local_date = v_prev_date;
  v_prev_has_source := v_prev_mode is not null;

  if v_prev_has_source then
    select exists (
      select 1 from public.restaurant_branch_special_hour_intervals i
      join public.restaurant_branch_special_hour_overrides o on o.id = i.override_id
      where o.branch_id = p_branch_id and o.local_date = v_prev_date
        and i.end_day_offset = 1
        and v_local_time < i.end_local_time
    ) into v_spillover;
  else
    select t.weekly_hours_configured into v_configured
      from public.restaurant_branch_temporal_state t where t.branch_id = p_branch_id;
    if coalesce(v_configured, false) then
      select exists (
        select 1 from public.restaurant_branch_weekly_hour_intervals w
        where w.branch_id = p_branch_id and w.weekday = v_prev_weekday
          and w.end_day_offset = 1
          and v_local_time < w.end_local_time
      ) into v_spillover;
    else
      v_spillover := false;
    end if;
  end if;

  if v_spillover then
    return query select 'OPEN'::text,
      case when v_prev_has_source then 'OPEN_SPECIAL_HOURS' else 'OPEN_WEEKLY_HOURS' end;
    return;
  end if;

  -- current-date: special override replaces weekly entirely when present.
  select o.mode into v_today_mode
    from public.restaurant_branch_special_hour_overrides o
    where o.branch_id = p_branch_id and o.local_date = v_local_date;
  v_today_has_override := v_today_mode is not null;

  if v_today_has_override then
    if v_today_mode = 'closed' then
      return query select 'CLOSED'::text, 'SPECIAL_DATE_CLOSED'::text;
      return;
    end if;
    select exists (
      select 1 from public.restaurant_branch_special_hour_intervals i
      join public.restaurant_branch_special_hour_overrides o on o.id = i.override_id
      where o.branch_id = p_branch_id and o.local_date = v_local_date
        and (
          (i.end_day_offset = 0 and v_local_time >= i.start_local_time and v_local_time < i.end_local_time)
          or (i.end_day_offset = 1 and v_local_time >= i.start_local_time)
        )
    ) into v_today_open;
    if v_today_open then
      return query select 'OPEN'::text, 'OPEN_SPECIAL_HOURS'::text;
    else
      return query select 'CLOSED'::text, 'OUTSIDE_SPECIAL_HOURS'::text;
    end if;
    return;
  end if;

  select t.weekly_hours_configured into v_configured
    from public.restaurant_branch_temporal_state t where t.branch_id = p_branch_id;

  if not coalesce(v_configured, false) then
    return query select 'UNKNOWN'::text, 'HOURS_UNKNOWN'::text;
    return;
  end if;

  select exists (
    select 1 from public.restaurant_branch_weekly_hour_intervals w
    where w.branch_id = p_branch_id and w.weekday = v_weekday
      and (
        (w.end_day_offset = 0 and v_local_time >= w.start_local_time and v_local_time < w.end_local_time)
        or (w.end_day_offset = 1 and v_local_time >= w.start_local_time)
      )
  ) into v_today_open;

  if v_today_open then
    return query select 'OPEN'::text, 'OPEN_WEEKLY_HOURS'::text;
  else
    return query select 'CLOSED'::text, 'OUTSIDE_WEEKLY_HOURS'::text;
  end if;
end;
$$;

comment on function restaurant_internal.evaluate_branch_temporal_state_v1(text, timestamptz) is
  'RA-2H-P1. Canonical read-only evaluator. Deterministic p_at for composition/tests; production callers pass the DB authoritative instant. Never mutates state.';

grant execute on function restaurant_internal.evaluate_branch_temporal_state_v1(text, timestamptz)
  to restaurant_branch_temporal_context_reader;

-- =================================================================================================
-- 13. Bounded Owner preview. Read-only, owned by the reader role. Special-date window defaults to
--     the next 90 branch-local dates and is capped at 366; closures are bounded to non-cancelled
--     current/future rows.
-- =================================================================================================
create function public.restaurant_owner_preview_branch_temporal_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
  v_from date;
  v_to date;
  v_weekly jsonb;
  v_special jsonb;
  v_closures jsonb;
  v_evaluation record;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_restaurant_id is null or p_branch_id is null or pg_catalog.length(p_branch_id) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  v_from := coalesce(p_from_date, current_date);
  v_to := coalesce(p_to_date, v_from + 90);
  if v_to < v_from or (v_to - v_from) > 366 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.weekly_hours_configured, t.weekly_hours_version,
      t.special_hours_version, t.operational_closure_version, b.timezone_name
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_branches b on b.id = t.branch_id
  where t.branch_id = p_branch_id
    and exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      join public.role_permissions as permission on permission.role_id = role.id
      where caller.auth_user_id = v_actor
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = t.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key in
          ('branch.hours.weekly.write', 'branch.hours.special.write', 'branch.operational_closure.write')
    );

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'weekday', w.weekday, 'startLocalTime', w.start_local_time::text,
      'endLocalTime', w.end_local_time::text, 'endDayOffset', w.end_day_offset
    ) order by w.weekday, w.start_local_time, w.end_day_offset, w.end_local_time), '[]'::jsonb)
    into v_weekly
  from public.restaurant_branch_weekly_hour_intervals w where w.branch_id = p_branch_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'localDate', o.local_date::text, 'mode', o.mode,
      'intervals', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'startLocalTime', i.start_local_time::text, 'endLocalTime', i.end_local_time::text,
            'endDayOffset', i.end_day_offset
          ) order by i.start_local_time, i.end_day_offset, i.end_local_time), '[]'::jsonb)
        from public.restaurant_branch_special_hour_intervals i where i.override_id = o.id
      )
    ) order by o.local_date), '[]'::jsonb)
    into v_special
  from public.restaurant_branch_special_hour_overrides o
  where o.branch_id = p_branch_id and o.local_date between v_from and v_to;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'closureId', c.id::text, 'startsAt', c.starts_at, 'endsAt', c.ends_at
    ) order by c.starts_at), '[]'::jsonb)
    into v_closures
  from public.restaurant_branch_operational_closures c
  where c.branch_id = p_branch_id and c.cancelled_at is null
    and (c.ends_at is null or c.ends_at > pg_catalog.now());

  select e.state, e.reason into v_evaluation
  from restaurant_internal.evaluate_branch_temporal_state_v1(p_branch_id, pg_catalog.now()) e;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'ready',
    'branchId', v_target.branch_id,
    'timezone', v_target.timezone_name,
    'weeklyHoursConfigured', v_target.weekly_hours_configured,
    'weeklyHours', v_weekly,
    'weeklyHoursVersion', v_target.weekly_hours_version::text,
    'specialOverrides', v_special,
    'specialHoursVersion', v_target.special_hours_version::text,
    'operationalClosures', v_closures,
    'operationalClosureVersion', v_target.operational_closure_version::text,
    'currentState', v_evaluation.state,
    'currentReason', v_evaluation.reason
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_temporal_v1(text, text, date, date) is
  'RA-2H-P1. Bounded Owner temporal preview. No sealed role, raw audit, membership internal, or unbounded history exposed.';

revoke all on function public.restaurant_owner_preview_branch_temporal_v1(text, text, date, date)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_preview_branch_temporal_v1(text, text, date, date)
  to authenticated;
alter function public.restaurant_owner_preview_branch_temporal_v1(text, text, date, date)
  owner to restaurant_branch_temporal_context_reader;

-- =================================================================================================
-- 14. Weekly whole-week replace/clear. Atomic: the whole candidate set is validated and written in
--     one transaction while the temporal_state row is held FOR UPDATE. Canonical order is weekday,
--     start time, end-day offset, end time, ascending; comparison is semantic, not array-order.
-- =================================================================================================
create function public.restaurant_owner_replace_branch_weekly_hours_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_operation text,
  p_intervals jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_target record;
  v_elem jsonb;
  v_key text;
  v_next_configured boolean;
  v_candidate_count integer;
  v_weekday_counts integer[];
  v_weekday smallint;
  v_start time;
  v_end time;
  v_offset smallint;
  v_current_canonical jsonb;
  v_next_canonical jsonb;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_operation is null or p_operation not in ('REPLACE_WEEKLY_SCHEDULE', 'CLEAR_WEEKLY_SCHEDULE')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'CLEAR_WEEKLY_SCHEDULE' and p_intervals is not null)
    or (p_operation = 'REPLACE_WEEKLY_SCHEDULE' and p_intervals is null)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.weekly_hours_configured, t.weekly_hours_version, m.id as membership_id
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_users as caller on true
  join public.restaurant_memberships as m on m.restaurant_user_id = caller.id
  join public.restaurant_roles as role on role.id = m.role_id
  join public.role_permissions as permission on permission.role_id = role.id
  where t.branch_id = p_branch_id
    and caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and m.status = 'active'
    and m.restaurant_id = t.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner'
    and permission.permission_key = 'branch.hours.weekly.write'
    and permission.permission_scope = 'restaurant'
  for update of t;

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  v_membership_id := v_target.membership_id;

  if v_target.weekly_hours_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  -- ---- parse & validate the candidate set (REPLACE only; CLEAR is definitionally empty) ----------
  if p_operation = 'REPLACE_WEEKLY_SCHEDULE' then
    if pg_catalog.jsonb_typeof(p_intervals) <> 'array' then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
    v_candidate_count := pg_catalog.jsonb_array_length(p_intervals);
    if v_candidate_count > 56 then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
    v_weekday_counts := array_fill(0, array[7]);
    for v_elem in select value from pg_catalog.jsonb_array_elements(p_intervals) loop
      if pg_catalog.jsonb_typeof(v_elem) <> 'object' then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      for v_key in select k from pg_catalog.jsonb_object_keys(v_elem) as k loop
        if v_key not in ('weekday', 'startLocalTime', 'endLocalTime', 'endDayOffset') then
          return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
        end if;
      end loop;
      if pg_catalog.jsonb_typeof(v_elem -> 'weekday') <> 'number'
        or pg_catalog.jsonb_typeof(v_elem -> 'endDayOffset') <> 'number'
        or pg_catalog.jsonb_typeof(v_elem -> 'startLocalTime') <> 'string'
        or pg_catalog.jsonb_typeof(v_elem -> 'endLocalTime') <> 'string'
      then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      begin
        v_weekday := (v_elem ->> 'weekday')::smallint;
        v_offset := (v_elem ->> 'endDayOffset')::smallint;
        v_start := (v_elem ->> 'startLocalTime')::time;
        v_end := (v_elem ->> 'endLocalTime')::time;
      exception when others then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end;
      if v_weekday not between 1 and 7 or v_offset not in (0, 1) then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      if not (
        (v_offset = 0 and v_start < v_end)
        or (v_offset = 1 and v_start > v_end)
        or (v_offset = 1 and v_start = '00:00:00' and v_end = '00:00:00')
      ) then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      v_weekday_counts[v_weekday] := v_weekday_counts[v_weekday] + 1;
      if v_weekday_counts[v_weekday] > 8 then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
    end loop;

    -- duplicate/overlap pre-check in SQL (defense-in-depth trigger re-validates after write)
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_intervals)
        as a(weekday smallint, "startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint)
      join pg_catalog.jsonb_to_recordset(p_intervals)
        as b(weekday smallint, "startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint)
        on true
      cross join (values (-10080), (0), (10080)) as shift(s)
      where (a.weekday, a."startLocalTime", a."endDayOffset", a."endLocalTime")
          < (b.weekday, b."startLocalTime", b."endDayOffset", b."endLocalTime")
        and (a.weekday - 1) * 1440 + pg_catalog.date_part('epoch', a."startLocalTime")::integer / 60
          < (b.weekday - 1) * 1440 + pg_catalog.date_part('epoch', b."endLocalTime")::integer / 60
            + b."endDayOffset" * 1440 + shift.s
        and (b.weekday - 1) * 1440 + pg_catalog.date_part('epoch', b."startLocalTime")::integer / 60 + shift.s
          < (a.weekday - 1) * 1440 + pg_catalog.date_part('epoch', a."endLocalTime")::integer / 60
            + a."endDayOffset" * 1440
    ) then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;

    if (select pg_catalog.count(*) from pg_catalog.jsonb_to_recordset(p_intervals)
          as x(weekday smallint, "startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint))
       <> (select pg_catalog.count(distinct (x.weekday, x."startLocalTime", x."endDayOffset", x."endLocalTime"))
          from pg_catalog.jsonb_to_recordset(p_intervals)
            as x(weekday smallint, "startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint))
    then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;

    v_next_configured := true;
  else
    v_next_configured := false;
  end if;

  -- ---- canonicalize both sides and compare for no_change ------------------------------------------
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'weekday', w.weekday, 'startLocalTime', w.start_local_time::text,
      'endLocalTime', w.end_local_time::text, 'endDayOffset', w.end_day_offset
    ) order by w.weekday, w.start_local_time, w.end_day_offset, w.end_local_time), '[]'::jsonb)
    into v_current_canonical
  from public.restaurant_branch_weekly_hour_intervals w where w.branch_id = p_branch_id;

  if p_operation = 'REPLACE_WEEKLY_SCHEDULE' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'weekday', x.weekday, 'startLocalTime', x."startLocalTime"::text,
        'endLocalTime', x."endLocalTime"::text, 'endDayOffset', x."endDayOffset"
      ) order by x.weekday, x."startLocalTime", x."endDayOffset", x."endLocalTime"), '[]'::jsonb)
      into v_next_canonical
    from pg_catalog.jsonb_to_recordset(p_intervals)
      as x(weekday smallint, "startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint);
  else
    v_next_canonical := '[]'::jsonb;
  end if;

  if v_next_configured = v_target.weekly_hours_configured and v_next_canonical = v_current_canonical then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  delete from public.restaurant_branch_weekly_hour_intervals where branch_id = p_branch_id;
  if p_operation = 'REPLACE_WEEKLY_SCHEDULE' and v_candidate_count > 0 then
    insert into public.restaurant_branch_weekly_hour_intervals
      (branch_id, weekday, start_local_time, end_local_time, end_day_offset)
    select p_branch_id, x.weekday, x."startLocalTime", x."endLocalTime", x."endDayOffset"
    from pg_catalog.jsonb_to_recordset(p_intervals)
      as x(weekday smallint, "startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint);
  end if;

  update public.restaurant_branch_temporal_state
    set weekly_hours_configured = v_next_configured, weekly_hours_version = weekly_hours_version + 1
    where branch_id = p_branch_id;

  insert into restaurant_internal.branch_weekly_hours_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, operation,
     previous_configured, next_configured, previous_version, next_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, p_operation,
     v_target.weekly_hours_configured, v_next_configured, v_target.weekly_hours_version,
     v_target.weekly_hours_version + 1)
  returning id into v_audit_id;

  insert into restaurant_internal.branch_weekly_hours_audit_intervals
    (audit_log_id, side, weekday, start_local_time, end_local_time, end_day_offset)
  select v_audit_id, 'previous', (x ->> 'weekday')::smallint, (x ->> 'startLocalTime')::time,
      (x ->> 'endLocalTime')::time, (x ->> 'endDayOffset')::smallint
  from pg_catalog.jsonb_array_elements(v_current_canonical) as x;

  insert into restaurant_internal.branch_weekly_hours_audit_intervals
    (audit_log_id, side, weekday, start_local_time, end_local_time, end_day_offset)
  select v_audit_id, 'next', (x ->> 'weekday')::smallint, (x ->> 'startLocalTime')::time,
      (x ->> 'endLocalTime')::time, (x ->> 'endDayOffset')::smallint
  from pg_catalog.jsonb_array_elements(v_next_canonical) as x;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied', 'branchId', p_branch_id,
    'weeklyHoursConfigured', v_next_configured, 'weeklyHours', v_next_canonical,
    'weeklyHoursVersion', (v_target.weekly_hours_version + 1)::text, 'auditId', v_audit_id::text
  );
end;
$$;

comment on function public.restaurant_owner_replace_branch_weekly_hours_v1(text, text, text, jsonb, bigint) is
  'RA-2H-P1. Atomic whole-week REPLACE_WEEKLY_SCHEDULE|CLEAR_WEEKLY_SCHEDULE. Never touches special/closure versions or any RA-2A-F/RA-1C column.';

revoke all on function public.restaurant_owner_replace_branch_weekly_hours_v1(text, text, text, jsonb, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_replace_branch_weekly_hours_v1(text, text, text, jsonb, bigint)
  to authenticated;
alter function public.restaurant_owner_replace_branch_weekly_hours_v1(text, text, text, jsonb, bigint)
  owner to restaurant_owner_branch_weekly_hours_write_authority;

-- =================================================================================================
-- 15. Special-date SET_CLOSED / SET_CUSTOM_HOURS / CLEAR_OVERRIDE. One branch-level
--     special_hours_version serializes edits across all dates and gives one ABA-safe token.
-- =================================================================================================
create function public.restaurant_owner_set_branch_special_hours_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_local_date date,
  p_operation text,
  p_intervals jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_target record;
  v_elem jsonb;
  v_key text;
  v_candidate_count integer;
  v_start time;
  v_end time;
  v_offset smallint;
  v_next_mode text;
  v_existing record;
  v_previous_mode text;
  v_previous_canonical jsonb;
  v_next_canonical jsonb;
  v_override_id uuid;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0 or p_local_date is null
    or p_operation is null or p_operation not in ('SET_CLOSED', 'SET_CUSTOM_HOURS', 'CLEAR_OVERRIDE')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation <> 'SET_CUSTOM_HOURS' and p_intervals is not null)
    or (p_operation = 'SET_CUSTOM_HOURS' and p_intervals is null)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.special_hours_version, m.id as membership_id
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_users as caller on true
  join public.restaurant_memberships as m on m.restaurant_user_id = caller.id
  join public.restaurant_roles as role on role.id = m.role_id
  join public.role_permissions as permission on permission.role_id = role.id
  where t.branch_id = p_branch_id
    and caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and m.status = 'active'
    and m.restaurant_id = t.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner'
    and permission.permission_key = 'branch.hours.special.write'
    and permission.permission_scope = 'restaurant'
  for update of t;

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  v_membership_id := v_target.membership_id;

  if v_target.special_hours_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  select o.id, o.mode into v_existing
    from public.restaurant_branch_special_hour_overrides o
    where o.branch_id = p_branch_id and o.local_date = p_local_date;
  v_previous_mode := v_existing.mode;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'startLocalTime', i.start_local_time::text, 'endLocalTime', i.end_local_time::text,
      'endDayOffset', i.end_day_offset
    ) order by i.start_local_time, i.end_day_offset, i.end_local_time), '[]'::jsonb)
    into v_previous_canonical
  from public.restaurant_branch_special_hour_intervals i where i.override_id = v_existing.id;

  if p_operation = 'SET_CLOSED' then
    v_next_mode := 'closed';
    v_next_canonical := '[]'::jsonb;
  elsif p_operation = 'CLEAR_OVERRIDE' then
    v_next_mode := null;
    v_next_canonical := '[]'::jsonb;
  else
    v_next_mode := 'custom';
    if pg_catalog.jsonb_typeof(p_intervals) <> 'array' then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
    v_candidate_count := pg_catalog.jsonb_array_length(p_intervals);
    if v_candidate_count < 1 or v_candidate_count > 8 then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
    for v_elem in select value from pg_catalog.jsonb_array_elements(p_intervals) loop
      if pg_catalog.jsonb_typeof(v_elem) <> 'object' then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      for v_key in select k from pg_catalog.jsonb_object_keys(v_elem) as k loop
        if v_key not in ('startLocalTime', 'endLocalTime', 'endDayOffset') then
          return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
        end if;
      end loop;
      if pg_catalog.jsonb_typeof(v_elem -> 'endDayOffset') <> 'number'
        or pg_catalog.jsonb_typeof(v_elem -> 'startLocalTime') <> 'string'
        or pg_catalog.jsonb_typeof(v_elem -> 'endLocalTime') <> 'string'
      then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      begin
        v_offset := (v_elem ->> 'endDayOffset')::smallint;
        v_start := (v_elem ->> 'startLocalTime')::time;
        v_end := (v_elem ->> 'endLocalTime')::time;
      exception when others then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end;
      if v_offset not in (0, 1) then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
      if not (
        (v_offset = 0 and v_start < v_end)
        or (v_offset = 1 and v_start > v_end)
        or (v_offset = 1 and v_start = '00:00:00' and v_end = '00:00:00')
      ) then
        return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
      end if;
    end loop;

    if (select pg_catalog.count(*) from pg_catalog.jsonb_to_recordset(p_intervals)
          as x("startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint))
       <> (select pg_catalog.count(distinct (x."startLocalTime", x."endDayOffset", x."endLocalTime"))
          from pg_catalog.jsonb_to_recordset(p_intervals)
            as x("startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint))
    then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_intervals)
        as a("startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint)
      join pg_catalog.jsonb_to_recordset(p_intervals)
        as b("startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint)
        on true
      where (a."startLocalTime", a."endDayOffset", a."endLocalTime") < (b."startLocalTime", b."endDayOffset", b."endLocalTime")
        and pg_catalog.date_part('epoch', a."startLocalTime")::integer / 60
          < pg_catalog.date_part('epoch', b."endLocalTime")::integer / 60 + b."endDayOffset" * 1440
        and pg_catalog.date_part('epoch', b."startLocalTime")::integer / 60
          < pg_catalog.date_part('epoch', a."endLocalTime")::integer / 60 + a."endDayOffset" * 1440
    ) then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'startLocalTime', x."startLocalTime"::text, 'endLocalTime', x."endLocalTime"::text,
        'endDayOffset', x."endDayOffset"
      ) order by x."startLocalTime", x."endDayOffset", x."endLocalTime"), '[]'::jsonb)
      into v_next_canonical
    from pg_catalog.jsonb_to_recordset(p_intervals)
      as x("startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint);
  end if;

  if v_next_mode is not distinct from v_previous_mode and v_next_canonical = v_previous_canonical then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  if v_existing.id is not null then
    delete from public.restaurant_branch_special_hour_overrides where id = v_existing.id;
  end if;
  if v_next_mode is not null then
    insert into public.restaurant_branch_special_hour_overrides (branch_id, local_date, mode)
      values (p_branch_id, p_local_date, v_next_mode)
      returning id into v_override_id;
    if v_next_mode = 'custom' then
      insert into public.restaurant_branch_special_hour_intervals
        (override_id, start_local_time, end_local_time, end_day_offset)
      select v_override_id, x."startLocalTime", x."endLocalTime", x."endDayOffset"
      from pg_catalog.jsonb_to_recordset(p_intervals)
        as x("startLocalTime" time, "endLocalTime" time, "endDayOffset" smallint);
    end if;
  end if;

  update public.restaurant_branch_temporal_state
    set special_hours_version = special_hours_version + 1
    where branch_id = p_branch_id;

  insert into restaurant_internal.branch_special_hours_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, local_date, operation,
     previous_mode, next_mode, previous_version, next_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, p_local_date, p_operation,
     v_previous_mode, v_next_mode, v_target.special_hours_version, v_target.special_hours_version + 1)
  returning id into v_audit_id;

  insert into restaurant_internal.branch_special_hours_audit_intervals
    (audit_log_id, side, start_local_time, end_local_time, end_day_offset)
  select v_audit_id, 'previous', (x ->> 'startLocalTime')::time, (x ->> 'endLocalTime')::time,
      (x ->> 'endDayOffset')::smallint
  from pg_catalog.jsonb_array_elements(v_previous_canonical) as x;

  insert into restaurant_internal.branch_special_hours_audit_intervals
    (audit_log_id, side, start_local_time, end_local_time, end_day_offset)
  select v_audit_id, 'next', (x ->> 'startLocalTime')::time, (x ->> 'endLocalTime')::time,
      (x ->> 'endDayOffset')::smallint
  from pg_catalog.jsonb_array_elements(v_next_canonical) as x;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied', 'branchId', p_branch_id, 'localDate', p_local_date::text,
    'mode', v_next_mode, 'intervals', v_next_canonical,
    'specialHoursVersion', (v_target.special_hours_version + 1)::text, 'auditId', v_audit_id::text
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_special_hours_v1(text, text, date, text, jsonb, bigint) is
  'RA-2H-P1. SET_CLOSED|SET_CUSTOM_HOURS|CLEAR_OVERRIDE. One branch-level special_hours_version. Never touches weekly/closure versions.';

revoke all on function public.restaurant_owner_set_branch_special_hours_v1(text, text, date, text, jsonb, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_set_branch_special_hours_v1(text, text, date, text, jsonb, bigint)
  to authenticated;
alter function public.restaurant_owner_set_branch_special_hours_v1(text, text, date, text, jsonb, bigint)
  owner to restaurant_owner_branch_special_hours_write_authority;

-- =================================================================================================
-- 16. CLOSE_NOW_INDEFINITE / CLOSE_NOW_UNTIL. starts_at is always the DB authoritative instant,
--     never a caller-supplied clock. Owner commands require Restaurant/Admin lifecycle active.
-- =================================================================================================
create function public.restaurant_owner_close_branch_now_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_operation text,
  p_until_local_datetime timestamp without time zone,
  p_fold text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_target record;
  v_restaurant_status text;
  v_branch_status text;
  v_now timestamptz;
  v_ends_at timestamptz;
  v_resolved record;
  v_closure_id uuid;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_operation is null or p_operation not in ('CLOSE_NOW_INDEFINITE', 'CLOSE_NOW_UNTIL')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'CLOSE_NOW_INDEFINITE' and p_until_local_datetime is not null)
    or (p_operation = 'CLOSE_NOW_UNTIL' and p_until_local_datetime is null)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.operational_closure_version, m.id as membership_id,
      b.timezone_name, b.status as branch_status, r.status as restaurant_status
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_branches b on b.id = t.branch_id
  join public.restaurants r on r.id = t.restaurant_id
  join public.restaurant_users as caller on true
  join public.restaurant_memberships as m on m.restaurant_user_id = caller.id
  join public.restaurant_roles as role on role.id = m.role_id
  join public.role_permissions as permission on permission.role_id = role.id
  where t.branch_id = p_branch_id
    and caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and m.status = 'active'
    and m.restaurant_id = t.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner'
    and permission.permission_key = 'branch.operational_closure.write'
    and permission.permission_scope = 'restaurant'
  for update of t;

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  v_membership_id := v_target.membership_id;

  if v_target.operational_closure_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if v_target.restaurant_status is distinct from 'active' or v_target.branch_status is distinct from 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'lifecycle_blocked');
  end if;

  v_now := pg_catalog.now();
  v_ends_at := null;

  if p_operation = 'CLOSE_NOW_UNTIL' then
    select * into v_resolved
      from restaurant_internal.resolve_branch_local_datetime_v1(v_target.timezone_name, p_until_local_datetime, p_fold);
    if v_resolved.status = 'nonexistent' then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_local_time');
    elsif v_resolved.status in ('ambiguous_fold_required', 'unambiguous_fold_not_allowed', 'invalid_fold') then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
    v_ends_at := v_resolved.instant;
    if v_ends_at <= v_now then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
  end if;

  if exists (
    select 1 from public.restaurant_branch_operational_closures c
    where c.branch_id = p_branch_id and c.cancelled_at is null
      and c.starts_at <= v_now and (c.ends_at is null or c.ends_at > v_now)
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'closure_conflict');
  end if;

  begin
    insert into public.restaurant_branch_operational_closures (branch_id, starts_at, ends_at)
      values (p_branch_id, v_now, v_ends_at)
      returning id into v_closure_id;
  exception when exclusion_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'closure_conflict');
  end;

  update public.restaurant_branch_temporal_state
    set operational_closure_version = operational_closure_version + 1
    where branch_id = p_branch_id;

  insert into restaurant_internal.branch_operational_closure_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, closure_id, operation,
     previous_starts_at, previous_ends_at, previous_cancelled_at,
     next_starts_at, next_ends_at, next_cancelled_at, previous_version, next_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, v_closure_id, p_operation,
     null, null, null, v_now, v_ends_at, null,
     v_target.operational_closure_version, v_target.operational_closure_version + 1)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied', 'branchId', p_branch_id, 'closureId', v_closure_id::text,
    'startsAt', v_now, 'endsAt', v_ends_at,
    'operationalClosureVersion', (v_target.operational_closure_version + 1)::text, 'auditId', v_audit_id::text
  );
end;
$$;

comment on function public.restaurant_owner_close_branch_now_v1(text, text, text, timestamp, text, bigint) is
  'RA-2H-P1. CLOSE_NOW_INDEFINITE|CLOSE_NOW_UNTIL. starts_at is always the DB instant. Never writes restaurant_branches.status.';

revoke all on function public.restaurant_owner_close_branch_now_v1(text, text, text, timestamp, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_close_branch_now_v1(text, text, text, timestamp, text, bigint)
  to authenticated;
alter function public.restaurant_owner_close_branch_now_v1(text, text, text, timestamp, text, bigint)
  owner to restaurant_owner_branch_operational_closure_write_authority;

-- =================================================================================================
-- 17. SCHEDULE_CLOSURE. Future local start (required) and optional local end, each independently
--     fold-disambiguated. No worker/cron required for the window to become effective or to lapse.
-- =================================================================================================
create function public.restaurant_owner_schedule_branch_closure_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_start_local_datetime timestamp without time zone,
  p_start_fold text,
  p_end_local_datetime timestamp without time zone,
  p_end_fold text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_target record;
  v_now timestamptz;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_resolved record;
  v_closure_id uuid;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0 or p_start_local_datetime is null
    or p_expected_version is null or p_expected_version < 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.operational_closure_version, m.id as membership_id,
      b.timezone_name, b.status as branch_status, r.status as restaurant_status
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_branches b on b.id = t.branch_id
  join public.restaurants r on r.id = t.restaurant_id
  join public.restaurant_users as caller on true
  join public.restaurant_memberships as m on m.restaurant_user_id = caller.id
  join public.restaurant_roles as role on role.id = m.role_id
  join public.role_permissions as permission on permission.role_id = role.id
  where t.branch_id = p_branch_id
    and caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and m.status = 'active'
    and m.restaurant_id = t.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner'
    and permission.permission_key = 'branch.operational_closure.write'
    and permission.permission_scope = 'restaurant'
  for update of t;

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  v_membership_id := v_target.membership_id;

  if v_target.operational_closure_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if v_target.restaurant_status is distinct from 'active' or v_target.branch_status is distinct from 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'lifecycle_blocked');
  end if;

  v_now := pg_catalog.now();

  select * into v_resolved
    from restaurant_internal.resolve_branch_local_datetime_v1(v_target.timezone_name, p_start_local_datetime, p_start_fold);
  if v_resolved.status = 'nonexistent' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_local_time');
  elsif v_resolved.status in ('ambiguous_fold_required', 'unambiguous_fold_not_allowed', 'invalid_fold') then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  v_starts_at := v_resolved.instant;
  if v_starts_at <= v_now then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_ends_at := null;
  if p_end_local_datetime is not null then
    select * into v_resolved
      from restaurant_internal.resolve_branch_local_datetime_v1(v_target.timezone_name, p_end_local_datetime, p_end_fold);
    if v_resolved.status = 'nonexistent' then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_local_time');
    elsif v_resolved.status in ('ambiguous_fold_required', 'unambiguous_fold_not_allowed', 'invalid_fold') then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
    v_ends_at := v_resolved.instant;
    if v_ends_at <= v_starts_at then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
  end if;

  if exists (
    select 1 from public.restaurant_branch_operational_closures c
    where c.branch_id = p_branch_id and c.cancelled_at is null
      and c.starts_at < coalesce(v_ends_at, 'infinity'::timestamptz)
      and coalesce(c.ends_at, 'infinity'::timestamptz) > v_starts_at
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'closure_conflict');
  end if;

  begin
    insert into public.restaurant_branch_operational_closures (branch_id, starts_at, ends_at)
      values (p_branch_id, v_starts_at, v_ends_at)
      returning id into v_closure_id;
  exception when exclusion_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'closure_conflict');
  end;

  update public.restaurant_branch_temporal_state
    set operational_closure_version = operational_closure_version + 1
    where branch_id = p_branch_id;

  insert into restaurant_internal.branch_operational_closure_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, closure_id, operation,
     previous_starts_at, previous_ends_at, previous_cancelled_at,
     next_starts_at, next_ends_at, next_cancelled_at, previous_version, next_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, v_closure_id, 'SCHEDULE_CLOSURE',
     null, null, null, v_starts_at, v_ends_at, null,
     v_target.operational_closure_version, v_target.operational_closure_version + 1)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied', 'branchId', p_branch_id, 'closureId', v_closure_id::text,
    'startsAt', v_starts_at, 'endsAt', v_ends_at,
    'operationalClosureVersion', (v_target.operational_closure_version + 1)::text, 'auditId', v_audit_id::text
  );
end;
$$;

comment on function public.restaurant_owner_schedule_branch_closure_v1(text, text, timestamp, text, timestamp, text, bigint) is
  'RA-2H-P1. Future scheduled closure. Becomes effective and lapses by time comparison alone -- no worker/cron.';

revoke all on function public.restaurant_owner_schedule_branch_closure_v1(text, text, timestamp, text, timestamp, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_schedule_branch_closure_v1(text, text, timestamp, text, timestamp, text, bigint)
  to authenticated;
alter function public.restaurant_owner_schedule_branch_closure_v1(text, text, timestamp, text, timestamp, text, bigint)
  owner to restaurant_owner_branch_operational_closure_write_authority;

-- =================================================================================================
-- 18. REOPEN_NOW. Ends the one currently-effective closure at the DB instant. Never resurrects an
--     Admin-blocked branch and never touches restaurant_branches.status.
-- =================================================================================================
create function public.restaurant_owner_reopen_branch_now_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_closure_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_target record;
  v_now timestamptz;
  v_closure record;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0 or p_closure_id is null
    or p_expected_version is null or p_expected_version < 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.operational_closure_version, m.id as membership_id
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_users as caller on true
  join public.restaurant_memberships as m on m.restaurant_user_id = caller.id
  join public.restaurant_roles as role on role.id = m.role_id
  join public.role_permissions as permission on permission.role_id = role.id
  where t.branch_id = p_branch_id
    and caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and m.status = 'active'
    and m.restaurant_id = t.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner'
    and permission.permission_key = 'branch.operational_closure.write'
    and permission.permission_scope = 'restaurant'
  for update of t;

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  v_membership_id := v_target.membership_id;

  if v_target.operational_closure_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  select c.id, c.starts_at, c.ends_at, c.cancelled_at into v_closure
    from public.restaurant_branch_operational_closures c
    where c.id = p_closure_id and c.branch_id = p_branch_id;

  if v_closure.id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  v_now := pg_catalog.now();

  if v_closure.cancelled_at is not null or v_closure.starts_at > v_now
    or (v_closure.ends_at is not null and v_closure.ends_at <= v_now)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.restaurant_branch_operational_closures
    set ends_at = v_now where id = p_closure_id;

  update public.restaurant_branch_temporal_state
    set operational_closure_version = operational_closure_version + 1
    where branch_id = p_branch_id;

  insert into restaurant_internal.branch_operational_closure_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, closure_id, operation,
     previous_starts_at, previous_ends_at, previous_cancelled_at,
     next_starts_at, next_ends_at, next_cancelled_at, previous_version, next_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, p_closure_id, 'REOPEN_NOW',
     v_closure.starts_at, v_closure.ends_at, v_closure.cancelled_at,
     v_closure.starts_at, v_now, null,
     v_target.operational_closure_version, v_target.operational_closure_version + 1)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied', 'branchId', p_branch_id, 'closureId', p_closure_id::text,
    'endsAt', v_now, 'operationalClosureVersion', (v_target.operational_closure_version + 1)::text,
    'auditId', v_audit_id::text
  );
end;
$$;

comment on function public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint) is
  'RA-2H-P1. Ends the one effective closure at the DB instant. Preserves history; never deletes.';

revoke all on function public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint)
  to authenticated;
alter function public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint)
  owner to restaurant_owner_branch_operational_closure_write_authority;

-- =================================================================================================
-- 19. CANCEL_FUTURE_CLOSURE. Marks one not-yet-started row cancelled without deleting it.
-- =================================================================================================
create function public.restaurant_owner_cancel_future_branch_closure_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_closure_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_target record;
  v_now timestamptz;
  v_closure record;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0 or p_closure_id is null
    or p_expected_version is null or p_expected_version < 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select t.branch_id, t.restaurant_id, t.operational_closure_version, m.id as membership_id
    into v_target
  from public.restaurant_branch_temporal_state t
  join public.restaurant_users as caller on true
  join public.restaurant_memberships as m on m.restaurant_user_id = caller.id
  join public.restaurant_roles as role on role.id = m.role_id
  join public.role_permissions as permission on permission.role_id = role.id
  where t.branch_id = p_branch_id
    and caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and m.status = 'active'
    and m.restaurant_id = t.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner'
    and permission.permission_key = 'branch.operational_closure.write'
    and permission.permission_scope = 'restaurant'
  for update of t;

  if v_target.branch_id is null or v_target.restaurant_id is distinct from p_restaurant_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  v_membership_id := v_target.membership_id;

  if v_target.operational_closure_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  select c.id, c.starts_at, c.ends_at, c.cancelled_at into v_closure
    from public.restaurant_branch_operational_closures c
    where c.id = p_closure_id and c.branch_id = p_branch_id;

  if v_closure.id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  v_now := pg_catalog.now();

  if v_closure.cancelled_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;
  if v_closure.starts_at <= v_now then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  update public.restaurant_branch_operational_closures
    set cancelled_at = v_now where id = p_closure_id;

  update public.restaurant_branch_temporal_state
    set operational_closure_version = operational_closure_version + 1
    where branch_id = p_branch_id;

  insert into restaurant_internal.branch_operational_closure_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, closure_id, operation,
     previous_starts_at, previous_ends_at, previous_cancelled_at,
     next_starts_at, next_ends_at, next_cancelled_at, previous_version, next_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, p_closure_id, 'CANCEL_FUTURE_CLOSURE',
     v_closure.starts_at, v_closure.ends_at, v_closure.cancelled_at,
     v_closure.starts_at, v_closure.ends_at, v_now,
     v_target.operational_closure_version, v_target.operational_closure_version + 1)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied', 'branchId', p_branch_id, 'closureId', p_closure_id::text,
    'cancelledAt', v_now, 'operationalClosureVersion', (v_target.operational_closure_version + 1)::text,
    'auditId', v_audit_id::text
  );
end;
$$;

comment on function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint) is
  'RA-2H-P1. Marks one not-yet-started closure cancelled without deleting it.';

revoke all on function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)
  to authenticated;
alter function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)
  owner to restaurant_owner_branch_operational_closure_write_authority;

-- =================================================================================================
-- 20. Internal-function hardening. PostgreSQL grants EXECUTE to PUBLIC by default on every newly
--     created function; every restaurant_internal function is revoked from PUBLIC and every client
--     role, keeping only the narrow grants already made above.
-- =================================================================================================
revoke all on function restaurant_internal.restaurant_branch_timezone_validate()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.restaurant_branch_temporal_state_seed()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.restaurant_branch_weekly_hours_overlap_guard()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.restaurant_branch_special_hours_overlap_guard()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.resolve_branch_local_datetime_v1(text, timestamp, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.evaluate_branch_temporal_state_v1(text, timestamptz)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function restaurant_internal.resolve_branch_local_datetime_v1(text, timestamp, text)
  to restaurant_owner_branch_operational_closure_write_authority;
grant execute on function restaurant_internal.evaluate_branch_temporal_state_v1(text, timestamptz)
  to restaurant_branch_temporal_context_reader;

revoke create on schema public from restaurant_owner_branch_weekly_hours_write_authority;
revoke create on schema public from restaurant_owner_branch_special_hours_write_authority;
revoke create on schema public from restaurant_owner_branch_operational_closure_write_authority;
revoke create on schema public from restaurant_branch_temporal_context_reader;

revoke restaurant_owner_branch_weekly_hours_write_authority from postgres granted by postgres;
revoke restaurant_owner_branch_special_hours_write_authority from postgres granted by postgres;
revoke restaurant_owner_branch_operational_closure_write_authority from postgres granted by postgres;
revoke restaurant_branch_temporal_context_reader from postgres granted by postgres;

-- =================================================================================================
-- 21. Fail-closed epilogue. pg_catalog-only reads; every failure raises rather than warns.
-- =================================================================================================
do $$
declare
  v_count integer;
begin
  -- timezone
  select pg_catalog.count(*) into v_count from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'restaurant_branches'
      and a.attname = 'timezone_name' and a.attnotnull = true and a.attnum > 0 and not a.attisdropped;
  if v_count <> 1 then
    raise exception 'RA-2H-P1: restaurant_branches.timezone_name is not NOT NULL';
  end if;

  select pg_catalog.count(*) into v_count from public.restaurant_branches b
    where not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = b.timezone_name);
  if v_count <> 0 then
    raise exception 'RA-2H-P1: % branch rows carry an unrecognized timezone', v_count;
  end if;

  -- temporal state seeded/zeroed and branch coverage: already proven in section 2, before RLS was
  -- enabled on this table (see the comment there for why a re-read here would be unreliable).
  select pg_catalog.count(*) into v_count from pg_catalog.pg_constraint
    where conrelid = 'public.restaurant_branch_temporal_state'::regclass
      and contype = 'p' and conname = 'restaurant_branch_temporal_state_pkey';
  if v_count <> 1 then
    raise exception 'RA-2H-P1: restaurant_branch_temporal_state is missing its primary key';
  end if;

  -- role properties
  select pg_catalog.count(*) into v_count from pg_catalog.pg_roles
    where rolname in (
      'restaurant_owner_branch_weekly_hours_write_authority',
      'restaurant_owner_branch_special_hours_write_authority',
      'restaurant_owner_branch_operational_closure_write_authority',
      'restaurant_branch_temporal_context_reader'
    ) and rolcanlogin = false and rolinherit = false and rolbypassrls = false;
  if v_count <> 4 then
    raise exception 'RA-2H-P1: one or more temporal sealed roles is not exactly NOLOGIN NOINHERIT NOBYPASSRLS';
  end if;

  -- transient membership released
  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid = m.roleid
    join pg_catalog.pg_roles g on g.oid = m.member
    where r.rolname in (
      'restaurant_owner_branch_weekly_hours_write_authority',
      'restaurant_owner_branch_special_hours_write_authority',
      'restaurant_owner_branch_operational_closure_write_authority',
      'restaurant_branch_temporal_context_reader'
    ) and g.rolname = 'postgres' and m.grantor = (select oid from pg_catalog.pg_roles where rolname = 'postgres');
  if v_count <> 0 then
    raise exception 'RA-2H-P1: a transient postgres membership into a temporal sealed role was not released';
  end if;

  -- no client role holds membership of any sealed writer
  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid = m.roleid
    join pg_catalog.pg_roles g on g.oid = m.member
    where r.rolname in (
      'restaurant_owner_branch_weekly_hours_write_authority',
      'restaurant_owner_branch_special_hours_write_authority',
      'restaurant_owner_branch_operational_closure_write_authority',
      'restaurant_branch_temporal_context_reader'
    ) and g.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2H-P1: a client role holds membership of a temporal sealed role';
  end if;

  -- permission seeding: already fully proven in section 7 while FORCE RLS was suspended. Once
  -- restored, postgres (non-BYPASSRLS) is itself subject to role_permissions' own RLS and a direct
  -- re-read here would silently observe zero rows rather than re-verifying anything.
  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_constraint
    where conrelid = 'public.role_permissions'::regclass
      and conname = 'role_permissions_permission_key_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%branch.hours.weekly.write%'
      and pg_catalog.pg_get_constraintdef(oid) like '%branch.hours.special.write%'
      and pg_catalog.pg_get_constraintdef(oid) like '%branch.operational_closure.write%';
  if v_count <> 1 then
    raise exception 'RA-2H-P1: the widened permission-key CHECK does not name all 3 temporal keys';
  end if;

  -- RLS: enabled+forced on internal audit; RESTRICTIVE tenant policies present on business tables
  select pg_catalog.count(*) into v_count from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'restaurant_internal'
      and c.relname in (
        'branch_weekly_hours_audit_log', 'branch_weekly_hours_audit_intervals',
        'branch_special_hours_audit_log', 'branch_special_hours_audit_intervals',
        'branch_operational_closure_audit_log'
      ) and c.relrowsecurity and c.relforcerowsecurity;
  if v_count <> 5 then
    raise exception 'RA-2H-P1: not every temporal audit relation is RLS-enabled and FORCE-d';
  end if;

  select pg_catalog.count(*) into v_count from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'restaurant_branch_temporal_state', 'restaurant_branch_weekly_hour_intervals',
        'restaurant_branch_special_hour_overrides', 'restaurant_branch_special_hour_intervals',
        'restaurant_branch_operational_closures'
      ) and c.relrowsecurity and c.relforcerowsecurity;
  if v_count <> 5 then
    raise exception 'RA-2H-P1: not every temporal business relation is RLS-enabled and FORCE-d';
  end if;

  select pg_catalog.count(*) into v_count from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    where c.relname in (
      'restaurant_branch_temporal_state', 'restaurant_branch_weekly_hour_intervals',
      'restaurant_branch_special_hour_overrides', 'restaurant_branch_special_hour_intervals',
      'restaurant_branch_operational_closures'
    ) and p.polpermissive = false;
  if v_count <> 6 then
    raise exception 'RA-2H-P1: expected exactly 6 RESTRICTIVE temporal tenant policies, found %', v_count;
  end if;

  -- no update/delete policy exists anywhere on the audit relations
  select pg_catalog.count(*) into v_count from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'restaurant_internal'
      and c.relname in (
        'branch_weekly_hours_audit_log', 'branch_weekly_hours_audit_intervals',
        'branch_special_hours_audit_log', 'branch_special_hours_audit_intervals',
        'branch_operational_closure_audit_log'
      ) and p.polcmd in ('u', 'd');
  if v_count <> 0 then
    raise exception 'RA-2H-P1: an update or delete policy exists on a temporal audit relation';
  end if;

  -- no client role holds any privilege on any temporal audit relation
  select pg_catalog.count(*) into v_count
    from information_schema.role_table_grants g
    where g.table_schema = 'restaurant_internal'
      and g.table_name in (
        'branch_weekly_hours_audit_log', 'branch_weekly_hours_audit_intervals',
        'branch_special_hours_audit_log', 'branch_special_hours_audit_intervals',
        'branch_operational_closure_audit_log'
      )
      and g.grantee in ('PUBLIC', 'anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2H-P1: a client role holds a privilege on a temporal audit relation';
  end if;

  -- RA-1C independence: no temporal role can write branch lifecycle status
  select pg_catalog.count(*) into v_count
    from information_schema.role_column_grants g
    where g.table_schema = 'public' and g.table_name = 'restaurant_branches'
      and g.column_name in ('status', 'status_version') and g.privilege_type = 'UPDATE'
      and g.grantee in (
        'restaurant_owner_branch_weekly_hours_write_authority',
        'restaurant_owner_branch_special_hours_write_authority',
        'restaurant_owner_branch_operational_closure_write_authority',
        'restaurant_branch_temporal_context_reader'
      );
  if v_count <> 0 then
    raise exception 'RA-2H-P1: a temporal role holds UPDATE on restaurant_branches.status or status_version';
  end if;

  -- RA-2A-F independence: no temporal role can write any predecessor RA-2A-F column
  select pg_catalog.count(*) into v_count
    from information_schema.role_column_grants g
    where ((g.table_schema = 'public' and g.table_name = 'branch_menu_items'
            and g.column_name in ('sold_out', 'sold_out_version', 'availability', 'availability_version',
              'price', 'price_version', 'branch_specific_status', 'branch_specific_status_version',
              'branch_specific_name', 'branch_specific_name_version', 'branch_specific_description'))
        or (g.table_schema = 'public' and g.table_name = 'restaurant_branches'
            and g.column_name in ('name', 'display_name_version')))
      and g.privilege_type = 'UPDATE'
      and g.grantee in (
        'restaurant_owner_branch_weekly_hours_write_authority',
        'restaurant_owner_branch_special_hours_write_authority',
        'restaurant_owner_branch_operational_closure_write_authority',
        'restaurant_branch_temporal_context_reader'
      );
  if v_count <> 0 then
    raise exception 'RA-2H-P1: a temporal role holds UPDATE on a frozen RA-2A-F column';
  end if;

  -- no temporal role holds broad UPDATE on restaurant_branches beyond its own narrow slice
  select pg_catalog.count(*) into v_count
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'restaurant_branches'
      and g.privilege_type = 'UPDATE'
      and g.grantee in (
        'restaurant_owner_branch_weekly_hours_write_authority',
        'restaurant_owner_branch_special_hours_write_authority',
        'restaurant_owner_branch_operational_closure_write_authority',
        'restaurant_branch_temporal_context_reader'
      );
  if v_count <> 0 then
    raise exception 'RA-2H-P1: a temporal role holds table-level UPDATE on restaurant_branches';
  end if;

  -- function security posture: every temporal RPC is SECURITY DEFINER, search_path pinned empty
  select pg_catalog.count(*) into v_count from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'restaurant_owner_%branch_%v1'
      and p.prosecdef = true
      and (select array_to_string(p.proconfig, ',')) like '%search_path=%';
  if v_count < 8 then
    raise exception 'RA-2H-P1: not every temporal RPC is a properly configured SECURITY DEFINER, found %', v_count;
  end if;

  -- extension pinned
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'btree_gist') then
    raise exception 'RA-2H-P1: btree_gist extension is not installed';
  end if;

  -- exclusion constraint present
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'restaurant_branch_operational_closures_no_overlap' and contype = 'x'
  ) then
    raise exception 'RA-2H-P1: the operational closure exclusion constraint is missing';
  end if;
end
$$;

commit;

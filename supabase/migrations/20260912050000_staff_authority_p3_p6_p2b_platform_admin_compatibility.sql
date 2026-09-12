-- RA-3-IA-P3-P6-P2B: one-way legacy Platform Admin to exact staff-entitlement bridge.
--
-- Legacy membership remains authoritative during the transition. Compatibility authority is
-- materialized as exact migration_backfill entitlement rows and identified by private, immutable
-- provenance. No application resolver or legacy API definition is replaced here.

begin;

create table admin_internal.staff_platform_admin_compatibility_links (
  link_id uuid not null default pg_catalog.gen_random_uuid(),
  platform_admin_membership_id uuid not null,
  staff_account_id uuid not null,
  permission_key text not null,
  entitlement_id uuid not null,
  status text not null default 'active',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  constraint staff_platform_admin_compatibility_links_pkey primary key (link_id),
  constraint staff_platform_admin_compatibility_links_membership_fkey
    foreign key (platform_admin_membership_id)
    references admin_internal.platform_admin_memberships (id)
    on update restrict on delete restrict,
  constraint staff_platform_admin_compatibility_links_staff_account_fkey
    foreign key (staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_platform_admin_compatibility_links_permission_fkey
    foreign key (permission_key)
    references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_platform_admin_compatibility_links_entitlement_fkey
    foreign key (entitlement_id)
    references admin_internal.staff_permission_entitlements (entitlement_id)
    on update restrict on delete restrict,
  constraint staff_platform_admin_compatibility_links_status_check
    check (status in ('active', 'revoked')),
  constraint staff_platform_admin_compatibility_links_revocation_shape_check
    check (
      (status = 'active' and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create unique index staff_platform_admin_compatibility_links_active_key
  on admin_internal.staff_platform_admin_compatibility_links
  (platform_admin_membership_id, permission_key)
  where status = 'active';

create index staff_platform_admin_compatibility_links_entitlement_idx
  on admin_internal.staff_platform_admin_compatibility_links (entitlement_id);

comment on table admin_internal.staff_platform_admin_compatibility_links is
  'P2B private one-way provenance: one exact legacy membership permission to one migration_backfill entitlement. Revoked history is retained; no reverse staff-to-legacy authority exists.';

alter table admin_internal.staff_platform_admin_compatibility_links enable row level security;
alter table admin_internal.staff_platform_admin_compatibility_links force row level security;

create policy staff_platform_admin_compatibility_links_writer_select
  on admin_internal.staff_platform_admin_compatibility_links for select
  to staff_authority_write_authority using (true);
create policy staff_platform_admin_compatibility_links_writer_insert
  on admin_internal.staff_platform_admin_compatibility_links for insert
  to staff_authority_write_authority with check (true);
create policy staff_platform_admin_compatibility_links_writer_update
  on admin_internal.staff_platform_admin_compatibility_links for update
  to staff_authority_write_authority using (true) with check (true);

-- FORCE RLS on the frozen legacy tables requires explicit, read-only policies for the new writer.
-- Column grants below keep those reads narrower than the policy predicates themselves.
create policy platform_admin_roles_staff_compatibility_select
  on admin_internal.platform_admin_roles for select
  to staff_authority_write_authority using (true);
create policy platform_admin_role_permissions_staff_compatibility_select
  on admin_internal.platform_admin_role_permissions for select
  to staff_authority_write_authority using (true);
create policy platform_admin_memberships_staff_compatibility_select
  on admin_internal.platform_admin_memberships for select
  to staff_authority_write_authority using (true);

revoke all on table admin_internal.staff_platform_admin_compatibility_links
  from public, anon, authenticated, authenticator, service_role, staff_authority_context_reader;
grant select, insert on table admin_internal.staff_platform_admin_compatibility_links
  to staff_authority_write_authority;
grant update (status, revoked_at)
  on table admin_internal.staff_platform_admin_compatibility_links
  to staff_authority_write_authority;

grant select (id, role_key, status)
  on table admin_internal.platform_admin_roles to staff_authority_write_authority;
grant select (role_id, permission_key)
  on table admin_internal.platform_admin_role_permissions to staff_authority_write_authority;
grant select (id, auth_user_id, role_id, status, granted_at, revoked_at)
  on table admin_internal.platform_admin_memberships to staff_authority_write_authority;

create function admin_internal.sync_platform_admin_staff_compatibility_v1(
  p_platform_admin_membership_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_membership record;
  v_staff_account record;
  v_link record;
  v_permission_key text;
  v_entitlement_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_legacy_permission_count integer;
  v_current_permission_count integer;
  v_affected integer;
begin
  if p_platform_admin_membership_id is null then
    raise exception using
      errcode = '22023',
      message = 'platform_admin_compatibility_invalid_membership';
  end if;

  -- The advisory lock also serializes direct sealed synchronizer calls. Membership writes already
  -- hold a row lock; the active-link unique index remains the final duplicate-authority backstop.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_platform_admin_membership_id::text, 0)
  );

  select membership.id, membership.auth_user_id, membership.role_id,
         membership.status, membership.granted_at, membership.revoked_at,
         role.role_key, role.status as role_status
  into v_membership
  from admin_internal.platform_admin_memberships membership
  left join admin_internal.platform_admin_roles role on role.id = membership.role_id
  where membership.id = p_platform_admin_membership_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'platform_admin_compatibility_membership_not_found';
  end if;

  if v_membership.status <> 'active'
     or v_membership.role_key is distinct from 'platform_admin'
     or v_membership.role_status is distinct from 'active' then
    for v_link in
      select link.link_id, link.entitlement_id, link.staff_account_id, link.permission_key
      from admin_internal.staff_platform_admin_compatibility_links link
      where link.platform_admin_membership_id = v_membership.id
        and link.status = 'active'
      order by link.permission_key
    loop
      update admin_internal.staff_permission_entitlements entitlement
      set status = 'revoked', effective_until = v_now, revoked_at = v_now
      where entitlement.entitlement_id = v_link.entitlement_id
        and entitlement.staff_account_id = v_link.staff_account_id
        and entitlement.permission_key = v_link.permission_key
        and entitlement.source_type = 'migration_backfill'
        and entitlement.source_bundle_assignment_id is null
        and entitlement.status = 'active';
      get diagnostics v_affected = row_count;
      if v_affected <> 1 then
        raise exception using
          errcode = 'P0001',
          message = 'platform_admin_compatibility_entitlement_conflict';
      end if;

      update admin_internal.staff_platform_admin_compatibility_links
      set status = 'revoked', revoked_at = v_now
      where link_id = v_link.link_id and status = 'active';
    end loop;
    return;
  end if;

  select pg_catalog.count(distinct permission.permission_key)::integer
  into v_legacy_permission_count
  from admin_internal.platform_admin_role_permissions permission
  where permission.role_id = v_membership.role_id;

  select pg_catalog.count(distinct permission.permission_key)::integer
  into v_current_permission_count
  from admin_internal.platform_admin_role_permissions legacy_permission
  join admin_internal.staff_permission_catalog permission
    on permission.permission_key = legacy_permission.permission_key
   and permission.lifecycle_status = 'active'
   and permission.readiness_status = 'current'
  where legacy_permission.role_id = v_membership.role_id;

  if v_legacy_permission_count = 0 or v_current_permission_count <> v_legacy_permission_count then
    raise exception using
      errcode = 'P0001',
      message = 'platform_admin_compatibility_permission_parity_broken';
  end if;

  select account.id, account.status, account.effective_from, account.effective_until
  into v_staff_account
  from admin_internal.staff_accounts account
  where account.auth_user_id = v_membership.auth_user_id;

  if not found then
    insert into admin_internal.staff_accounts (
      auth_user_id, status, effective_from, effective_until
    ) values (
      v_membership.auth_user_id, 'active', v_membership.granted_at, null
    )
    returning id, status, effective_from, effective_until into v_staff_account;
  elsif v_staff_account.status <> 'active'
     or v_staff_account.effective_from > v_now
     or (v_staff_account.effective_until is not null and v_now >= v_staff_account.effective_until) then
    raise exception using
      errcode = 'P0001',
      message = 'platform_admin_compatibility_staff_account_conflict';
  end if;

  -- Remove active compatibility sources no longer present in the exact authoritative role set.
  for v_link in
    select link.link_id, link.entitlement_id, link.staff_account_id, link.permission_key
    from admin_internal.staff_platform_admin_compatibility_links link
    where link.platform_admin_membership_id = v_membership.id
      and link.status = 'active'
      and not exists (
        select 1
        from admin_internal.platform_admin_role_permissions permission
        where permission.role_id = v_membership.role_id
          and permission.permission_key = link.permission_key
      )
    order by link.permission_key
  loop
    update admin_internal.staff_permission_entitlements entitlement
    set status = 'revoked', effective_until = v_now, revoked_at = v_now
    where entitlement.entitlement_id = v_link.entitlement_id
      and entitlement.staff_account_id = v_link.staff_account_id
      and entitlement.permission_key = v_link.permission_key
      and entitlement.source_type = 'migration_backfill'
      and entitlement.source_bundle_assignment_id is null
      and entitlement.status = 'active';
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'platform_admin_compatibility_entitlement_conflict';
    end if;
    update admin_internal.staff_platform_admin_compatibility_links
    set status = 'revoked', revoked_at = v_now
    where link_id = v_link.link_id and status = 'active';
  end loop;

  for v_permission_key in
    select distinct permission.permission_key
    from admin_internal.platform_admin_role_permissions permission
    join admin_internal.staff_permission_catalog catalog
      on catalog.permission_key = permission.permission_key
     and catalog.lifecycle_status = 'active'
     and catalog.readiness_status = 'current'
    where permission.role_id = v_membership.role_id
    order by permission.permission_key
  loop
    select link.link_id, link.entitlement_id, link.staff_account_id, link.permission_key
    into v_link
    from admin_internal.staff_platform_admin_compatibility_links link
    where link.platform_admin_membership_id = v_membership.id
      and link.permission_key = v_permission_key
      and link.status = 'active';

    if found then
      if v_link.staff_account_id <> v_staff_account.id
         or not exists (
           select 1
           from admin_internal.staff_permission_entitlements entitlement
           where entitlement.entitlement_id = v_link.entitlement_id
             and entitlement.staff_account_id = v_staff_account.id
             and entitlement.permission_key = v_permission_key
             and entitlement.source_type = 'migration_backfill'
             and entitlement.source_bundle_assignment_id is null
             and entitlement.status = 'active'
             and entitlement.effective_from <= v_now
             and (entitlement.effective_until is null or v_now < entitlement.effective_until)
         ) then
        raise exception using
          errcode = 'P0001',
          message = 'platform_admin_compatibility_active_link_conflict';
      end if;
      continue;
    end if;

    insert into admin_internal.staff_permission_entitlements (
      staff_account_id, permission_key, source_type, source_bundle_assignment_id,
      status, effective_from, effective_until, revoked_at
    ) values (
      v_staff_account.id, v_permission_key, 'migration_backfill', null,
      'active', greatest(v_membership.granted_at, v_staff_account.effective_from), null, null
    ) returning entitlement_id into v_entitlement_id;

    insert into admin_internal.staff_platform_admin_compatibility_links (
      platform_admin_membership_id, staff_account_id, permission_key,
      entitlement_id, status, revoked_at
    ) values (
      v_membership.id, v_staff_account.id, v_permission_key,
      v_entitlement_id, 'active', null
    );
  end loop;
end;
$$;

create function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
begin
  perform admin_internal.sync_platform_admin_staff_compatibility_v1(new.id);
  return new;
end;
$$;

-- Create the trigger while the migration runner still owns the helper. PostgreSQL checks EXECUTE
-- at CREATE TRIGGER time; runtime calls use the sealed SECURITY DEFINER owner settled below.
create trigger platform_admin_memberships_staff_compatibility_v1
after insert or update of role_id, status, granted_at, revoked_at
on admin_internal.platform_admin_memberships
for each row
execute function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1();

revoke all on function admin_internal.sync_platform_admin_staff_compatibility_v1(uuid)
  from public, anon, authenticated, authenticator, service_role,
       staff_authority_context_reader, platform_admin_context_reader,
       platform_admin_write_authority;
revoke all on function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1()
  from public, anon, authenticated, authenticator, service_role,
       staff_authority_context_reader, platform_admin_context_reader,
       platform_admin_write_authority;

grant staff_authority_write_authority to postgres
  with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
alter function admin_internal.sync_platform_admin_staff_compatibility_v1(uuid)
  owner to staff_authority_write_authority;
alter function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1()
  owner to staff_authority_write_authority;
revoke create on schema admin_internal from staff_authority_write_authority;

-- Reconcile the bounded pre-existing membership set after all structures and the trigger exist.
set role staff_authority_write_authority;
do $$
declare
  v_membership_id uuid;
begin
  for v_membership_id in
    select membership.id
    from admin_internal.platform_admin_memberships membership
    order by membership.id
  loop
    perform admin_internal.sync_platform_admin_staff_compatibility_v1(v_membership_id);
  end loop;
end;
$$;
reset role;

revoke staff_authority_write_authority from postgres granted by postgres;

commit;

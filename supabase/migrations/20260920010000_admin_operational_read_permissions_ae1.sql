-- ADMIN-AE1: exact CURRENT operational read permissions for the accepted Admin MVP surfaces.
--
-- Narrow authority successor activation. The Admin route registry already names one exact PLANNED read
-- key per accepted ADMIN-B/C/D route, but PLANNED keys have no database authority, so an application route
-- that requires only a PLANNED key resolves to base-Admin (`admin_context.read`). This migration gives the
-- fifteen keys those routes require, plus ONE narrow dashboard-counts key, a CURRENT catalogue row each.
--
-- What it does NOT do (the assertions below fail the migration if any of it happens):
--   * it grants nothing: no entitlement is created, so base Admin, every Platform Admin and every staff
--     account stay DENIED until a Primary grants a key through the existing privileged lane (P3F, AAL2
--     step-up);
--   * it activates no other key (all other PLANNED keys, incl. Business Development, Engineering, Members,
--     Social reports, Nutrition standards/assignments, stay unknown to the database);
--   * it changes no existing catalogue row, function, ACL, RLS policy or sealed role, and adds no wildcard
--     or umbrella key.
--
-- Classification of every new key: privileged lane only (`privileged_only`, not supervisor-delegable,
-- individually provisionable, temporary-grantable) - the same lane and shape as `admin_audit.read`, the
-- existing cross-tenant read precedent. They are granted and revoked by the existing
-- `staff_management_{grant,revoke}_privileged_permission_v2` operators; no new grant mechanism exists.

begin;

-- The catalogue FORCEs RLS (owner included), so every catalogue read and write below runs as the frozen
-- catalogue writer. Its temporary SET membership is released in this same transaction (P3A/P3F/P3I shape).
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
set role staff_authority_write_authority;

-- Fail closed unless the predecessor catalogue is exactly the known eleven rows (ten current, one planned).
do $$
begin
  if (select pg_catalog.count(*) from admin_internal.staff_permission_catalog) <> 11
    or (select pg_catalog.count(*) from admin_internal.staff_permission_catalog where readiness_status = 'current') <> 10
    or exists (select 1 from admin_internal.staff_permission_catalog where permission_key <> all (array[
      'admin_audit.read', 'admin_context.read', 'admin_restaurant_branch.status.write',
      'admin.management.permissions.read', 'admin.management.read',
      'admin.management.staff.account.write', 'admin.management.staff.bundle.write',
      'admin.management.staff.console_admission.write', 'admin.management.staff.delegation.write',
      'admin.management.staff.permission.write', 'admin.management.staff.read']))
  then
    raise exception using errcode = '23514', message = 'ae1_predecessor_catalog_mismatch';
  end if;
end;
$$;

insert into admin_internal.staff_permission_catalog (
  permission_key, lifecycle_status, readiness_status, sensitivity_class,
  individually_provisionable, temporary_grantable, ordinary_supervisor_delegable,
  privileged_only, deferred, console_admission_required
)
select v.permission_key, 'active', 'current', v.sensitivity_class, true, true, false, true, false, false
from (values
  ('admin.dashboard.counts.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.nutrition.certification.pending.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.about.read', 'PUBLIC'),
  ('admin.restaurants.branches.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.contact.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.geo.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.hours.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menu_item.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menu_items.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menu.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menu_management.data_quality.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menu_management.pending.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menu_management.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.menus.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.restaurants.read', 'RESTAURANT_OPERATIONAL'),
  ('admin.social.policies.read', 'PUBLIC')
) as v (permission_key, sensitivity_class)
order by v.permission_key;

-- Fail-closed postconditions: only the intended delta occurred.
do $$
declare
  v_new constant text[] := array[
    'admin.dashboard.counts.read', 'admin.nutrition.certification.pending.read',
    'admin.restaurants.about.read', 'admin.restaurants.branches.read', 'admin.restaurants.contact.read',
    'admin.restaurants.geo.read', 'admin.restaurants.hours.read',
    'admin.restaurants.menu_item.read', 'admin.restaurants.menu_items.read',
    'admin.restaurants.menu.read', 'admin.restaurants.menu_management.data_quality.read',
    'admin.restaurants.menu_management.pending.read', 'admin.restaurants.menu_management.read',
    'admin.restaurants.menus.read', 'admin.restaurants.read', 'admin.social.policies.read'];
begin
  if (select pg_catalog.count(*) from admin_internal.staff_permission_catalog) <> 27
    or (select pg_catalog.count(*) from admin_internal.staff_permission_catalog where readiness_status = 'current') <> 26
    or (select pg_catalog.count(*) from admin_internal.staff_permission_catalog where readiness_status = 'planned') <> 1
    or (select pg_catalog.count(*) from admin_internal.staff_permission_catalog where permission_key = any (v_new)) <> 16
  then
    raise exception using errcode = '23514', message = 'ae1_catalog_delta_mismatch';
  end if;
  if exists (
    select 1 from admin_internal.staff_permission_catalog
    where permission_key = any (v_new)
      and not (lifecycle_status = 'active' and readiness_status = 'current'
        and individually_provisionable and temporary_grantable
        and not ordinary_supervisor_delegable and privileged_only
        and not deferred and not console_admission_required
        and sensitivity_class in ('RESTAURANT_OPERATIONAL', 'PUBLIC'))
  ) then
    raise exception using errcode = '23514', message = 'ae1_new_key_shape_mismatch';
  end if;
  -- Predecessor rows keep their readiness: only bundle.write is planned.
  if (select readiness_status from admin_internal.staff_permission_catalog
        where permission_key = 'admin.management.staff.bundle.write') <> 'planned'
    or exists (select 1 from admin_internal.staff_permission_catalog
      where permission_key <> all (v_new) and permission_key <> 'admin.management.staff.bundle.write'
        and readiness_status <> 'current')
  then
    raise exception using errcode = '23514', message = 'ae1_predecessor_rows_changed';
  end if;
  -- No wildcard and no umbrella operational read key.
  if exists (select 1 from admin_internal.staff_permission_catalog
      where permission_key ~ '[*%]'
        or permission_key in ('admin_all.read', 'platform_everything.read', 'admin.read', 'admin.restaurants.all.read'))
  then
    raise exception using errcode = '23514', message = 'ae1_umbrella_permission_present';
  end if;
  -- Activation grants nothing: no entitlement exists for any new key.
  if exists (select 1 from admin_internal.staff_permission_entitlements where permission_key = any (v_new)) then
    raise exception using errcode = '23514', message = 'ae1_unexpected_grant_present';
  end if;
end;
$$;

reset role;
revoke staff_authority_write_authority from postgres granted by postgres;

do $$
begin
  if pg_catalog.pg_has_role('postgres', 'staff_authority_write_authority', 'SET') then
    raise exception using errcode = '23514', message = 'ae1_writer_set_edge_retained';
  end if;
end;
$$;

commit;

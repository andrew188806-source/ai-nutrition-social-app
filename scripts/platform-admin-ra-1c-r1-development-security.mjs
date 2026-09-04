#!/usr/bin/env node
// Read-only Development gate for the explicit RA-1C-R1 sealed-role manifest.
import {
  RA1CR1_CLIENT_ROLES,
  RA1CR1_GOVERNED_ROLES,
  RA1CR1_PROJECT_NAME,
  RA1CR1_PROJECT_REF,
  RA1CR1_REPOSITORY_ROLE_DEFINITIONS
} from "./platform-admin-ra-1c-r1-successor-manifest.mjs";
import { auditDevelopmentSnapshot, auditRepositoryRoleDefinitions, discoverRepositoryRoleDefinitions }
  from "./platform-admin-ra-1c-r1-contract.mjs";

const OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1C_R1_DEVELOPMENT_SECURITY";
if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: "platform-admin-ra-1c-r1-development-security", status: "skipped",
    reason: `set ${OPT_IN}=1 for the read-only Development gate` }, null, 2));
  process.exit(0);
}
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!managementToken) throw new Error("SUPABASE_ACCESS_TOKEN absent");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function management(path, init = {}) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${RA1CR1_PROJECT_REF}${path}`, {
      ...init, headers: { Authorization: `Bearer ${managementToken}`, ...(init.headers ?? {}) }
    });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    if (response.status !== 429) throw new Error(`Development Management API ${response.status}`);
    await wait(Math.min(20000, attempt * 3000));
  }
  throw new Error("Development Management API throttled");
}
const sql = async (query) => management("/database/query", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query })
});
const quotedValues = (values) => values.map((value) => `('${value.replaceAll("'", "''")}')`).join(",");
const manifestedValues = quotedValues(RA1CR1_GOVERNED_ROLES.map((item) => item.role));
const knownValues = quotedValues(RA1CR1_REPOSITORY_ROLE_DEFINITIONS.map((item) => item.role));
const clientValues = quotedValues(RA1CR1_CLIENT_ROLES);

const ROLE_QUERY = `with manifested(role_name) as (values ${manifestedValues})
select manifested.role_name, role.rolcanlogin, role.rolinherit, role.rolbypassrls, role.rolsuper,
  role.rolcreatedb, role.rolcreaterole, role.rolreplication,
  coalesce((select jsonb_agg(jsonb_build_object('member',member.rolname,'grantor',grantor.rolname,
    'admin_option',membership.admin_option,'inherit_option',membership.inherit_option,'set_option',membership.set_option)
    order by member.rolname,grantor.rolname)
    from pg_auth_members membership join pg_roles member on member.oid=membership.member
    join pg_roles grantor on grantor.oid=membership.grantor where membership.roleid=role.oid),'[]'::jsonb) memberships,
  case when role.oid is null then null else pg_has_role('postgres',role.oid,'MEMBER') end postgres_member,
  case when role.oid is null then null else pg_has_role('postgres',role.oid,'USAGE') end postgres_usage,
  case when role.oid is null then null else pg_has_role('postgres',role.oid,'SET') end postgres_set
from manifested left join pg_roles role on role.rolname=manifested.role_name order by manifested.role_name;`;

const CLIENT_QUERY = `with manifested(role_name) as (values ${manifestedValues}), clients(role_name) as (values ${clientValues})
select manifested.role_name sealed_role, clients.role_name client_role,
  pg_has_role(client_role.oid,sealed_role.oid,'MEMBER') is_member,
  pg_has_role(client_role.oid,sealed_role.oid,'USAGE') can_use,
  pg_has_role(client_role.oid,sealed_role.oid,'SET') can_set,
  (select count(*)::int from pg_auth_members membership
    where membership.roleid=sealed_role.oid and membership.member=client_role.oid) direct_rows
from manifested join pg_roles sealed_role on sealed_role.rolname=manifested.role_name
cross join clients join pg_roles client_role on client_role.rolname=clients.role_name
order by manifested.role_name, clients.role_name;`;

const UNMANIFESTED_QUERY = `with known(role_name) as (values ${knownValues})
select role.rolname role_name
from pg_roles role
where not exists(select 1 from known where known.role_name=role.rolname)
  and exists(select 1 from pg_auth_members membership join pg_roles member on member.oid=membership.member
    join pg_roles grantor on grantor.oid=membership.grantor where membership.roleid=role.oid
    and member.rolname='postgres' and grantor.rolname='supabase_admin' and membership.admin_option is true
    and membership.inherit_option is false and membership.set_option is false)
  and (exists(select 1 from pg_proc function join pg_namespace namespace on namespace.oid=function.pronamespace
      where function.proowner=role.oid and namespace.nspname not in ('pg_catalog','information_schema'))
    or exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
      where relation.relowner=role.oid and namespace.nspname not in ('pg_catalog','information_schema'))
    or exists(select 1 from pg_namespace namespace cross join lateral aclexplode(namespace.nspacl) privilege
      where namespace.nspacl is not null and privilege.grantee=role.oid)
    or exists(select 1 from pg_class relation cross join lateral aclexplode(relation.relacl) privilege
      where relation.relacl is not null and privilege.grantee=role.oid)
    or exists(select 1 from pg_proc function cross join lateral aclexplode(function.proacl) privilege
      where function.proacl is not null and privilege.grantee=role.oid)
    or exists(select 1 from pg_policy policy where role.oid=any(policy.polroles))
    or exists(select 1 from pg_auth_members membership where membership.member=role.oid))
order by role.rolname;`;

const BUSINESS_QUERY = `select
  (select status from public.restaurant_branches where id='synthetic-fixture-branch-b') target_status,
  (select status_version::text from public.restaurant_branches where id='synthetic-fixture-branch-b') target_version,
  (select count(*)::int from admin_internal.platform_admin_operation_receipts
    where branch_id='synthetic-fixture-branch-b') receipts_total,
  (select count(*)::int from admin_internal.platform_admin_operation_receipts
    where branch_id='synthetic-fixture-branch-b' and result='applied') receipts_applied,
  (select count(*)::int from admin_internal.platform_admin_operation_receipts
    where branch_id='synthetic-fixture-branch-b' and result='rejected') receipts_rejected,
  (select count(*)::int from admin_internal.platform_admin_operation_receipts
    where branch_id='synthetic-fixture-branch-b' and result='noop') receipts_noop,
  (select count(*)::int from admin_internal.platform_admin_memberships where status='active') active_platform_admins,
  protected.status protected_status, protected.is_active protected_active, protected.district protected_district,
  protected.address protected_address, protected.geocode_status protected_geocode_status,
  protected.geocode_attempts protected_geocode_attempts, protected.latitude protected_latitude,
  protected.longitude protected_longitude
from public.restaurant_branches protected where protected.id='dev-branch-xinyi';`;

const project = await management("");
if (project.id !== RA1CR1_PROJECT_REF || project.name !== RA1CR1_PROJECT_NAME) throw new Error("Development project pin failed");
const [roles, clients, unmanifestedAuthorityRoles, businessRows] = await Promise.all([
  sql(ROLE_QUERY), sql(CLIENT_QUERY), sql(UNMANIFESTED_QUERY), sql(BUSINESS_QUERY)
]);
const snapshot = { project: { id: project.id, name: project.name }, roles, clients,
  unmanifestedAuthorityRoles, business: businessRows[0] };
const checks = [
  ...auditRepositoryRoleDefinitions(discoverRepositoryRoleDefinitions()),
  ...auditDevelopmentSnapshot(snapshot)
];
checks.forEach((item, index) => console.log(`${item.pass ? "PASS" : "FAIL"} ${index + 1} ${item.name}`));
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-r1-development-security", project: RA1CR1_PROJECT_REF,
  governedRoles: RA1CR1_GOVERNED_ROLES.length, total: checks.length, passed: checks.length - failures.length,
  failed: failures.length, failures, readOnly: true, business: snapshot.business }, null, 2));
if (failures.length) process.exitCode = 1;

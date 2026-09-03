import fs from "node:fs";

export const BASELINE = "6bff2e750f5ac72bab0c93f819bc9ce56b698e22";
export const MIGRATION = "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql";
export const PATHS = Object.freeze([
  "docs/platform-admin-branch-status-ra-1c-p0.md",
  "package.json",
  "scripts/platform-admin-ra-1c-p0-contract.mjs",
  "scripts/platform-admin-ra-1c-p0-development-acceptance.mjs",
  "scripts/platform-admin-ra-1c-p0-guard.mjs",
  "scripts/platform-admin-ra-1c-p0-mutations.mjs",
  "scripts/platform-admin-ra-1c-p0-postgres-apply.mjs",
  "scripts/platform-admin-ra-1c-p0-smoke.mjs",
  MIGRATION
]);
export const readMigration = () => fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g,"\n");

const requirements = [
  ["one exact permission", /admin_restaurant_branch\.status\.write/],
  ["scope pair is closed", /permission_key = 'admin_restaurant_branch\.status\.write' and permission_scope = 'platform'/],
  ["legacy context stays read-only", /where permission\.permission_key in \('admin_context\.read', 'admin_audit\.read'\)/],
  ["legacy function is replaced by its sealed owner", /set role platform_admin_context_reader;[\s\S]*create or replace function public\.platform_admin_current_context_v1[\s\S]*reset role;/],
  ["status version exists", /add column status_version bigint not null default 0/],
  ["status version is nonnegative", /restaurant_branches_status_version_check[\s\S]*status_version >= 0/],
  ["version trigger is status-only", /before update of status on public\.restaurant_branches[\s\S]*old\.status is distinct from new\.status/],
  ["receipt is append-only", /create table admin_internal\.platform_admin_operation_receipts/],
  ["receipt key binds actor", /unique \(actor_auth_user_id, request_id\)/],
  ["receipt action is closed", /action = 'set_restaurant_branch_status'/],
  ["receipt results are closed", /result in \('applied', 'noop', 'rejected'\)/],
  ["sealed role cannot login", /create role platform_admin_branch_status_authority nologin noinherit nobypassrls/],
  ["branch grant is column-scoped", /select \(id, restaurant_id, name, status, status_version\), update \(status\)/],
  ["no delete grant", /grant[^;]*delete/i, 0],
  ["membership lock has no actor parameter", /create function admin_internal\.lock_current_platform_admin_branch_status_actor_v1\(\)/],
  ["membership is locked", /for update of membership/],
  ["permission is rechecked in DB", /permission\.permission_key = 'admin_restaurant_branch\.status\.write'/],
  ["permission seed traverses forced RLS", /platform_admin_role_permissions_writer_insert[\s\S]*grant insert on admin_internal\.platform_admin_role_permissions[\s\S]*set role platform_admin_write_authority;[\s\S]*insert into admin_internal\.platform_admin_role_permissions[\s\S]*reset role;/],
  ["private helper owner gets only transient schema CREATE", /grant create on schema admin_internal to platform_admin_write_authority;[\s\S]*revoke create on schema admin_internal from platform_admin_write_authority;/],
  ["preview takes exact target", /platform_admin_restaurant_branch_status_v1\(p_restaurant_id text, p_branch_id text\)/],
  ["mutation uses typed args", /platform_admin_set_restaurant_branch_status_v1\([\s\S]*p_expected_version bigint[\s\S]*p_request_id uuid/],
  ["request UUID must be v4", /get_byte\(uuid_send\(p_request_id\), 6\) >> 4\) <> 4/],
  ["IDs are bounded", /pg_catalog\.length\(p_restaurant_id\) not between 1 and 200/],
  ["reason is paired with state", /p_requested_status='inactive' and p_reason_code='operational_pause'/],
  ["idempotency is serialized", /pg_advisory_xact_lock/],
  ["replay compares typed payload", /v_prior\.expected_version[\s\S]*p_expected_version/],
  ["different replay conflicts", /'idempotency_conflict'/],
  ["target row is locked", /where branch\.id=p_branch_id for update/],
  ["parent is checked", /v_branch_restaurant_id <> p_restaurant_id/],
  ["unsupported state rejects", /v_before_status not in \('active','inactive'\)/],
  ["stale state rejects", /v_before_status <> p_expected_status or v_before_version <> p_expected_version/],
  ["business update is status-only", /update public\.restaurant_branches set status=p_requested_status where id=p_branch_id/],
  ["receipt follows mutation", /update public\.restaurant_branches[\s\S]*insert into admin_internal\.platform_admin_operation_receipts/],
  ["clients cannot read receipt table", /revoke all on admin_internal\.platform_admin_operation_receipts from public, anon, authenticated, authenticator, service_role/],
  ["private helper stays private", /revoke all on function admin_internal\.lock_current_platform_admin_branch_status_actor_v1\(\) from public, anon, authenticated, authenticator, service_role/],
  ["only authenticated executes public mutation", /grant execute on function public\.platform_admin_set_restaurant_branch_status_v1[^;]+ to authenticated/],
  ["public function has empty search path", /returns jsonb language plpgsql volatile security definer set search_path = '' set row_security = 'on'/],
  ["function owner is sealed", /alter function public\.platform_admin_set_restaurant_branch_status_v1[^;]+ owner to platform_admin_branch_status_authority/],
  ["bootstrap memberships are removed", /revoke platform_admin_branch_status_authority from postgres granted by postgres;[\s\S]*revoke platform_admin_context_reader from postgres granted by postgres;[\s\S]*revoke platform_admin_write_authority from postgres granted by postgres;/],
  ["transaction is explicit", /begin;[\s\S]*commit;\s*$/]
];

export function auditSql(sql) {
  const failures=[];
  for (const [name,re,count] of requirements) {
    const match=sql.match(re); const pass=count===undefined ? Boolean(match) : (match?.length ?? 0)===count;
    if(!pass) failures.push(name);
  }
  if (/service_role\s*;?\s*$/.test(sql.match(/grant execute[^;]+/gi)?.join("\n") ?? "")) failures.push("service role execute leakage");
  if (/\bp_actor\b|\bactor_auth_user_id\s+(text|uuid)[,)]/i.test(sql.match(/create function public\.platform_admin_set[\s\S]*?\$\$;/)?.[0] ?? "")) failures.push("caller-selected actor");
  if (/set search_path = public|default values; update public\.restaurant_branches/i.test(sql)) failures.push("unsafe SQL composition");
  return failures;
}

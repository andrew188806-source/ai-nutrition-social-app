#!/usr/bin/env node
// P3-P6-P2A mutation gate. Mutants are in-memory only; no repository file is written.
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const original = fs.readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
function audit(sql) {
  const bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
  const resolver = bare.slice(bare.indexOf("create function admin_internal.staff_effective_permissions_for_subject_v1"), bare.indexOf("create function public.staff_current_context_v1"));
  const context = bare.slice(bare.indexOf("create function public.staff_current_context_v1"), bare.indexOf("create function public.staff_has_permission_v1"));
  const predicate = bare.slice(bare.indexOf("create function public.staff_has_permission_v1"), bare.indexOf("comment on function public.staff_current_context_v1"));
  return /create function admin_internal\.staff_request_subject_v1\(\)/.test(bare)
    && /current_setting\('request\.jwt\.claim\.sub', true\)/.test(bare)
    && /current_setting\('request\.jwt\.claims', true\)/.test(bare)
    && /create function admin_internal\.staff_effective_permissions_for_subject_v1\(\s*p_auth_user_id uuid,\s*p_database_now timestamptz/.test(bare)
    && /select distinct entitlement\.permission_key/.test(resolver)
    && /account\.auth_user_id = p_auth_user_id/.test(resolver)
    && /account\.status = 'active'/.test(resolver)
    && /account\.effective_from <= p_database_now/.test(resolver)
    && /account\.effective_until is null or p_database_now < account\.effective_until/.test(resolver)
    && /permission\.lifecycle_status = 'active'/.test(resolver)
    && /permission\.readiness_status = 'current'/.test(resolver)
    && /entitlement\.status = 'active'/.test(resolver)
    && /entitlement\.effective_from <= p_database_now/.test(resolver)
    && /entitlement\.effective_until is null or p_database_now < entitlement\.effective_until/.test(resolver)
    && /entitlement\.source_type in \('direct_grant', 'migration_backfill'\)[\s\S]*entitlement\.source_bundle_assignment_id is null/.test(resolver)
    && /entitlement\.source_type = 'bundle_assignment'/.test(resolver)
    && /assignment\.assignment_id = entitlement\.source_bundle_assignment_id/.test(resolver)
    && /assignment\.staff_account_id = entitlement\.staff_account_id/.test(resolver)
    && /assignment\.status = 'active'/.test(resolver)
    && /assignment\.effective_from <= p_database_now/.test(resolver)
    && /assignment\.effective_until is null or p_database_now < assignment\.effective_until/.test(resolver)
    && !/staff_bundle_templates|staff_bundle_template_permissions/.test(resolver)
    && /create function public\.staff_current_context_v1\(\)/.test(context)
    && /returns table \(permission_key text\)/.test(context)
    && /staff_effective_permissions_for_subject_v1\([\s\S]*staff_request_subject_v1\(\)[\s\S]*statement_timestamp\(\)/.test(context)
    && /create function public\.staff_has_permission_v1\(p_requested_permission_key text\)/.test(predicate)
    && /p_requested_permission_key is null or p_requested_permission_key = ''/.test(predicate)
    && /effective\.permission_key = p_requested_permission_key/.test(predicate)
    && !/\blike\b|\bilike\b|starts_with|p_auth_user_id uuid[\s\S]*create function public\.staff_current_context/i.test(context + predicate)
    && (bare.match(/language (?:sql|plpgsql)\s+stable\s+security definer\s+set search_path = ''\s+set row_security = 'on'/g) ?? []).length === 4
    && /grant execute on function public\.staff_current_context_v1\(\) to authenticated;/.test(bare)
    && /grant execute on function public\.staff_has_permission_v1\(text\) to authenticated;/.test(bare)
    && !/grant execute on function[^;]+to (?:public|anon|service_role|authenticator)/i.test(bare)
    && !/grant\s+select[^;]+to\s+(?:authenticated|anon|service_role|public)/i.test(bare)
    && !/platform_admin_current_context_v1|platform_admin_has_permission_v1/.test(bare)
    && !/insert\s+into\s+admin_internal\.(?:staff_accounts|staff_permission_entitlements|staff_permission_catalog)/i.test(bare)
    && !/admin\.staff_authority\.[a-z_.]+\.delegate/.test(bare);
}

const mutations = [];
function mutate(name, anchor, replacement) { if (!original.includes(anchor)) throw new Error(`stale mutation anchor: ${name}`); mutations.push({ name, sql: original.replace(anchor, replacement) }); }
mutate("remove staff active filter", "and account.status = 'active'", "and true");
mutate("remove staff start filter", "and account.effective_from <= p_database_now", "and true");
mutate("remove staff expiry filter", "and (account.effective_until is null or p_database_now < account.effective_until)", "and true");
mutate("make staff end inclusive", "p_database_now < account.effective_until", "p_database_now <= account.effective_until");
mutate("remove entitlement active filter", "and entitlement.status = 'active'", "and true");
mutate("remove entitlement start filter", "and entitlement.effective_from <= p_database_now", "and true");
mutate("remove entitlement expiry filter", "and (entitlement.effective_until is null or p_database_now < entitlement.effective_until)", "and true");
mutate("make entitlement end inclusive", "p_database_now < entitlement.effective_until", "p_database_now <= entitlement.effective_until");
mutate("remove catalog active filter", "and permission.lifecycle_status = 'active'", "and true");
mutate("remove catalog current filter", "and permission.readiness_status = 'current'", "and true");
mutate("use permission prefix match", "effective.permission_key = p_requested_permission_key", "effective.permission_key like p_requested_permission_key || '%'");
mutate("use permission LIKE", "effective.permission_key = p_requested_permission_key", "effective.permission_key like p_requested_permission_key");
mutate("remove DISTINCT", "select distinct entitlement.permission_key", "select entitlement.permission_key");
mutate("read Bundle templates at runtime", "left join admin_internal.staff_bundle_assignments assignment", "join admin_internal.staff_bundle_templates template on true\n  left join admin_internal.staff_bundle_assignments assignment");
mutate("ignore Bundle assignment revoked state", "and assignment.status = 'active'", "and true");
mutate("ignore Bundle assignment window", "and assignment.effective_from <= p_database_now", "and true");
mutate("ignore Bundle assignment expiry", "and (assignment.effective_until is null or p_database_now < assignment.effective_until)", "and true");
mutate("allow wrong-staff Bundle source", "and assignment.staff_account_id = entitlement.staff_account_id", "and true");
mutate("require Bundle assignment for direct grant", "entitlement.source_type in ('direct_grant', 'migration_backfill')", "entitlement.source_type in ('bundle_assignment')");
mutate("accept caller user-id argument", "create function public.staff_current_context_v1()", "create function public.staff_current_context_v1(p_auth_user_id uuid)");
mutate("grant anon EXECUTE", "grant execute on function public.staff_current_context_v1() to authenticated;", "grant execute on function public.staff_current_context_v1() to authenticated, anon;");
mutate("grant PUBLIC EXECUTE", "grant execute on function public.staff_current_context_v1() to authenticated;", "grant execute on function public.staff_current_context_v1() to authenticated;\ngrant execute on function public.staff_current_context_v1() to public;");
mutate("grant service_role EXECUTE", "grant execute on function public.staff_has_permission_v1(text) to authenticated;", "grant execute on function public.staff_has_permission_v1(text) to authenticated, service_role;");
mutate("grant client raw table SELECT", "grant execute on function public.staff_current_context_v1() to authenticated;", "grant select on admin_internal.staff_accounts to authenticated;\ngrant execute on function public.staff_current_context_v1() to authenticated;");
mutate("modify legacy Platform Admin resolver", "begin;", "begin;\ncreate function public.platform_admin_current_context_v1() returns void language sql as $$ select $$;");
mutate("add compatibility backfill", "begin;", "begin;\ninsert into admin_internal.staff_accounts select * from admin_internal.staff_accounts;");
mutate("seed planned permission", "begin;", "begin;\ninsert into admin_internal.staff_permission_catalog(permission_key) values ('admin.future.read');");

const results = mutations.map(({ name, sql }) => ({ name, killed: !audit(sql) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2a-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;

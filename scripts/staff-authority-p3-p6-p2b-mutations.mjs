#!/usr/bin/env node
// P3-P6-P2B mutation gate. Mutants are in memory; repository files are never written.
import fs from "node:fs";

const FILE = "supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql";
const original = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
function audit(sql) {
  const bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
  const sync = bare.slice(bare.indexOf("create function admin_internal.sync_platform_admin_staff_compatibility_v1"), bare.indexOf("create function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1"));
  return /create table admin_internal\.staff_platform_admin_compatibility_links/.test(bare)
    && /unique index staff_platform_admin_compatibility_links_active_key[\s\S]*\(platform_admin_membership_id, permission_key\)[\s\S]*where status = 'active'/.test(bare)
    && /compatibility_links enable row level security/.test(bare)
    && /compatibility_links force row level security/.test(bare)
    && /revoke all on table admin_internal\.staff_platform_admin_compatibility_links\s+from public, anon, authenticated, authenticator, service_role, staff_authority_context_reader;/.test(bare)
    && /grant select, insert on table admin_internal\.staff_platform_admin_compatibility_links\s+to staff_authority_write_authority;/.test(bare)
    && /grant update \(status, revoked_at\)/.test(bare)
    && !/grant delete[^;]*compatibility_links/i.test(bare)
    && /sync_platform_admin_staff_compatibility_v1\(\s*p_platform_admin_membership_id uuid\s*\)/.test(sync)
    && /language plpgsql\s+volatile\s+security definer\s+set search_path = ''\s+set row_security = 'on'\s+set timezone = 'UTC'/.test(sync)
    && /pg_advisory_xact_lock[\s\S]*hashtextextended\(p_platform_admin_membership_id::text, 0\)/.test(sync)
    && /v_membership\.status <> 'active'[\s\S]*v_membership\.role_key is distinct from 'platform_admin'[\s\S]*v_membership\.role_status is distinct from 'active'/.test(sync)
    && /select distinct permission\.permission_key[\s\S]*platform_admin_role_permissions permission[\s\S]*permission\.role_id = v_membership\.role_id/.test(sync)
    && /v_current_permission_count <> v_legacy_permission_count[\s\S]*platform_admin_compatibility_permission_parity_broken/.test(sync)
    && /catalog\.lifecycle_status = 'active'[\s\S]*catalog\.readiness_status = 'current'/.test(sync)
    && /elsif v_staff_account\.status <> 'active'[\s\S]*v_staff_account\.effective_from > v_now[\s\S]*v_now >= v_staff_account\.effective_until[\s\S]*staff_account_conflict/.test(sync)
    && !/update admin_internal\.staff_accounts/.test(sync)
    && /v_staff_account\.id, v_permission_key, 'migration_backfill', null/.test(sync)
    && /greatest\(v_membership\.granted_at, v_staff_account\.effective_from\)/.test(sync)
    && (sync.match(/entitlement\.entitlement_id = v_link\.entitlement_id/g) ?? []).length === 3
    && /entitlement\.entitlement_id = v_link\.entitlement_id[\s\S]*entitlement\.staff_account_id = v_link\.staff_account_id[\s\S]*entitlement\.permission_key = v_link\.permission_key[\s\S]*entitlement\.source_type = 'migration_backfill'[\s\S]*source_bundle_assignment_id is null/.test(sync)
    && (sync.match(/entitlement\.source_bundle_assignment_id is null/g) ?? []).length === 3
    && !/source_type in \([^)]*(?:direct_grant|bundle_assignment)/.test(sync)
    && !/\bdelete\s+from\b/i.test(sync)
    && !/staff_bundle_templates|staff_bundle_template_permissions|insert into admin_internal\.staff_bundle_assignments/.test(bare)
    && !/(insert|update|delete)\s+(into\s+)?admin_internal\.platform_admin_/i.test(sync)
    && !/\blike\b|\bilike\b|starts_with/.test(sync)
    && /create trigger platform_admin_memberships_staff_compatibility_v1/.test(bare)
    && /perform admin_internal\.sync_platform_admin_staff_compatibility_v1\(new\.id\)/.test(bare)
    && /after insert or update of role_id, status, granted_at, revoked_at\s+on admin_internal\.platform_admin_memberships/.test(bare)
    && (bare.match(/owner to staff_authority_write_authority;/g) ?? []).length === 2
    && (bare.match(/revoke all on function admin_internal\.sync_platform_admin_staff_compatibility/g) ?? []).length === 2
    && !/grant execute on function admin_internal\.sync_platform_admin_staff_compatibility/i.test(bare)
    && !/grant\s+(?:select|insert|update|delete)[^;]*staff_platform_admin_compatibility_links[^;]*to\s+(?:public|anon|authenticated|authenticator|service_role|staff_authority_context_reader)/i.test(bare)
    && /revoke staff_authority_write_authority from postgres granted by postgres;/.test(bare)
    && !/create\s+(?:or replace\s+)?function\s+admin_internal\.(?:grant|revoke)_platform_admin/i.test(bare)
    && !/create\s+(?:or replace\s+)?function\s+public\.platform_admin_(?:current_context|has_permission)_v1/i.test(bare)
    && !/create\s+(?:or replace\s+)?function\s+public\.staff_(?:current_context|has_permission)_v1/i.test(bare)
    && !/alter table admin_internal\.staff_authority_audit_log/i.test(bare)
    && !/insert into admin_internal\.staff_permission_catalog/i.test(bare)
    && /\n    join admin_internal\.staff_permission_catalog catalog/.test(sync)
    && !/platform_admin_current_context_v1/.test(sync)
    && !/'[a-z][a-z0-9_]*\.[a-z0-9_.]+'/.test(sync)
    && !/APP_SOURCE_MUTATION/.test(sql);
}

const mutations=[];
function mutate(name, anchor, replacement) { if (!original.includes(anchor)) throw new Error(`stale mutation anchor: ${name}`); mutations.push({name,sql:original.replace(anchor,replacement)}); }
mutate("remove membership trigger", "create trigger platform_admin_memberships_staff_compatibility_v1", "-- removed trigger platform_admin_memberships_staff_compatibility_v1");
mutate("trigger only INSERT", "after insert or update of role_id, status, granted_at, revoked_at", "after insert");
mutate("replace legacy grant function body", "begin;", "begin;\ncreate function admin_internal.grant_platform_admin(uuid,text,uuid,text) returns jsonb language sql as $$ select '{}'::jsonb $$;");
mutate("replace legacy revoke function body", "begin;", "begin;\ncreate function admin_internal.revoke_platform_admin(uuid,uuid,text) returns jsonb language sql as $$ select '{}'::jsonb $$;");
mutate("hardcode permission instead of legacy rows", "select distinct permission.permission_key", "select 'admin_context.read'::text");
mutate("silently ignore missing staff catalog permission", "if v_legacy_permission_count = 0 or v_current_permission_count <> v_legacy_permission_count then", "if v_legacy_permission_count = 0 then");
mutate("mirror only permission intersection", "raise exception using\n+      errcode = 'P0001',\n+      message = 'platform_admin_compatibility_permission_parity_broken';".replaceAll("+      ", "      "), "null;");
mutate("reactivate suspended staff account", "raise exception using\n+      errcode = 'P0001',\n+      message = 'platform_admin_compatibility_staff_account_conflict';".replaceAll("+      ", "      "), "update admin_internal.staff_accounts set status = 'active' where id = v_staff_account.id;");
mutate("revoke whole staff account", "if v_membership.status <> 'active'", "update admin_internal.staff_accounts set status = 'revoked';\n+  if v_membership.status <> 'active'");
mutate("revoke migration rows without linked id", "where entitlement.entitlement_id = v_link.entitlement_id", "where true");
mutate("revoke direct grants", "entitlement.source_type = 'migration_backfill'", "entitlement.source_type in ('migration_backfill', 'direct_grant')");
mutate("revoke Bundle sources", "entitlement.source_type = 'migration_backfill'", "entitlement.source_type in ('migration_backfill', 'bundle_assignment')");
mutate("remove active-link uniqueness", "create unique index staff_platform_admin_compatibility_links_active_key", "create index staff_platform_admin_compatibility_links_active_key");
mutate("allow duplicate active links", "(platform_admin_membership_id, permission_key)\n+  where status = 'active';".replace("+  ", "  "), "(link_id);" );
mutate("use Bundle source type", "v_staff_account.id, v_permission_key, 'migration_backfill', null", "v_staff_account.id, v_permission_key, 'bundle_assignment', pg_catalog.gen_random_uuid()" );
mutate("add compatibility Bundle", "begin;", "begin;\ninsert into admin_internal.staff_bundle_assignments select * from admin_internal.staff_bundle_assignments;");
mutate("grant authenticated link SELECT", "grant select, insert on table admin_internal.staff_platform_admin_compatibility_links", "grant select on table admin_internal.staff_platform_admin_compatibility_links to authenticated;\n+grant select, insert on table admin_internal.staff_platform_admin_compatibility_links");
mutate("grant service_role link access", "grant select, insert on table admin_internal.staff_platform_admin_compatibility_links", "grant select on table admin_internal.staff_platform_admin_compatibility_links to service_role;\n+grant select, insert on table admin_internal.staff_platform_admin_compatibility_links");
mutate("grant client synchronizer execute", "revoke all on function admin_internal.sync_platform_admin_staff_compatibility_v1(uuid)", "grant execute on function admin_internal.sync_platform_admin_staff_compatibility_v1(uuid) to authenticated;\nrevoke all on function admin_internal.sync_platform_admin_staff_compatibility_v1(uuid)");
mutate("add reverse staff to legacy mutation", "begin\n+  if p_platform_admin_membership_id".replace("+  ", "  "), "begin\n+  update admin_internal.platform_admin_memberships set status = 'active';\n+  if p_platform_admin_membership_id");
mutate("remove staff-account conflict fail closed", "elsif v_staff_account.status <> 'active'", "elsif false and v_staff_account.status <> 'active'");
mutate("remove synchronization lock", "perform pg_catalog.pg_advisory_xact_lock(", "perform pg_catalog.abs(");
mutate("allow permission absent from catalog", "join admin_internal.staff_permission_catalog catalog", "left join admin_internal.staff_permission_catalog catalog");
mutate("modify P2A resolver", "begin;", "begin;\ncreate function public.staff_current_context_v1() returns table(permission_key text) language sql as $$ select null::text $$;");
mutate("weaken P1C audit constraints", "begin;", "begin;\nalter table admin_internal.staff_authority_audit_log drop constraint staff_authority_audit_log_event_type_check;");
mutate("seed planned permission", "begin;", "begin;\ninsert into admin_internal.staff_permission_catalog(permission_key) values ('admin.future.read');");
mutate("modify application source", "begin;", "begin;\n-- APP_SOURCE_MUTATION");
mutate("remove entitlement source-bundle isolation", "and entitlement.source_bundle_assignment_id is null", "and true");
mutate("use legacy current-context DTO as mirror source", "from admin_internal.platform_admin_role_permissions permission", "from public.platform_admin_current_context_v1() permission");
mutate("mirror only two DTO permissions", "where permission.role_id = v_membership.role_id", "where permission.role_id = v_membership.role_id and permission.permission_key in ('admin_context.read','admin_audit.read')");
mutate("omit Branch Status permission", "order by permission.permission_key", "and permission.permission_key <> 'admin_restaurant_branch.status.write' order by permission.permission_key");
mutate("hardcode two legacy DTO permissions", "select distinct permission.permission_key", "select unnest(array['admin_context.read','admin_audit.read'])");
mutate("treat role as implicit all-permission authority", "select distinct permission.permission_key", "select catalog.permission_key from admin_internal.staff_permission_catalog catalog");
mutate("modify frozen legacy DTO to expose third permission", "begin;", "begin;\ncreate or replace function public.platform_admin_current_context_v1() returns table(role_key text,permission_key text,permission_scope text) language sql as $$ select 'platform_admin','admin_restaurant_branch.status.write','platform' $$;");
mutate("modify frozen exact legacy predicate", "begin;", "begin;\ncreate or replace function public.platform_admin_has_permission_v1(text) returns boolean language sql as $$ select true $$;");
mutate("allow extra compatibility permission", "select distinct permission.permission_key", "select distinct permission.permission_key union all select 'admin.extra.read'");

const results=mutations.map(({name,sql})=>({name,killed:!audit(sql)}));
const survivors=results.filter((x)=>!x.killed).map((x)=>x.name);
for(const item of results) console.log(`${item.killed?"PASS":"FAIL"} ${item.name}`);
console.log("\n"+JSON.stringify({suite:"staff-authority-p3-p6-p2b-mutations",mutations:results.length,killed:results.length-survivors.length,survivors:survivors.length,survivorNames:survivors,repositoryFilesWritten:0,databaseUsed:false,developmentAccessed:false,productionAccessed:false},null,2));
process.exitCode=survivors.length?1:0;

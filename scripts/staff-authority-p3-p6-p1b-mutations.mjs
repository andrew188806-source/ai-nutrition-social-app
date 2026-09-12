#!/usr/bin/env node
// P3-P6-P1B mutation gate. Mutants exist only in memory; no repository file is written.
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const original = fs.readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
function audit(sql) {
  const bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
  const expectedTables = ["staff_bundle_templates", "staff_bundle_template_permissions", "staff_bundle_assignments", "staff_permission_entitlements"];
  const noClientGrant = !/grant\s+[^;]*(?:table\s+)?admin_internal\.staff_[^;]+\s+to\s+(?:anon|authenticated|authenticator|service_role|public)/i.test(bare);
  return expectedTables.every((table) => new RegExp(`create table admin_internal\\.${table}\\b`).test(bare))
    && (bare.match(/force row level security;/g) ?? []).length === 4
    && noClientGrant
    && !/grant\s+[^;]*delete[^;]*staff_authority_write_authority/i.test(bare)
    && !/on delete cascade/i.test(bare)
    && /check \(bundle_key ~ '\^\[a-z\]\[a-z0-9_\]\{2,79\}\$'\)/.test(bare)
    && /check \(revision > 0\)/.test(bare)
    && (bare.match(/check \(status in \('active', 'revoked'\)\)/g) ?? []).length === 2
    && !/check \(status in \([^)]*expired/.test(bare)
    && (bare.match(/check \(effective_until is null or effective_until > effective_from\)/g) ?? []).length === 2
    && /source_type = 'bundle_assignment' and source_bundle_assignment_id is not null/.test(bare)
    && /source_type in \('direct_grant', 'migration_backfill'\) and source_bundle_assignment_id is null/.test(bare)
    && /create unique index staff_permission_entitlements_bundle_source_key[\s\S]*\(source_bundle_assignment_id, permission_key\)[\s\S]*where source_type = 'bundle_assignment';/.test(bare)
    && !/unique\s*\(staff_account_id,\s*permission_key\)/i.test(bare)
    && !/insert\s+into\s+admin_internal\.staff_bundle_/i.test(bare)
    && !/insert\s+into\s+admin_internal\.staff_permission_entitlements/i.test(bare)
    && !/insert\s+into\s+admin_internal\.staff_permission_catalog/i.test(bare)
    && !/create\s+(?:or replace\s+)?function\s+public\./i.test(bare)
    && !/staff_current_context_v1|staff_has_permission_v1/.test(bare)
    && !/grant\s+(?:insert|update|delete)[^;]*staff_authority_context_reader/i.test(bare)
    && !/grant\s+select[^;]*staff_bundle_templates[^;]*staff_authority_context_reader/i.test(bare);
}

const mutations = [];
function mutate(name, anchor, replacement) {
  if (!original.includes(anchor)) throw new Error(`stale mutation anchor: ${name}`);
  mutations.push({ name, sql: original.replace(anchor, replacement) });
}
mutate("remove FORCE RLS", "alter table admin_internal.staff_permission_entitlements force row level security;", "");
mutate("grant authenticated SELECT", "revoke all on table admin_internal.staff_bundle_templates", "grant select on admin_internal.staff_bundle_templates to authenticated;\nrevoke all on table admin_internal.staff_bundle_templates");
mutate("grant service_role access", "revoke all on table admin_internal.staff_bundle_templates", "grant select on admin_internal.staff_bundle_templates to service_role;\nrevoke all on table admin_internal.staff_bundle_templates");
mutate("add DELETE grant", "grant select, insert on table admin_internal.staff_permission_entitlements", "grant delete on table admin_internal.staff_permission_entitlements to staff_authority_write_authority;\ngrant select, insert on table admin_internal.staff_permission_entitlements");
mutate("add ON DELETE CASCADE", "on update restrict on delete restrict,\n  constraint staff_permission_entitlements_source_type_check", "on update restrict on delete cascade,\n  constraint staff_permission_entitlements_source_type_check");
mutate("introduce unique staff permission", "create unique index staff_permission_entitlements_bundle_source_key", "alter table admin_internal.staff_permission_entitlements add unique (staff_account_id, permission_key);\ncreate unique index staff_permission_entitlements_bundle_source_key");
mutate("allow bundle source without assignment", "source_type = 'bundle_assignment' and source_bundle_assignment_id is not null", "source_type = 'bundle_assignment'");
mutate("allow direct source with assignment", "source_type in ('direct_grant', 'migration_backfill') and source_bundle_assignment_id is null", "source_type in ('direct_grant', 'migration_backfill')");
mutate("remove assignment temporal constraint", "constraint staff_bundle_assignments_effective_window_check\n    check (effective_until is null or effective_until > effective_from),", "");
mutate("remove entitlement temporal constraint", "constraint staff_permission_entitlements_effective_window_check\n    check (effective_until is null or effective_until > effective_from),", "");
mutate("allow stored expired state", "check (status in ('active', 'revoked'))", "check (status in ('active', 'revoked', 'expired'))");
mutate("seed Bundle row prematurely", "alter table admin_internal.staff_bundle_templates enable row level security;", "insert into admin_internal.staff_bundle_templates(bundle_key,revision,display_name) values ('test_bundle',1,'Test');\nalter table admin_internal.staff_bundle_templates enable row level security;");
mutate("seed entitlement prematurely", "alter table admin_internal.staff_bundle_templates enable row level security;", "insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type) values (gen_random_uuid(),'admin_context.read','direct_grant');\nalter table admin_internal.staff_bundle_templates enable row level security;");
mutate("seed fourth permission", "alter table admin_internal.staff_bundle_templates enable row level security;", "insert into admin_internal.staff_permission_catalog(permission_key,lifecycle_status,readiness_status,sensitivity_class,individually_provisionable,temporary_grantable,ordinary_supervisor_delegable,privileged_only,deferred) values ('admin.future.read','active','planned','AUDIT',true,true,false,true,true);\nalter table admin_internal.staff_bundle_templates enable row level security;");
mutate("create public assign_bundle RPC", "alter table admin_internal.staff_bundle_templates enable row level security;", "create function public.assign_bundle() returns void language sql as $$ select $$;\nalter table admin_internal.staff_bundle_templates enable row level security;");
mutate("create staff_current_context_v1", "alter table admin_internal.staff_bundle_templates enable row level security;", "create function public.staff_current_context_v1() returns void language sql as $$ select $$;\nalter table admin_internal.staff_bundle_templates enable row level security;");
mutate("grant context reader template mutation", "grant select, insert on table admin_internal.staff_bundle_templates", "grant update on table admin_internal.staff_bundle_templates to staff_authority_context_reader;\ngrant select, insert on table admin_internal.staff_bundle_templates");
mutate("broaden writer to DELETE", "grant select, insert on table admin_internal.staff_bundle_templates", "grant delete on table admin_internal.staff_bundle_assignments to staff_authority_write_authority;\ngrant select, insert on table admin_internal.staff_bundle_templates");
mutate("create wildcard Bundle key", "check (bundle_key ~ '^[a-z][a-z0-9_]{2,79}$')", "check (bundle_key ~ '^[a-z][a-z0-9_*]{2,79}$')");

const results = mutations.map(({ name, sql }) => ({ name, killed: !audit(sql) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p1b-mutations", mutations: results.length,
  killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors,
  repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false
}, null, 2));
process.exitCode = survivors.length ? 1 : 0;

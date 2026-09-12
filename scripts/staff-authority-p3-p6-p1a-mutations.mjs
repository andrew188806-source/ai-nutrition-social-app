#!/usr/bin/env node
// P3-P6-P1A mutation gate. Mutants exist only in memory; no repository file is written.
import fs from "node:fs";

const MIGRATION = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const original = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const allowedSeeds = new Set(["admin_context.read", "admin_audit.read", "admin_restaurant_branch.status.write"]);

function audit(sql) {
  const stripped = sql.replace(/(^|\s)--[^\n]*/g, "$1");
  const rolesSealed = ["staff_authority_context_reader", "staff_authority_write_authority"].every((role) =>
    new RegExp(`create role ${role}\\s+nologin\\s+noinherit\\s+nobypassrls;`).test(stripped));
  const seedBlock = stripped.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "";
  const seeds = [...seedBlock.matchAll(/\('([a-z0-9_.*%.]+)',\s*'active',\s*'(?:current|planned)'/g)].map((m) => m[1]);
  return rolesSealed
    && (stripped.match(/force row level security;/g) ?? []).length === 2
    && !/grant\s+select[^;]*to\s+authenticated/i.test(stripped)
    && !/grant\s+(?:select|insert|update|delete|truncate|references|trigger)[^;]*to\s+service_role/i.test(stripped)
    && seeds.length === 3 && seeds.every((key) => allowedSeeds.has(key))
    && /constraint staff_accounts_auth_user_id_key unique \(auth_user_id\)/.test(stripped)
    && /check \(status in \('active', 'suspended', 'revoked'\)\)/.test(stripped)
    && /check \(effective_until is null or effective_until > effective_from\)/.test(stripped)
    && !/insert\s+into\s+admin_internal\.staff_accounts/i.test(stripped)
    && !/create\s+table\s+admin_internal\.staff_bundle/i.test(stripped)
    && !/create\s+table\s+admin_internal\.staff_permission_entitlements/i.test(stripped)
    && !/create\s+table\s+admin_internal\.staff_delegation/i.test(stripped)
    && !/create\s+table\s+admin_internal\.staff_authority_(audit|operation)/i.test(stripped)
    && !/create\s+(?:or replace\s+)?function\s+public\./i.test(stripped)
    && !/staff_current_context_v1|staff_has_permission_v1/.test(stripped);
}

const mutations = [];
function mutate(name, find, replacement) {
  if (!original.includes(find)) throw new Error(`stale mutation anchor: ${name}`);
  mutations.push({ name, sql: original.replace(find, replacement) });
}

mutate("remove FORCE RLS", "alter table admin_internal.staff_accounts force row level security;", "");
mutate("grant authenticated SELECT", "grant usage on schema admin_internal to staff_authority_context_reader;",
  "grant select on admin_internal.staff_accounts to authenticated;\ngrant usage on schema admin_internal to staff_authority_context_reader;");
mutate("grant service_role table access", "grant usage on schema admin_internal to staff_authority_context_reader;",
  "grant select on admin_internal.staff_permission_catalog to service_role;\ngrant usage on schema admin_internal to staff_authority_context_reader;");
mutate("make sealed reader LOGIN", "create role staff_authority_context_reader\n  nologin", "create role staff_authority_context_reader\n  login");
mutate("make sealed writer INHERIT", "create role staff_authority_write_authority\n  nologin\n  noinherit", "create role staff_authority_write_authority\n  nologin\n  inherit");
mutate("make sealed writer BYPASSRLS", "create role staff_authority_write_authority\n  nologin\n  noinherit\n  nobypassrls", "create role staff_authority_write_authority\n  nologin\n  noinherit\n  bypassrls");
mutate("seed wildcard permission", "('admin_context.read', 'active', 'current'", "('admin.*', 'active', 'current'");
mutate("seed future PLANNED permission", "('admin_context.read', 'active', 'current'", "('admin.future.read', 'active', 'planned'");
mutate("remove auth-user uniqueness", "constraint staff_accounts_auth_user_id_key unique (auth_user_id),", "");
mutate("allow invalid lifecycle", "check (status in ('active', 'suspended', 'revoked'))", "check (status in ('active', 'suspended', 'revoked', 'expired'))");
mutate("remove effective-window constraint", "constraint staff_accounts_effective_window_check\n    check (effective_until is null or effective_until > effective_from),", "");
mutate("add staff backfill", "alter table admin_internal.staff_permission_catalog enable row level security;",
  "insert into admin_internal.staff_accounts(auth_user_id) select auth_user_id from admin_internal.platform_admin_memberships;\nalter table admin_internal.staff_permission_catalog enable row level security;");
mutate("create premature Bundle table", "alter table admin_internal.staff_permission_catalog enable row level security;",
  "create table admin_internal.staff_bundle_templates(id uuid);\nalter table admin_internal.staff_permission_catalog enable row level security;");
mutate("create premature entitlement table", "alter table admin_internal.staff_permission_catalog enable row level security;",
  "create table admin_internal.staff_permission_entitlements(id uuid);\nalter table admin_internal.staff_permission_catalog enable row level security;");
mutate("create premature delegation table", "alter table admin_internal.staff_permission_catalog enable row level security;",
  "create table admin_internal.staff_delegation_scopes(id uuid);\nalter table admin_internal.staff_permission_catalog enable row level security;");
mutate("create premature authority audit table", "alter table admin_internal.staff_permission_catalog enable row level security;",
  "create table admin_internal.staff_authority_audit_log(id uuid);\nalter table admin_internal.staff_permission_catalog enable row level security;");
mutate("create premature public RPC", "alter table admin_internal.staff_permission_catalog enable row level security;",
  "create function public.staff_current_context_v1() returns void language sql as $$ select $$;\nalter table admin_internal.staff_permission_catalog enable row level security;");

const results = mutations.map(({ name, sql }) => ({ name, killed: !audit(sql) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p1a-mutations",
  mutations: results.length,
  killed: results.length - survivors.length,
  survivors: survivors.length,
  survivorNames: survivors,
  repositoryFilesWritten: 0,
  databaseUsed: false,
  developmentAccessed: false,
  productionAccessed: false
}, null, 2));
process.exitCode = survivors.length === 0 ? 0 : 1;

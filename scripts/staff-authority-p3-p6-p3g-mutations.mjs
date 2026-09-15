#!/usr/bin/env node

import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql", "utf8");
const cli = fs.readFileSync("scripts/break-glass-control.mjs", "utf8");
const embeddedCredentialUrl = ["postgresql://postgres", "secret@db.invalid/postgres"].join(":");
const replace = (source, needle, replacement) => {
  if (!source.includes(needle)) throw new Error(`mutation needle absent: ${needle.slice(0, 100)}`);
  return source.replace(needle, replacement);
};
const count = (source, pattern) => source.match(pattern)?.length ?? 0;
function accepts(candidateSql, candidateCli) {
  const activationLoop = candidateSql.match(/foreach v_permission_key in array array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? "";
  const rootKeys = [...activationLoop.matchAll(/'([a-z0-9_.]+)'/g)].map((match) => match[1]);
  const expectedRoot = [
    "admin_context.read",
    "admin.management.staff.account.write",
    "admin.management.staff.console_admission.write",
    "admin.management.staff.permission.write",
  ];
  return [
    /create role staff_break_glass_control_authority\s+nologin\s+noinherit\s+nobypassrls;/.test(candidateSql),
    !/(?:insert into|update) admin_internal\.staff_permission_catalog/i.test(candidateSql),
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|@[a-z0-9.-]+/i.test(candidateSql),
    count(candidateSql, /if session_user <> 'postgres'/g) === 7,
    !/grant execute[^;]*to (?:public|anon|authenticated|authenticator|service_role)/i.test(candidateSql),
    !/function public\.staff_break_glass/i.test(candidateSql),
    /v_active_count >= 2/.test(candidateSql),
    count(candidateSql, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(\s*'staff_break_glass_principal_capacity'/g) === 2,
    /break_glass_principal_revoked_terminal/.test(candidateSql),
    /break_glass_activation_closed_terminal/.test(candidateSql),
    /break_glass_activation_grant_revoked_terminal/.test(candidateSql),
    !/update admin_internal\.staff_accounts/i.test(candidateSql),
    !/insert into auth\.users|auth\.admin|createUser/i.test(candidateSql),
    /effective_until timestamptz not null/.test(candidateSql),
    /effective_until <= effective_from \+ interval '2 hours'/.test(candidateSql),
    /v_now \+ interval '30 minutes'/.test(candidateSql),
    /v_activation\.effective_until \+ interval '30 minutes'/.test(candidateSql),
    /v_activation\.effective_from \+ interval '2 hours'/.test(candidateSql),
    /if v_now >= v_activation\.effective_until then\s*raise exception using errcode = '55000', message = 'activation_expired'/.test(candidateSql),
    count(candidateSql, /v_activation\.status <> 'active'/g) >= 3,
    !/p_(?:duration|effective_from|effective_until|permission_key)/.test(candidateSql.match(/create function admin_internal\.staff_break_glass_activate_v1[\s\S]*?\$\$;/)?.[0] ?? ""),
    count(candidateSql, /coalesce\(v_staff\.effective_until, 'infinity'::timestamptz\)/g) >= 2,
    JSON.stringify(rootKeys) === JSON.stringify(expectedRoot),
    /staff_break_glass_activation_grants_permission_check check/.test(candidateSql),
    /unique \(activation_id, permission_key\)/.test(candidateSql),
    /unique \(entitlement_id\)/.test(candidateSql),
    /v_permission_key, 'direct_grant',\s*null, 'active'/.test(candidateSql),
    /deferrable initially deferred/.test(candidateSql),
    count(candidateSql, /insert into admin_internal\.staff_break_glass_control_receipts/g) === 5,
    count(candidateSql, /insert into admin_internal\.staff_break_glass_audit_log/g) === 5,
    /if p_reason_code is null\s*or pg_catalog\.length\(p_reason_code\) not between 1 and 80/.test(candidateSql)
      && /invalid_reason_code/.test(candidateSql) && /\^\[a-z\]\[a-z0-9_\]\*\$/.test(candidateSql),
    /request_id_must_be_uuid_v4/.test(candidateSql),
    /message = 'request_conflict'/.test(candidateSql),
    count(candidateSql, /alter table admin_internal\.staff_break_glass_[a-z_]+ enable row level security;/g) === 5,
    count(candidateSql, /alter table admin_internal\.staff_break_glass_[a-z_]+ force row level security;/g) === 5,
    !/delete from admin_internal\./i.test(candidateSql),
    !/grant (?:insert|update|delete)[^;]*to (?:public|anon|authenticated|authenticator|service_role)/i.test(candidateSql),
    /from admin_internal\.staff_break_glass_activation_grants grant_row[\s\S]*grant_row\.entitlement_id = entitlement\.entitlement_id/.test(candidateSql),
    /source_type = 'direct_grant'[\s\S]*source_bundle_assignment_id is null/.test(candidateSql),
    candidateCli.includes('from "pg"'),
    candidateCli.includes("TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL")
      && candidateCli.includes("TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL"),
    candidateCli.includes("target_environment_required"),
    candidateCli.includes("PRODUCTION BREAK GLASS") && candidateCli.includes("production_confirmation_required"),
    candidateCli.includes("service_role credentials are invalid"),
    !/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i.test(candidateCli),
    !/(?:insert into|update|delete from) admin_internal/i.test(candidateCli),
    !/public\.staff_break_glass/i.test(candidateCli),
    /staff_break_glass_status_v1\(\)/.test(candidateCli),
    /staff_break_glass_(?:enroll_principal|activate|extend_activation|close_activation|revoke_principal)_v1\(\$1/.test(candidateCli),
  ].every(Boolean);
}

const mutants = [
  ["seed principal", `${sql}\ninsert into admin_internal.staff_break_glass_principals values ('11111111-1111-4111-8111-111111111111');`, cli],
  ["seed activation", `${sql}\n-- 22222222-2222-4222-8222-222222222222 seeded activation`, cli],
  ["new catalogue key", `${sql}\ninsert into admin_internal.staff_permission_catalog(permission_key) values ('break_glass.root');`, cli],
  ["authenticated EXECUTE", `${sql}\ngrant execute on function admin_internal.staff_break_glass_activate_v1(uuid,text,uuid) to authenticated;`, cli],
  ["service_role EXECUTE", `${sql}\ngrant execute on function admin_internal.staff_break_glass_activate_v1(uuid,text,uuid) to service_role;`, cli],
  ["non-postgres caller", sql.replaceAll("if session_user <> 'postgres'", "if session_user <> 'service_role'"), cli],
  ["15m obsolete duration", sql.replaceAll("interval '30 minutes'", "interval '15 minutes'"), cli],
  ["caller arbitrary duration", replace(sql, "p_principal_id uuid,\n  p_reason_code text", "p_principal_id uuid,\n  p_duration interval,\n  p_reason_code text"), cli],
  ["initial greater than 30m", replace(sql, "v_now + interval '30 minutes'", "v_now + interval '45 minutes'"), cli],
  ["extend greater than 30m", replace(sql, "v_activation.effective_until + interval '30 minutes'", "v_activation.effective_until + interval '60 minutes'"), cli],
  ["continuous greater than 2h", sql.replaceAll("interval '2 hours'", "interval '3 hours'"), cli],
  ["NULL activation end", replace(sql, "effective_until timestamptz not null,", "effective_until timestamptz,"), cli],
  ["remove staff containment", sql.replaceAll("pg_catalog.coalesce(v_staff.effective_until, 'infinity'::timestamptz)", "'infinity'::timestamptz"), cli],
  ["arbitrary permission", replace(sql, "p_principal_id uuid,\n  p_reason_code text", "p_principal_id uuid,\n  p_permission_key text,\n  p_reason_code text"), cli],
  ["three-key root", replace(sql, "  foreach v_permission_key in array array[\n    'admin_context.read',\n    'admin.management.staff.account.write',\n    'admin.management.staff.console_admission.write',", "  foreach v_permission_key in array array[\n    'admin_context.read',\n    'admin.management.staff.account.write',"), cli],
  ["fifth root key", replace(sql, "    'admin.management.staff.permission.write'\n  ]::text[]", "    'admin.management.staff.permission.write',\n    'admin_audit.read'\n  ]::text[]"), cli],
  ["automatic delegation key", replace(sql, "    'admin.management.staff.permission.write'\n  ]::text[]", "    'admin.management.staff.permission.write',\n    'admin.management.staff.delegation.write'\n  ]::text[]"), cli],
  ["staff-account UPDATE", `${sql}\nupdate admin_internal.staff_accounts set status='active';`, cli],
  ["reactivate revoked staff", `${sql}\nupdate admin_internal.staff_accounts set status='active' where status='revoked';`, cli],
  ["create Auth user", `${sql}\ninsert into auth.users(id) values (gen_random_uuid());`, cli],
  ["more than two principals", replace(sql, "v_active_count >= 2", "v_active_count >= 3"), cli],
  ["remove capacity lock", sql.replaceAll("'staff_break_glass_principal_capacity'", "'unbounded_enrollment'"), cli],
  ["revoked principal reactivation", replace(sql, "break_glass_principal_revoked_terminal", "principal_update_allowed"), cli],
  ["closed activation reactivation", replace(sql, "break_glass_activation_closed_terminal", "activation_update_allowed"), cli],
  ["extend expired activation", sql.replaceAll("v_now >= v_activation.effective_until", "false"), cli],
  ["extend closed activation", sql.replaceAll("v_activation.status <> 'active'", "false"), cli],
  ["extend unrelated entitlement", sql.replaceAll("grant_row.entitlement_id = entitlement.entitlement_id", "true"), cli],
  ["close unrelated entitlement", sql.replaceAll("grant_row.entitlement_id = entitlement.entitlement_id", "entitlement.status = 'active'"), cli],
  ["physical DELETE", `${sql}\ndelete from admin_internal.staff_permission_entitlements;`, cli],
  ["missing receipt", replace(sql, "insert into admin_internal.staff_break_glass_control_receipts", "select 1 /* receipt removed */"), cli],
  ["missing audit", replace(sql, "insert into admin_internal.staff_break_glass_audit_log", "select 1 /* audit removed */"), cli],
  ["optional reason", replace(sql, "or pg_catalog.length(p_reason_code) not between 1 and 80", "and pg_catalog.length(p_reason_code) not between 1 and 80"), cli],
  ["broken request idempotency", replace(sql, "message = 'request_conflict'", "message = 'ignored_conflict'"), cli],
  ["RLS disabled", replace(sql, "alter table admin_internal.staff_break_glass_principals enable row level security;", "alter table admin_internal.staff_break_glass_principals disable row level security;"), cli],
  ["FORCE removed", replace(sql, "alter table admin_internal.staff_break_glass_principals force row level security;", ""), cli],
  ["client mutation", `${sql}\ngrant insert on admin_internal.staff_break_glass_principals to authenticated;`, cli],
  ["CLI service_role", sql, replace(cli, "service_role credentials are invalid", "service_role credentials are accepted")],
  ["CLI embedded URL", sql, `${cli}\nconst example = ${JSON.stringify(embeddedCredentialUrl)};`],
  ["CLI implicit Production", sql, cli.replaceAll("target_environment_required", "defaults_to_production")],
  ["CLI weak Production confirmation", sql, cli.replaceAll("PRODUCTION BREAK GLASS", "yes")],
  ["CLI direct table write", sql, `${cli}\nconst unsafe = "update admin_internal.staff_break_glass_principals set status='active'";`],
  ["CLI public RPC", sql, replace(cli, "admin_internal.staff_break_glass_status_v1()", "public.staff_break_glass_status_v1()")],
  ["role can inherit", replace(sql, "  noinherit\n  nobypassrls;", "  inherit\n  nobypassrls;"), cli],
  ["role bypasses RLS", replace(sql, "  nobypassrls;", "  bypassrls;"), cli],
  ["grant reactivation", replace(sql, "break_glass_activation_grant_revoked_terminal", "activation_grant_update_allowed"), cli],
];

const survivors = [];
for (const [name, candidateSql, candidateCli] of mutants) {
  if (accepts(candidateSql, candidateCli)) survivors.push(name);
  else console.log(`PASS ${name}`);
}
for (const name of survivors) console.log(`FAIL ${name}`);
console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p3g-mutations",
  mutations: mutants.length,
  killed: mutants.length - survivors.length,
  survivors: survivors.length,
  survivorNames: survivors,
  repositoryFilesWritten: 0,
  databaseUsed: false,
  developmentAccessed: false,
  productionAccessed: false,
}, null, 2));
process.exitCode = survivors.length ? 1 : 0;

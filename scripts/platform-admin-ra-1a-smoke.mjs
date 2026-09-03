#!/usr/bin/env node
// RA-1A smoke: executes the real server-only authority module and asserts the migration's
// security contract against its own text. No database, no network, no credentials, no artifacts.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  RA1A_CLIENT_ROLE_LIST, RA1A_FUNCTIONS, RA1A_MIGRATION, escapeRa1aRegex
} from "./platform-admin-ra-1a-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

function load(relative) {
  const absolute = path.join(root, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: absolute
  });
  const module = { exports: {} };
  // `server-only` is a build-time marker with no runtime behaviour; nothing else may be required.
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {};
    throw new Error(`RA-1A authority module must not import ${specifier}`);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

const authority = load("apps/admin-web/server/platformAdminAuthority.ts");
const sql = read(RA1A_MIGRATION).replace(/(^|\s)--[^\n]*/g, "$1");
const {
  resolvePlatformAdminContext, platformAdminHasPermission, assertPlatformAdminPermission,
  PLATFORM_ADMIN_PERMISSION_KEYS, PLATFORM_ADMIN_ROLE_KEYS
} = authority;

const adminRows = [
  { role_key: "platform_admin", permission_key: "admin_context.read", permission_scope: "self" },
  { role_key: "platform_admin", permission_key: "admin_audit.read", permission_scope: "platform" }
];
const ok = (rows) => ({ ok: true, rows });

// ---------------------------------------------------------------- authorization states
const admin = resolvePlatformAdminContext(ok(adminRows), true);
check("an active Platform Admin resolves to the admin state with both permissions",
  admin.state === "admin" && admin.roleKey === "platform_admin"
  && JSON.stringify(admin.permissions) === JSON.stringify(["admin_audit.read", "admin_context.read"]), admin);
check("a signed-in non-admin resolves to not_admin, which is not an error",
  resolvePlatformAdminContext(ok([]), true).state === "not_admin");
check("a signed-out caller resolves to unauthenticated regardless of rows",
  resolvePlatformAdminContext(ok(adminRows), false).state === "unauthenticated");
for (const reason of ["authority_unreachable", "authority_rejected"]) {
  const out = resolvePlatformAdminContext({ ok: false, reason }, true);
  check(`an ${reason} authority failure is unavailable, never not_admin and never admin`,
    out.state === "unavailable" && out.reason === reason, out);
}

// ---------------------------------------------------------------- fail-closed vocabulary
const unknownRole = resolvePlatformAdminContext(
  ok([{ role_key: "superadmin", permission_key: "admin_context.read", permission_scope: "self" }]), true);
check("an unrecognised role key fails closed as unavailable, never as admin",
  unknownRole.state === "unavailable" && unknownRole.reason === "unrecognized_role", unknownRole);
const unknownPermission = resolvePlatformAdminContext(
  ok([{ role_key: "platform_admin", permission_key: "restaurant.approve", permission_scope: "platform" }]), true);
check("an unrecognised permission key fails closed as unavailable, never silently narrowed",
  unknownPermission.state === "unavailable" && unknownPermission.reason === "unrecognized_permission",
  unknownPermission);
const mixedRoles = resolvePlatformAdminContext(ok([
  { role_key: "platform_admin", permission_key: "admin_context.read", permission_scope: "self" },
  { role_key: "nutritionist", permission_key: "admin_context.read", permission_scope: "self" }
]), true);
check("two different role keys in one context is an inconsistent authority, not a merge",
  mixedRoles.state === "unavailable" && mixedRoles.reason === "inconsistent_role", mixedRoles);

// ---------------------------------------------------------------- permission gate
check("the permission gate is true only for a held permission",
  platformAdminHasPermission(admin, "admin_audit.read") === true
  && platformAdminHasPermission(resolvePlatformAdminContext(ok([adminRows[0]]), true), "admin_audit.read") === false);
for (const state of [resolvePlatformAdminContext(ok([]), true),
  resolvePlatformAdminContext(ok(adminRows), false),
  resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true)]) {
  check(`the gate refuses in the ${state.state} state`,
    assertPlatformAdminPermission(state, "admin_context.read").allowed === false
    && assertPlatformAdminPermission(state, "admin_context.read").refusal === state.state);
}
check("the gate allows and reports no refusal for a held permission",
  assertPlatformAdminPermission(admin, "admin_context.read").allowed === true
  && assertPlatformAdminPermission(admin, "admin_context.read").refusal === null);
check("the exported vocabulary is exactly the closed RA-1A read list",
  JSON.stringify([...PLATFORM_ADMIN_PERMISSION_KEYS]) === JSON.stringify(["admin_context.read", "admin_audit.read"])
  && JSON.stringify([...PLATFORM_ADMIN_ROLE_KEYS]) === JSON.stringify(["platform_admin"]));
check("the resolved context is frozen so a caller cannot widen its own permissions",
  Object.isFrozen(admin) && Object.isFrozen(admin.permissions));

// ---------------------------------------------------------------- migration contract
check("the private schema is created and closed to PUBLIC",
  /create schema admin_internal;/.test(sql) && /revoke all on schema admin_internal from public;/.test(sql));
check("both authority roles are NOLOGIN, NOINHERIT and NOBYPASSRLS",
  (sql.match(/nologin\s+noinherit\s+nobypassrls;/g) ?? []).length === 2);
check("no elevated role attribute is requested anywhere",
  !/\bsuperuser\b|\bcreatedb\b|\bcreaterole\b|\breplication\b/.test(sql)
  && !/(^|[^o])\bbypassrls\b/.test(sql.replace(/nobypassrls/g, "")));
check("all four private tables force row level security",
  (sql.match(/force row level security;/g) ?? []).length === 4);
check("no DELETE policy exists on any RA-1A table", !/for delete/.test(sql));
check("the audit log can be inserted and read but never updated or deleted",
  /create policy platform_admin_audit_log_writer_insert/.test(sql)
  && /create policy platform_admin_audit_log_reader_select/.test(sql)
  && !/platform_admin_audit_log_writer_update/.test(sql));
check("the client read boundary accepts no actor parameter",
  /create function public\.platform_admin_current_context_v1\(\)/.test(sql));
check("the actor comes only from the verified request subject",
  /request\.jwt\.claim\.sub/.test(sql));
check("every SECURITY DEFINER pins search_path and keeps row security on",
  (sql.match(/security definer/g) ?? []).length === 5
  && (sql.match(/set search_path = ''/g) ?? []).length === 5
  && (sql.match(/set row_security = 'on'/g) ?? []).length === 5);
check("every RA-1A function explicitly revokes EXECUTE from PUBLIC and all four client roles",
  (sql.match(new RegExp(
    `revoke all on function (public|admin_internal)\\.[a-z_0-9]+\\([a-z, ]*\\)\\s+from ${RA1A_CLIENT_ROLE_LIST};`,
    "g")) ?? []).length === 5);
check("only authenticated may execute the client functions",
  (sql.match(/grant execute on function public\.platform_admin_[a-z_0-9]+\([a-z ,]*\) to authenticated;/g) ?? []).length === 3);
check("no provisioning function is granted to any role — no make-me-admin path exists",
  !/grant execute on function admin_internal\./.test(sql));

// ---------------------------------------------------------------- foreign-schema authority
// The sealed writer holds no USAGE on the auth schema and must never be given any, so identity
// existence is delegated to the foreign key. Only the target-identity constraint may become a
// user-facing rejection; any other foreign key failing there is re-raised rather than misreported.
const bodies = [...sql.matchAll(/as \$\$([\s\S]*?)\$\$;/g)].map((match) => match[1]).join("\n");
check("no RA-1A function body reaches into the auth schema", !/\bauth\./.test(bodies));
check("the migration names auth.users exactly once, as the foreign key that owns the invariant",
  (sql.match(/auth\.users/g) ?? []).length === 1
  && /foreign key \(auth_user_id\) references auth\.users \(id\)/.test(sql));
check("the sealed roles are granted no auth-schema privilege and no Supabase auth role",
  !/grant[^;]*\bon schema auth\b[^;]*to\s+platform_admin_/.test(sql)
  && !/grant[^;]*\bon\s+auth\.[a-z_]+[^;]*to\s+platform_admin_/.test(sql)
  && !/grant\s+(supabase_admin|supabase_auth_admin|service_role)\s+to\s+platform_admin_/.test(sql));
check("the unknown-identity rejection is raised from the foreign key, not a preflight read",
  /when foreign_key_violation then/.test(sql)
  && /'rejected', 'unknown target identity'/.test(sql)
  && /'errorCode', 'unknown_identity'/.test(sql));
check("only platform_admin_memberships_auth_user_id_fkey becomes a rejection; anything else re-raises",
  /get stacked diagnostics v_constraint_name = constraint_name;/.test(sql)
  && /if v_constraint_name <> 'platform_admin_memberships_auth_user_id_fkey' then\s*\n\s*raise;\s*\n\s*end if;/
    .test(sql));
check("the exception block is scoped to the membership write alone",
  /begin\s*\n\s*insert into admin_internal\.platform_admin_memberships/.test(sql)
  && (sql.match(/exception\s*\n\s*when foreign_key_violation/g) ?? []).length === 1);

// ---------------------------------------------------------------- privilege / ownership order
// A REVOKE issued after ownership has moved to a sealed role is a silent no-op: PostgreSQL warns
// and leaves the PUBLIC EXECUTE default in place. That is how all five functions ended up
// PUBLIC-executable on the first Development apply. Statement order is the text-visible part of
// that semantics, so it is asserted per function rather than inferred.
for (const fn of RA1A_FUNCTIONS) {
  const sig = escapeRa1aRegex(fn.signature);
  const ownerAt = sql.search(new RegExp(`alter function ${sig}\\s+owner to ${fn.owner};`));
  const revokeAt = sql.search(new RegExp(`revoke all on function ${sig}\\s+from ${RA1A_CLIENT_ROLE_LIST};`));
  const grantAt = sql.search(new RegExp(`grant execute on function ${sig} to authenticated;`));
  check(`${fn.signature} revokes client EXECUTE while it is still owned by the migration`,
    revokeAt >= 0 && ownerAt > revokeAt, { revokeAt, ownerAt });
  check(fn.clientExecutable
    ? `${fn.signature} grants EXECUTE to authenticated before ownership moves`
    : `${fn.signature} is granted EXECUTE to no role whatsoever`,
    fn.clientExecutable
      ? grantAt >= 0 && ownerAt > grantAt
      : !new RegExp(`grant execute on function ${sig}`).test(sql),
    { grantAt, ownerAt });
}

// ---------------------------------------------------------------- SQL construct qualification
// `least`, `greatest`, `coalesce` and `nullif` are grammar constructs, not catalogue functions. An
// empty search_path does not reach them, so qualifying one is never a hardening measure — it is a
// 42883 at parse time. Genuine catalogue calls stay qualified; these two checks separate the cases.
for (const construct of ["least", "greatest", "coalesce", "nullif"]) {
  check(`the SQL construct ${construct} is never schema-qualified`,
    !new RegExp(`[a-z_][a-z0-9_]*\\s*\\.\\s*${construct}\\s*\\(`).test(sql));
}
const qualifiedCalls = [...new Set([...sql.matchAll(/\bpg_catalog\s*\.\s*([a-z_][a-z0-9_]*)\s*\(/g)]
  .map((match) => match[1]))].sort();
check("every pg_catalog-qualified call names a genuine catalogue function",
  JSON.stringify(qualifiedCalls) === JSON.stringify(["btrim", "clock_timestamp", "count",
    "current_setting", "gen_random_uuid", "jsonb_build_object"]), qualifiedCalls);
check("the audit-log limit clamp is bare and still bounded to 500",
  /limit least\(greatest\(coalesce\(requested_limit, 100\), 1\), 500\);/.test(sql));

// ---------------------------------------------------------------- role graph invariant
// `authenticated` receives EXECUTE on reader-OWNED functions. It is never a MEMBER of the reader
// role, so it can neither SET ROLE to it nor inherit its column privileges. NOINHERIT is not relied
// on as the protection: the correct state is no membership at all.
const membershipGrants = [...sql.matchAll(
  /grant\s+(platform_admin_context_reader|platform_admin_write_authority)\s+to\s+([a-z_]+)/g)];
check("the migration grants sealed-role membership to postgres only, twice, transiently",
  membershipGrants.length === 2 && membershipGrants.every((match) => match[2] === "postgres"),
  membershipGrants.map((match) => `${match[1]} -> ${match[2]}`));
for (const client of ["authenticated", "anon", "authenticator", "service_role", "public"]) {
  check(`${client} is never a member of either sealed role`,
    !new RegExp(`grant\\s+platform_admin_(context_reader|write_authority)\\s+to\\s+[^;]*\\b${client}\\b`).test(sql)
    && !new RegExp(`grant\\s+${client}\\s+to\\s+platform_admin_`).test(sql));
}
check("no SET ROLE seam to a sealed role exists, and no client role is altered",
  !/set\s+role\s+platform_admin_/.test(sql)
  && !/alter\s+role\s+(authenticated|anon|authenticator|service_role)\b/.test(sql));
check("authenticated reaches the reader only through EXECUTE on reader-owned functions",
  (sql.match(/grant execute on function public\.platform_admin_[a-z_0-9]+\([a-z ,]*\) to authenticated;/g) ?? []).length === 3
  && !/to authenticated/.test(sql.replace(/grant execute on function[^;]*;/g, "")
    .replace(/from public, anon, authenticated, authenticator, service_role;/g, "")));
check("provisioning execution is explicitly revoked from every client role",
  (sql.match(/revoke all on function admin_internal\.[a-z_]+\([a-z, ]*\)\s+from public, anon, authenticated, authenticator, service_role;/g) ?? []).length === 2);
check("provisioning writes an audit row for grant, revoke and refusal alike",
  /'granted'/.test(sql) && /'revoked'/.test(sql) && (sql.match(/'rejected'/g) ?? []).length >= 4);
check("revocation is a status change and never a delete",
  /set status = 'revoked'/.test(sql) && !/delete from admin_internal\./.test(sql));
check("the role vocabulary admits platform_admin only, so no Nutritionist or break-glass role is implied",
  /check \(role_key = 'platform_admin'\)/.test(sql) && !/nutritionist|break_glass|super_admin/i.test(sql));
check("both transient bootstrap memberships and both CREATE privileges are released",
  /revoke platform_admin_context_reader from postgres granted by postgres;/.test(sql)
  && /revoke platform_admin_write_authority from postgres granted by postgres;/.test(sql)
  && /revoke create on schema public from platform_admin_context_reader;/.test(sql)
  && /revoke create on schema admin_internal from platform_admin_write_authority;/.test(sql));
check("the migration is a single transaction", /^begin;/m.test(sql) && /^commit;/m.test(sql));
check("RA-1A grants no read over private Consumer or Social data",
  !/meal_records|meal_analyses|meal_photo|social_internal|geo_internal|taste_profiles|chat/.test(sql));

console.log("\n" + JSON.stringify({
  suite: "platform-admin-ra-1a-smoke",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name),
  databaseUsed: false, networkUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;

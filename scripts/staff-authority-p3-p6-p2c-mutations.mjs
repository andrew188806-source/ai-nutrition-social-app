#!/usr/bin/env node
// P3-P6-P2C mutation gate. Mutants remain in memory; repository files are never written.
import fs from "node:fs";

const files = {
  shadow: fs.readFileSync("apps/admin-web/auth/admin-staff-authority-shadow.ts", "utf8").replace(/\r\n/g, "\n"),
  context: fs.readFileSync("apps/admin-web/auth/admin-context.ts", "utf8").replace(/\r\n/g, "\n"),
  vocabulary: fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8").replace(/\r\n/g, "\n"),
  route: fs.readFileSync("apps/admin-web/auth/admin-route-authorization.ts", "utf8"),
  navigation: fs.readFileSync("apps/admin-web/auth/admin-navigation-visibility.ts", "utf8"),
  api: fs.readFileSync("apps/admin-web/auth/admin-api-authorization.ts", "utf8"),
  session: fs.readFileSync("apps/admin-web/auth/admin-session-gate.ts", "utf8"),
  extraMigration: false
};

function audit(state) {
  const { shadow, context, vocabulary } = state;
  const runtime = shadow.slice(shadow.indexOf("export async function resolveAdminStaffAuthorityShadow"));
  return shadow.startsWith('import "server-only";')
    && /ADMIN_STAFF_AUTHORITY_SHADOW_ENV = "TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW"/.test(shadow)
    && /return env\[ADMIN_STAFF_AUTHORITY_SHADOW_ENV\] === "enabled";/.test(shadow)
    && !/NEXT_PUBLIC/.test(shadow)
    && (shadow.match(/"staff_current_context_v1"/g) ?? []).length === 1
    && !/staff_has_permission_v1/.test(shadow)
    && /state: "disabled"/.test(shadow) && /state: "not_applicable"/.test(shadow)
    && /state: "match"/.test(shadow) && /state: "mismatch"/.test(shadow)
    && /"rpc_rejected"[\s\S]*"rpc_unreachable"[\s\S]*"malformed_response"/.test(shadow)
    && /if \(!Array\.isArray\(data\)\)/.test(shadow)
    && /typeof row !== "object"[\s\S]*row === null[\s\S]*!\("permission_key" in row\)[\s\S]*!isCurrentAdminPermissionKey\(row\.permission_key\)/.test(shadow)
    && /new Set<CurrentAdminPermissionKey>\(\)/.test(shadow)
    && /const authoritativePermissions = new Set\(authoritativeContext\.permissions\);/.test(shadow)
    && /authoritativeContext\.permissions[\s\S]*filter\(\(permission\) => !staffPermissions\.has\(permission\)\)/.test(shadow)
    && /staff\.permissions[\s\S]*filter\(\(permission\) => !authoritativePermissions\.has\(permission\)\)/.test(shadow)
    && /missingFromStaff\.length === 0 && extraInStaff\.length === 0/.test(shadow)
    && /if \(!enabled\) return Object\.freeze\(\{ state: "disabled" as const \}\);/.test(shadow)
    && /if \(authoritativeContext\.state !== "admin"\)/.test(shadow)
    && /if \(!enabled \|\| authoritativeContext\.state !== "admin"\)[\s\S]*return compareAdminStaffAuthorityShadow\(authoritativeContext, null, enabled\);/.test(runtime)
    && /client\.rpc\(STAFF_CURRENT_CONTEXT_FUNCTION\)/.test(runtime)
    && /ADMIN_STAFF_AUTHORITY_SHADOW_TIMEOUT_MS = 1_500/.test(shadow)
    && /Promise\.race\([\s\S]*setTimeout\([\s\S]*clearTimeout\(timeout\)/.test(runtime)
    && /const enabled = options\.enabled \?\? isAdminStaffAuthorityShadowEnabled\(\);/.test(runtime)
    && /result\.error[\s\S]*reason: "rpc_rejected"/.test(runtime)
    && /catch \{[\s\S]*reason: "rpc_unreachable"/.test(runtime)
    && /emitAdminStaffAuthorityShadowDiagnostic\(shadow, options\.warn \?\? console\.warn\)/.test(runtime)
    && !/subject|email|jwt|cookie|authorization|access.?token|refresh.?token|raw.?error/i.test(shadow.slice(shadow.indexOf("export type AdminStaffAuthorityShadowDiagnostic"), shadow.indexOf("type AdminStaffAuthorityShadowOptions")))
    && !/response.?header|localStorage|query.?parameter|debug.?page|browser.?banner/i.test(shadow)
    && !/subject|rawError|browser.?shadow/i.test(shadow)
    && /const authoritativeContext = resolveCurrentAdminPermissionContext\([\s\S]*await resolveAdminStaffAuthorityShadow\(client, authoritativeContext\);[\s\S]*return authoritativeContext;/.test(context)
    && context.includes("await resolveAdminStaffAuthorityShadow(client, authoritativeContext);\n  return authoritativeContext;")
    && (context.match(/auth\.getUser\(\)/g) ?? []).length === 1
    && !/staff_current_context_v1|staff_has_permission_v1/.test(context)
    && JSON.stringify([...vocabulary.matchAll(/"(admin[_.][a-z0-9_.]+)"/g)].map((match) => match[1])) === JSON.stringify([
      "admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"
    ])
    && state.route === files.route
    && state.navigation === files.navigation
    && state.api === files.api
    && state.session === files.session
    && !state.extraMigration;
}

const mutations = [];
function mutate(name, key, anchor, replacement) {
  if (!files[key].includes(anchor)) throw new Error(`stale mutation anchor: ${name}`);
  mutations.push({ name, state: { ...files, [key]: files[key].replace(anchor, replacement) } });
}
mutate("make staff shadow authoritative", "context", "await resolveAdminStaffAuthorityShadow(client, authoritativeContext);\n  return authoritativeContext;", "return await resolveAdminStaffAuthorityShadow(client, authoritativeContext) as never;");
mutate("fallback to staff when legacy not_admin", "shadow", 'if (authoritativeContext.state !== "admin") {', 'if (authoritativeContext.state === "unauthenticated") {');
mutate("fallback to staff when legacy unavailable", "shadow", 'if (!enabled || authoritativeContext.state !== "admin") {', 'if (!enabled || authoritativeContext.state === "unauthenticated") {');
mutate("deny request on shadow mismatch", "context", "await resolveAdminStaffAuthorityShadow(client, authoritativeContext);", "const diagnostic = await resolveAdminStaffAuthorityShadow(client, authoritativeContext);\n  if (diagnostic.state === \"mismatch\") return { state: \"not_admin\" };");
mutate("deny request on staff RPC error", "context", "await resolveAdminStaffAuthorityShadow(client, authoritativeContext);", "const diagnostic = await resolveAdminStaffAuthorityShadow(client, authoritativeContext);\n  if (diagnostic.state === \"unavailable\") return { state: \"unavailable\", reason: \"authority_unreachable\" };");
mutate("compare against two-key legacy DTO", "context", "resolveAdminStaffAuthorityShadow(client, authoritativeContext)", "resolveAdminStaffAuthorityShadow(client, authority.context as never)");
mutate("ignore Branch Status during comparison", "shadow", "const authoritativePermissions = new Set(authoritativeContext.permissions);", "const authoritativePermissions = new Set(authoritativeContext.permissions.filter((key) => key !== \"admin_restaurant_branch.status.write\"));");
mutate("union legacy and staff authority", "context", "return authoritativeContext;", "return { ...authoritativeContext, permissions: [...new Set([...authoritativeContext.permissions, ...shadow.permissions])] };");
mutate("intersect legacy and staff authority", "context", "return authoritativeContext;", "return { ...authoritativeContext, permissions: authoritativeContext.permissions.filter((key) => shadow.permissions.includes(key)) };");
mutate("call staff predicate per permission", "shadow", 'STAFF_CURRENT_CONTEXT_FUNCTION = "staff_current_context_v1"', 'STAFF_CURRENT_CONTEXT_FUNCTION = "staff_has_permission_v1"');
mutate("remove bounded shadow timeout", "shadow", "const result = await Promise.race([", "const result = await Promise.all([");
mutate("call auth.getUser twice", "context", "userResult = await client.auth.getUser();", "userResult = await client.auth.getUser();\n    await client.auth.getUser();");
mutate("enable shadow by default", "shadow", "const enabled = options.enabled ?? isAdminStaffAuthorityShadowEnabled();", "const enabled = options.enabled ?? true;");
mutate("use NEXT_PUBLIC shadow env", "shadow", "TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW", "NEXT_PUBLIC_TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW");
mutate("log subject UUID", "shadow", "state: result.state,\n        missingFromStaff", "state: result.state,\n        subject: authoritativeContext.subject,\n        missingFromStaff");
mutate("log raw RPC error", "shadow", "reason: \"rpc_rejected\" as const", "reason: \"rpc_rejected\" as const, rawError: result.error");
mutate("send mismatch to browser", "shadow", "export type AdminStaffAuthorityShadowResult", "export const browserShadowResult = true;\nexport type AdminStaffAuthorityShadowResult");
mutate("add debug response header", "shadow", "export type AdminStaffAuthorityShadowResult", "export const responseHeader = \"x-admin-shadow\";\nexport type AdminStaffAuthorityShadowResult");
mutate("filter route authority from shadow", "route", "import type", "const SHADOW_ROUTE_FILTER = true;\nimport type");
mutate("filter navigation from shadow", "navigation", "import {", "const SHADOW_NAVIGATION_FILTER = true;\nimport {");
mutate("authorize Admin API from shadow", "api", "server-only", "server-only\nSHADOW_API_AUTHORITY");
mutate("change login gate to staff", "session", "import type", "const STAFF_LOGIN_AUTHORITY = true;\nimport type");
mutate("expand current permission vocabulary", "vocabulary", '"admin_restaurant_branch.status.write"', '"admin_restaurant_branch.status.write",\n  "admin.future.read"');
mutations.push({ name: "add P2C migration", state: { ...files, extraMigration: true } });

const results = mutations.map(({ name, state }) => ({ name, killed: !audit(state) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2c-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;

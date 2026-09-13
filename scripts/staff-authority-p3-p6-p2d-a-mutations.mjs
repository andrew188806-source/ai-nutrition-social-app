#!/usr/bin/env node
// P3-P6-P2D-A mutation gate. Mutants remain in memory; repository files are never written.
import fs from "node:fs";

const files = {
  selector: fs.readFileSync("apps/admin-web/auth/admin-authority-selector.ts", "utf8").replace(/\r\n/g, "\n"),
  staff: fs.readFileSync("apps/admin-web/auth/admin-staff-permission-authority.ts", "utf8").replace(/\r\n/g, "\n"),
  context: fs.readFileSync("apps/admin-web/auth/admin-context.ts", "utf8").replace(/\r\n/g, "\n"),
  current: fs.readFileSync("apps/admin-web/auth/admin-current-permission-context.ts", "utf8").replace(/\r\n/g, "\n"),
  session: fs.readFileSync("apps/admin-web/auth/admin-session-gate.ts", "utf8").replace(/\r\n/g, "\n"),
  login: fs.readFileSync("apps/admin-web/app/admin/login/actions.ts", "utf8").replace(/\r\n/g, "\n"),
  page: fs.readFileSync("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx", "utf8").replace(/\r\n/g, "\n"),
  route: fs.readFileSync("apps/admin-web/auth/admin-route-authorization.ts", "utf8").replace(/\r\n/g, "\n"),
  navigation: fs.readFileSync("apps/admin-web/auth/admin-navigation-visibility.ts", "utf8").replace(/\r\n/g, "\n"),
  api: fs.readFileSync("apps/admin-web/auth/admin-api-authorization.ts", "utf8").replace(/\r\n/g, "\n"),
  vocabulary: fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8").replace(/\r\n/g, "\n"),
  extraMigration: false
};

function audit(state) {
  const { selector, staff, context, current, session, login, page } = state;
  const staffBranch = context.slice(context.indexOf('if (mode.mode === "staff_permissions_legacy_admission")'), context.indexOf("let branchStatusPermission"));
  const legacyBranch = context.slice(context.indexOf("let branchStatusPermission"));
  return selector.startsWith('import "server-only";')
    && /ADMIN_AUTHORITY_MODE_ENV = "TASTKIND_ADMIN_AUTHORITY_MODE"/.test(selector)
    && /value === undefined \|\| value === "legacy"/.test(selector)
    && /value === "staff_permissions_legacy_admission"/.test(selector)
    && /state: "unavailable" as const, reason: "invalid_authority_mode"/.test(selector)
    && !/\.trim\(|toLowerCase|toUpperCase|NEXT_PUBLIC/i.test(selector)
    && (context.match(/auth\.getUser\(\)/g) ?? []).length === 1
    && !/MUTANT_/.test(selector + staff + context)
    && context.indexOf("if (authority.subject === null)") < context.indexOf("resolveAdminAuthorityMode()")
    && /mode\.state === "unavailable"[\s\S]*reason: mode\.reason/.test(context)
    && /authority\.context\.state !== "admin"/.test(context)
    && context.indexOf('authority.context.state !== "admin"') < context.indexOf('mode.mode === "staff_permissions_legacy_admission"')
    && /\|\| !authority\.context\.permissions\.includes\("admin_context\.read"\)/.test(context)
    && staff.startsWith('import "server-only";')
    && /STAFF_PERMISSION_CONTEXT_FUNCTION = "staff_current_context_v1"/.test(staff)
    && (staffBranch.match(/client\.rpc\(STAFF_PERMISSION_CONTEXT_FUNCTION\)/g) ?? []).length === 1
    && !/staff_has_permission_v1|STAFF_HAS_PERMISSION/.test(staff + context)
    && !/PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION|branchStatusPermission/.test(staffBranch)
    && /resolveAdminStaffPermissionSet\(\s*outcome:/.test(staff)
    && !/\bsubject\s*:/.test(staff)
    && !/MUTANT_|legacyPermissions|UNION_LEGACY|INTERSECT_LEGACY/.test(staff + staffBranch)
    && /const staffPermissions = resolveAdminStaffPermissionSet\(outcome\);[\s\S]*if \(staffPermissions\.state !== "ready"\) return staffPermissions;/.test(staffBranch)
    && /result\.error[\s\S]*staff_authority_rejected/.test(staffBranch)
    && /catch \{[\s\S]*staff_authority_unreachable/.test(staffBranch)
    && /if \(!Array\.isArray\(outcome\.data\)\)/.test(staff)
    && /typeof row !== "object"[\s\S]*typeof row\.permission_key !== "string"/.test(staff)
    && /if \(!isCurrentAdminPermissionKey\(row\.permission_key\)\) \{[\s\S]*unrecognized_current_permission/.test(staff)
    && /new Set<CurrentAdminPermissionKey>\(\)/.test(staff)
    && /if \(!permissions\.has\(BASE_PERMISSION\)\)[\s\S]*state: "not_admin"/.test(staff)
    && /admissionAuthority: "legacy" as const/.test(staffBranch)
    && /admissionAuthority: "legacy" \| "staff"/.test(current)
    && !/\broleKey\b/.test(current)
    && ["invalid_authority_mode", "staff_authority_unreachable", "staff_authority_rejected", "staff_authority_malformed"].every((reason) => current.includes(`"${reason}"`))
    && /client\.rpc\(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION/.test(legacyBranch)
    && !staffBranch.includes("resolveAdminStaffAuthorityShadow")
    && (legacyBranch.match(/resolveAdminStaffAuthorityShadow/g) ?? []).length === 1
    && /resolveVerifiedAdminPermissionContext\(client\)/.test(login)
    && !/resolveVerifiedAdminContext/.test(login)
    && /CurrentAdminPermissionContext/.test(session)
    && !/PlatformAdminContext|permissions\.includes/.test(session)
    && /const permissionContext = await getVerifiedAdminPermissionContext\(\)/.test(page)
    && !/getVerifiedAdminContext|baseContext:/.test(page)
    && state.route === files.route
    && state.navigation === files.navigation
    && state.api === files.api
    && state.vocabulary === files.vocabulary
    && !state.extraMigration;
}

const mutations = [];
function mutate(name, key, anchor, replacement) {
  if (!files[key].includes(anchor)) throw new Error(`stale mutation anchor: ${name}`);
  mutations.push({ name, state: { ...files, [key]: files[key].replace(anchor, replacement) } });
}

mutate("default selector to staff", "selector", 'value === undefined || value === "legacy"', 'value === "legacy"');
mutate("invalid selector falls back legacy", "selector", 'return Object.freeze({ state: "unavailable" as const, reason: "invalid_authority_mode" as const });', 'return Object.freeze({ state: "ready" as const, mode: "legacy" as const });');
mutate("trim selector", "selector", 'const value = env[ADMIN_AUTHORITY_MODE_ENV];', 'const value = env[ADMIN_AUTHORITY_MODE_ENV]?.trim();');
mutate("case-normalize selector", "selector", 'const value = env[ADMIN_AUTHORITY_MODE_ENV];', 'const value = env[ADMIN_AUTHORITY_MODE_ENV]?.toLowerCase();');
mutate("expose NEXT_PUBLIC selector", "selector", "TASTKIND_ADMIN_AUTHORITY_MODE", "NEXT_PUBLIC_TASTKIND_ADMIN_AUTHORITY_MODE");
mutate("union staff and legacy permissions", "context", "permissions: staffPermissions.permissions", "permissions: MUTANT_UNION_LEGACY(authority.context.permissions, staffPermissions.permissions)");
mutate("intersect staff with legacy permissions", "staff", "const permissions = new Set<CurrentAdminPermissionKey>();", "const MUTANT_INTERSECT_LEGACY = true; const permissions = new Set<CurrentAdminPermissionKey>();");
mutate("accept caller-selected subject input", "staff", "resolveAdminStaffPermissionSet(\n  outcome:", "resolveAdminStaffPermissionSet(\n  subject: string,\n  outcome:");
mutate("fallback legacy when staff returns empty", "staff", "if (!permissions.has(BASE_PERMISSION)) {", "if (!permissions.has(BASE_PERMISSION) && permissions.size > 0) {");
mutate("fallback legacy when staff lacks base", "staff", 'return Object.freeze({ state: "not_admin" as const });', 'return Object.freeze({ state: "ready" as const, permissions: Object.freeze([]) });');
mutate("fallback legacy on staff RPC error", "context", 'reason: "staff_authority_rejected" as const', 'reason: "MUTANT_FALLBACK_LEGACY" as const');
mutate("fallback legacy on staff throw", "context", 'reason: "staff_authority_unreachable" as const', 'reason: "MUTANT_FALLBACK_LEGACY" as const');
mutate("accept unknown staff permission", "staff", "if (!isCurrentAdminPermissionKey(row.permission_key)) {", "if (false && !isCurrentAdminPermissionKey(row.permission_key)) {");
mutate("allow staff-only admission", "context", 'authority.context.state !== "admin"', 'authority.context.state === "unauthenticated"');
mutate("skip legacy base admission", "context", '!authority.context.permissions.includes("admin_context.read")', 'false && !authority.context.permissions.includes("admin_context.read")');
mutate("rescue legacy not_admin with staff", "context", "return resolveCurrentAdminPermissionContext({\n      subject: authority.subject,", "const MUTANT_RESCUE_NOT_ADMIN = true; return resolveCurrentAdminPermissionContext({\n      subject: authority.subject,");
mutate("rescue legacy unavailable with staff", "context", "const mode = resolveAdminAuthorityMode();", "const MUTANT_RESCUE_UNAVAILABLE = true; const mode = resolveAdminAuthorityMode();");
mutate("login keeps raw legacy resolver", "login", "resolveVerifiedAdminPermissionContext", "resolveVerifiedAdminContext");
mutate("base routes keep raw legacy resolver", "page", "getVerifiedAdminPermissionContext", "getVerifiedAdminContext");
mutate("staff mode calls legacy branch predicate", "context", "const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);", "await client.rpc(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION); const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);");
mutate("staff mode forward-shadows second RPC", "context", "const staffPermissions = resolveAdminStaffPermissionSet(outcome);", "const MUTANT_FORWARD_SHADOW = await resolveAdminStaffAuthorityShadow(client, authority.context); const staffPermissions = resolveAdminStaffPermissionSet(outcome);");
mutate("staff has-permission fanout", "staff", "staff_current_context_v1", "staff_has_permission_v1");
mutate("duplicate auth.getUser", "context", "userResult = await client.auth.getUser();", "userResult = await client.auth.getUser(); await client.auth.getUser();");
mutate("modify route policy", "route", "const BASE_PERMISSION", "const MUTANT_ROUTE_POLICY = true;\nconst BASE_PERMISSION");
mutate("modify navigation policy", "navigation", "export type AdminNavigationVisibilityModel", "const MUTANT_NAVIGATION_POLICY = true;\nexport type AdminNavigationVisibilityModel");
mutate("modify bearer path", "api", "if (authorizationHeader !== null) {", "if (authorizationHeader === null) {");
mutate("expand permission vocabulary", "vocabulary", '"admin_restaurant_branch.status.write"', '"admin_restaurant_branch.status.write",\n  "admin.future.read"');
mutate("restore divergent session permission check", "session", 'return { state: "allow" };', 'return context.permissions.includes("admin_context.read") ? { state: "allow" } : { state: "access_denied" };');
mutations.push({ name: "add P2D-A migration", state: { ...files, extraMigration: true } });

const results = mutations.map(({ name, state }) => ({ name, killed: !audit(state) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-a-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;

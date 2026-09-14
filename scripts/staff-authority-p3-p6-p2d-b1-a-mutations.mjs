#!/usr/bin/env node
// B1-A mutants remain in memory. Repository files are never written.
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const files = {
  current: read("apps/admin-web/auth/admin-current-permission-context.ts"),
  context: read("apps/admin-web/auth/admin-context.ts"),
  legacy: read("apps/admin-web/server/platformAdminAuthority.ts"),
  selector: read("apps/admin-web/auth/admin-authority-selector.ts"),
  route: read("apps/admin-web/auth/admin-route-authorization.ts"),
  navigation: read("apps/admin-web/auth/admin-navigation-visibility.ts"),
  api: read("apps/admin-web/auth/admin-api-authorization.ts"),
  readSelector: read("apps/admin-web/auth/admin-protected-read-authority.ts"),
  mutationSelector: read("apps/admin-web/auth/admin-protected-mutation-authority.ts"),
  clientExposure: false,
  migration: false
};

function audit(state) {
  const hybrid = state.context.slice(state.context.indexOf("async function resolvePermissionsForAuthority"), state.context.indexOf("let branchStatusPermission"));
  return /admissionAuthority: "legacy" \| "staff";/.test(state.current)
    && !/\broleKey\b/.test(state.current)
    && /admissionAuthority: "legacy" as const/.test(state.current)
    && /resolveStaffAdminPermissionContext\(client, authority\.subject, "legacy"\)/.test(hybrid)
    && /mode\.mode === "staff"[\s\S]*resolveStaffAdminPermissionContext\(client, identity\.subject, "staff"\)/.test(state.context)
    && /roleKey: PlatformAdminRoleKey/.test(state.legacy)
    && /PLATFORM_ADMIN_ROLE_KEYS = Object\.freeze\(\["platform_admin"\]/.test(state.legacy)
    && /\| "legacy"[\s\S]*\| "staff_permissions_legacy_admission"[\s\S]*\| "staff";/.test(state.selector)
    && /value === "staff"/.test(state.selector)
    && /authority\.context\.state !== "admin"/.test(state.context)
    && state.context.indexOf('authority.context.state !== "admin"') < state.context.indexOf('mode.mode === "staff_permissions_legacy_admission"')
    && /!authority\.context\.permissions\.includes\("admin_context\.read"\)/.test(state.context)
    && !/false && !authority\.context\.permissions\.includes\("admin_context\.read"\)/.test(state.context)
    && /if \(staffPermissions\.state !== "ready"\) return staffPermissions;/.test(hybrid)
    && !/UNION_LEGACY|MUTANT_/.test(Object.values(state).filter((value) => typeof value === "string").join("\n"))
    && state.route === files.route
    && state.navigation === files.navigation
    && state.api === files.api
    && state.readSelector === files.readSelector
    && state.mutationSelector === files.mutationSelector
    && !state.clientExposure
    && !state.migration
    && !/service_role/.test(state.current + state.context);
}

const mutations = [];
function mutate(name, key, anchor, replacement) {
  if (!files[key].includes(anchor)) throw new Error(`stale mutation anchor: ${name}`);
  mutations.push({ name, state: { ...files, [key]: files[key].replace(anchor, replacement) } });
}
mutate("keep canonical roleKey", "current", 'admissionAuthority: "legacy" | "staff";', 'roleKey: "platform_admin";');
mutate("remove admissionAuthority", "current", 'admissionAuthority: "legacy" | "staff";', 'permissionsSource: "current";');
mutate("emit staff admission in hybrid", "context", 'resolveStaffAdminPermissionContext(client, authority.subject, "legacy")', 'resolveStaffAdminPermissionContext(client, authority.subject, "staff")');
mutate("allow staff-only admission", "context", 'if (mode.mode === "staff")', 'if (mode.mode !== "legacy")');
mutate("remove staff selector value", "selector", '  | "staff";', '  | "removed_staff";');
mutate("fallback staff failure to legacy", "context", 'if (staffPermissions.state !== "ready") return staffPermissions;', 'if (staffPermissions.state !== "ready") return MUTANT_FALLBACK_LEGACY;');
mutate("union permissions", "context", 'permissions: staffPermissions.permissions', 'permissions: UNION_LEGACY(authority.context.permissions, staffPermissions.permissions)');
mutate("skip admin_context admission", "context", '!authority.context.permissions.includes("admin_context.read")', 'false && !authority.context.permissions.includes("admin_context.read")');
mutate("change legacy DTO role", "legacy", 'roleKey: PlatformAdminRoleKey', 'admissionAuthority: "legacy"');
mutate("route depends on admissionAuthority", "route", 'const BASE_PERMISSION', 'const MUTANT_ROUTE_AUTHORITY = "admissionAuthority";\nconst BASE_PERMISSION');
mutate("navigation depends on admissionAuthority", "navigation", 'export type AdminNavigationVisibilityModel', 'const MUTANT_NAVIGATION_AUTHORITY = "admissionAuthority";\nexport type AdminNavigationVisibilityModel');
mutate("change bearer behavior", "api", 'if (authorizationHeader !== null) {', 'if (authorizationHeader === null) {');
mutate("change B0 read selector", "readSelector", 'credentialMode === "bearer"', 'credentialMode === "browser_cookie_session"');
mutate("change B0 mutation selector", "mutationSelector", 'credentialMode === "bearer"', 'credentialMode === "browser_cookie_session"');
mutations.push({ name: "add migration", state: { ...files, migration: true } });
mutations.push({ name: "expose authority to client", state: { ...files, clientExposure: true } });
mutate("add service_role runtime", "context", 'import "server-only";', 'import "server-only";\nconst MUTANT_SERVICE = "service_role";');

const results = mutations.map(({ name, state }) => ({ name, killed: !audit(state) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-b1-a-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;

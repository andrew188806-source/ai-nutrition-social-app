#!/usr/bin/env node
// B1-B mutants remain in memory. Repository files are never written.
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const files = {
  current: read("apps/admin-web/auth/admin-current-permission-context.ts"),
  context: read("apps/admin-web/auth/admin-context.ts"),
  parser: read("apps/admin-web/auth/admin-staff-permission-authority.ts"),
  selector: read("apps/admin-web/auth/admin-authority-selector.ts"),
  legacy: read("apps/admin-web/server/platformAdminAuthority.ts"),
  route: read("apps/admin-web/auth/admin-route-authorization.ts"),
  navigation: read("apps/admin-web/auth/admin-navigation-visibility.ts"),
  api: read("apps/admin-web/auth/admin-api-authorization.ts"),
  readSelector: read("apps/admin-web/auth/admin-protected-read-authority.ts"),
  mutationSelector: read("apps/admin-web/auth/admin-protected-mutation-authority.ts"),
  clientControlled: false,
  migration: false
};

function audit(state) {
  const staffStart = state.context.indexOf('if (mode.mode === "staff")');
  const legacyStart = state.context.indexOf("const authority = await resolveLegacyAdminAuthority");
  const staffBranch = state.context.slice(staffStart, legacyStart);
  const allText = Object.values(state).filter((value) => typeof value === "string").join("\n");
  return /\| "legacy"[\s\S]*\| "staff_permissions_legacy_admission"[\s\S]*\| "staff";/.test(state.selector)
    && /value === undefined \|\| value === "legacy"[\s\S]{0,180}mode: "legacy" as const/.test(state.selector)
    && /value === "staff"/.test(state.selector)
    && !/\.trim\(|toLowerCase|toUpperCase|NEXT_PUBLIC/.test(state.selector)
    && !/\broleKey\b/.test(state.current)
    && /admissionAuthority: "legacy" \| "staff"/.test(state.current)
    && /admissionAuthority: "legacy" as const/.test(state.current)
    && /resolveStaffAdminPermissionContext\(client, authority\.subject, "legacy"\)/.test(state.context)
    && /resolveStaffAdminPermissionContext\(client, identity\.subject, "staff"\)/.test(state.context)
    && staffStart >= 0 && staffStart < legacyStart
    && !/resolveLegacyAdminAuthority|PLATFORM_ADMIN_CONTEXT_FUNCTION|PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION/.test(staffBranch)
    && (state.context.match(/auth\.getUser\(\)/g) ?? []).length === 1
    && (state.context.match(/client\.rpc\(STAFF_PERMISSION_CONTEXT_FUNCTION\)/g) ?? []).length === 1
    && !/staff_has_permission_v1|STAFF_HAS_PERMISSION/.test(state.context)
    && /if \(!permissions\.has\(BASE_PERMISSION\)\)/.test(state.parser)
    && /return Object\.freeze\(\{ state: "not_admin" as const \}\)/.test(state.parser)
    && /unrecognized_current_permission/.test(state.parser)
    && /if \(staffPermissions\.state !== "ready"\) return staffPermissions;/.test(state.context)
    && !/concat|\.union\(|UNION_LEGACY/.test(state.context)
    && /mode\.mode === "legacy" \? "legacy" as const : "staff" as const/.test(state.readSelector)
    && /mode\.mode === "legacy" \? "legacy" as const : "staff" as const/.test(state.mutationSelector)
    && state.readSelector.indexOf('credentialMode === "bearer"') < state.readSelector.indexOf("const mode = resolveAdminAuthorityMode")
    && state.mutationSelector.indexOf('credentialMode === "bearer"') < state.mutationSelector.indexOf("const mode = resolveAdminAuthorityMode")
    && /roleKey: PlatformAdminRoleKey/.test(state.legacy)
    && !/MUTANT_/.test(allText)
    && !state.clientControlled && !state.migration
    && !/service_role/.test(state.context + state.selector + state.readSelector + state.mutationSelector);
}

const mutations = [];
function mutate(name, key, anchor, replacement) {
  if (!files[key].includes(anchor)) throw new Error(`stale mutation anchor: ${name}`);
  mutations.push({ name, state: { ...files, [key]: files[key].replace(anchor, replacement) } });
}
mutate("staff selector omitted", "selector", '  | "staff";', ';');
mutate("staff selector defaults instead of legacy", "selector", 'mode: "legacy" as const', 'mode: "staff" as const');
mutate("trim staff value", "selector", 'const value = env[ADMIN_AUTHORITY_MODE_ENV];', 'const value = env[ADMIN_AUTHORITY_MODE_ENV]?.trim();');
mutate("case-normalize staff", "selector", 'const value = env[ADMIN_AUTHORITY_MODE_ENV];', 'const value = env[ADMIN_AUTHORITY_MODE_ENV]?.toLowerCase();');
mutate("staff mode still requires legacy admission", "context", 'return resolveStaffAdminPermissionContext(client, identity.subject, "staff");', 'return MUTANT_REQUIRE_LEGACY(identity);');
mutate("staff mode calls legacy fallback", "context", 'if (staffPermissions.state !== "ready") return staffPermissions;', 'if (staffPermissions.state !== "ready") return MUTANT_LEGACY_FALLBACK;');
mutate("staff mode uses legacy permissions", "context", 'permissions: staffPermissions.permissions', 'permissions: MUTANT_LEGACY_PERMISSIONS');
mutate("staff mode unions legacy and staff", "context", 'permissions: staffPermissions.permissions', 'permissions: UNION_LEGACY(staffPermissions.permissions)');
mutate("staff technical failure falls back legacy", "context", 'outcome = Object.freeze({ ok: false as const, reason: "staff_authority_unreachable" as const });', 'outcome = MUTANT_FALLBACK_ON_FAILURE;');
mutate("staff empty context falls back legacy", "parser", 'return Object.freeze({ state: "not_admin" as const });', 'return MUTANT_EMPTY_FALLBACK;');
mutate("staff missing admin_context admitted", "parser", 'if (!permissions.has(BASE_PERMISSION)) {', 'if (MUTANT_IGNORE_BASE && !permissions.has(BASE_PERMISSION)) {');
mutate("unknown staff permission ignored", "parser", 'return Object.freeze({ state: "unavailable" as const, reason: "unrecognized_current_permission" as const });', 'continue; // MUTANT_IGNORE_UNKNOWN');
mutate("staff mode emits legacy admission", "context", 'resolveStaffAdminPermissionContext(client, identity.subject, "staff")', 'resolveStaffAdminPermissionContext(client, identity.subject, "legacy")');
mutate("hybrid emits staff admission", "context", 'resolveStaffAdminPermissionContext(client, authority.subject, "legacy")', 'resolveStaffAdminPermissionContext(client, authority.subject, "staff")');
mutate("legacy emits staff admission", "current", 'admissionAuthority: "legacy" as const', 'admissionAuthority: "staff" as const');
mutate("duplicate auth getUser", "context", 'userResult = await client.auth.getUser();', 'userResult = await client.auth.getUser(); await client.auth.getUser();');
mutate("duplicate staff resolver", "context", 'const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);', 'await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION); const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);');
mutate("staff permission fanout", "context", 'const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);', 'const MUTANT_STAFF_HAS_PERMISSION = "staff_has_permission_v1"; const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);');
mutate("cookie staff read routes legacy", "readSelector", 'mode.mode === "legacy" ? "legacy" as const : "staff" as const', 'MUTANT_COOKIE_STAFF_READ_LEGACY');
mutate("cookie staff mutation routes legacy", "mutationSelector", 'mode.mode === "legacy" ? "legacy" as const : "staff" as const', 'MUTANT_COOKIE_STAFF_MUTATION_LEGACY');
mutate("bearer staff routes staff", "readSelector", 'authority: "legacy" as const', 'authority: MUTANT_BEARER_STAFF');
mutate("bearer invalid becomes unavailable", "mutationSelector", 'if (credentialMode === "bearer") {', 'if (MUTANT_BEARER_CONSULTS_SELECTOR && credentialMode === "bearer") {');
mutate("staff-only allowed hybrid", "context", 'const authority = await resolveLegacyAdminAuthority(client, identity);', 'const authority = MUTANT_HYBRID_WITHOUT_LEGACY;');
mutate("staff-only allowed legacy", "context", 'const authority = await resolveLegacyAdminAuthority(client, identity);', 'const authority = MUTANT_LEGACY_WITHOUT_ADMISSION;');
mutate("ordinary Auth user admitted without admin_context", "parser", 'if (!permissions.has(BASE_PERMISSION)) {', 'if (MUTANT_ANY_AUTH_DENIAL && !permissions.has(BASE_PERMISSION)) {');
mutations.push({ name: "client-controlled selector", state: { ...files, clientControlled: true } });
mutate("NEXT_PUBLIC selector", "selector", 'TASTKIND_ADMIN_AUTHORITY_MODE', 'NEXT_PUBLIC_TASTKIND_ADMIN_AUTHORITY_MODE');
mutate("reintroduce roleKey", "current", 'admissionAuthority: "legacy" | "staff";', 'roleKey: "platform_admin";');
mutations.push({ name: "add migration", state: { ...files, migration: true } });
mutate("use service_role", "context", 'import "server-only";', 'import "server-only";\nconst MUTANT_SERVICE = "service_role";');

const results = mutations.map(({ name, state }) => ({ name, killed: !audit(state) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-b1-b-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;

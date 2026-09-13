#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
function loadTypeScript(file, requireModule = () => { throw new Error(`Unexpected import from ${file}`); }) {
  const result = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
    reportDiagnostics: true
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map((item) => String(item.messageText)).join("\n"));
  const module = { exports: {} };
  new Function("exports", "module", "require", result.outputText)(module.exports, module, requireModule);
  return module.exports;
}

const vocabulary = loadTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const current = loadTypeScript("apps/admin-web/auth/admin-current-permission-context.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected current-context import: ${request}`);
});
const selector = loadTypeScript("apps/admin-web/auth/admin-authority-selector.ts", (request) => {
  if (request === "server-only") return {};
  throw new Error(`Unexpected selector import: ${request}`);
});
const staffAuthority = loadTypeScript("apps/admin-web/auth/admin-staff-permission-authority.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected staff authority import: ${request}`);
});
const shadow = loadTypeScript("apps/admin-web/auth/admin-staff-authority-shadow.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected shadow import: ${request}`);
});
const legacy = loadTypeScript("apps/admin-web/server/platformAdminAuthority.ts", (request) => {
  if (request === "server-only") return {};
  throw new Error(`Unexpected legacy import: ${request}`);
});
const adminContext = loadTypeScript("apps/admin-web/auth/admin-context.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "next/cache") return { unstable_noStore: () => {} };
  if (request === "react") return { cache: (callback) => callback };
  if (request === "@supabase/supabase-js") return { isAuthSessionMissingError: () => false };
  if (request === "../server/platformAdminAuthority") return legacy;
  if (request === "../server/platformAdminBranchStatusAuthority") return { PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION: "admin_restaurant_branch.status.write" };
  if (request === "../config/admin-auth") return { getAdminAuthConfig: () => ({ state: "unavailable" }) };
  if (request === "./admin-authority-selector") return selector;
  if (request === "./admin-current-permission-context") return current;
  if (request === "./admin-staff-permission-authority") return staffAuthority;
  if (request === "./admin-staff-authority-shadow") return shadow;
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused"); } };
  throw new Error(`Unexpected Admin context import: ${request}`);
});
const sessionGate = loadTypeScript("apps/admin-web/auth/admin-session-gate.ts");
const registry = loadTypeScript("apps/admin-web/auth/admin-route-registry.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected registry import: ${request}`);
});
const routeAuthorization = loadTypeScript("apps/admin-web/auth/admin-route-authorization.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-current-permission-context") return current;
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected route import: ${request}`);
});
const navigation = loadTypeScript("apps/admin-web/auth/admin-navigation-visibility.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-route-authorization") return routeAuthorization;
  throw new Error(`Unexpected navigation import: ${request}`);
});
const apiAuthorization = loadTypeScript("apps/admin-web/auth/admin-api-authorization.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-current-permission-context") return current;
  if (request === "./admin-context") return { getVerifiedAdminPermissionContext: () => { throw new Error("unused"); } };
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused"); } };
  throw new Error(`Unexpected API import: ${request}`);
});
const readSelector = loadTypeScript("apps/admin-web/auth/admin-protected-read-authority.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-authority-selector") return selector;
  throw new Error(`Unexpected read-selector import: ${request}`);
});
const mutationSelector = loadTypeScript("apps/admin-web/auth/admin-protected-mutation-authority.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-authority-selector") return selector;
  throw new Error(`Unexpected mutation-selector import: ${request}`);
});

const subject = "11111111-1111-4111-8111-111111111111";
const base = "admin_context.read", audit = "admin_audit.read", branch = "admin_restaurant_branch.status.write";
const rows = (permissions) => permissions.map((permission_key) => ({ permission_key }));
const legacyRows = (permissions = [base, audit]) => permissions.map((permission_key) => ({
  role_key: "platform_admin",
  permission_key,
  permission_scope: permission_key === base ? "self" : "platform"
}));

function fakeClient(options = {}) {
  const calls = { getUser: 0, rpc: [] };
  return {
    calls,
    client: {
      auth: { getUser: async () => {
        calls.getUser += 1;
        if (options.unauthenticated) return { data: { user: null }, error: null };
        return { data: { user: { id: subject, is_anonymous: false } }, error: null };
      } },
      rpc: async (name) => {
        calls.rpc.push(name);
        if (name === "platform_admin_current_context_v1") {
          if (options.legacyThrow) throw new Error("legacy unavailable");
          if (options.legacyError) return { data: null, error: new Error("legacy rejected") };
          return { data: options.legacyNotAdmin ? [] : legacyRows(options.legacyPermissions), error: null };
        }
        if (name === "platform_admin_has_permission_v1") return { data: options.branchGranted ?? true, error: null };
        if (name === "staff_current_context_v1") {
          if (options.staffThrow) throw new Error("staff unavailable");
          return { data: options.staffData ?? rows([base, audit, branch]), error: options.staffError ? new Error("staff rejected") : null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      }
    }
  };
}

async function resolve(mode, options = {}) {
  const prior = process.env.TASTKIND_ADMIN_AUTHORITY_MODE;
  if (mode === undefined) delete process.env.TASTKIND_ADMIN_AUTHORITY_MODE;
  else process.env.TASTKIND_ADMIN_AUTHORITY_MODE = mode;
  const fake = fakeClient(options);
  try { return { context: await adminContext.resolveVerifiedAdminPermissionContext(fake.client), calls: fake.calls }; }
  finally {
    if (prior === undefined) delete process.env.TASTKIND_ADMIN_AUTHORITY_MODE;
    else process.env.TASTKIND_ADMIN_AUTHORITY_MODE = prior;
  }
}

const cases = [], test = (name, run) => cases.push([name, run]);
test("01 selector missing defaults legacy", () => assert.deepEqual(selector.resolveAdminAuthorityMode({}), { state: "ready", mode: "legacy" }));
test("02 selector legacy", () => assert.equal(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: "legacy" }).mode, "legacy"));
test("03 selector hybrid", () => assert.equal(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: "staff_permissions_legacy_admission" }).mode, "staff_permissions_legacy_admission"));
test("04 selector staff", () => assert.equal(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: "staff" }).mode, "staff"));
for (const value of ["", "STAFF", " staff", "staff ", "staff_native", "dual", "auto"]) {
  test(`selector rejects ${JSON.stringify(value)}`, () => assert.equal(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: value }).state, "unavailable"));
}
test("12 legacy healthy", async () => assert.deepEqual((await resolve("legacy", { branchGranted: false })).context, { state: "admin", subject, admissionAuthority: "legacy", permissions: [audit, base] }));
test("13 hybrid healthy", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([base, audit]) })).context, { state: "admin", subject, admissionAuthority: "legacy", permissions: [audit, base] }));
test("14 staff-only healthy", async () => { const r = await resolve("staff", { legacyThrow: true, staffData: rows([base, audit]) }); assert.deepEqual(r.context, { state: "admin", subject, admissionAuthority: "staff", permissions: [audit, base] }); assert.deepEqual(r.calls.rpc, ["staff_current_context_v1"]); });
test("15 staff ignores legacy not_admin", async () => assert.equal((await resolve("staff", { legacyNotAdmin: true })).context.state, "admin"));
test("16 staff ignores legacy unavailable", async () => assert.equal((await resolve("staff", { legacyThrow: true })).context.state, "admin"));
test("17 staff empty is not_admin", async () => assert.deepEqual((await resolve("staff", { staffData: [] })).context, { state: "not_admin" }));
test("18 staff without context is not_admin", async () => assert.deepEqual((await resolve("staff", { staffData: rows([audit]) })).context, { state: "not_admin" }));
test("19 staff RPC error unavailable", async () => assert.equal((await resolve("staff", { staffError: true })).context.reason, "staff_authority_rejected"));
test("20 staff RPC throw unavailable", async () => assert.equal((await resolve("staff", { staffThrow: true })).context.reason, "staff_authority_unreachable"));
test("21 malformed staff unavailable", async () => assert.equal((await resolve("staff", { staffData: [{ permission_key: 7 }] })).context.reason, "staff_authority_malformed"));
test("22 unknown staff permission unavailable", async () => assert.equal((await resolve("staff", { staffData: rows([base, "future.permission"]) })).context.reason, "unrecognized_current_permission"));
test("23 invalid selector authenticated unavailable", async () => assert.equal((await resolve("unknown")).context.reason, "invalid_authority_mode"));
test("24 unauthenticated precedes invalid selector", async () => assert.deepEqual((await resolve("unknown", { unauthenticated: true })).context, { state: "unauthenticated" }));
test("25 staff exact permissions preserved", async () => assert.deepEqual((await resolve("staff", { staffData: rows([branch, base]) })).context.permissions, [base, branch]));
test("26 staff permissions do not union legacy", async () => assert.deepEqual((await resolve("staff", { legacyPermissions: [base, audit], staffData: rows([base]) })).context.permissions, [base]));
test("27 staff failure has no legacy fallback", async () => { const r = await resolve("staff", { staffThrow: true }); assert.equal(r.context.state, "unavailable"); assert.ok(!r.calls.rpc.includes("platform_admin_current_context_v1")); });
test("28 staff call counts exact", async () => { const r = await resolve("staff"); assert.equal(r.calls.getUser, 1); assert.deepEqual(r.calls.rpc, ["staff_current_context_v1"]); });
test("29 hybrid call pattern preserved", async () => { const r = await resolve("staff_permissions_legacy_admission"); assert.deepEqual(r.calls.rpc, ["platform_admin_current_context_v1", "staff_current_context_v1"]); });
test("30 legacy call pattern preserved", async () => { const r = await resolve("legacy"); assert.deepEqual(r.calls.rpc, ["platform_admin_current_context_v1", "platform_admin_has_permission_v1"]); });
test("31 staff-only legacy refused", async () => assert.equal((await resolve("legacy", { legacyNotAdmin: true })).context.state, "not_admin"));
test("32 staff-only hybrid refused", async () => { const r = await resolve("staff_permissions_legacy_admission", { legacyNotAdmin: true }); assert.equal(r.context.state, "not_admin"); assert.ok(!r.calls.rpc.includes("staff_current_context_v1")); });
test("33 staff-only staff accepted", async () => assert.equal((await resolve("staff", { legacyNotAdmin: true })).context.state, "admin"));
test("34 login remains canonical", () => { const source = read("apps/admin-web/app/admin/login/actions.ts"); assert.match(source, /resolveVerifiedAdminPermissionContext\(client\)/); assert.match(source, /decision\.state === "allow"/); });
test("35 session accepts staff canonical", () => assert.equal(sessionGate.decideAdminSessionGate({ state: "admin", subject, admissionAuthority: "staff", permissions: [base] }).state, "allow"));
test("36 base route accepts staff canonical", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: { state: "base_admin" }, currentPermissionContext: { state: "admin", subject, admissionAuthority: "staff", permissions: [base] } }).state, "allow_base_admin"));
test("37 Audit route follows staff permissions", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: { state: "current_permissions", permissions: [audit] }, currentPermissionContext: { state: "admin", subject, admissionAuthority: "staff", permissions: [base, audit] } }).state, "allow_current_permission"));
test("38 Branch route denied without permission", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: { state: "current_permissions", permissions: [branch] }, currentPermissionContext: { state: "admin", subject, admissionAuthority: "staff", permissions: [base, audit] } }).state, "permission_denied"));
test("39 navigation follows staff permissions", () => { const result = navigation.deriveAdminNavigationVisibility({ state: "admin", subject, admissionAuthority: "staff", permissions: [base, branch] }); assert.equal(result.state, "ready"); assert.ok(!result.linkRouteIds.includes("audit")); assert.ok(result.linkRouteIds.includes("restaurant-branch-status")); });
test("40 cookie Audit accepts staff context", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, audit, { resolvePermissionContext: async () => ({ state: "admin", subject, admissionAuthority: "staff", permissions: [base, audit] }), resolveSessionSnapshot: async () => ({ subject, accessToken: "fixture-token" }) })).mode, "browser_cookie_session"));
test("41 cookie Audit denies missing permission", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, audit, { resolvePermissionContext: async () => ({ state: "admin", subject, admissionAuthority: "staff", permissions: [base] }), resolveSessionSnapshot: async () => ({ subject, accessToken: "fixture-token" }) })).state, "forbidden"));
test("42 cookie Branch accepts staff context", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, branch, { resolvePermissionContext: async () => ({ state: "admin", subject, admissionAuthority: "staff", permissions: [base, branch] }), resolveSessionSnapshot: async () => ({ subject, accessToken: "fixture-token" }) })).mode, "browser_cookie_session"));
test("43 bearer remains frozen", async () => assert.deepEqual(await apiAuthorization.resolveAdminApiAuthorization("Bearer frozen.token", audit), { state: "authorized", mode: "bearer", authorization: "Bearer frozen.token" }));
for (const [mode, cookieAuthority] of [["legacy", "legacy"], ["staff_permissions_legacy_admission", "staff"], ["staff", "staff"]]) {
  test(`read selector ${mode}`, () => { assert.equal(readSelector.resolveAdminProtectedReadAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: mode }).authority, cookieAuthority); assert.equal(readSelector.resolveAdminProtectedReadAuthority("bearer", { TASTKIND_ADMIN_AUTHORITY_MODE: mode }).authority, "legacy"); });
  test(`mutation selector ${mode}`, () => { assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: mode }).authority, cookieAuthority); assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("bearer", { TASTKIND_ADMIN_AUTHORITY_MODE: mode }).authority, "legacy"); });
}
test("50 invalid cookie selectors unavailable", () => { assert.equal(readSelector.resolveAdminProtectedReadAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: "invalid" }).state, "unavailable"); assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: "invalid" }).state, "unavailable"); });
test("51 bearer ignores invalid selector", () => { assert.equal(readSelector.resolveAdminProtectedReadAuthority("bearer", { TASTKIND_ADMIN_AUTHORITY_MODE: "invalid" }).authority, "legacy"); assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("bearer", { TASTKIND_ADMIN_AUTHORITY_MODE: "invalid" }).authority, "legacy"); });
test("52 staff-only protected operation integration", async () => { const r = await resolve("staff", { legacyThrow: true }); assert.equal(r.context.state, "admin"); assert.deepEqual(r.calls.rpc, ["staff_current_context_v1"]); for (const permission of [audit, branch]) assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, permission, { resolvePermissionContext: async () => r.context, resolveSessionSnapshot: async () => ({ subject, accessToken: "fixture-token" }) })).state, "authorized"); assert.equal(readSelector.resolveAdminProtectedReadAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: "staff" }).authority, "staff"); assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: "staff" }).authority, "staff"); });
test("53 mid-session revoke and regain", async () => { assert.equal((await resolve("staff")).context.state, "admin"); assert.equal((await resolve("staff", { staffData: [] })).context.state, "not_admin"); assert.equal((await resolve("staff")).context.state, "admin"); });

let passed = 0; const failures = [];
for (const [name, run] of cases) {
  try { await run(); passed += 1; console.log(`PASS ${String(passed + failures.length).padStart(2, "0")} ${name}`); }
  catch (error) { failures.push({ name, error: error instanceof Error ? error.message : String(error) }); console.log(`FAIL ${String(passed + failures.length).padStart(2, "0")} ${name}`); }
}
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-b1-b-smoke", total: cases.length, passed, failed: failures.length, failures, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;

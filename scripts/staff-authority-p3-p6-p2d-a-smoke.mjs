#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
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
  if (request === "./admin-context") return { getVerifiedAdminPermissionContext: () => { throw new Error("unused default"); } };
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused default"); } };
  throw new Error(`Unexpected API import: ${request}`);
});

const subject = "11111111-1111-4111-8111-111111111111";
const base = "admin_context.read";
const audit = "admin_audit.read";
const branch = "admin_restaurant_branch.status.write";
const rows = (permissions) => permissions.map((permission_key) => ({ permission_key }));
const legacyRows = (permissions = [base, audit]) => permissions.map((permission_key) => ({
  role_key: "platform_admin",
  permission_key,
  permission_scope: permission_key === base ? "self" : "platform"
}));

function fakeClient(options = {}) {
  const calls = { getUser: 0, rpc: [] };
  const client = {
    auth: {
      getUser: async () => {
        calls.getUser += 1;
        if (options.authThrow) throw new Error("auth transport detail");
        if (options.unauthenticated) return { data: { user: null }, error: null };
        return { data: { user: { id: subject, is_anonymous: false } }, error: null };
      }
    },
    rpc: async (name) => {
      calls.rpc.push(name);
      if (name === "platform_admin_current_context_v1") {
        if (options.legacyThrow) throw new Error("legacy transport detail");
        if (options.legacyError) return { data: null, error: new Error("legacy rejected") };
        if (options.legacyNotAdmin) return { data: [], error: null };
        return { data: legacyRows(options.legacyPermissions), error: null };
      }
      if (name === "platform_admin_has_permission_v1") {
        return { data: options.branchGranted ?? true, error: options.branchError ? new Error("branch rejected") : null };
      }
      if (name === "staff_current_context_v1") {
        if (options.staffThrow) throw new Error("staff transport detail");
        return { data: options.staffData ?? rows([base, audit, branch]), error: options.staffError ? new Error("staff rejected") : null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };
  return { client, calls };
}

async function withAuthorityEnv(mode, shadowMode, run) {
  const beforeMode = process.env.TASTKIND_ADMIN_AUTHORITY_MODE;
  const beforeShadow = process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW;
  if (mode === undefined) delete process.env.TASTKIND_ADMIN_AUTHORITY_MODE;
  else process.env.TASTKIND_ADMIN_AUTHORITY_MODE = mode;
  if (shadowMode === undefined) delete process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW;
  else process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW = shadowMode;
  try { return await run(); }
  finally {
    if (beforeMode === undefined) delete process.env.TASTKIND_ADMIN_AUTHORITY_MODE;
    else process.env.TASTKIND_ADMIN_AUTHORITY_MODE = beforeMode;
    if (beforeShadow === undefined) delete process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW;
    else process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW = beforeShadow;
  }
}

async function resolve(mode, options = {}, shadowMode) {
  const fake = fakeClient(options);
  const context = await withAuthorityEnv(mode, shadowMode, () => adminContext.resolveVerifiedAdminPermissionContext(fake.client));
  return { context, calls: fake.calls };
}

const cases = [];
const test = (name, run) => cases.push([name, run]);
test("A default legacy selector", () => assert.deepEqual(selector.resolveAdminAuthorityMode({}), { state: "ready", mode: "legacy" }));
test("B exact legacy selector", () => assert.deepEqual(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: "legacy" }), { state: "ready", mode: "legacy" }));
test("C exact staff transitional selector", () => assert.deepEqual(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: "staff_permissions_legacy_admission" }), { state: "ready", mode: "staff_permissions_legacy_admission" }));
for (const [label, value] of [["empty", ""], ["uppercase", "LEGACY"], ["leading space", " legacy"], ["trailing space", "legacy "], ["staff alias", "staff_native"], ["dual alias", "dual"], ["unknown", "unknown"]]) {
  test(`selector rejects ${label}`, () => assert.equal(selector.resolveAdminAuthorityMode({ TASTKIND_ADMIN_AUTHORITY_MODE: value }).state, "unavailable"));
}
test("D missing selector preserves exact legacy three", async () => {
  const result = await resolve(undefined);
  assert.deepEqual(result.context.permissions, [audit, base, branch]);
  assert.deepEqual(result.calls.rpc, ["platform_admin_current_context_v1", "platform_admin_has_permission_v1"]);
});
test("E exact legacy preserves exact legacy subset", async () => {
  const result = await resolve("legacy", { branchGranted: false });
  assert.deepEqual(result.context.permissions, [audit, base]);
});
test("F legacy shadow mismatch cannot change authority", async () => {
  const result = await resolve("legacy", { staffData: rows([base]) }, "enabled");
  assert.deepEqual(result.context.permissions, [audit, base, branch]);
  assert.equal(result.calls.rpc.filter((name) => name === "staff_current_context_v1").length, 1);
});
test("G staff exact three", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission")).context.permissions, [audit, base, branch]));
test("H staff exact subset", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([base, audit]) })).context.permissions, [audit, base]));
test("I staff exact context only", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([base]) })).context.permissions, [base]));
test("J staff missing base is not_admin", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffData: rows([audit]) })).context.state, "not_admin"));
test("K zero staff permissions is not_admin", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffData: [] })).context.state, "not_admin"));
test("L no union", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([base]) })).context.permissions, [base]));
test("M no legacy permission ceiling or intersection", async () => {
  const result = await resolve("staff_permissions_legacy_admission", { legacyPermissions: [base], branchGranted: false, staffData: rows([base, audit, branch]) });
  assert.deepEqual(result.context.permissions, [audit, base, branch]);
  assert.ok(!result.calls.rpc.includes("platform_admin_has_permission_v1"));
});
test("N staff RPC error unavailable", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffError: true })).context.reason, "staff_authority_rejected"));
test("O staff RPC throw unavailable", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffThrow: true })).context.reason, "staff_authority_unreachable"));
test("P malformed staff response unavailable", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffData: {} })).context.reason, "staff_authority_malformed"));
test("Q malformed staff row unavailable", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffData: [{}] })).context.reason, "staff_authority_malformed"));
test("R unknown staff permission unavailable", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffData: rows([base, "admin.future.read"]) })).context.reason, "unrecognized_current_permission"));
test("S duplicate staff rows deduplicate", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([base, audit, audit]) })).context.permissions, [audit, base]));
test("T legacy not_admin cannot be rescued", async () => {
  const result = await resolve("staff_permissions_legacy_admission", { legacyNotAdmin: true });
  assert.equal(result.context.state, "not_admin");
  assert.ok(!result.calls.rpc.includes("staff_current_context_v1"));
});
test("U legacy unavailable cannot be rescued", async () => {
  const result = await resolve("staff_permissions_legacy_admission", { legacyError: true });
  assert.equal(result.context.state, "unavailable");
  assert.ok(!result.calls.rpc.includes("staff_current_context_v1"));
});
test("V staff-only identity is denied", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { legacyNotAdmin: true, staffData: rows([base, audit]) })).context.state, "not_admin"));
test("W invalid selector fails closed after verified identity", async () => {
  const result = await resolve("staff_native");
  assert.deepEqual(result.context, { state: "unavailable", reason: "invalid_authority_mode" });
  assert.deepEqual(result.calls.rpc, []);
});
test("X unauthenticated classification precedes invalid selector", async () => assert.equal((await resolve("staff_native", { unauthenticated: true })).context.state, "unauthenticated"));
test("Y staff mode plus shadow enabled makes one staff RPC", async () => {
  const result = await resolve("staff_permissions_legacy_admission", {}, "enabled");
  assert.equal(result.calls.rpc.filter((name) => name === "staff_current_context_v1").length, 1);
  assert.ok(!result.calls.rpc.includes("platform_admin_has_permission_v1"));
});
test("Z one auth.getUser call", async () => assert.equal((await resolve("staff_permissions_legacy_admission")).calls.getUser, 1));
test("AA session gate accepts canonical admin", () => assert.equal(sessionGate.decideAdminSessionGate({ state: "admin", subject, admissionAuthority: "legacy", permissions: [base] }).state, "allow"));
test("AB session gate denies canonical not_admin", () => assert.equal(sessionGate.decideAdminSessionGate({ state: "not_admin" }).state, "access_denied"));
test("AC session gate preserves unavailable", () => assert.equal(sessionGate.decideAdminSessionGate({ state: "unavailable", reason: "staff_authority_rejected" }).state, "authority_unavailable"));
test("AD login uses canonical resolver", () => {
  const source = read("apps/admin-web/app/admin/login/actions.ts");
  assert.match(source, /resolveVerifiedAdminPermissionContext\(client\)/);
  assert.doesNotMatch(source, /resolveVerifiedAdminContext/);
});
test("AE base-route old bypass is closed", () => {
  const source = read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx");
  assert.doesNotMatch(source, /getVerifiedAdminContext|baseContext:/);
  assert.match(source, /const permissionContext = await getVerifiedAdminPermissionContext\(\)/);
});
const staffSubset = Object.freeze({ state: "admin", subject, admissionAuthority: "legacy", permissions: Object.freeze([audit, base]) });
const auditRoute = registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "audit");
const branchRoute = registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "restaurant-branch-status");
test("AF current Audit route follows staff subset", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: routeAuthorization.resolveAdminRouteRequirement(auditRoute), currentPermissionContext: staffSubset }).state, "allow_current_permission"));
test("AG current Branch route follows staff subset", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: routeAuthorization.resolveAdminRouteRequirement(branchRoute), currentPermissionContext: staffSubset }).state, "permission_denied"));
test("AH navigation follows exact staff subset", () => {
  const visible = navigation.deriveAdminNavigationVisibility(staffSubset);
  assert.equal(visible.state, "ready");
  assert.ok(visible.linkRouteIds.includes("audit"));
  assert.ok(!visible.linkRouteIds.includes("restaurant-branch-status"));
});
test("AI cookie Audit filtering", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, audit, { resolvePermissionContext: async () => ({ ...staffSubset, permissions: [base] }), resolveSessionSnapshot: async () => ({ subject, accessToken: "token" }) })).state, "forbidden"));
test("AJ cookie Branch filtering", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, branch, { resolvePermissionContext: async () => staffSubset, resolveSessionSnapshot: async () => ({ subject, accessToken: "token" }) })).state, "forbidden"));
test("AK explicit bearer path untouched", async () => assert.deepEqual(await apiAuthorization.resolveAdminApiAuthorization("Bearer frozen.token", audit, { resolvePermissionContext: async () => { throw new Error("must not call"); }, resolveSessionSnapshot: async () => { throw new Error("must not call"); } }), { state: "authorized", mode: "bearer", authorization: "Bearer frozen.token" }));
test("AL malformed explicit bearer cannot fall back", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization("malformed", audit, { resolvePermissionContext: async () => staffSubset, resolveSessionSnapshot: async () => ({ subject, accessToken: "token" }) })).mode, "bearer"));
test("AM current vocabulary includes bounded P3B successor", () => assert.deepEqual([...vocabulary.CURRENT_ADMIN_PERMISSION_KEYS], [audit, base, "admin.management.staff.account.write", branch]));

let passed = 0;
const failures = [];
for (const [name, run] of cases) {
  try { await run(); passed += 1; console.log(`PASS ${String(passed + failures.length).padStart(2, "0")} ${name}`); }
  catch (error) { failures.push({ name, error: error instanceof Error ? error.message : String(error) }); console.log(`FAIL ${String(passed + failures.length).padStart(2, "0")} ${name}`); }
}
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-a-smoke", total: cases.length, passed, failed: failures.length, failures, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;

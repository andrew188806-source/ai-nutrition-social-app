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
test("A legacy healthy canonical context", async () => assert.deepEqual((await resolve("legacy", { branchGranted: false })).context, { state: "admin", subject, admissionAuthority: "legacy", permissions: [audit, base] }));
test("B hybrid healthy canonical context", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([base, audit]) })).context, { state: "admin", subject, admissionAuthority: "legacy", permissions: [audit, base] }));
test("C legacy admissionAuthority", async () => assert.equal((await resolve("legacy")).context.admissionAuthority, "legacy"));
test("D hybrid admissionAuthority remains legacy", async () => assert.equal((await resolve("staff_permissions_legacy_admission")).context.admissionAuthority, "legacy"));
test("E canonical roleKey absent", async () => assert.ok(!Object.hasOwn((await resolve("legacy")).context, "roleKey")));
test("F staff-only hypothetical user denied", async () => { const r = await resolve("staff_permissions_legacy_admission", { legacyNotAdmin: true, staffData: rows([base, audit, branch]) }); assert.equal(r.context.state, "not_admin"); assert.ok(!r.calls.rpc.includes("staff_current_context_v1")); });
test("G legacy not_admin unchanged", async () => assert.deepEqual((await resolve("legacy", { legacyNotAdmin: true })).context, { state: "not_admin" }));
test("H legacy unavailable unchanged", async () => assert.equal((await resolve("legacy", { legacyError: true })).context.state, "unavailable"));
test("I unauthenticated unchanged", async () => assert.deepEqual((await resolve("legacy", { unauthenticated: true })).context, { state: "unauthenticated" }));
test("J invalid selector unchanged", async () => assert.deepEqual((await resolve("staff")).context, { state: "unavailable", reason: "invalid_authority_mode" }));
test("K hybrid staff technical failure unavailable", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffError: true })).context.reason, "staff_authority_rejected"));
test("L hybrid missing admin_context not_admin", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffData: rows([audit]) })).context.state, "not_admin"));
test("M exact permissions preserved", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { staffData: rows([branch, base]) })).context.permissions, [base, branch]));
test("N no permission union", async () => assert.deepEqual((await resolve("staff_permissions_legacy_admission", { legacyPermissions: [base, audit], staffData: rows([base]) })).context.permissions, [base]));
test("O no staff failure fallback", async () => assert.equal((await resolve("staff_permissions_legacy_admission", { staffThrow: true })).context.reason, "staff_authority_unreachable"));
test("P login contract unchanged", () => { const source = read("apps/admin-web/app/admin/login/actions.ts"); assert.match(source, /resolveVerifiedAdminPermissionContext\(client\)/); assert.match(source, /decision\.state === "allow"/); });
test("Q session gate unchanged", () => assert.equal(sessionGate.decideAdminSessionGate({ state: "admin", subject, admissionAuthority: "legacy", permissions: [base] }).state, "allow"));
test("R base route unchanged", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: { state: "base_admin" }, currentPermissionContext: { state: "admin", subject, admissionAuthority: "legacy", permissions: [base] } }).state, "allow_base_admin"));
test("S current route permission filtering unchanged", () => assert.equal(routeAuthorization.resolveAdminRouteAuthorization({ requirement: { state: "current_permissions", permissions: [audit] }, currentPermissionContext: { state: "admin", subject, admissionAuthority: "legacy", permissions: [base] } }).state, "permission_denied"));
test("T navigation filtering unchanged", () => { const result = navigation.deriveAdminNavigationVisibility({ state: "admin", subject, admissionAuthority: "legacy", permissions: [base, audit] }); assert.equal(result.state, "ready"); assert.ok(result.linkRouteIds.includes("audit")); assert.ok(!result.linkRouteIds.includes("restaurant-branch-status")); });
test("U cookie Audit authorization unchanged", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, audit, { resolvePermissionContext: async () => ({ state: "admin", subject, admissionAuthority: "legacy", permissions: [base, audit] }), resolveSessionSnapshot: async () => ({ subject, accessToken: "fixture-token" }) })).mode, "browser_cookie_session"));
test("V cookie Branch authorization unchanged", async () => assert.equal((await apiAuthorization.resolveAdminApiAuthorization(null, branch, { resolvePermissionContext: async () => ({ state: "admin", subject, admissionAuthority: "legacy", permissions: [base] }), resolveSessionSnapshot: async () => ({ subject, accessToken: "fixture-token" }) })).state, "forbidden"));
test("W bearer behavior unchanged", async () => assert.deepEqual(await apiAuthorization.resolveAdminApiAuthorization("Bearer frozen.token", audit), { state: "authorized", mode: "bearer", authorization: "Bearer frozen.token" }));
test("X B0 read selection unchanged", () => { assert.equal(readSelector.resolveAdminProtectedReadAuthority("bearer", { TASTKIND_ADMIN_AUTHORITY_MODE: "staff_permissions_legacy_admission" }).authority, "legacy"); assert.equal(readSelector.resolveAdminProtectedReadAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: "staff_permissions_legacy_admission" }).authority, "staff"); });
test("Y B0 mutation selection unchanged", () => { assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("bearer", { TASTKIND_ADMIN_AUTHORITY_MODE: "staff_permissions_legacy_admission" }).authority, "legacy"); assert.equal(mutationSelector.resolveAdminProtectedMutationAuthority("browser_cookie_session", { TASTKIND_ADMIN_AUTHORITY_MODE: "staff_permissions_legacy_admission" }).authority, "staff"); });

let passed = 0; const failures = [];
for (const [name, run] of cases) {
  try { await run(); passed += 1; console.log(`PASS ${String(passed + failures.length).padStart(2, "0")} ${name}`); }
  catch (error) { failures.push({ name, error: error instanceof Error ? error.message : String(error) }); console.log(`FAIL ${String(passed + failures.length).padStart(2, "0")} ${name}`); }
}
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-b1-a-smoke", total: cases.length, passed, failed: failures.length, failures, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;

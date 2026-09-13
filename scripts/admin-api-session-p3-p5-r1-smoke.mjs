#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
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

const adminRequire = createRequire(path.join(root, "apps/admin-web/package.json"));
const { AuthSessionMissingError, isAuthSessionMissingError } = adminRequire("@supabase/supabase-js");
const authority = loadTypeScript("apps/admin-web/server/platformAdminAuthority.ts", (request) => {
  if (request === "server-only") return {};
  throw new Error(`Unexpected authority import: ${request}`);
});
const vocabulary = loadTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const currentPermissions = loadTypeScript("apps/admin-web/auth/admin-current-permission-context.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected permission import: ${request}`);
});
const adminContext = loadTypeScript("apps/admin-web/auth/admin-context.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "next/cache") return { unstable_noStore: () => {}, default: () => {} };
  if (request === "react") return { cache: (callback) => callback };
  if (request === "@supabase/supabase-js") return { isAuthSessionMissingError };
  if (request === "../server/platformAdminAuthority") return authority;
  if (request === "../server/platformAdminBranchStatusAuthority") {
    return { PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION: "admin_restaurant_branch.status.write" };
  }
  if (request === "../config/admin-auth") return { getAdminAuthConfig: () => ({ state: "unavailable" }) };
  if (request === "./admin-current-permission-context") return currentPermissions;
  if (request === "./admin-staff-authority-shadow") return { resolveAdminStaffAuthorityShadow: async () => ({ state: "disabled" }) };
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused"); } };
  throw new Error(`Unexpected Admin context import: ${request}`);
});

const apiHelper = loadTypeScript("apps/admin-web/auth/admin-api-authorization.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-current-permission-context") return currentPermissions;
  if (request === "./admin-context") return { getVerifiedAdminPermissionContext: async () => ({ state: "unavailable" }) };
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused"); } };
  throw new Error(`Unexpected API helper import: ${request}`);
});

const auditRuntime = loadTypeScript("apps/admin-web/server/platformAdminAuditRuntime.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./platformAdminAuditTransport") return { getPlatformAdminAuditConfig: () => ({ mode: "live" }) };
  if (request === "./platformAdminAuditRead") return {
    readPlatformAdminAudit: async (authorization) => authorization === "Malformed"
      ? { state: "forbidden" }
      : { state: "ready", events: [], page: 1, pageSize: 20, hasNextPage: false, sourceWindow: 500 }
  };
  if (request === "../auth/admin-api-authorization") return apiHelper;
  throw new Error(`Unexpected Audit runtime import: ${request}`);
});

const branchAuthority = {
  PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT: 2048,
  PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION: "admin_restaurant_branch.status.write",
  readVerifiedBearer: (value) => typeof value === "string" && /^Bearer [A-Za-z0-9._~-]+$/.test(value) ? value : null,
  readBoundedIdentity: (value) => typeof value === "string" && value.length > 0 ? value : null,
  parseMutationRequest: () => ({}),
  parseMutationResult: () => ({ state: "ready" }),
  parsePreviewRows: () => ({ state: "ready" })
};
const branchRuntime = loadTypeScript("apps/admin-web/server/platformAdminBranchStatusRuntime.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./platformAdminBranchStatusAuthority") return branchAuthority;
  if (request === "./platformAdminBranchStatusTransport") return {
    BranchStatusTransportError: class BranchStatusTransportError extends Error {},
    getPlatformAdminBranchStatusConfig: () => ({ mode: "live" }),
    createPlatformAdminBranchStatusTransport: () => { throw new Error("unexpected transport"); }
  };
  if (request === "../auth/admin-api-authorization") return apiHelper;
  throw new Error(`Unexpected Branch runtime import: ${request}`);
});

const subject = "11111111-1111-4111-8111-111111111111";
const resultClient = (result, rpc = async () => { throw new Error("unexpected rpc"); }) => ({
  auth: { getUser: async () => result },
  rpc
});
const thrownClient = { auth: { getUser: async () => { throw new Error("transport failure"); } } };
const noUser = (error = null) => ({ data: { user: null }, error });
const stateFor = async (result) => (await adminContext.resolveVerifiedAdminContext(resultClient(result))).state;
const permissionFor = async (result) => adminContext.resolveVerifiedAdminPermissionContext(resultClient(result));
const cookieResolverFor = (result) => async (authorization, permission) => apiHelper.resolveAdminApiAuthorization(
  authorization,
  permission,
  {
    resolvePermissionContext: () => permissionFor(result),
    resolveSessionSnapshot: async () => { throw new Error("session must not be read"); }
  }
);
const auditRequest = (headers = {}) => new Request("https://admin.invalid/api/platform-admin/audit", { headers });
const branchGetRequest = () => new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch/status?restaurantId=restaurant");
const branchPostRequest = () => new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch/status", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}"
});

const cases = [];
const test = (name, run) => cases.push([name, run]);
test("A no user and no error is unauthenticated", async () => assert.equal(await stateFor(noUser()), "unauthenticated"));
test("B canonical AuthSessionMissingError is unauthenticated", async () => assert.equal(await stateFor(noUser(new AuthSessionMissingError())), "unauthenticated"));
test("C canonical missing-session status 400 is unauthenticated", async () => {
  const error = new AuthSessionMissingError();
  assert.equal(error.status, 400);
  assert.equal(await stateFor(noUser(error)), "unauthenticated");
});
test("D unrelated status-400 Auth error is unavailable", async () => assert.equal(await stateFor(noUser(Object.assign(new Error("bad request"), { status: 400 }))), "unavailable"));
test("E status-401 no-user Auth error is unauthenticated", async () => assert.equal(await stateFor(noUser(Object.assign(new Error("unauthorized"), { status: 401 }))), "unauthenticated"));
test("F status-403 no-user Auth error preserves unauthenticated", async () => assert.equal(await stateFor(noUser(Object.assign(new Error("forbidden"), { status: 403 }))), "unauthenticated"));
test("G unexpected status-500 Auth error is unavailable", async () => assert.equal(await stateFor(noUser(Object.assign(new Error("server error"), { status: 500 }))), "unavailable"));
test("H thrown getUser error is unavailable", async () => assert.equal((await adminContext.resolveVerifiedAdminContext(thrownClient)).state, "unavailable"));
test("I valid verified user continues membership resolution", async () => {
  let calls = 0;
  const context = await adminContext.resolveVerifiedAdminContext(resultClient(
    { data: { user: { id: subject, is_anonymous: false } }, error: null },
    async () => {
      calls += 1;
      return { data: [{ role_key: "platform_admin", permission_key: "admin_context.read", permission_scope: "self" }], error: null };
    }
  ));
  assert.equal(context.state, "admin");
  assert.equal(calls, 1);
});
test("J no-session current permission context is unauthenticated", async () => assert.equal((await permissionFor(noUser(new AuthSessionMissingError()))).state, "unauthenticated"));
test("K no-session Audit cookie API maps to 401 unauthenticated", async () => {
  const response = await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, cookieResolverFor(noUser(new AuthSessionMissingError())));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { state: "unauthenticated" });
});
test("L no-session Branch cookie APIs map to 401 unauthenticated", async () => {
  const resolver = cookieResolverFor(noUser(new AuthSessionMissingError()));
  const responses = [
    await branchRuntime.handlePlatformAdminBranchStatusPreviewRequest(branchGetRequest(), "branch", {}, fetch, resolver),
    await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest(), "branch", {}, fetch, resolver)
  ];
  assert.ok(responses.every((response) => response.status === 401));
  assert.deepEqual(await Promise.all(responses.map((response) => response.json())), [{ state: "unauthenticated" }, { state: "unauthenticated" }]);
});
test("M malformed explicit bearer still cannot use cookie authority", async () => {
  let contextCalls = 0;
  const result = await apiHelper.resolveAdminApiAuthorization("Malformed", "admin_audit.read", {
    resolvePermissionContext: async () => { contextCalls += 1; return { state: "admin" }; },
    resolveSessionSnapshot: async () => null
  });
  assert.deepEqual(result, { state: "authorized", mode: "bearer", authorization: "Malformed" });
  assert.equal(contextCalls, 0);
});
test("N unexpected authority failure cookie API remains 503", async () => {
  const response = await auditRuntime.handlePlatformAdminAuditRequest(
    auditRequest(), {}, fetch,
    cookieResolverFor(noUser(Object.assign(new Error("server error"), { status: 500 })))
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { state: "unavailable" });
});

let passed = 0;
for (const [name, run] of cases) {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(error instanceof Error ? error.stack : String(error));
  }
}
console.log(JSON.stringify({
  suite: "admin-api-session-p3-p5-r1-smoke",
  total: cases.length,
  passed,
  failed: cases.length - passed,
  developmentAccessed: false,
  productionAccessed: false
}, null, 2));
if (passed !== cases.length) process.exitCode = 1;

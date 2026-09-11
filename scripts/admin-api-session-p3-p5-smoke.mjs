#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
function loadTypeScript(file, requireModule) {
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

const exactPermission = (context, key) => ({
  allowed: context.state === "admin" && context.permissions.includes(key),
  refusal: context.state === "admin" && context.permissions.includes(key) ? null : context.state
});
const helper = loadTypeScript("apps/admin-web/auth/admin-api-authorization.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-current-permission-context") return { assertCurrentAdminPermission: exactPermission };
  if (request === "./admin-context") return { getVerifiedAdminPermissionContext: async () => ({ state: "unavailable" }) };
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused default dependency"); } };
  throw new Error(`Unexpected helper import: ${request}`);
});

const subject = "11111111-1111-4111-8111-111111111111";
const admin = (permissions) => ({ state: "admin", subject, roleKey: "platform_admin", permissions });
const fullAdmin = admin(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"]);
const deps = (context, snapshot = { subject, accessToken: "fixture-token" }, counters = { context: 0, session: 0 }) => ({
  counters,
  value: {
    resolvePermissionContext: async () => { counters.context += 1; return context; },
    resolveSessionSnapshot: async () => { counters.session += 1; return snapshot; }
  }
});
const cookieResolver = (permissionContext = fullAdmin, snapshot) => {
  const dependency = deps(permissionContext, snapshot);
  return {
    dependency,
    resolve: (authorization, permission) => helper.resolveAdminApiAuthorization(authorization, permission, dependency.value)
  };
};

let auditReadCalls = [];
const auditRuntime = loadTypeScript("apps/admin-web/server/platformAdminAuditRuntime.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./platformAdminAuditTransport") return { getPlatformAdminAuditConfig: () => ({ mode: "live", url: "https://supabase.invalid", publishableKey: "sb_publishable_fixture" }) };
  if (request === "./platformAdminAuditRead") return {
    readPlatformAdminAudit: async (authorization) => {
      auditReadCalls.push(authorization);
      return /^Bearer [A-Za-z0-9._~-]+$/.test(authorization ?? "")
        ? { state: "ready", events: [], page: 1, pageSize: 20, hasNextPage: false, sourceWindow: 500 }
        : { state: "unauthenticated" };
    }
  };
  if (request === "../auth/admin-api-authorization") return helper;
  throw new Error(`Unexpected audit runtime import: ${request}`);
});

let branchTransportCalls = [];
const branchAuthority = {
  PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT: 2048,
  PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION: "admin_restaurant_branch.status.write",
  readVerifiedBearer: (value) => typeof value === "string" && value.length <= 8192 && /^Bearer [A-Za-z0-9._~-]+$/.test(value) ? value : null,
  readBoundedIdentity: (value) => typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null,
  parseMutationRequest: () => ({ restaurantId: "restaurant-fixture", expectedStatus: "active", nextStatus: "inactive", expectedVersion: "1", reasonCode: "operational_pause", requestId: "11111111-1111-4111-8111-111111111111" }),
  parseMutationResult: (_raw, requestId) => ({ state: "ready", outcome: "applied", operation: "set_restaurant_branch_status", status: "inactive", statusVersion: "2", occurredAt: "2026-09-12T00:00:00Z", requestId }),
  parsePreviewRows: () => ({ state: "ready", restaurantId: "restaurant-fixture", branchId: "branch-fixture", branchName: "Fixture", status: "active", statusVersion: "1" })
};
const branchRuntime = loadTypeScript("apps/admin-web/server/platformAdminBranchStatusRuntime.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./platformAdminBranchStatusAuthority") return branchAuthority;
  if (request === "./platformAdminBranchStatusTransport") return {
    BranchStatusTransportError: class BranchStatusTransportError extends Error {},
    getPlatformAdminBranchStatusConfig: () => ({ mode: "live", url: "https://supabase.invalid", publishableKey: "sb_publishable_fixture" }),
    createPlatformAdminBranchStatusTransport: (_config, authorization) => {
      branchTransportCalls.push(authorization);
      return {
        verifyIdentity: async () => true,
        hasPermission: async () => true,
        preview: async () => [{}],
        mutate: async () => ({})
      };
    }
  };
  if (request === "../auth/admin-api-authorization") return helper;
  throw new Error(`Unexpected branch runtime import: ${request}`);
});

const auditRequest = (headers = {}) => new Request("https://admin.invalid/api/platform-admin/audit", { headers });
const branchGetRequest = (headers = {}) => new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch-fixture/status?restaurantId=restaurant-fixture", { headers });
const branchPostRequest = (headers = {}) => new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch-fixture/status", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: "{}"
});
const parse = async (response) => ({ status: response.status, headers: response.headers, body: await response.json() });

const cases = [];
const test = (name, run) => cases.push([name, run]);

test("A no bearer and no Admin session maps to 401", async () => {
  const resolution = cookieResolver({ state: "unauthenticated" });
  const result = await parse(await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, resolution.resolve));
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { state: "unauthenticated" });
});
test("B valid bearer selects the legacy path", async () => {
  const resolution = cookieResolver();
  const result = await helper.resolveAdminApiAuthorization("Bearer fixture-token", "admin_audit.read", resolution.dependency.value);
  assert.deepEqual(result, { state: "authorized", mode: "bearer", authorization: "Bearer fixture-token" });
  assert.deepEqual(resolution.dependency.counters, { context: 0, session: 0 });
});
test("C malformed Authorization never falls back to cookies", async () => {
  const resolution = cookieResolver();
  const result = await parse(await auditRuntime.handlePlatformAdminAuditRequest(auditRequest({ authorization: "Malformed" }), {}, fetch, resolution.resolve));
  assert.equal(result.status, 401);
  assert.deepEqual(resolution.dependency.counters, { context: 0, session: 0 });
});
test("D authenticated non-admin maps to 403", async () => {
  const resolution = cookieResolver({ state: "not_admin" });
  assert.equal((await helper.resolveAdminApiAuthorization(null, "admin_audit.read", resolution.dependency.value)).state, "forbidden");
});
test("E Admin missing the exact CURRENT permission maps to 403", async () => {
  const resolution = cookieResolver(admin(["admin_context.read"]));
  const result = await parse(await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, resolution.resolve));
  assert.equal(result.status, 403);
});
test("F unavailable cookie authority maps to 503", async () => {
  const resolution = cookieResolver({ state: "unavailable", reason: "authority_unreachable" });
  const result = await parse(await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, resolution.resolve));
  assert.equal(result.status, 503);
});
test("G verified Admin session composes an internal bearer", async () => {
  const resolution = cookieResolver();
  const result = await helper.resolveAdminApiAuthorization(null, "admin_audit.read", resolution.dependency.value);
  assert.deepEqual(result, { state: "authorized", mode: "browser_cookie_session", authorization: "Bearer fixture-token" });
});
test("H verified and session subject mismatch fails closed", async () => {
  const resolution = cookieResolver(fullAdmin, { subject: "22222222-2222-4222-8222-222222222222", accessToken: "fixture-token" });
  assert.equal((await helper.resolveAdminApiAuthorization(null, "admin_audit.read", resolution.dependency.value)).state, "unavailable");
});
test("I missing access token fails closed", async () => {
  const resolution = cookieResolver(fullAdmin, { subject, accessToken: "" });
  assert.equal((await helper.resolveAdminApiAuthorization(null, "admin_audit.read", resolution.dependency.value)).state, "unavailable");
});
test("J Audit cookie mode requests admin_audit.read", async () => {
  const seen = [];
  const resolution = cookieResolver();
  await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, async (authorization, permission) => { seen.push(permission); return resolution.resolve(authorization, permission); });
  assert.deepEqual(seen, ["admin_audit.read"]);
});
test("K Branch GET requests branch-status CURRENT permission", async () => {
  const seen = [];
  const resolution = cookieResolver();
  await branchRuntime.handlePlatformAdminBranchStatusPreviewRequest(branchGetRequest(), "branch-fixture", {}, fetch, async (authorization, permission) => { seen.push(permission); return resolution.resolve(authorization, permission); });
  assert.deepEqual(seen, ["admin_restaurant_branch.status.write"]);
});
test("L Branch POST requests branch-status CURRENT permission", async () => {
  const seen = [];
  const resolution = cookieResolver();
  await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "https://admin.invalid" }), "branch-fixture", {}, fetch, async (authorization, permission) => { seen.push(permission); return resolution.resolve(authorization, permission); });
  assert.deepEqual(seen, ["admin_restaurant_branch.status.write"]);
});
test("M cookie POST with exact Origin continues", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "https://admin.invalid" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 200);
});
test("N cookie POST missing Origin is rejected", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest(), "branch-fixture", {}, fetch, resolution.resolve)).status, 403);
});
test("O cookie POST cross-origin is rejected", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "https://other.invalid" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 403);
});
test("P cookie POST Origin null is rejected", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "null" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 403);
});
test("Q cookie POST cross-site is rejected", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "https://admin.invalid", "sec-fetch-site": "cross-site" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 403);
});
test("R cookie POST same-site is rejected", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "https://admin.invalid", "sec-fetch-site": "same-site" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 403);
});
test("S cookie POST same-origin fetch site continues", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ origin: "https://admin.invalid", "sec-fetch-site": "same-origin" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 200);
});
test("T bearer POST without Origin stays compatible", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ authorization: "Bearer fixture-token" }), "branch-fixture", {}, fetch, resolution.resolve)).status, 200);
});
test("U cookie GET does not require Origin", async () => {
  const resolution = cookieResolver();
  assert.equal((await branchRuntime.handlePlatformAdminBranchStatusPreviewRequest(branchGetRequest(), "branch-fixture", {}, fetch, resolution.resolve)).status, 200);
});
test("V responses remain private and no-store", async () => {
  const resolution = cookieResolver();
  const responses = [
    await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, resolution.resolve),
    await branchRuntime.handlePlatformAdminBranchStatusPreviewRequest(branchGetRequest(), "branch-fixture", {}, fetch, resolution.resolve)
  ];
  assert.ok(responses.every((response) => response.headers.get("cache-control") === "private, no-store"));
});
test("W Vary includes Authorization and Cookie", async () => {
  const resolution = cookieResolver();
  const response = await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, resolution.resolve);
  assert.equal(response.headers.get("vary"), "Authorization, Cookie");
});
test("X composed token is absent from API responses", async () => {
  const resolution = cookieResolver();
  const response = await auditRuntime.handlePlatformAdminAuditRequest(auditRequest(), {}, fetch, resolution.resolve);
  assert.ok(!JSON.stringify(await response.json()).includes("fixture-token"));
});
test("Y application composition contains no service-role authority", async () => {
  const source = read("apps/admin-web/auth/admin-api-authorization.ts") + read("apps/admin-web/server/platformAdminAuditRuntime.ts") + read("apps/admin-web/server/platformAdminBranchStatusRuntime.ts");
  assert.ok(!/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(source));
});
test("Z explicit bearer refusal cannot use cookie authority", async () => {
  const resolution = cookieResolver();
  const response = await branchRuntime.handlePlatformAdminBranchStatusMutationRequest(branchPostRequest({ authorization: "Malformed" }), "branch-fixture", {}, fetch, resolution.resolve);
  assert.equal(response.status, 401);
  assert.deepEqual(resolution.dependency.counters, { context: 0, session: 0 });
});

let passed = 0;
for (const [name, run] of cases) {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(error instanceof Error ? error.message : String(error));
  }
}
console.log(JSON.stringify({ suite: "admin-api-session-p3-p5-smoke", total: cases.length, passed, failed: cases.length - passed, developmentAccessed: false, productionAccessed: false }, null, 2));
if (passed !== cases.length) process.exitCode = 1;

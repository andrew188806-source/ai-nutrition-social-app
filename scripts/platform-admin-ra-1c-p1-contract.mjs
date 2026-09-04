import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
export const BASELINE = "e335cb2416ae65653502e47e408d6a5824818e73";
export const ORIGIN_BASELINE = "6bff2e750f5ac72bab0c93f819bc9ce56b698e22";
export const SUBJECT = "Activate governed Platform Admin branch status control";
export const P0_MIGRATION = "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql";
export const P0_SHA256 = "dac22c901da171d44b2f064024d10b00f31d78e9fe27f51341baca69a3b44f5a";
export const AUTHORITY = "apps/admin-web/server/platformAdminBranchStatusAuthority.ts";
export const TRANSPORT = "apps/admin-web/server/platformAdminBranchStatusTransport.ts";
export const RUNTIME = "apps/admin-web/server/platformAdminBranchStatusRuntime.ts";
export const DTO = "apps/admin-web/view-models/platform-admin-branch-status.ts";
export const ROUTE = "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts";
export const UI = "apps/admin-web/components/PlatformAdminBranchStatus.tsx";
export const PAGE = "apps/admin-web/app/restaurant-review/page.tsx";
export const PRODUCT_PATHS = [AUTHORITY, TRANSPORT, RUNTIME, DTO, ROUTE, UI, PAGE];
export const PATHS = [...PRODUCT_PATHS, "package.json", "docs/platform-admin-branch-status-ra-1c-p1.md",
  ...["contract", "guard", "smoke", "mutations", "development-acceptance"].map((name) => `scripts/platform-admin-ra-1c-p1-${name}.mjs`)].sort();
export const SCRIPT_KEYS = ["test:platform-admin-ra-1c-p1", "test:platform-admin-ra-1c-p1-smoke",
  "test:platform-admin-ra-1c-p1-mutations", "test:platform-admin-ra-1c-p1-development"];

export function readSources(root = process.cwd()) {
  const sources = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (["node_modules", ".next"].includes(entry.name)) continue;
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (/\.(ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file)) sources[file] = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
    }
  }
  walk("apps/admin-web");
  return sources;
}

export function loadModules(sources) {
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const source = sources[file] ?? fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const { outputText } = ts.transpileModule(source, { fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    const module = { exports: {} }; cache.set(file, module);
    const localRequire = (specifier) => {
      if (specifier === "server-only") return {};
      if (!specifier.startsWith(".")) throw new Error(`Unexpected import: ${specifier}`);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      return load([target, `${target}.ts`, `${target}.tsx`].find((name) => sources[name] || fs.existsSync(path.join(process.cwd(), name))) ?? target);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load;
}

export function auditSources(sources) {
  const checks = [], check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  const authority = sources[AUTHORITY] ?? "", transport = sources[TRANSPORT] ?? "", runtime = sources[RUNTIME] ?? "";
  const dto = sources[DTO] ?? "", route = sources[ROUTE] ?? "", ui = sources[UI] ?? "", page = sources[PAGE] ?? "";
  for (const file of [AUTHORITY, TRANSPORT, RUNTIME]) check(`${file} is server-only`, /^import "server-only";/.test(sources[file] ?? ""));
  check("exact permission predicate", transport.includes('requested_permission_key: PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION')
    && authority.includes('"admin_restaurant_branch.status.write"'));
  check("only fixed preview and mutation RPC constants", authority.includes('"platform_admin_restaurant_branch_status_v1"')
    && authority.includes('"platform_admin_set_restaurant_branch_status_v1"') && !/rpcName|functionName|genericRpc/i.test(transport + runtime));
  check("canonical identity is verified before permission", runtime.indexOf("await transport.verifyIdentity()") < runtime.indexOf("await transport.hasPermission()"));
  check("bearer gate cannot be bypassed", runtime.includes('if (!bearer) return { failure: { state: "unauthenticated" }'));
  check("caller claims never grant authority", !/query\.get\(["'](?:role|userId|restaurantOwner)|body\.(?:role|userId)|receiptCache/.test(authority + transport + runtime));
  check("permission is checked after preview", (runtime.match(/await authority\.transport\.hasPermission\(\)/g) ?? []).length === 2);
  check("request schema has exact keys", /if \(!isRecord\(value\) \|\| !hasExactKeys\(value, \[\s*"restaurantId", "expectedStatus", "nextStatus", "expectedVersion", "reasonCode", "requestId"\s*\]\)\) return null;/.test(authority));
  check("body is bounded at 2 KiB", authority.includes("PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT = 2048")
    && runtime.includes("new TextEncoder().encode(text).byteLength > PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT"));
  check("status transition is closed", authority.includes('status === "active"') && authority.includes('"operational_pause"')
    && authority.includes('"operational_resume"') && !/temporary_closed|archived/.test(authority + ui));
  check("reason must match the transition", authority.includes("value.reasonCode !== transition.reasonCode"));
  check("versions are decimal strings without Number coercion", authority.includes("readStatusVersion(value.expectedVersion)")
    && authority.includes('typeof value !== "string"') && !/Number\([^)]*(?:version|Version)/.test(PRODUCT_PATHS.map((file) => sources[file]).join("\n")));
  check("request IDs are UUID v4", authority.includes("isUuidV4") && authority.includes("-4[0-9a-f]{3}-[89ab]"));
  check("upstream calls are private and bounded", transport.includes('cache: "no-store"') && transport.includes('redirect: "error"')
    && transport.includes("AbortSignal.timeout(8000)"));
  check("only publishable configuration is accepted", transport.includes("sb_publishable_")
    && !/SERVICE_ROLE|sb_secret_|NEXT_PUBLIC_/.test(PRODUCT_PATHS.map((file) => sources[file]).join("\n")));
  check("response caching is private", runtime.includes('"Cache-Control": "private, no-store"') && runtime.includes('Vary: "Authorization"'));
  check("HTTP error vocabulary is exact", ["401", "403", "400", "404", "409", "422", "503", "500"].every((code) => runtime.includes(code)));
  check("unknown upstream vocabulary fails closed", runtime.includes('parseMutationResult(raw, input.requestId) ?? { state: "internal_failure" }'));
  check("DTO projection is closed", !/actor|membership|receipt|metadata|sql|secret|userId/i.test(dto));
  check("no raw errors or rows escape", !/console\.|error\.(message|stack)|\.\.\.row|JSON\.stringify\(error\)/.test(authority + transport + runtime));
  check("route exposes only GET and POST", /export async function GET/.test(route) && /export async function POST/.test(route)
    && !/PATCH|PUT|DELETE/.test(route));
  check("route and page are dynamic", [route, page].every((source) => source.includes('dynamic = "force-dynamic"') && source.includes("revalidate = 0")));
  check("live component calls only fixed same-origin route", ui.includes("/api/platform-admin/restaurant-branches/")
    && !/supabase|\/rest\/v1|createClient|admin_internal/i.test(ui));
  check("confirmation gates submission", ui.includes("setConfirmationOpen(true)") && ui.indexOf("setConfirmationOpen(true)") < ui.indexOf("onClick={confirm}")
    && ui.includes('role="alertdialog"'));
  check("uncertain retry retains operation", ui.includes("setPending(operation)") && ui.includes("onClick={() => void send(pending)}")
    && ui.includes("使用相同 requestId 重試"));
  check("stale refreshes without automatic mutation", ui.includes('result.state === "stale_state"')
    && /result\.state === "stale_state"\)[\s\S]{0,260}await refresh\(operation\.body\.restaurantId, operation\.branchId\)[\s\S]{0,80}return;/.test(ui)
    && !/result\.state === "stale_state"\)[\s\S]{0,260}(?:send\(|fetch\([^)]*POST)/.test(ui));
  check("new operation uses crypto UUID", ui.includes("globalThis.crypto.randomUUID()") && !/Date\.now|Math\.random/.test(ui));
  check("mock IDs cannot activate control", page.includes("restaurantId = typeof searchParams?.restaurantId")
    && page.includes("示範資料（Mock）") && page.indexOf("<PlatformAdminBranchStatus") < page.indexOf("rows.map"));
  check("denial cannot become mock success", !ui.includes("adminRestaurantService") && !runtime.includes('mode: "mock"'));
  check("no direct database fallback", !/\.from\(|\.schema\(|\bUPDATE\b|restaurant_branches\?/.test(PRODUCT_PATHS.map((file) => sources[file]).join("\n")));

  const imports = (file) => {
    const ast = ts.createSourceFile(file, sources[file] ?? "", ts.ScriptTarget.Latest, true);
    return ast.statements.filter((node) => ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly
      && !(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        && !node.importClause.name && node.importClause.namedBindings.elements.every((item) => item.isTypeOnly)))
      .map((node) => node.moduleSpecifier.text);
  };
  for (const entry of [UI, DTO]) {
    const seen = new Set(), violations = [];
    function visit(file) {
      if (seen.has(file)) return; seen.add(file);
      if (/\/server\//.test(file) || /service_role|sb_secret_|admin_internal/i.test(sources[file] ?? "")) violations.push(file);
      for (const specifier of imports(file)) if (specifier.startsWith(".")) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        const found = [target, `${target}.ts`, `${target}.tsx`].find((name) => Object.hasOwn(sources, name));
        if (found) visit(found);
      }
    }
    visit(entry); check(`browser boundary ${entry}`, violations.length === 0);
  }
  return checks;
}

export const liveEnv = { NODE_ENV: "test", TASTKIND_ADMIN_BRANCH_STATUS_DATA_SOURCE: "supabase",
  TASTKIND_SUPABASE_URL: "https://status.invalid", TASTKIND_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ra1c_fixture" };
export const mutationBody = { restaurantId: "restaurant-fixture", expectedStatus: "active", nextStatus: "inactive",
  expectedVersion: "9007199254740993123", reasonCode: "operational_pause", requestId: "00000000-0000-4000-8000-000000000001" };
const previewRow = { restaurant_id: "restaurant-fixture", branch_id: "branch-fixture", branch_name: "Fixture Branch",
  status: "active", status_version: "9007199254740993123" };
const mutationResult = { ok: true, outcome: "applied", errorCode: null, status: "inactive",
  version: "9007199254740993124", occurredAt: "2026-09-04T02:00:00.000Z" };

export function fixture(options = {}) {
  const calls = []; let permissionReads = 0;
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (options.throwNetwork) throw new Error("PRIVATE_DATABASE_ERROR");
    assert.equal(url.origin, liveEnv.TASTKIND_SUPABASE_URL); assert.equal(url.search, "");
    const headers = new Headers(init.headers); assert.equal(headers.get("Authorization"), "Bearer fixture-token");
    assert.equal(headers.get("apikey"), liveEnv.TASTKIND_SUPABASE_PUBLISHABLE_KEY);
    if (url.pathname === "/auth/v1/user") return Response.json(options.identity ?? { id: "00000000-0000-4000-8000-000000000002", is_anonymous: false }, { status: options.authStatus ?? 200 });
    const body = JSON.parse(init.body); 
    if (url.pathname === "/rest/v1/rpc/platform_admin_has_permission_v1") {
      assert.deepEqual(body, { requested_permission_key: "admin_restaurant_branch.status.write" }); permissionReads += 1;
      const permission = permissionReads > 1 && Object.hasOwn(options, "afterPermission") ? options.afterPermission : (options.permission ?? true);
      return Response.json(permission);
    }
    if (url.pathname === "/rest/v1/rpc/platform_admin_restaurant_branch_status_v1") {
      assert.deepEqual(body, { p_restaurant_id: "restaurant-fixture", p_branch_id: "branch-fixture" });
      return Response.json(Object.hasOwn(options, "preview") ? options.preview : [previewRow]);
    }
    assert.equal(url.pathname, "/rest/v1/rpc/platform_admin_set_restaurant_branch_status_v1");
    assert.deepEqual(body, { p_restaurant_id: mutationBody.restaurantId, p_branch_id: "branch-fixture",
      p_expected_status: mutationBody.expectedStatus, p_requested_status: mutationBody.nextStatus,
      p_expected_version: mutationBody.expectedVersion, p_reason_code: mutationBody.reasonCode, p_request_id: mutationBody.requestId });
    return Response.json(Object.hasOwn(options, "mutation") ? options.mutation : mutationResult);
  };
  return { calls, fetchImpl, get permissionReads() { return permissionReads; } };
}

export async function runSmoke(sources, { onCheck = () => {} } = {}) {
  const checks = [], test = async (name, fn) => {
    try { await fn(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, detail: String(error.message).slice(0, 300) }); }
    onCheck(checks.at(-1));
  };
  const load = loadModules(sources), authority = load(AUTHORITY), runtime = load(RUNTIME), transport = load(TRANSPORT);
  const config = transport.getPlatformAdminBranchStatusConfig(liveEnv);
  const preview = async (options = {}, authorization = "Bearer fixture-token", restaurantId = "restaurant-fixture", branchId = "branch-fixture") => {
    const fake = fixture(options); return { result: await runtime.readPlatformAdminBranchStatus(authorization, restaurantId, branchId, config, fake.fetchImpl), fake };
  };
  for (const bearer of [null, "", "Basic admin", "Bearer x y", `Bearer ${"x".repeat(8200)}`]) await test(`invalid bearer denied ${String(bearer).slice(0, 12)}`, async () => {
    const { result, fake } = await preview({}, bearer); assert.deepEqual(result, { state: "unauthenticated" }); assert.equal(fake.calls.length, 0);
  });
  await test("consumer denied", async () => { const { result, fake } = await preview({ permission: false }); assert.deepEqual(result, { state: "permission_denied" }); assert.equal(fake.calls.length, 2); });
  await test("Restaurant Owner alone denied", async () => { const { result } = await preview({ permission: false, identity: { id: "00000000-0000-4000-8000-000000000002", user_metadata: { role: "restaurant_owner" } } }); assert.deepEqual(result, { state: "permission_denied" }); });
  await test("revoked Admin denied", async () => { const { result } = await preview({ permission: false, identity: { id: "00000000-0000-4000-8000-000000000002", user_metadata: { role: "platform_admin" } } }); assert.deepEqual(result, { state: "permission_denied" }); });
  await test("anonymous identity denied", async () => { const { result } = await preview({ identity: { id: "00000000-0000-4000-8000-000000000002", is_anonymous: true } }); assert.deepEqual(result, { state: "unauthenticated" }); });
  await test("expired bearer maps to unauthenticated", async () => { const { result } = await preview({ authStatus: 401 }); assert.deepEqual(result, { state: "unauthenticated" }); });
  await test("malformed permission result fails closed", async () => { const { result } = await preview({ permission: { allowed: true } }); assert.deepEqual(result, { state: "dependency_unavailable" }); });
  await test("canonical preview and bigint projection", async () => { const { result, fake } = await preview(); assert.deepEqual(result, { state: "ready", restaurantId: "restaurant-fixture", branchId: "branch-fixture", branchName: "Fixture Branch", status: "active", statusVersion: "9007199254740993123" }); assert.equal(fake.calls.length, 4); });
  await test("revocation during preview denies", async () => { const { result } = await preview({ afterPermission: false }); assert.deepEqual(result, { state: "permission_denied" }); });
  await test("missing target distinguished after permission recheck", async () => { const { result } = await preview({ preview: [] }); assert.deepEqual(result, { state: "target_not_found" }); });
  await test("unsupported target status rejected", async () => { const { result } = await preview({ preview: [{ ...previewRow, status: "archived" }] }); assert.deepEqual(result, { state: "mutation_rejected" }); });
  await test("mismatched target fails closed", async () => { const { result } = await preview({ preview: [{ ...previewRow, branch_id: "other" }] }); assert.deepEqual(result, { state: "internal_failure" }); });
  await test("unknown preview row fails closed", async () => { const { result } = await preview({ preview: [{ ...previewRow, sql: "PRIVATE" }] }); assert.deepEqual(result, { state: "internal_failure" }); });
  for (const [name, body] of [["unknown field", { ...mutationBody, role: "admin" }], ["null", null], ["bad ID", { ...mutationBody, restaurantId: " bad" }],
    ["unsafe version", { ...mutationBody, expectedVersion: 9007199254740992 }], ["bad UUID", { ...mutationBody, requestId: "1" }],
    ["unsupported status", { ...mutationBody, nextStatus: "archived" }], ["reason mismatch", { ...mutationBody, reasonCode: "operational_resume" }]]) {
    await test(`request rejects ${name}`, async () => assert.equal(authority.parseMutationRequest(body), null));
  }
  await test("version maximum is exact", async () => { assert.equal(authority.readStatusVersion("9223372036854775807"), "9223372036854775807"); assert.equal(authority.readStatusVersion("9223372036854775808"), null); });
  await test("caller identity fields are rejected", async () => { assert.equal(authority.parseMutationRequest({ ...mutationBody, userId: "claimed" }), null); });
  const post = async (options = {}, body = mutationBody, authorization = "Bearer fixture-token", extraHeaders = {}) => {
    const fake = fixture(options); const request = new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch-fixture/status", {
      method: "POST", headers: { authorization, "content-type": "application/json", ...extraHeaders }, body: JSON.stringify(body)
    });
    return { response: await runtime.handlePlatformAdminBranchStatusMutationRequest(request, "branch-fixture", liveEnv, fake.fetchImpl), fake };
  };
  await test("mutation maps exact safe DTO", async () => { const { response, fake } = await post(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { state: "ready", outcome: "applied", operation: "set_restaurant_branch_status", status: "inactive", statusVersion: "9007199254740993124", occurredAt: "2026-09-04T02:00:00.000Z", requestId: mutationBody.requestId }); assert.equal(fake.calls.length, 3); });
  await test("noop maps without changing version type", async () => { const { response } = await post({ mutation: { ...mutationResult, outcome: "noop", status: "active", version: mutationBody.expectedVersion } }); const result = await response.json(); assert.equal(result.outcome, "noop"); assert.equal(result.statusVersion, mutationBody.expectedVersion); });
  for (const [errorCode, status] of [["permission_denied",403],["invalid_request",400],["idempotency_conflict",409]]) await test(`${errorCode} maps to ${status}`, async () => {
    const { response } = await post({ mutation: { ok: false, errorCode } }); assert.equal(response.status, status); assert.deepEqual(await response.json(), { state: errorCode });
  });
  for (const [errorCode, status] of [["target_not_found",404],["stale_state",409],["mutation_rejected",422]]) await test(`${errorCode} rejection maps to ${status}`, async () => {
    const { response } = await post({ mutation: { ok: false, outcome: "rejected", errorCode, status: "active", version: "7", occurredAt: "2026-09-04T02:00:00Z" } }); assert.equal(response.status, status); assert.deepEqual(await response.json(), { state: errorCode });
  });
  await test("unknown DB result is internal failure", async () => { const { response } = await post({ mutation: { ok: true, outcome: "surprise" } }); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { state: "internal_failure" }); });
  await test("oversized body denied before database", async () => { const { response, fake } = await post({}, mutationBody, "Bearer fixture-token", { "content-length": "2049" }); assert.equal(response.status, 400); assert.equal(fake.calls.length, 0); });
  await test("network errors are redacted unavailable", async () => { const { response } = await post({ throwNetwork: true }); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { state: "dependency_unavailable" }); });
  await test("responses are private", async () => { const { response } = await post(); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("vary"), "Authorization"); });
  await test("GET handler exposes exact preview DTO", async () => { const fake = fixture(); const request = new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch-fixture/status?restaurantId=restaurant-fixture", { headers: { authorization: "Bearer fixture-token" } }); const response = await runtime.handlePlatformAdminBranchStatusPreviewRequest(request, "branch-fixture", liveEnv, fake.fetchImpl); assert.equal(response.status, 200); assert.deepEqual(Object.keys(await response.json()).sort(), ["branchId","branchName","restaurantId","state","status","statusVersion"].sort()); });
  await test("GET rejects unknown query fields before network", async () => { const fake = fixture(); const request = new Request("https://admin.invalid/api/platform-admin/restaurant-branches/branch-fixture/status?restaurantId=restaurant-fixture&role=admin", { headers: { authorization: "Bearer fixture-token" } }); const response = await runtime.handlePlatformAdminBranchStatusPreviewRequest(request, "branch-fixture", liveEnv, fake.fetchImpl); assert.equal(response.status, 400); assert.equal(fake.calls.length, 0); });
  await test("disabled config never composes network", async () => { const fake = fixture(); const result = await runtime.readPlatformAdminBranchStatus("Bearer fixture-token", "restaurant-fixture", "branch-fixture", { mode: "disabled" }, fake.fetchImpl); assert.deepEqual(result, { state: "dependency_unavailable" }); assert.equal(fake.calls.length, 0); });
  return checks;
}

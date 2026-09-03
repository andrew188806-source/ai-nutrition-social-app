import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const requireReact = createRequire(new URL("../apps/admin-web/package.json", import.meta.url));
const ts = require_("typescript");
export const BASELINE = "c2c41d18a1e87b39bda639185b0089e5474ca048";
export const SUBJECT = "Add Platform Admin canonical audit read";
export const AUTHORITY = "apps/admin-web/server/platformAdminAuthority.ts";
export const READ = "apps/admin-web/server/platformAdminAuditRead.ts";
export const TRANSPORT = "apps/admin-web/server/platformAdminAuditTransport.ts";
export const RUNTIME = "apps/admin-web/server/platformAdminAuditRuntime.ts";
export const DTO = "apps/admin-web/view-models/platform-admin-audit.ts";
export const PAGE = "apps/admin-web/app/audit-trail/page.tsx";
export const UI = "apps/admin-web/components/PlatformAdminAudit.tsx";
export const ROUTE = "apps/admin-web/app/api/platform-admin/audit/route.ts";
export const PRODUCT_PATHS = [READ, TRANSPORT, RUNTIME, DTO, PAGE, UI, ROUTE];
export const PATHS = [...PRODUCT_PATHS, "package.json", "docs/platform-admin-audit-ra-1b.md",
  ...["contract", "guard", "smoke", "mutations"].map((name) => `scripts/platform-admin-ra-1b-${name}.mjs`)].sort();
export const SCRIPT_KEYS = ["test:platform-admin-ra-1b", "test:platform-admin-ra-1b-smoke", "test:platform-admin-ra-1b-mutations"];

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

/** In-memory module loader. Tests replace the HTTP boundary, never the authorization module. */
export function loadModules(sources, overrides = {}) {
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const source = sources[file] ?? fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const { outputText } = ts.transpileModule(source, { fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    const module = { exports: {} }; cache.set(file, module);
    const localRequire = (specifier) => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier === "server-only") return {};
      if (["react", "react/jsx-runtime", "react-dom/server"].includes(specifier)) return requireReact(specifier);
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
  const checks = [];
  const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  for (const file of [READ, TRANSPORT, RUNTIME]) check(`${file} is server-only`, /^import "server-only";/.test(sources[file] ?? ""));
  const reader = sources[READ] ?? "", transport = sources[TRANSPORT] ?? "", runtime = sources[RUNTIME] ?? "";
  const dto = sources[DTO] ?? "", page = sources[PAGE] ?? "", ui = sources[UI] ?? "";
  check("identity verification precedes RA-1A context", reader.indexOf("await transport.verifyIdentity()") > 0
    && reader.indexOf("await transport.verifyIdentity()") < reader.indexOf("await transport.readContext()"));
  check("RA-1A context and audit permission are mandatory", reader.includes('import { assertPlatformAdminPermission, resolvePlatformAdminContext } from "./platformAdminAuthority"')
    && reader.includes('if (!assertPlatformAdminPermission(context, "admin_audit.read").allowed)'));
  check("audit RPC is followed by a fresh permission check", reader.indexOf("const current = resolvePlatformAdminContext") > reader.indexOf("await transport.readAuditWindow()")
    && reader.includes('if (!assertPlatformAdminPermission(current, "admin_audit.read").allowed)'));
  check("only frozen public RPC constants are used", transport.includes('} from "./platformAdminAuthority"')
    && transport.includes("/rest/v1/rpc/${PLATFORM_ADMIN_CONTEXT_FUNCTION}") && transport.includes("/rest/v1/rpc/${PLATFORM_ADMIN_AUDIT_LOG_FUNCTION}"));
  check("bounded source request and response", transport.includes("PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW = 500 as const")
    && transport.includes("requested_limit: PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW")
    && transport.includes("rows.length > PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW"));
  check("default 20 and maximum 50", reader.includes("PLATFORM_ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 20")
    && reader.includes("PLATFORM_ADMIN_AUDIT_MAX_PAGE_SIZE = 50")
    && reader.includes("Math.min(requestedSize, PLATFORM_ADMIN_AUDIT_MAX_PAGE_SIZE)"));
  check("source order preserved and page sliced before projection", reader.includes("rows.slice(offset, offset + pageSize).map(normalizeEvent)")
    && !/\.sort\(|\.reverse\(|query\.get\("(?:order|select|columns)"\)/.test(reader + transport));
  check("DTO contains only the closed projection", !/actor|target|reason|membership|metadata|token|secret|userId|\bid\s*:/i.test(dto.replace(/\/\*[\s\S]*?\*\//g, "")));
  check("projection never spreads raw data", !/\.\.\.row\b|actor_auth_user_id|target_auth_user_id|row\.(reason|target_id|id)\b/.test(reader));
  check("no raw errors or logging", !/console\.|error\.(message|stack)|JSON\.stringify\(error\)/.test(reader + transport + runtime));
  check("HTTP requests disable cache and redirects", transport.includes('cache: "no-store"') && transport.includes('redirect: "error"')
    && transport.includes("AbortSignal.timeout(8000)"));
  check("endpoint responses are private and uncacheable", runtime.includes('"Cache-Control": "private, no-store"') && runtime.includes('Vary: "Authorization"'));
  check("canonical JSON endpoint composes real read only", runtime.includes("const result = await readPlatformAdminAudit(") && !/mock.*(logs|events)|adminAuditService/.test(runtime));
  check("page and route are dynamic", [PAGE, ROUTE].every((file) => sources[file]?.includes('export const dynamic = "force-dynamic"')
    && sources[file]?.includes("export const revalidate = 0")));
  check("page consumes bounded result before mock services", page.includes('<PlatformAdminAudit result={composition.result} />')
    && page.indexOf('if (composition.mode === "live")') < page.indexOf("adminAuditService.listAuditLogs()"));
  check("mock display is labelled explicitly", page.includes("示範資料（Mock）") && page.includes("不授予管理員權限"));
  check("live UI has no mock service", !/adminAuditService|mock|actor|targetId|reason|metadata/.test(ui));
  check("only nonprivileged publishable configuration", transport.includes("sb_publishable_")
    && !/SUPABASE_SERVICE|SERVICE_ROLE|sb_secret_|NEXT_PUBLIC_/.test(PRODUCT_PATHS.map((file) => sources[file]).join("\n")));
  check("product has no privileged database path", !/admin_internal|platform_admin_memberships|platform_admin_context_reader|platform_admin_write_authority|createClient|\.from\(|\.schema\(/.test(PRODUCT_PATHS.map((file) => sources[file]).join("\n")));

  // Walk runtime imports from every browser entry and from the DTO-only presentation component.
  // Type-only imports do not pull a runtime module into a bundle.
  const imports = (file) => {
    const ast = ts.createSourceFile(file, sources[file] ?? "", ts.ScriptTarget.Latest, true);
    return ast.statements.filter((node) => ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly
      && !(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        && !node.importClause.name && node.importClause.namedBindings.elements.every((item) => item.isTypeOnly)))
      .map((node) => node.moduleSpecifier.text);
  };
  const browserRoots = Object.keys(sources).filter((file) => /^[\s]*(?:"use client"|'use client')/.test(sources[file]));
  for (const entry of [...browserRoots, UI, DTO]) {
    const seen = new Set(), violations = [];
    function visit(file) {
      if (seen.has(file)) return; seen.add(file);
      const source = sources[file] ?? "";
      if (/\/server\//.test(file) || /admin_internal|service_role|SERVICE_ROLE|sb_secret_|createClient/.test(source)) violations.push(file);
      for (const specifier of imports(file)) {
        if (specifier === "server-only" || /supabase|privileged|database-client/i.test(specifier)) violations.push(specifier);
        if (specifier.startsWith(".")) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
          const found = [target, `${target}.ts`, `${target}.tsx`].find((name) => Object.hasOwn(sources, name));
          if (found) visit(found);
        }
      }
    }
    visit(entry);
    check(`browser boundary ${entry}`, violations.length === 0);
  }
  return checks;
}

export const activeRows = [
  { role_key: "platform_admin", permission_key: "admin_context.read", permission_scope: "self" },
  { role_key: "platform_admin", permission_key: "admin_audit.read", permission_scope: "platform" }
];
export const liveEnv = { NODE_ENV: "test", TASTKIND_ADMIN_AUDIT_DATA_SOURCE: "supabase",
  TASTKIND_SUPABASE_URL: "https://audit.invalid", TASTKIND_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ra1b_fixture" };
const fixtureId = "00000000-0000-4000-8000-000000000001";
export function auditRows(count = 65) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(1000 - index).padStart(12, "0")}`,
    actor_auth_user_id: "00000000-0000-4000-8000-000000000002",
    // The frozen RA-1A target_id is the target auth UUID, not the membership ID.
    target_id: "00000000-0000-4000-8000-000000000003", reason: "FREE_TEXT_PRIVATE_REASON",
    membership_id: "MEMBERSHIP_PRIVATE_ID",
    sql: "PRIVATE_SQL_METADATA", security: { token: "PRIVATE_SECURITY_TOKEN" },
    action: index % 2 ? "revoke_platform_admin" : "grant_platform_admin",
    target_type: "platform_admin_membership", result: index % 2 ? "revoked" : "granted",
    created_at: new Date(Date.UTC(2026, 8, 3, 12, 0, 0) - index * 1000).toISOString()
  }));
}

/** This fake HTTP server returns raw authority rows; the real RA-1A module resolves them. */
export function fixture(options = {}) {
  const calls = []; let contextReads = 0;
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (options.throwNetwork) throw new Error("PRIVATE_SQL_METADATA");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Authorization"), options.authorization ?? "Bearer fixture-token", "caller token changed");
    assert.equal(headers.get("apikey"), liveEnv.TASTKIND_SUPABASE_PUBLISHABLE_KEY);
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(url.origin, liveEnv.TASTKIND_SUPABASE_URL);
    assert.equal(url.search, "", "arbitrary query reached upstream");
    if (url.pathname === "/auth/v1/user") {
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
      return Response.json(Object.hasOwn(options, "identity") ? options.identity : { id: fixtureId, is_anonymous: false, user_metadata: options.metadata ?? {} }, { status: options.authStatus ?? 200 });
    }
    assert.equal(init.method, "POST");
    if (url.pathname === "/rest/v1/rpc/platform_admin_current_context_v1") {
      assert.deepEqual(JSON.parse(init.body), {}, "caller identity/role reached context RPC");
      contextReads += 1;
      const rows = contextReads > 1 && options.afterRows !== undefined ? options.afterRows
        : Object.hasOwn(options, "contextRows") ? options.contextRows : activeRows;
      return Response.json(rows, { status: options.contextStatus ?? 200 });
    }
    assert.equal(url.pathname, "/rest/v1/rpc/platform_admin_audit_log_v1", "unexpected database resource");
    assert.deepEqual(JSON.parse(init.body), { requested_limit: 500 }, "unbounded audit read");
    return Response.json(Object.hasOwn(options, "rows") ? options.rows : auditRows(), { status: options.auditStatus ?? 200 });
  };
  return { fetchImpl, calls, get contextReads() { return contextReads; } };
}

export async function runSmoke(sources, { onCheck = () => {} } = {}) {
  const checks = [];
  const test = async (name, fn) => {
    try { await fn(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, detail: String(error.message).slice(0, 300) }); }
    onCheck(checks.at(-1));
  };
  const load = loadModules(sources);
  const { readPlatformAdminAudit: read } = load(READ);
  const { getPlatformAdminAuditConfig: config } = load(TRANSPORT);
  const { loadAuditTrail, handlePlatformAdminAuditRequest: handle } = load(RUNTIME);
  const run = async (options = {}, query = "", authorization = "Bearer fixture-token") => {
    const fake = fixture(options);
    const result = await read(authorization, new URLSearchParams(query), config(liveEnv), fake.fetchImpl);
    return { result, fake };
  };
  const denied = (result, state) => { assert.deepEqual(result, { state }); assert.equal("events" in result, false); };
  for (const authorization of [null, "", "Basic admin", "Bearer x y", `Bearer ${"x".repeat(8200)}`]) {
    await test(`anonymous or invalid bearer denied (${String(authorization).slice(0, 20)})`, async () => {
      const { result, fake } = await run({}, "role=admin&userId=claimed", authorization);
      denied(result, "unauthenticated"); assert.equal(fake.calls.length, 0);
    });
  }
  for (const [name, options] of [["invalid token", { authStatus: 401 }], ["anonymous auth account", { identity: { id: fixtureId, is_anonymous: true } }],
    ["unverified identity payload", { identity: { role: "admin", id: "claimed" } }]]) {
    await test(`${name} denied before authority`, async () => {
      const { result, fake } = await run(options); denied(result, "unauthenticated"); assert.equal(fake.calls.length, 1);
    });
  }
  for (const [name, query, metadata] of [["consumer", "", {}], ["Restaurant Owner alone", "restaurantOwner=true", { role: "restaurant_owner" }],
    ["revoked Admin", "", { role: "admin", status: "revoked" }], ["caller role=admin", "role=admin", { role: "admin" }],
    ["caller user UUID", `userId=${fixtureId}`, {}], ["mock/demo claims", "mode=mock&isAdmin=true", { demo: true }]]) {
    await test(`${name} cannot grant audit authority`, async () => {
      const { result, fake } = await run({ contextRows: [], metadata }, query);
      denied(result, "forbidden"); assert.equal(fake.calls.length, 2, "denial must happen before reading audit");
    });
  }
  await test("active Admin is accepted through verified identity and RA-1A", async () => {
    const { result, fake } = await run(); assert.equal(result.state, "ready");
    assert.equal(fake.calls.length, 4); assert.equal(fake.contextReads, 2);
    assert.deepEqual(fake.calls.map((call) => call.url.pathname), ["/auth/v1/user", "/rest/v1/rpc/platform_admin_current_context_v1",
      "/rest/v1/rpc/platform_admin_audit_log_v1", "/rest/v1/rpc/platform_admin_current_context_v1"]);
  });
  await test("admin_audit.read is required in addition to active Admin", async () => {
    const { result, fake } = await run({ contextRows: [activeRows[0]] }); denied(result, "forbidden"); assert.equal(fake.calls.length, 2);
  });
  for (const afterRows of [[], [activeRows[0]]]) await test("revocation or permission loss during read denies", async () => {
    const { result } = await run({ afterRows }); denied(result, "forbidden");
  });
  for (const contextRows of [null, {}, [{ ...activeRows[1], role_key: "restaurant_owner" }], [{ ...activeRows[1], permission_scope: "self" }],
    [{ ...activeRows[1], permission_key: "private.read" }], [...activeRows, activeRows[0]]]) {
    await test(`malformed authority fails closed ${JSON.stringify(contextRows)}`, async () => {
      const { result, fake } = await run({ contextRows });
      denied(result, "unavailable"); assert.equal(fake.calls.length, 2);
    });
  }
  await test("default page is 20, includes bounded metadata only", async () => {
    const { result } = await run(); assert.equal(result.events.length, 20); assert.equal(result.page, 1);
    assert.equal(result.pageSize, 20); assert.equal(result.sourceWindow, 500); assert.equal(result.hasNextPage, true);
    assert.deepEqual(Object.keys(result).sort(), ["events", "hasNextPage", "page", "pageSize", "sourceWindow", "state"].sort());
  });
  for (const size of [50, 51, 500, 999999999]) await test(`page size ${size} capped at 50`, async () => {
    const { result } = await run({}, `pageSize=${size}`); assert.equal(result.pageSize, 50); assert.equal(result.events.length, 50);
  });
  for (const query of ["pageSize=all", "pageSize=0", "pageSize=-1", "pageSize=1.5", "pageSize=NaN", "pageSize=", "page=0", "page=-1",
    "page=26", "pageSize=50&page=11", "page=999999999", "pageSize=20&pageSize=50", "page=1&page=2"]) {
    await test(`invalid pagination denied: ${query}`, async () => {
      const { result, fake } = await run({}, query); denied(result, "invalid_request"); assert.equal(fake.calls.length, 0);
    });
  }
  await test("fetch-all, SQL order and column selection cannot alter request", async () => {
    const { result } = await run({}, "all=true&limit=99999&order=created_at;drop+table&select=*&columns=reason&userId=other&role=admin");
    assert.equal(result.events.length, 20);
  });
  await test("500 source rows paginate to bounded last page", async () => {
    const { result } = await run({ rows: auditRows(500) }, "page=25");
    assert.equal(result.events.length, 20); assert.equal(result.hasNextPage, false);
    assert.equal(result.events[19].occurredAt, auditRows(500)[499].created_at);
  });
  await test("oversize upstream source rejected", async () => { denied((await run({ rows: auditRows(501) })).result, "unavailable"); });
  await test("non-array upstream source rejected", async () => { denied((await run({ rows: {} })).result, "unavailable"); });
  await test("empty authorized window is valid", async () => {
    const { result } = await run({ rows: [] }); assert.equal(result.state, "ready"); assert.deepEqual(result.events, []); assert.equal(result.hasNextPage, false);
  });
  await test("page beyond current window is empty and cannot advance", async () => {
    const { result } = await run({ rows: auditRows(1) }, "page=2"); assert.deepEqual(result.events, []); assert.equal(result.hasNextPage, false);
  });
  await test("stable frozen ordering and page boundary preserved", async () => {
    const first = (await run({}, "page=1")).result, second = (await run({}, "page=2")).result;
    assert.equal(first.events.at(-1).occurredAt, auditRows()[19].created_at);
    assert.equal(second.events[0].occurredAt, auditRows()[20].created_at);
    assert.deepEqual(first, (await run({}, "page=1")).result);
  });
  await test("microsecond and UUID tie ordering is inherited without JS resort", async () => {
    const rows = auditRows(3); rows[0].created_at = "2026-09-03T12:00:00.000999+00:00";
    rows[1].created_at = rows[2].created_at = "2026-09-03T12:00:00.000001+00:00";
    rows[1].result = "rejected"; rows[2].action = "revoke_platform_admin"; rows[2].result = "revoked";
    const { result } = await run({ rows });
    assert.deepEqual(result.events.map((event) => event.outcome), ["granted", "rejected", "revoked"]);
  });
  await test("DTO allowlist excludes UUIDs, IDs, unrestricted reasons and metadata", async () => {
    const { result } = await run();
    for (const event of result.events) assert.deepEqual(Object.keys(event).sort(), ["action", "occurredAt", "outcome", "role"]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|actor|target|membership|reason|sql|security|token/);
    for (const row of auditRows()) {
      for (const field of ["id", "actor_auth_user_id", "target_id", "reason", "membership_id"]) {
        assert.equal(JSON.stringify(result).includes(row[field]), false, `raw ${field} exposed`);
      }
    }
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.events) && Object.isFrozen(result.events[0]));
  });
  for (const update of [{ action: "FREE_TEXT_PRIVATE_REASON" }, { result: "PRIVATE_SQL_METADATA" }, { target_type: "auth.users" },
    { created_at: "yesterday" }, { created_at: "PRIVATE_SECURITY_TOKEN" }, { created_at: null }]) {
    await test(`malformed event refused ${JSON.stringify(update)}`, async () => {
      denied((await run({ rows: [{ ...auditRows(1)[0], ...update }] })).result, "unavailable");
    });
  }
  for (const options of [{ throwNetwork: true }, { authStatus: 500 }, { contextStatus: 500 }, { auditStatus: 500 }]) {
    await test(`upstream failures redact errors ${JSON.stringify(options)}`, async () => { denied((await run(options)).result, "unavailable"); });
  }
  await test("audit RPC rejection is denied without data", async () => { denied((await run({ auditStatus: 403 })).result, "forbidden"); });
  await test("expired token during audit is unauthenticated", async () => { denied((await run({ auditStatus: 401 })).result, "unauthenticated"); });
  for (const env of [{}, { NODE_ENV: "production" }, { ...liveEnv, TASTKIND_ADMIN_AUDIT_DATA_SOURCE: "unknown" },
    { ...liveEnv, TASTKIND_SUPABASE_URL: "http://audit.invalid" }, { ...liveEnv, TASTKIND_SUPABASE_URL: "https://user:pass@audit.invalid" },
    { ...liveEnv, TASTKIND_SUPABASE_PUBLISHABLE_KEY: "sb_secret_invalid_fixture" }, { ...liveEnv, TASTKIND_SUPABASE_PUBLISHABLE_KEY: "eyJ.privileged.fixture" },
    { ...liveEnv, TASTKIND_SUPABASE_URL: "https://audit.invalid/rest/v1" }]) {
    await test(`non-live or invalid config cannot grant authority ${JSON.stringify(env)}`, async () => {
      const fake = fixture(); denied(await read("Bearer fixture-token", new URLSearchParams(), config(env), fake.fetchImpl), "unavailable"); assert.equal(fake.calls.length, 0);
    });
  }
  await test("mock page composition is explicit and performs no live read", async () => {
    const fake = fixture(); assert.deepEqual(await loadAuditTrail(null, new URLSearchParams(), { NODE_ENV: "test", TASTKIND_ADMIN_AUDIT_DATA_SOURCE: "mock" }, fake.fetchImpl), { mode: "mock" });
    assert.equal(fake.calls.length, 0);
  });
  await test("production refuses mock mode", async () => { assert.equal(config({ NODE_ENV: "production", TASTKIND_ADMIN_AUDIT_DATA_SOURCE: "mock" }).mode, "disabled"); });
  await test("live denial never composes mock", async () => {
    const fake = fixture({ contextRows: [] }); const value = await loadAuditTrail("Bearer fixture-token", new URLSearchParams("mode=mock"), liveEnv, fake.fetchImpl);
    assert.deepEqual(value, { mode: "live", result: { state: "forbidden" } });
  });
  await test("live outage never composes mock", async () => {
    const fake = fixture({ throwNetwork: true }); assert.deepEqual(await loadAuditTrail("Bearer fixture-token", new URLSearchParams(), liveEnv, fake.fetchImpl), { mode: "live", result: { state: "unavailable" } });
  });
  for (const [status, options, query, token] of [[200, {}, "", "Bearer fixture-token"], [401, {}, "", null], [403, { contextRows: [] }, "", "Bearer fixture-token"],
    [503, { throwNetwork: true }, "", "Bearer fixture-token"], [400, {}, "page=0", "Bearer fixture-token"]]) {
    await test(`HTTP ${status} uses canonical result and no-store`, async () => {
      const fake = fixture(options); const response = await handle(new Request(`https://admin.invalid/api/platform-admin/audit?${query}`, {
        headers: { ...(token ? { Authorization: token } : {}), "x-user-id": fixtureId, "x-role": "admin" }
      }), liveEnv, fake.fetchImpl);
      assert.equal(response.status, status); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("Vary"), "Authorization"); assert.doesNotMatch(await response.text(), /PRIVATE|actor|reason|mock/);
    });
  }
  await test("mock config cannot supply data to canonical endpoint", async () => {
    const fake = fixture(); const response = await handle(new Request("https://admin.invalid/api/platform-admin/audit"), { NODE_ENV: "test" }, fake.fetchImpl);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { state: "unavailable" }); assert.equal(fake.calls.length, 0);
  });
  await test("real page consumes live DTO and never calls mock services on denial", async () => {
    let mockCalls = 0;
    const pageLoad = loadModules(sources, {
      "next/headers": { headers: () => new Headers() },
      "../../server/platformAdminAuditRuntime": { loadAuditTrail: async () => ({ mode: "live", result: { state: "forbidden" } }) },
      "../../services/admin-audit-service": { adminAuditService: { listAuditLogs: () => { mockCalls++; return []; }, listActionDrafts: () => { mockCalls++; return []; } } },
      "next/link": { __esModule: true, default: (props) => requireReact("react").createElement("a", props) }
    });
    const tree = await pageLoad(PAGE).default({}); const html = requireReact("react-dom/server").renderToStaticMarkup(tree);
    assert.equal(mockCalls, 0); assert.match(html, /沒有讀取/); assert.doesNotMatch(html, /示範資料（Mock）/);
  });
  await test("live component renders bounded events and pagination", async () => {
    const result = (await run()).result;
    const html = requireReact("react-dom/server").renderToStaticMarkup(requireReact("react").createElement(load(UI).PlatformAdminAudit, { result }));
    assert.match(html, /正式資料/); assert.match(html, /page=2&amp;pageSize=20/); assert.doesNotMatch(html, /PRIVATE|actor|target_id|reason/);
  });
  return checks;
}

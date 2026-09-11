#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import ts from "typescript";

const P3_P2_HEAD = "ab59cdc13317ee70482ae168923ac45f9b016906";
const P3_P3_SUBJECT = "Enforce current Admin route permissions";
const CURRENT_KEYS = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"];
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const walk = (directory) => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const target = path.posix.join(directory, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});
const checks = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1200)}`);
};
function executeTypeScript(file, requireModule = () => { throw new Error(`Unexpected runtime import from ${file}`); }) {
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

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = git("status", "--short");
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changed = [...new Set([...lines(git("diff", "--name-only", P3_P2_HEAD)), ...untracked])].sort();
const candidate = head === P3_P2_HEAD && origin === P3_P2_HEAD && ahead === 0 && behind === 0;
const frozen = head !== P3_P2_HEAD && git("rev-parse", "HEAD^") === P3_P2_HEAD && origin === P3_P2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P3_SUBJECT && status === "";
check("exact P3-P2 predecessor or one local P3-P3 freeze is recognized", candidate || frozen, { head, origin, ahead, behind, status });

const vocabulary = executeTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const currentContext = executeTypeScript("apps/admin-web/auth/admin-current-permission-context.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected current-context import: ${request}`);
});
const registry = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected registry import: ${request}`);
});
const authorization = executeTypeScript("apps/admin-web/auth/admin-route-authorization.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-current-permission-context") return currentContext;
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected authorization import: ${request}`);
});
const navigation = executeTypeScript("apps/admin-web/components/admin-shell/admin-ia-navigation.ts", (request) => {
  if (request === "../../auth/admin-route-registry") return registry;
  throw new Error(`Unexpected navigation import: ${request}`);
});

const factory = read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx");
const accessState = read("apps/admin-web/components/admin-shell/AdminAccessState.tsx");
const routeAuthority = read("apps/admin-web/auth/admin-route-authorization.ts");
const p3p2Factory = git("show", `${P3_P2_HEAD}:apps/admin-web/components/admin-shell/AdminRegistryPage.tsx`).replace(/\r\n/g, "\n");
const currentRoutes = registry.ADMIN_ROUTE_REGISTRY.filter((route) => authorization.resolveAdminRouteRequirement(route).state === "current_permissions");
const baseRoutes = registry.ADMIN_ROUTE_REGISTRY.filter((route) => authorization.resolveAdminRouteRequirement(route).state === "base_admin");
const plannedRoutes = registry.ADMIN_ROUTE_REGISTRY.filter((route) => route.requiredPermissions.some((key) => registry.ADMIN_PERMISSION_REGISTRY.find((permission) => permission.key === key)?.status === "PLANNED"));
const currentRouteFacts = currentRoutes.map((route) => `${route.id}:${route.route}`).sort();
const expectedCurrentRouteFacts = [
  "audit-platform-memberships:/admin/audit/platform-memberships",
  "audit:/admin/audit",
  "restaurant-branch-status:/admin/restaurants/[restaurantId]/branches/[branchId]/status"
].sort();

check("P3-P1 base session gate is byte-identical", read("apps/admin-web/auth/admin-session-gate.ts").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/auth/admin-session-gate.ts`).replace(/\r\n/g, "\n").trimEnd());
check("P3-P2 verified current-permission context is reused", factory.includes("getVerifiedAdminPermissionContext") && factory.includes("resolveAdminRouteAuthorization"));
check("P3-P2 permission resolver remains byte-identical", ["apps/admin-web/auth/admin-context.ts", "apps/admin-web/auth/admin-current-permission-context.ts"].every((file) => read(file).trimEnd() === git("show", `${P3_P2_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("no second permission resolver was introduced", !/auth\.getUser|client\.rpc|createAdminSupabaseServerClient/.test(routeAuthority));
check("canonical route metadata resolves before authority I/O", factory.indexOf("getAdminRoute(routeId)") < factory.indexOf("getVerifiedAdminPermissionContext()") && factory.indexOf("resolveAdminRouteRequirement(route)") < factory.indexOf("getVerifiedAdminContext()"));
check("unknown canonical decision remains not registered", authorization.resolveAdminRouteRequirement(null).state === "not_registered" && factory.includes("notFound()"));
check("unknown pathname remains unmatched", navigation.matchAdminRoute("/admin/does-not-exist") === null);
check("login is explicitly exempt", authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "admin-login")).state === "login_exempt");
check("login page remains outside the canonical protected factory", !read("apps/admin-web/app/admin/login/page.tsx").includes("createAdminRegistryPage"));
check("current route checks reuse exact-match helper", routeAuthority.includes("hasCurrentAdminPermission(context, permission)"));
check("route authorization contains no wildcard", !/startsWith\(|endsWith\(|permission.*\*/i.test(routeAuthority));
check("route authorization contains no namespace-prefix implication", !/split\(|substring\(|slice\(/.test(routeAuthority));
check("PLANNED keys are classified without entering the current helper", routeAuthority.includes("plannedPermissionKeys.has(permission)") && routeAuthority.indexOf("plannedPermissionKeys.has(permission)") < routeAuthority.indexOf("decideCurrentPermissions"));
check("PLANNED routes use temporary base-Admin policy", plannedRoutes.length === 89 && plannedRoutes.every((route) => authorization.resolveAdminRouteRequirement(route).state === "base_admin"), plannedRoutes.length);
check("missing CURRENT permission produces permission denial", authorization.resolveAdminRouteAuthorization({ requirement: authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "audit")), currentPermissionContext: { state: "admin", subject: "11111111-1111-4111-8111-111111111111", roleKey: "platform_admin", permissions: ["admin_context.read"] } }).state === "permission_denied");
check("current authority failure remains unavailable", authorization.resolveAdminRouteAuthorization({ requirement: authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "audit")), currentPermissionContext: { state: "unavailable", reason: "permission_authority_unreachable" } }).state === "authority_unavailable");
check("permission denial is distinct server-rendered UX", factory.includes("<AdminPermissionDenied />") && accessState.includes("你沒有存取此管理功能的權限。") && !accessState.includes("admin_audit.read"));
check("authorization decision precedes shell and protected page body", factory.indexOf("const decision") < factory.indexOf("<AdminShell>") && factory.indexOf("permission_denied") < factory.indexOf("<AdminRegistryPage routeId={routeId}"));
check("all 93 protected physical pages use the central factory", walk("apps/admin-web/app/admin").filter((file) => file.endsWith("/page.tsx") && file !== "apps/admin-web/app/admin/login/page.tsx").every((file) => read(file).includes("createAdminRegistryPage")));
check("dynamic contextual branch route is CURRENT-enforced", navigation.matchAdminRoute("/admin/restaurants/r1/branches/b1/status")?.entry.id === "restaurant-branch-status" && currentRouteFacts.includes("restaurant-branch-status:/admin/restaurants/[restaurantId]/branches/[branchId]/status"));
check("static route still outranks overlapping dynamic route", navigation.matchAdminRoute("/admin/restaurants/menu-management")?.entry.id === "menu-management");
check("break-glass remains hidden and without a physical page", authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "break-glass")).state === "not_registered" && !exists("apps/admin-web/app/admin/break-glass/page.tsx"));
check("availability is independent from route authority", routeAuthority.includes("requiredPermissions") && !routeAuthority.includes(".availability"));
check("Sidebar remains byte-identical with no filtering", read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/components/admin-shell/AdminSidebar.tsx`).replace(/\r\n/g, "\n").trimEnd());
const dashboardBefore = p3p2Factory.slice(p3p2Factory.indexOf("function Dashboard()"), p3p2Factory.indexOf("export function AdminRegistryPage"));
const dashboardAfter = factory.slice(factory.indexOf("function Dashboard()"), factory.indexOf("export function AdminRegistryPage"));
check("Dashboard rendering remains byte-identical with no filtering", dashboardAfter === dashboardBefore);

const apiPaths = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts",
  "apps/admin-web/server/platformAdminAuditRuntime.ts",
  "apps/admin-web/server/platformAdminAuditRead.ts",
  "apps/admin-web/server/platformAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusRuntime.ts",
  "apps/admin-web/server/platformAdminBranchStatusTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusAuthority.ts"
];
check("existing Admin APIs remain byte-identical and bearer-only", apiPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P2_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()) && /readVerifiedBearer|authorization/i.test(apiPaths.map(read).join("\n")));
check("database migrations are unchanged", changed.every((file) => !file.startsWith("supabase/migrations/")), changed);
const applicationChanges = changed.filter((file) => exists(file) && !file.startsWith("scripts/")).map(read).join("\n");
check("service_role is not used", !/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(applicationChanges));
check("current vocabulary remains exactly three", JSON.stringify(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS) === JSON.stringify(CURRENT_KEYS));
check("no permission key was added or promoted", read("apps/admin-web/auth/admin-route-registry.ts").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/auth/admin-route-registry.ts`).replace(/\r\n/g, "\n").trimEnd());
check("current-enforced route set is exactly the three registry mappings", JSON.stringify(currentRouteFacts) === JSON.stringify(expectedCurrentRouteFacts), currentRouteFacts);
check("dashboard admin_context requirement remains the existing base gate", authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "dashboard")).state === "base_admin");
check("base-gate protected route count is exactly 90", baseRoutes.length === 90, baseRoutes.length);
check("no client-side permission decision exists", !routeAuthority.startsWith('"use client"') && !factory.startsWith('"use client"'));
check("permission authority remains request-local", read("apps/admin-web/auth/admin-context.ts").includes("getVerifiedAdminAuthorityRequest = cache") && !/new Map|setInterval|setTimeout|localStorage|sessionStorage|permission.*ttl/i.test(routeAuthority));
check("permission-denied UX exposes no authority internals", !/platform_admin|permission_key|rpc|database/i.test(accessState.slice(accessState.indexOf("export function AdminPermissionDenied"))));

const allowed = (file) =>
  file === "package.json"
  || file === "apps/admin-web/auth/admin-route-authorization.ts"
  || file === "apps/admin-web/components/admin-shell/AdminAccessState.tsx"
  || file === "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"
  || file === "scripts/admin-route-authorization-p3-p3-guard.mjs"
  || file === "scripts/admin-route-authorization-p3-p3-smoke.mjs"
  || ["scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs", "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-session-p3-p1-smoke.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-current-permissions-p3-p2-smoke.mjs"].includes(file);
check("diff remains inside the exact P3-P3 boundary", changed.every(allowed), changed.filter((file) => !allowed(file)));
check("no dependency or lockfile change exists", !changed.some((file) => /lock/i.test(file)) && JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${P3_P2_HEAD}:package.json`)).dependencies ?? {}));
const pkg = JSON.parse(read("package.json"));
check("P3-P3 guard and smoke package scripts are registered", pkg.scripts["test:admin-route-authorization-p3-p3"] === "node scripts/admin-route-authorization-p3-p3-guard.mjs" && pkg.scripts["test:admin-route-authorization-p3-p3-smoke"] === "node scripts/admin-route-authorization-p3-p3-smoke.mjs");

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-route-authorization-p3-p3-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  currentEnforcedRoutes: currentRouteFacts,
  currentEnforcedRouteCount: currentRoutes.length,
  baseGateRouteCount: baseRoutes.length,
  plannedMetadataRouteCount: plannedRoutes.length,
  changedPathCount: changed.length,
  changedPaths: changed,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length) process.exitCode = 1;

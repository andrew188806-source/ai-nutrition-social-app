#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import ts from "typescript";

const P3_P2_HEAD = "ab59cdc13317ee70482ae168923ac45f9b016906";
const P3_P3_SUBJECT = "Enforce current Admin route permissions";
const P3_P3_HEAD = "abb747551a9dd5c97988b44cff0c16f6f555eed8";
const P3_P4_SUBJECT = "Filter Admin navigation by current permissions";
const P3_P4_HEAD = "61256ade3bb8e92d57264bc9ef322f6a351825c4";
const P3_P5_SUBJECT = "Allow Admin APIs from browser sessions";
const P3_P5_HEAD = "2ddc6eadeb344d40cba57958874a808fb79dc19d";
const P3_P5_R1_SUBJECT = "Classify missing Admin sessions as unauthenticated";
const P3_P5_R1_CONTEXT_BLOB = "1d4d98975b574fec0ce8b22a301d248668e7df89";
const P3_P5_R1_HEAD = "e79cca87fe2eea689251d86008b23edb6dc9d5d4";
const P1A_SUBJECT = "Add staff authority identity foundation";
const P1A_MIGRATION = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1A_PATHS = [
  P1A_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1a-smoke.mjs", "scripts/staff-authority-p3-p6-p1a-mutations.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P1A_HEAD = "0d60c787c1919aaf44d7714a1fd03b419469ba15";
const P1B_SUBJECT = "Add staff bundle entitlement foundation";
const P1B_MIGRATION = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const P1B_PATHS = [
  P1B_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1b-smoke.mjs", "scripts/staff-authority-p3-p6-p1b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs", "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P1B_HEAD = "2cb5f50944a8bff261d9f5d8dc7457ad9f6247a7";
const P1C_HEAD = "78dcdaba1cebbbe3ec99a5d56b5361ba1a16a31a";
const P1C_SUBJECT = "Add sealed staff authority materializer";
const P1C_MIGRATION = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const P1C_PATHS = [
  P1C_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p1c-smoke.mjs", "scripts/staff-authority-p3-p6-p1c-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P2A_SUBJECT = "Add staff effective permission resolver";
const P2A_MIGRATION = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const P2A_PATHS = [
  P2A_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p2a-smoke.mjs", "scripts/staff-authority-p3-p6-p2a-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const CURRENT_KEYS = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"];
const P2A_HEAD = "8c8ab93fc091f76f8b0af535c910d8a5227d48cb";
const P2B_SUBJECT = "Add Platform Admin staff compatibility bridge";
const P2B_MIGRATION = "supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql";
const P2B_PATHS = [
  P2B_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2b-smoke.mjs", "scripts/staff-authority-p3-p6-p2b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P2C_HEAD = "8dbd14b65b8734842095ce809686ce5929cc5958";
const P2C_SUBJECT = "Add Admin staff authority shadow comparison";
const P2C_SHADOW = "apps/admin-web/auth/admin-staff-authority-shadow.ts";
const P2C_APP_PATHS = ["apps/admin-web/auth/admin-context.ts", P2C_SHADOW];
const P2C_PATHS = [
  "package.json", ...P2C_APP_PATHS,
  "scripts/staff-authority-p3-p6-p2c-guard.mjs", "scripts/staff-authority-p3-p6-p2c-smoke.mjs", "scripts/staff-authority-p3-p6-p2c-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p2b-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs", "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
];
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
const pushed = head === P3_P3_HEAD && origin === P3_P3_HEAD && ahead === 0 && behind === 0;
const p3P4Frozen = head !== P3_P3_HEAD && git("rev-parse", "HEAD^") === P3_P3_HEAD && origin === P3_P3_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P4_SUBJECT && status === "";
const p3P4Pushed = head === P3_P4_HEAD && origin === P3_P4_HEAD && ahead === 0 && behind === 0;
const p3P5Frozen = head !== P3_P4_HEAD && git("rev-parse", "HEAD^") === P3_P4_HEAD && origin === P3_P4_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_SUBJECT && status === "";
const p3P5R1Candidate = head === P3_P5_HEAD && origin === P3_P4_HEAD && ahead === 1 && behind === 0;
const p3P5R1Frozen = head !== P3_P5_HEAD && git("rev-parse", "HEAD^") === P3_P5_HEAD && origin === P3_P4_HEAD
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_R1_SUBJECT && status === "";
const p1aCandidate = head === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD && ahead === 0 && behind === 0;
const p1aFrozen = head !== P3_P5_R1_HEAD && git("rev-parse", "HEAD^") === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1A_SUBJECT && status === "";
const p1aPushed = head === P1A_HEAD && origin === P1A_HEAD && ahead === 0 && behind === 0;
const p1bCandidate = p1aPushed;
const p1bFrozen = head !== P1A_HEAD && git("rev-parse", "HEAD^") === P1A_HEAD && origin === P1A_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1B_SUBJECT && status === "";
const p1bPushed = head === P1B_HEAD && origin === P1B_HEAD && ahead === 0 && behind === 0;
const p1cCandidate = p1bPushed;
const p1cFrozen = head !== P1B_HEAD && git("rev-parse", "HEAD^") === P1B_HEAD && origin === P1B_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1C_SUBJECT && status === "";
const p1cPushed = head === P1C_HEAD && origin === P1C_HEAD && ahead === 0 && behind === 0;
const p2aCandidate = p1cPushed;
const p2aFrozen = head !== P1C_HEAD && git("rev-parse", "HEAD^") === P1C_HEAD && origin === P1C_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P2A_SUBJECT && status === "";
const p2cCandidate = head === P2C_HEAD && origin === P2C_HEAD && ahead === 0 && behind === 0;
const p2cFrozen = head !== P2C_HEAD && git("rev-parse", "HEAD^") === P2C_HEAD && origin === P2C_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2C_SUBJECT;
const p2cPhase = p2cCandidate || p2cFrozen;
const p2bCandidate = head === P2A_HEAD && origin === P2A_HEAD && ahead === 0 && behind === 0;
const p2bFrozen = head !== P2A_HEAD && git("rev-parse", "HEAD^") === P2A_HEAD && origin === P2A_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P2B_SUBJECT && status === "";
const p2bPhase = p2bCandidate || p2bFrozen || p2cPhase;
const p2aPhase = p2aCandidate || p2aFrozen || p2bPhase;
const p1cPhase = p1cCandidate || p1cFrozen || p1cPushed || p2aPhase;
const p1bPhase = p1bCandidate || p1bFrozen || p1cPhase;
const p1aPhase = p1aCandidate || p1aFrozen || p1bPhase;
const p3P5R1Phase = p3P5R1Candidate || p3P5R1Frozen || p1aPhase;
const p3P5Phase = p3P4Pushed || p3P5Frozen || p3P5R1Phase;
const p3P4Phase = pushed || p3P4Frozen || p3P5Phase;
check("exact P3-P2 through P3-P4 lifecycle or one local P3-P5 freeze is recognized", candidate || frozen || p3P4Phase, { head, origin, ahead, behind, status });

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
check("P3-P2 permission resolver remains exact through the bounded R1 classification repair",
  read("apps/admin-web/auth/admin-current-permission-context.ts").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/auth/admin-current-permission-context.ts`).replace(/\r\n/g, "\n").trimEnd()
    && (p2cPhase
      ? read("apps/admin-web/auth/admin-context.ts").includes('import { resolveAdminStaffAuthorityShadow } from "./admin-staff-authority-shadow";')
        && read("apps/admin-web/auth/admin-context.ts").includes("await resolveAdminStaffAuthorityShadow(client, authoritativeContext);\n  return authoritativeContext;")
        && (read("apps/admin-web/auth/admin-context.ts").match(/auth\.getUser\(\)/g) ?? []).length === 1
      : p3P5R1Phase
      ? git("hash-object", "apps/admin-web/auth/admin-context.ts") === P3_P5_R1_CONTEXT_BLOB
      : read("apps/admin-web/auth/admin-context.ts").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/auth/admin-context.ts`).replace(/\r\n/g, "\n").trimEnd()));
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
check("authorization decision precedes shell and protected page body", factory.indexOf("const decision") < factory.indexOf("<AdminShell") && factory.indexOf("permission_denied") < factory.indexOf("<AdminRegistryPage routeId={routeId}"));
check("all 93 protected physical pages use the central factory", walk("apps/admin-web/app/admin").filter((file) => file.endsWith("/page.tsx") && file !== "apps/admin-web/app/admin/login/page.tsx").every((file) => read(file).includes("createAdminRegistryPage")));
check("dynamic contextual branch route is CURRENT-enforced", navigation.matchAdminRoute("/admin/restaurants/r1/branches/b1/status")?.entry.id === "restaurant-branch-status" && currentRouteFacts.includes("restaurant-branch-status:/admin/restaurants/[restaurantId]/branches/[branchId]/status"));
check("static route still outranks overlapping dynamic route", navigation.matchAdminRoute("/admin/restaurants/menu-management")?.entry.id === "menu-management");
check("break-glass remains hidden and without a physical page", authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "break-glass")).state === "not_registered" && !exists("apps/admin-web/app/admin/break-glass/page.tsx"));
check("availability is independent from route authority", routeAuthority.includes("requiredPermissions") && !routeAuthority.includes(".availability"));
check("Sidebar is historically unchanged or its exact P3-P4 successor consumes server-derived route IDs", p3P4Phase
  ? read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").includes("buildAdminScaffoldNavigation(visibleRouteIds, linkRouteIds)")
  : read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/components/admin-shell/AdminSidebar.tsx`).replace(/\r\n/g, "\n").trimEnd());
const dashboardBefore = p3p2Factory.slice(p3p2Factory.indexOf("function Dashboard()"), p3p2Factory.indexOf("export function AdminRegistryPage"));
const dashboardAfter = factory.slice(factory.indexOf("function Dashboard()"), factory.indexOf("export function AdminRegistryPage"));
check("Dashboard is historically unchanged or its exact P3-P4 successor uses the shared visibility model", p3P4Phase
  ? factory.includes("function Dashboard({ visibility }") && factory.includes("linked.has(id)")
  : dashboardAfter === dashboardBefore);

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
const preservedBearerApiPaths = apiPaths.filter((file) => !file.endsWith("Runtime.ts"));
check("existing Admin APIs remain bearer-compatible through exact P3-P5 composition", p3P5Phase
  ? preservedBearerApiPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P2_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd())
    && apiPaths.filter((file) => file.endsWith("Runtime.ts")).every((file) => read(file).includes("resolveAdminApiAuthorization"))
  : apiPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P2_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()) && /readVerifiedBearer|authorization/i.test(apiPaths.map(read).join("\n")));
check("database migrations are unchanged except the exact P1A successor", changed.filter((file) => file.startsWith("supabase/migrations/")).every((file) => p1aPhase && (file === P1A_MIGRATION || (p1bPhase && file === P1B_MIGRATION) || (p1cPhase && file === P1C_MIGRATION) || (p2aPhase && file === P2A_MIGRATION) || (p2bPhase && file === P2B_MIGRATION))), changed.filter((file) => file.startsWith("supabase/migrations/")));
const applicationChanges = changed.filter((file) => exists(file) && file.startsWith("apps/")).map(read).join("\n");
check("service_role is not used", !/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(applicationChanges));
check("current vocabulary remains exactly three", JSON.stringify(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS) === JSON.stringify(CURRENT_KEYS));
check("no permission key was added or promoted", read("apps/admin-web/auth/admin-route-registry.ts").trimEnd() === git("show", `${P3_P2_HEAD}:apps/admin-web/auth/admin-route-registry.ts`).replace(/\r\n/g, "\n").trimEnd());
check("current-enforced route set is exactly the three registry mappings", JSON.stringify(currentRouteFacts) === JSON.stringify(expectedCurrentRouteFacts), currentRouteFacts);
check("dashboard admin_context requirement remains the existing base gate", authorization.resolveAdminRouteRequirement(registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "dashboard")).state === "base_admin");
check("base-gate protected route count is exactly 90", baseRoutes.length === 90, baseRoutes.length);
check("no client-side permission decision exists", !routeAuthority.startsWith('"use client"') && !factory.startsWith('"use client"'));
check("permission authority remains request-local", read("apps/admin-web/auth/admin-context.ts").includes("getVerifiedAdminAuthorityRequest = cache") && !/new Map|setInterval|setTimeout|localStorage|sessionStorage|permission.*ttl/i.test(routeAuthority));
check("permission-denied UX exposes no authority internals", !/platform_admin|permission_key|rpc|database/i.test(accessState.slice(accessState.indexOf("export function AdminPermissionDenied"))));

const allowed = (file) => (p2cPhase && P2C_PATHS.includes(file))
  ||
  file === "package.json"
  || file === "apps/admin-web/auth/admin-context.ts"
  || file === "apps/admin-web/auth/admin-route-authorization.ts"
  || file === "apps/admin-web/auth/admin-navigation-visibility.ts"
  || file === "apps/admin-web/auth/admin-api-authorization.ts"
  || file === "apps/admin-web/server/platformAdminAuditRuntime.ts"
  || file === "apps/admin-web/server/platformAdminBranchStatusRuntime.ts"
  || file === "apps/admin-web/components/admin-shell/AdminAccessState.tsx"
  || file.startsWith("apps/admin-web/components/admin-shell/")
  || file === "scripts/admin-route-authorization-p3-p3-guard.mjs"
  || file === "scripts/admin-route-authorization-p3-p3-smoke.mjs"
  || file === "scripts/admin-navigation-p3-p4-guard.mjs"
  || file === "scripts/admin-navigation-p3-p4-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-guard.mjs"
  || file === "scripts/admin-api-session-p3-p5-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-guard.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
  || (p1aPhase && P1A_PATHS.includes(file))
  || (p1bPhase && P1B_PATHS.includes(file))
  || (p1cPhase && P1C_PATHS.includes(file))
  || (p2aPhase && P2A_PATHS.includes(file))
  || (p2bPhase && P2B_PATHS.includes(file))
  || ["scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs", "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-session-p3-p1-smoke.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-current-permissions-p3-p2-smoke.mjs"].includes(file);
check("diff remains inside the exact P3-P3 boundary", changed.every(allowed), changed.filter((file) => !allowed(file)));
check("no dependency or lockfile change exists", !changed.some((file) => /lock/i.test(file)) && JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${P3_P2_HEAD}:package.json`)).dependencies ?? {}));
const pkg = JSON.parse(read("package.json"));
check("P3-P3 guard and smoke package scripts are registered", pkg.scripts["test:admin-route-authorization-p3-p3"] === "node scripts/admin-route-authorization-p3-p3-guard.mjs" && pkg.scripts["test:admin-route-authorization-p3-p3-smoke"] === "node scripts/admin-route-authorization-p3-p3-smoke.mjs");

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-route-authorization-p3-p3-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : pushed ? "p3_p3_pushed" : p3P4Frozen ? "p3_p4_frozen_local"
    : p3P4Pushed ? "p3_p4_pushed" : p3P5Frozen ? "p3_p5_frozen_local"
      : p3P5R1Candidate ? "p3_p5_r1_candidate" : p3P5R1Frozen ? "p3_p5_r1_frozen_local" : p1aCandidate ? "p1a_candidate" : p1aFrozen ? "p1a_frozen_local" : p1bCandidate ? "p1b_candidate" : p1bFrozen ? "p1b_frozen_local" : p1cCandidate ? "p1c_candidate" : p1cFrozen ? "p1c_frozen_local" : p2aCandidate ? "p2a_candidate" : p2aFrozen ? "p2a_frozen_local" : p2bCandidate ? "p2b_candidate" : p2bFrozen ? "p2b_frozen_local" : p2cCandidate ? "p2c_candidate" : p2cFrozen ? "p2c_frozen_local" : p1cPushed ? "p1c_pushed" : "invalid",
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

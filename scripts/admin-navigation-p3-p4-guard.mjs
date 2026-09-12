#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import ts from "typescript";

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
const CURRENT_KEYS = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"];
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
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
const changed = [...new Set([...lines(git("diff", "--name-only", P3_P3_HEAD)), ...untracked])].sort();
const candidate = head === P3_P3_HEAD && origin === P3_P3_HEAD && ahead === 0 && behind === 0;
const frozen = head !== P3_P3_HEAD && git("rev-parse", "HEAD^") === P3_P3_HEAD && origin === P3_P3_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P4_SUBJECT && status === "";
const pushed = head === P3_P4_HEAD && origin === P3_P4_HEAD && ahead === 0 && behind === 0;
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
const p1cPhase = p1cCandidate || p1cFrozen;
const p1bPhase = p1bCandidate || p1bFrozen || p1cPhase;
const p1aPhase = p1aCandidate || p1aFrozen || p1bPhase;
const p3P5R1Phase = p3P5R1Candidate || p3P5R1Frozen || p1aPhase;
const p3P5Phase = pushed || p3P5Frozen || p3P5R1Phase;
check("exact P3-P3/P3-P4 lifecycle or one local P3-P5 freeze is recognized", candidate || frozen || p3P5Phase, { head, origin, ahead, behind, status });

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
const visibility = executeTypeScript("apps/admin-web/auth/admin-navigation-visibility.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-route-authorization") return authorization;
  throw new Error(`Unexpected visibility import: ${request}`);
});

const admin = (permissions) => ({ state: "admin", subject: "11111111-1111-4111-8111-111111111111", roleKey: "platform_admin", permissions });
const base = visibility.deriveAdminNavigationVisibility(admin(["admin_context.read"]));
const full = visibility.deriveAdminNavigationVisibility(admin(CURRENT_KEYS));
const linked = (model, id) => model.state === "ready" && model.linkRouteIds.includes(id);
const visible = (model, id) => model.state === "ready" && model.visibleRouteIds.includes(id);
const factory = read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx");
const routeAuthority = read("apps/admin-web/auth/admin-route-authorization.ts");
const visibilitySource = read("apps/admin-web/auth/admin-navigation-visibility.ts");
const shell = read("apps/admin-web/components/admin-shell/AdminShell.tsx");
const sidebar = read("apps/admin-web/components/admin-shell/AdminSidebar.tsx");
const sidebarSection = read("apps/admin-web/components/admin-shell/AdminSidebarSection.tsx");
const navigation = read("apps/admin-web/components/admin-shell/admin-ia-navigation.ts");
const fixtureParent = { ...registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "audit"), id: "fixture-parent", parentId: null, route: "/admin/fixture-parent", legacyRoutes: [] };
const fixtureChild = { ...registry.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "restaurant-branch-status"), id: "fixture-child", parentId: "fixture-parent", route: "/admin/fixture-parent/child", legacyRoutes: [] };
const structural = visibility.deriveAdminNavigationVisibility(admin(["admin_context.read", "admin_restaurant_branch.status.write"]), [fixtureParent, fixtureChild]);
const empty = visibility.deriveAdminNavigationVisibility(admin(["admin_context.read"]), [fixtureParent, { ...fixtureChild, requiredPermissions: ["admin_audit.read"] }]);

check("P3-P3 route authorization remains the independent server boundary", factory.includes("resolveAdminRouteAuthorization") && factory.indexOf("const decision") < factory.indexOf("const visibility = deriveAdminNavigationVisibility") && factory.indexOf("permission_denied") < factory.indexOf("<AdminShell"));
check("P3-P2 permission resolver remains exact through the bounded R1 classification repair",
  read("apps/admin-web/auth/admin-current-permission-context.ts").trimEnd() === git("show", `${P3_P3_HEAD}:apps/admin-web/auth/admin-current-permission-context.ts`).replace(/\r\n/g, "\n").trimEnd()
    && (p3P5R1Phase
      ? git("hash-object", "apps/admin-web/auth/admin-context.ts") === P3_P5_R1_CONTEXT_BLOB
      : read("apps/admin-web/auth/admin-context.ts").trimEnd() === git("show", `${P3_P3_HEAD}:apps/admin-web/auth/admin-context.ts`).replace(/\r\n/g, "\n").trimEnd()));
check("browser-provided permissions are never accepted", !/permissionContext|permissionKey|currentPermission|hasCurrentAdminPermission/.test(shell + sidebar + sidebarSection));
check("navigation visibility is derived at the protected server seam", !visibilitySource.startsWith('"use client"') && factory.includes("deriveAdminNavigationVisibility(") && factory.indexOf("deriveAdminNavigationVisibility(") < factory.indexOf("<AdminShell"));
check("Sidebar performs no authority resolution", !/getVerified|resolveAdminRouteAuthorization|deriveAdminNavigationVisibility|auth\.getUser|\.rpc\(/.test(sidebar));
check("Sidebar consumes the bounded visibility model instead of the full tree", sidebar.includes("visibleRouteIds") && sidebar.includes("linkRouteIds") && sidebar.includes("buildAdminScaffoldNavigation(visibleRouteIds, linkRouteIds)"));
check("Dashboard consumes the shared link visibility set", factory.includes("function Dashboard({ visibility }") && factory.includes("linked.has(id)"));
check("workspace child cards consume the same shared link visibility set", factory.includes("function WorkspaceLanding({") && factory.includes("linked.has(candidate.id)"));
check("held CURRENT routes are visible", linked(full, "audit") && linked(full, "audit-platform-memberships") && linked(full, "restaurant-branch-status"));
check("missing CURRENT routes are hidden as links", !linked(base, "audit") && !linked(base, "audit-platform-memberships") && !linked(base, "restaurant-branch-status"));
check("PLANNED routes remain visible under the temporary base policy", linked(base, "business-development") && linked(base, "operations") && linked(base, "management") && linked(base, "engineering"));
check("hidden routes are excluded", !visible(full, "admin-login"));
check("break-glass remains excluded and has no page", !visible(full, "break-glass") && !exists("apps/admin-web/app/admin/break-glass/page.tsx"));
check("necessary ancestors are retained without gaining link authority", visible(structural, "fixture-parent") && !linked(structural, "fixture-parent") && linked(structural, "fixture-child"));
check("empty structural groups are removed", empty.state === "ready" && empty.visibleRouteIds.length === 0);
check("denied direct routes still use the P3-P3 permission-denied state", factory.includes("<AdminPermissionDenied />") && routeAuthority.includes('state: "permission_denied"'));
check("unavailable permission authority produces no navigation", visibility.deriveAdminNavigationVisibility({ state: "unavailable", reason: "permission_authority_unreachable" }).state === "unavailable" && factory.includes('visibility.state === "unavailable"'));
check("canonical registry order is preserved", full.state === "ready" && full.linkRouteIds.every((id, index) => index === 0 || registry.ADMIN_ROUTE_REGISTRY.findIndex((route) => route.id === full.linkRouteIds[index - 1]) < registry.ADMIN_ROUTE_REGISTRY.findIndex((route) => route.id === id)));
check("availability remains independent from permission visibility", !visibilitySource.includes(".availability"));
check("visibility policy contains no wildcard matching", !/startsWith\(|endsWith\(|permission.*\*/i.test(visibilitySource + routeAuthority));
check("visibility policy contains no namespace-prefix implication", !/split\(|substring\(|slice\(/.test(visibilitySource + routeAuthority));
check("current permission vocabulary remains exactly three", JSON.stringify(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS) === JSON.stringify(CURRENT_KEYS));
check("no permission was added or promoted", read("apps/admin-web/auth/admin-route-registry.ts").trimEnd() === git("show", `${P3_P3_HEAD}:apps/admin-web/auth/admin-route-registry.ts`).replace(/\r\n/g, "\n").trimEnd());
check("PLANNED metadata still resolves through base policy", registry.ADMIN_ROUTE_REGISTRY.filter((route) => route.requiredPermissions.some((key) => registry.ADMIN_PERMISSION_REGISTRY.find((permission) => permission.key === key)?.status === "PLANNED")).every((route) => authorization.resolveAdminRouteRequirement(route).state === "base_admin"));
check("client receives canonical route IDs only", shell.includes("visibleRouteIds: readonly AdminRouteId[]") && shell.includes("linkRouteIds: readonly AdminRouteId[]") && !shell.includes("AdminPermission"));
check("unauthorized retained ancestors render as non-link grouping nodes", navigation.includes("href: string | null") && navigation.includes("linked.has(entry.id) ? entry.route : null") && sidebarSection.includes("node.href === null"));
check("Dashboard availability counts use only linked descendants", factory.includes("getAdminDescendants(workspace.id as AdminRouteId).filter((route) => linked.has(route.id))"));
check("workspace shortcuts use the shared visibility set", factory.includes("linked.has(shortcut.targetRouteId)"));
check("breadcrumbs remain byte-identical", read("apps/admin-web/components/admin-shell/AdminBreadcrumbs.tsx").trimEnd() === git("show", `${P3_P3_HEAD}:apps/admin-web/components/admin-shell/AdminBreadcrumbs.tsx`).replace(/\r\n/g, "\n").trimEnd());
check("request-local permission freshness is preserved", read("apps/admin-web/auth/admin-context.ts").includes("getVerifiedAdminAuthorityRequest = cache") && !/setInterval|setTimeout|localStorage|sessionStorage|permission.*ttl|navigation.*cache/i.test(visibilitySource));
check("mobile toggle and recursive Sidebar behavior remain structurally present", shell.includes("mobileNavOpen") && shell.includes('aria-controls="admin-mobile-nav"') && sidebarSection.includes("<AdminSidebarSection"));

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
check("Admin APIs remain bearer-compatible or use the exact P3-P5 session composition", p3P5Phase
  ? preservedBearerApiPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P3_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd())
    && apiPaths.filter((file) => file.endsWith("Runtime.ts")).every((file) => read(file).includes("resolveAdminApiAuthorization"))
  : apiPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P3_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd())
    && /readVerifiedBearer|authorization/i.test(apiPaths.map(read).join("\n")));
check("database migrations are unchanged except the exact P1A successor", changed.filter((file) => file.startsWith("supabase/migrations/")).every((file) => p1aPhase && (file === P1A_MIGRATION || (p1bPhase && file === P1B_MIGRATION) || (p1cPhase && file === P1C_MIGRATION))), changed.filter((file) => file.startsWith("supabase/migrations/")));
const applicationChanges = changed.filter((file) => exists(file) && file.startsWith("apps/")).map(read).join("\n");
check("service_role is not used", !/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(applicationChanges));
check("future staff roles and bundles are not implemented", !/roleBundle|permissionBundle|nutritionist_role|marketing_role/i.test(applicationChanges));
check("predecessor guards contain exact P3-P4 successor awareness", ["admin-ia-p1", "admin-ia-p2", "admin-ia-p2-r1", "admin-ia-p2-r2", "admin-session-p3-p1", "admin-current-permissions-p3-p2", "admin-route-authorization-p3-p3"].every((name) => read(`scripts/${name}-guard.mjs`).includes(P3_P4_SUBJECT)));

const allowed = (file) => file === "package.json"
  || file === "apps/admin-web/auth/admin-context.ts"
  || file === "apps/admin-web/auth/admin-navigation-visibility.ts"
  || file === "apps/admin-web/auth/admin-route-authorization.ts"
  || file === "apps/admin-web/auth/admin-api-authorization.ts"
  || file.startsWith("apps/admin-web/components/admin-shell/")
  || file === "apps/admin-web/server/platformAdminAuditRuntime.ts"
  || file === "apps/admin-web/server/platformAdminBranchStatusRuntime.ts"
  || file === "scripts/admin-navigation-p3-p4-guard.mjs"
  || file === "scripts/admin-navigation-p3-p4-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-guard.mjs"
  || file === "scripts/admin-api-session-p3-p5-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-guard.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
  || (p1aPhase && P1A_PATHS.includes(file))
  || (p1bPhase && P1B_PATHS.includes(file))
  || (p1cPhase && P1C_PATHS.includes(file))
  || ["scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs", "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-route-authorization-p3-p3-guard.mjs"].includes(file);
check("diff remains inside the exact P3-P4 boundary", changed.every(allowed), changed.filter((file) => !allowed(file)));
check("no dependency or lockfile change exists", !changed.some((file) => /lock/i.test(file)) && JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${P3_P3_HEAD}:package.json`)).dependencies ?? {}));
const pkg = JSON.parse(read("package.json"));
check("P3-P4 guard and smoke scripts are registered", pkg.scripts["test:admin-navigation-p3-p4"] === "node scripts/admin-navigation-p3-p4-guard.mjs" && pkg.scripts["test:admin-navigation-p3-p4-smoke"] === "node scripts/admin-navigation-p3-p4-smoke.mjs");

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-navigation-p3-p4-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : pushed ? "p3_p4_pushed" : p3P5Frozen ? "p3_p5_frozen_local"
    : p3P5R1Candidate ? "p3_p5_r1_candidate" : p3P5R1Frozen ? "p3_p5_r1_frozen_local" : p1aCandidate ? "p1a_candidate" : p1aFrozen ? "p1a_frozen_local" : p1bCandidate ? "p1b_candidate" : p1bFrozen ? "p1b_frozen_local" : p1cCandidate ? "p1c_candidate" : p1cFrozen ? "p1c_frozen_local" : "invalid",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  fullPermissionLinkCount: full.state === "ready" ? full.linkRouteIds.length : 0,
  basePermissionLinkCount: base.state === "ready" ? base.linkRouteIds.length : 0,
  basePermissionStructuralCount: base.state === "ready" ? base.visibleRouteIds.length : 0,
  changedPathCount: changed.length,
  changedPaths: changed,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length) process.exitCode = 1;

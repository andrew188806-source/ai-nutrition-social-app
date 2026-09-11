#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";

const BASELINE = "500c122a5cfcd806e5d253731033f65727fdc4c0";
const P1_FREEZE = "0562566b57bab43d948640f7adc138bcf8e359fe";
const SUBJECT = "Define canonical Admin information architecture";
const P2_HEAD = "981f3ec4976394f1254834cc5188566d1415c000";
const P2_SUBJECT = "Build canonical Admin workspace shell";
const P2_R1_SUBJECT = "Realign Admin nutrition and menu workspaces";
const EXPECTED_ROUTE_COUNT = 69;
const ALLOWED_PATHS = [
  "apps/admin-web/auth/admin-route-registry.ts",
  "docs/admin-information-architecture-ra-3-ia-p1.md",
  "package.json",
  "scripts/admin-ia-p1-guard.mjs"
].sort();
const API_PATHS = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts"
];

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1000)}`);
};

const source = read("apps/admin-web/auth/admin-route-registry.ts");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  },
  fileName: "admin-route-registry.ts",
  reportDiagnostics: true
});
const transpileErrors = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
const module = { exports: {} };
if (transpileErrors.length === 0) {
  const execute = new Function("exports", "module", "require", transpiled.outputText);
  execute(module.exports, module, () => { throw new Error("The IA registry must have no runtime imports."); });
}
const ia = module.exports;

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changedFromBaseline = [...new Set([...lines(git("diff", "--name-only", BASELINE)), ...untracked])].sort();
const changedFromP1 = [...new Set([...lines(git("diff", "--name-only", P1_FREEZE)), ...untracked])].sort();
const p1FreezePaths = lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", P1_FREEZE)).sort();
const candidate = head === BASELINE && origin === BASELINE && ahead === 0 && behind === 0;
const frozen = head === P1_FREEZE && git("rev-parse", "HEAD^") === BASELINE && origin === BASELINE
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === SUBJECT
  && git("status", "--short") === "";
const successorCandidate = head === P1_FREEZE && origin === BASELINE && ahead === 1 && behind === 0;
const successorFrozen = head === P2_HEAD && git("rev-parse", "HEAD^") === P1_FREEZE && origin === BASELINE
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === P2_SUBJECT
  && git("status", "--short") === "";
const r1Candidate = head === P2_HEAD && origin === BASELINE && ahead === 2 && behind === 0;
const r1Frozen = head !== P2_HEAD && git("rev-parse", "HEAD^") === P2_HEAD && origin === BASELINE
  && ahead === 3 && behind === 0 && git("log", "-1", "--format=%s") === P2_R1_SUBJECT
  && git("status", "--short") === "";
const successor = successorCandidate || successorFrozen || r1Candidate || r1Frozen;
const changed = successor ? changedFromP1 : changedFromBaseline;

check("lifecycle is the P1 candidate/freeze or its bounded P2/P2-R1 successor", candidate || frozen || successor,
  { head, origin, ahead, behind });
check("the frozen IA-P1 commit is exactly the four approved paths",
  JSON.stringify(p1FreezePaths) === JSON.stringify(ALLOWED_PATHS), { expected: ALLOWED_PATHS, actual: p1FreezePaths });
check("the registry transpiles without syntax errors", transpileErrors.length === 0,
  transpileErrors.map((diagnostic) => String(diagnostic.messageText)));

if (transpileErrors.length === 0) {
  const invariantErrors = ia.validateAdminIaRegistry();
  check("all registry invariants pass", invariantErrors.length === 0, invariantErrors);
  check(`the canonical registry has the actual final count of ${EXPECTED_ROUTE_COUNT}`,
    ia.ADMIN_ROUTE_REGISTRY.length === EXPECTED_ROUTE_COUNT, ia.ADMIN_ROUTE_REGISTRY.length);
  check("the canonical root is /admin", ia.ADMIN_CANONICAL_ROOT === "/admin");

  const expectedTopLevel = [
    "dashboard", "operations", "restaurants", "members", "social", "nutrition", "audit", "management", "engineering"
  ];
  check("all approved top-level workspaces exist in deterministic order",
    JSON.stringify(ia.ADMIN_TOP_LEVEL_WORKSPACE_IDS) === JSON.stringify(expectedTopLevel));
  check("route IDs are unique", new Set(ia.ADMIN_ROUTE_REGISTRY.map((route) => route.id)).size === ia.ADMIN_ROUTE_REGISTRY.length);
  check("canonical routes are unique", new Set(ia.ADMIN_ROUTE_REGISTRY.map((route) => route.route)).size === ia.ADMIN_ROUTE_REGISTRY.length);
  check("every parent ID resolves and no cycle exists", invariantErrors.every((error) => !/parent|cycle/.test(error)));

  const expectedCurrent = ["admin_context.read", "admin_audit.read", "admin_restaurant_branch.status.write"].sort();
  const actualCurrent = ia.ADMIN_PERMISSION_REGISTRY.filter((permission) => permission.status === "CURRENT")
    .map((permission) => permission.key).sort();
  check("CURRENT permissions are limited to the three actual repository keys",
    JSON.stringify(actualCurrent) === JSON.stringify(expectedCurrent), actualCurrent);
  check("PLANNED permissions are never treated as current authority",
    ia.ADMIN_PERMISSION_REGISTRY.filter((permission) => permission.status === "PLANNED")
      .every((permission) => !ia.isCurrentAdminPermission(permission.key)
        && !ia.isAdminRouteCurrentlyAuthorized({ requiredPermissions: [permission.key] }, [permission.key])));

  const liveIds = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.availability === "LIVE").map((route) => route.id).sort();
  check("branch-status and Platform Admin membership audit are the only LIVE capabilities",
    JSON.stringify(liveIds) === JSON.stringify(["audit-platform-memberships", "restaurant-branch-status"]), liveIds);
  check("mock-backed domains are not mislabelled LIVE",
    ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.availability === "LIVE")
      .every((route) => ["admin_audit.read", "admin_restaurant_branch.status.write"].includes(route.requiredPermissions[0])));

  const engineering = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "engineering" || route.parentId === "engineering");
  check("Engineering is a first-class top-level workspace", ia.ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes("engineering") && engineering.length === 8);
  check("Engineering declares only sanitized diagnostic data classifications",
    engineering.every((route) => route.dataClass === "ENGINEERING_DIAGNOSTIC")
      && ia.ENGINEERING_WORKSPACE_BOUNDARY.grantsPrivateUserDataAccess === false);

  const management = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "management" || route.parentId === "management");
  check("Platform Management remains NOT_ENABLED without authority",
    management.length === 4 && management.every((route) => route.availability === "NOT_ENABLED"));
  const breakGlass = ia.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "break-glass");
  check("Break-glass is reserved outside ordinary navigation and has no permission",
    breakGlass?.route === "/admin/break-glass" && breakGlass.navigationVisibility === "HIDDEN"
      && breakGlass.requiredPermissions.length === 0 && ia.MANAGEMENT_AND_BREAK_GLASS_BOUNDARY.breakGlassPermissionCreated === false);

  check("Restaurant Verification semantics exclude unrelated certification and badges",
    ia.RESTAURANT_VERIFICATION_BOUNDARY.means.includes("restaurant identity")
      && ["nutrition certification", "food safety certification", "platform recommendation", "quality badge", "allergen certification"]
        .every((term) => ia.RESTAURANT_VERIFICATION_BOUNDARY.doesNotMean.includes(term)));
  check("Restaurant About is not certification and nutrition authority remains separate",
    /not platform certification/i.test(ia.NUTRITION_CERTIFICATION_BOUNDARY.restaurantAbout)
      && /separate future governed nutrition authority/i.test(ia.NUTRITION_CERTIFICATION_BOUNDARY.nutritionCertification)
      && ia.NUTRITION_CERTIFICATION_BOUNDARY.combinedWithRestaurantVerification === false);
  check("Production mock fallback is prohibited and runtime error is not stored availability",
    ia.ADMIN_DATA_MODE_CONTRACT.productionLiveFailureFallback === "PROHIBITED"
      && ia.ADMIN_DATA_MODE_CONTRACT.demoRequiresExplicitMode === true
      && ia.ADMIN_DATA_MODE_CONTRACT.errorIsStoredAvailability === false
      && !ia.ADMIN_AVAILABILITIES.includes("ERROR"));

  const branchNav = ia.deriveCurrentAdminNavigationIds(["admin_restaurant_branch.status.write"]);
  check("parent navigation can derive visibility from an authorized child without granting the parent",
    ["restaurants", "restaurant-detail", "restaurant-branches", "restaurant-branch-status"].every((id) => branchNav.includes(id))
      && !ia.isAdminRouteCurrentlyAuthorized(ia.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "restaurants"), ["admin_restaurant_branch.status.write"]));
  const unavailableChild = ia.ADMIN_ROUTE_REGISTRY.find((route) => route.id === "management-roles");
  check("an unavailable child never implies a permission grant",
    unavailableChild.availability === "NOT_ENABLED"
      && !ia.isAdminRouteCurrentlyAuthorized(unavailableChild, ["admin.management.roles.read"]));

  const approvedRoutes = [
    "/admin", "/admin/operations", "/admin/operations/ads", "/admin/operations/sponsored",
    "/admin/restaurants", "/admin/restaurants/verification", "/admin/restaurants/reviews",
    "/admin/restaurants/menu-management", "/admin/restaurants/menu-management/items", "/admin/restaurants/menu-management/pending",
    "/admin/restaurants/menu-management/duplicates", "/admin/restaurants/menu-management/aliases",
    "/admin/restaurants/menu-management/ingredients", "/admin/restaurants/menu-management/allergens",
    "/admin/restaurants/menu-management/data-quality", "/admin/restaurants/menu-management/nutrition-data",
    "/admin/restaurants/menu-management/certification-status",
    "/admin/restaurants/[restaurantId]",
    "/admin/restaurants/[restaurantId]/about", "/admin/restaurants/[restaurantId]/contact", "/admin/restaurants/[restaurantId]/menus",
    "/admin/restaurants/[restaurantId]/menus/[menuId]/items",
    "/admin/restaurants/[restaurantId]/branches", "/admin/restaurants/[restaurantId]/branches/[branchId]/status",
    "/admin/restaurants/[restaurantId]/branches/[branchId]",
    "/admin/restaurants/[restaurantId]/branches/[branchId]/hours", "/admin/restaurants/[restaurantId]/branches/[branchId]/contact",
    "/admin/restaurants/[restaurantId]/branches/[branchId]/geo", "/admin/restaurants/[restaurantId]/branches/[branchId]/menu-items",
    "/admin/members", "/admin/members/cases", "/admin/members/[memberRef]", "/admin/members/[memberRef]/consents",
    "/admin/members/[memberRef]/access-history", "/admin/social", "/admin/social/reports", "/admin/social/policies",
    "/admin/nutrition", "/admin/nutrition/self-cooked-quality",
    "/admin/nutrition/standards", "/admin/nutrition/standards/scoring", "/admin/nutrition/standards/recommendation",
    "/admin/nutrition/standards/parameters",
    "/admin/nutrition/members", "/admin/nutrition/members/[memberRef]",
    "/admin/nutrition/certification", "/admin/nutrition/certification/pending", "/admin/nutrition/certification/discrepancy-reports",
    "/admin/nutrition/certification/remote-review", "/admin/nutrition/certification/history", "/admin/nutrition/certification/re-review",
    "/admin/audit", "/admin/audit/platform-memberships",
    "/admin/audit/operations", "/admin/audit/data-access", "/admin/management", "/admin/management/roles",
    "/admin/management/permissions", "/admin/management/settings", "/admin/engineering", "/admin/engineering/health",
    "/admin/engineering/versions", "/admin/engineering/jobs", "/admin/engineering/push", "/admin/engineering/geo",
    "/admin/engineering/feature-modes", "/admin/engineering/repairs"
  ];
  const registeredRoutes = new Set(ia.ADMIN_ROUTE_REGISTRY.map((route) => route.route));
  check("every approved canonical Sitemap location is registered",
    approvedRoutes.every((route) => registeredRoutes.has(route)), approvedRoutes.filter((route) => !registeredRoutes.has(route)));
}

check("old Platform Admin API sources remain byte-equivalent to the baseline",
  API_PATHS.every((file) => read(file).trimEnd() === git("show", `${BASELINE}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
const p2SuccessorPath = (file) => file === "apps/admin-web/auth/admin-route-registry.ts"
  || file === "scripts/admin-ia-p1-guard.mjs" || file === "scripts/admin-ia-p2-guard.mjs"
  || file === "scripts/admin-ia-p2-r1-guard.mjs"
  || file === "package.json" || file.startsWith("apps/admin-web/app/admin/")
  || file.startsWith("apps/admin-web/components/admin-shell/");
check("P1 authority remains bounded and its P2/P2-R1 successors change only presentation paths",
  (successor ? changed.every(p2SuccessorPath) : changed.every((file) => ALLOWED_PATHS.includes(file)))
    && changed.every((file) => !/^supabase\//.test(file))
    && !changed.includes("apps/admin-web/components/AdminShell.tsx")
    && changed.every((file) => !/lock|\.env/i.test(file)), changed);

const pkg = JSON.parse(read("package.json"));
const baselinePkg = JSON.parse(git("show", `${BASELINE}:package.json`));
const expectedScripts = {
  ...baselinePkg.scripts,
  "test:admin-ia-p1": "node scripts/admin-ia-p1-guard.mjs",
  ...(successor ? { "test:admin-ia-p2": "node scripts/admin-ia-p2-guard.mjs" } : {}),
  ...((r1Candidate || r1Frozen) ? { "test:admin-ia-p2-r1": "node scripts/admin-ia-p2-r1-guard.mjs" } : {})
};
const expectedPkg = { ...baselinePkg, scripts: expectedScripts };
let packageMatches = true;
try { assert.deepEqual(pkg, expectedPkg); } catch { packageMatches = false; }
check("package.json adds only the IA-P1 guard command and no dependency", packageMatches);

const doc = read("docs/admin-information-architecture-ra-3-ia-p1.md");
const docPlain = doc.replace(/\s+/g, " ");
check("the canonical document records all required authority separations",
  /Restaurant Verification/.test(docPlain) && /not platform certification/i.test(docPlain)
    && /Nutritionist remains a future separate identity\/role/.test(docPlain)
    && /Engineering is a separate workspace/.test(docPlain)
    && /Break-glass is hidden from ordinary navigation/.test(docPlain));

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-ia-p1-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local"
    : successorCandidate ? "p2_candidate" : successorFrozen ? "p2_frozen_local"
      : r1Candidate ? "p2_r1_candidate" : r1Frozen ? "p2_r1_frozen_local" : "invalid",
  expectedRouteCount: EXPECTED_ROUTE_COUNT,
  actualRouteCount: ia.ADMIN_ROUTE_REGISTRY?.length ?? 0,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  changedPaths: changed,
  migrations: 0,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length > 0) process.exitCode = 1;

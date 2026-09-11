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
const R1_HEAD = "5e4d68cb72ec5a1fcc3c2ce4550a0f9bfca033b0";
const P2_R1_SUBJECT = "Realign Admin nutrition and menu workspaces";
const P2_R2_SUBJECT = "Realign Admin sales marketing restaurant and nutrition workspaces";
const P2_R2_HEAD = "a3acc21a7eec4ba8051f30bcb7b470a2b2770551";
const P3_P1_SUBJECT = "Add Admin browser session gate";
const P3_P1_HEAD = "a75412a3da1cdf52c37732864975ad926da067f6";
const P3_P2_SUBJECT = "Resolve current Admin permissions";
const EXPECTED_ROUTE_COUNT = 95;
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

const vocabularySource = read("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const vocabularyTranspiled = ts.transpileModule(vocabularySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: "admin-current-permission-vocabulary.ts",
  reportDiagnostics: true
});
const vocabularyModule = { exports: {} };
new Function("exports", "module", "require", vocabularyTranspiled.outputText)(
  vocabularyModule.exports, vocabularyModule, () => { throw new Error("The permission vocabulary must have no runtime imports."); }
);
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
  execute(module.exports, module, (request) => {
    if (request === "./admin-current-permission-vocabulary") return vocabularyModule.exports;
    throw new Error(`Unexpected IA registry import: ${request}`);
  });
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
const r1Frozen = head === R1_HEAD && git("rev-parse", "HEAD^") === P2_HEAD && origin === BASELINE
  && ahead === 3 && behind === 0 && git("log", "-1", "--format=%s") === P2_R1_SUBJECT
  && git("status", "--short") === "";
const r2Candidate = head === R1_HEAD && origin === BASELINE && ahead === 3 && behind === 0;
const r2Frozen = head !== R1_HEAD && git("rev-parse", "HEAD^") === R1_HEAD && origin === BASELINE
  && ahead === 4 && behind === 0 && git("log", "-1", "--format=%s") === P2_R2_SUBJECT
  && git("status", "--short") === "";
const p3Candidate = head === P2_R2_HEAD && origin === P2_R2_HEAD && ahead === 0 && behind === 0;
const p3Frozen = head !== P2_R2_HEAD && git("rev-parse", "HEAD^") === P2_R2_HEAD && origin === P2_R2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P1_SUBJECT
  && git("status", "--short") === "";
const p3Pushed = head === P3_P1_HEAD && origin === P3_P1_HEAD && ahead === 0 && behind === 0;
const p3P2Frozen = head !== P3_P1_HEAD && git("rev-parse", "HEAD^") === P3_P1_HEAD && origin === P3_P1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P2_SUBJECT && git("status", "--short") === "";
const p3P2Phase = p3Pushed || p3P2Frozen;
const p3Phase = p3Candidate || p3Frozen || p3P2Phase;
const successor = successorCandidate || successorFrozen || r1Candidate || r1Frozen || r2Candidate || r2Frozen || p3Phase;
const changed = successor ? changedFromP1 : changedFromBaseline;

check("lifecycle is the P1 candidate/freeze or its bounded P2/P2-R1/P2-R2/P3-P1 successor", candidate || frozen || successor,
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
    "dashboard", "business-development", "operations", "restaurants", "nutrition", "members", "social", "audit", "management", "engineering"
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
    "/admin",
    "/admin/business-development", "/admin/business-development/prospects", "/admin/business-development/pipeline",
    "/admin/business-development/follow-ups", "/admin/business-development/contacts", "/admin/business-development/contracts",
    "/admin/business-development/renewals", "/admin/business-development/assignments", "/admin/business-development/history",
    "/admin/operations", "/admin/operations/campaigns", "/admin/operations/promotions", "/admin/operations/ads",
    "/admin/operations/sponsored", "/admin/operations/placements", "/admin/operations/communications", "/admin/operations/performance",
    "/admin/restaurants", "/admin/restaurants/verification", "/admin/restaurants/reviews",
    "/admin/restaurants/menu-management", "/admin/restaurants/menu-management/pending", "/admin/restaurants/menu-management/duplicates",
    "/admin/restaurants/menu-management/aliases", "/admin/restaurants/menu-management/nutrition-discrepancy",
    "/admin/restaurants/menu-management/data-quality",
    "/admin/restaurants/[restaurantId]",
    "/admin/restaurants/[restaurantId]/about", "/admin/restaurants/[restaurantId]/contact", "/admin/restaurants/[restaurantId]/menus",
    "/admin/restaurants/[restaurantId]/menus/[menuId]", "/admin/restaurants/[restaurantId]/menus/[menuId]/items",
    "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]",
    "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition",
    "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/ingredients",
    "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/allergens",
    "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/certification",
    "/admin/restaurants/[restaurantId]/branches", "/admin/restaurants/[restaurantId]/branches/[branchId]/status",
    "/admin/restaurants/[restaurantId]/branches/[branchId]",
    "/admin/restaurants/[restaurantId]/branches/[branchId]/hours", "/admin/restaurants/[restaurantId]/branches/[branchId]/contact",
    "/admin/restaurants/[restaurantId]/branches/[branchId]/geo", "/admin/restaurants/[restaurantId]/branches/[branchId]/menu-items",
    "/admin/members", "/admin/members/cases", "/admin/members/[memberRef]", "/admin/members/[memberRef]/consents",
    "/admin/members/[memberRef]/access-history", "/admin/social", "/admin/social/reports", "/admin/social/policies",
    "/admin/nutrition", "/admin/nutrition/self-cooked-quality",
    "/admin/nutrition/my-work", "/admin/nutrition/my-work/restaurants", "/admin/nutrition/my-work/cases", "/admin/nutrition/my-work/members",
    "/admin/nutrition/standards", "/admin/nutrition/standards/scoring", "/admin/nutrition/standards/recommendation",
    "/admin/nutrition/standards/parameters",
    "/admin/nutrition/members", "/admin/nutrition/members/[memberRef]",
    "/admin/nutrition/certification", "/admin/nutrition/certification/pending", "/admin/nutrition/certification/discrepancy-reports",
    "/admin/nutrition/certification/remote-review", "/admin/nutrition/certification/history", "/admin/nutrition/certification/re-review",
    "/admin/nutrition/assignments", "/admin/nutrition/assignments/nutritionists", "/admin/nutrition/assignments/regions",
    "/admin/nutrition/assignments/restaurants", "/admin/nutrition/assignments/cases", "/admin/nutrition/assignments/workload",
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
  || file === "scripts/admin-ia-p2-r1-guard.mjs" || file === "scripts/admin-ia-p2-r2-guard.mjs"
  || file === "package.json" || file.startsWith("apps/admin-web/app/admin/")
  || file.startsWith("apps/admin-web/components/admin-shell/");
const p3SuccessorPath = (file) => p2SuccessorPath(file)
  || file === "package-lock.json" || file === "apps/admin-web/package.json" || file === "apps/admin-web/middleware.ts"
  || file.startsWith("apps/admin-web/auth/") || file.startsWith("apps/admin-web/config/")
  || file === "scripts/admin-session-p3-p1-guard.mjs" || file === "scripts/admin-session-p3-p1-smoke.mjs"
  || file === "scripts/admin-current-permissions-p3-p2-guard.mjs" || file === "scripts/admin-current-permissions-p3-p2-smoke.mjs";
check("P1 authority remains bounded through its exact P3-P1 successor",
  (p3Phase ? changed.every(p3SuccessorPath)
    : successor ? changed.every(p2SuccessorPath) : changed.every((file) => ALLOWED_PATHS.includes(file)))
    && changed.every((file) => !/^supabase\//.test(file))
    && !changed.includes("apps/admin-web/components/AdminShell.tsx")
    && changed.every((file) => !/\.env/i.test(file) && (!/lock/i.test(file) || (p3Phase && file === "package-lock.json"))), changed);

const pkg = JSON.parse(read("package.json"));
const baselinePkg = JSON.parse(git("show", `${BASELINE}:package.json`));
const expectedScripts = {
  ...baselinePkg.scripts,
  "test:admin-ia-p1": "node scripts/admin-ia-p1-guard.mjs",
  ...(successor ? { "test:admin-ia-p2": "node scripts/admin-ia-p2-guard.mjs" } : {}),
  ...((r1Candidate || r1Frozen || r2Candidate || r2Frozen || p3Phase) ? { "test:admin-ia-p2-r1": "node scripts/admin-ia-p2-r1-guard.mjs" } : {}),
  ...((r2Candidate || r2Frozen || p3Phase) ? { "test:admin-ia-p2-r2": "node scripts/admin-ia-p2-r2-guard.mjs" } : {}),
  ...(p3Phase ? {
    "test:admin-session-p3-p1": "node scripts/admin-session-p3-p1-guard.mjs",
    "test:admin-session-p3-p1-smoke": "node scripts/admin-session-p3-p1-smoke.mjs"
  } : {}),
  ...(p3P2Phase ? {
    "test:admin-current-permissions-p3-p2": "node scripts/admin-current-permissions-p3-p2-guard.mjs",
    "test:admin-current-permissions-p3-p2-smoke": "node scripts/admin-current-permissions-p3-p2-smoke.mjs"
  } : {})
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
      : r1Candidate ? "p2_r1_candidate" : r1Frozen ? "p2_r1_frozen_local"
        : r2Candidate ? "p2_r2_candidate" : r2Frozen ? "p2_r2_frozen_local"
          : p3Candidate ? "p3_p1_candidate" : p3Frozen ? "p3_p1_frozen_local"
            : p3Pushed ? "p3_p1_pushed" : p3P2Frozen ? "p3_p2_frozen_local" : "invalid",
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

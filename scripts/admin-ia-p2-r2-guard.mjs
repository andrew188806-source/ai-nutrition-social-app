#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";

const P1_HEAD = "0562566b57bab43d948640f7adc138bcf8e359fe";
const R1_HEAD = "5e4d68cb72ec5a1fcc3c2ce4550a0f9bfca033b0";
const ORIGIN_BASELINE = "500c122a5cfcd806e5d253731033f65727fdc4c0";
const P2_R2_SUBJECT = "Realign Admin sales marketing restaurant and nutrition workspaces";
const EXPECTED_REGISTRY_ROUTES = 95;

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const walk = (directory) => {
  if (!exists(directory)) return [];
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? walk(childPath) : [childPath];
  });
};
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
  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) throw new Error(errors.map((diagnostic) => String(diagnostic.messageText)).join("\n"));
  const module = { exports: {} };
  new Function("exports", "module", "require", result.outputText)(module.exports, module, requireModule);
  return module.exports;
}

const ia = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts");
const registryPage = read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx");
const routeById = new Map(ia.ADMIN_ROUTE_REGISTRY.map((route) => [route.id, route]));
const rootWorkspaceOf = (routeId) => {
  let current = routeById.get(routeId);
  while (current && current.parentId !== null) current = routeById.get(current.parentId);
  return current?.id ?? null;
};

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changedFromR1 = [...new Set([...lines(git("diff", "--name-only", R1_HEAD)), ...untracked])].sort();
const candidate = head === R1_HEAD && origin === ORIGIN_BASELINE && ahead === 3 && behind === 0;
const frozen = head !== R1_HEAD && git("rev-parse", "HEAD^") === R1_HEAD && origin === ORIGIN_BASELINE
  && ahead === 4 && behind === 0 && git("log", "-1", "--format=%s") === P2_R2_SUBJECT && git("status", "--short") === "";

check("lifecycle is exactly the P2-R2 candidate or one clean local P2-R2 freeze", candidate || frozen, { head, origin, ahead, behind });
check(`the registry contains the actual final count of ${EXPECTED_REGISTRY_ROUTES}`,
  ia.ADMIN_ROUTE_REGISTRY.length === EXPECTED_REGISTRY_ROUTES, ia.ADMIN_ROUTE_REGISTRY.length);

// ---------------------------------------------------------------------
// 65. BUSINESS DEVELOPMENT
// ---------------------------------------------------------------------
const bizDev = routeById.get("business-development");
check("1. Business Development top-level workspace exists", ia.ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes("business-development"));
check("2. label is 商務拓展", bizDev?.zhTWLabel === "商務拓展");
check("3. Business Development staff domain exists", ia.ADMIN_STAFF_DOMAINS.includes("BUSINESS_DEVELOPMENT"));
check("4. prospects exists", routeById.get("business-development-prospects")?.parentId === "business-development");
check("5. pipeline exists", routeById.get("business-development-pipeline")?.parentId === "business-development");
check("6. follow-ups exists", routeById.get("business-development-follow-ups")?.parentId === "business-development");
check("7. contacts exists", routeById.get("business-development-contacts")?.parentId === "business-development");
check("8. contracts exists", routeById.get("business-development-contracts")?.parentId === "business-development");
check("9. renewals exists", routeById.get("business-development-renewals")?.parentId === "business-development");
check("10. sales assignments exists", routeById.get("business-development-assignments")?.parentId === "business-development");
check("11. partnership history exists", routeById.get("business-development-history")?.parentId === "business-development");
const bizDevSources = walk("apps/admin-web/app/admin/business-development").filter((f) => f.endsWith(".tsx")).map(read).join("\n") + registryPage;
check("12. no fake CRM KPIs/data",
  !/(prospect count|conversion rate|contract value|revenue|renewal count|sales forecast)/i.test(bizDevSources)
    && ia.BUSINESS_DEVELOPMENT_FUTURE_DATA_PRINCIPLES?.writesImplementedInThisPhase === false);
check("13. Prospect vs canonical Restaurant distinction documented",
  ia.PROSPECT_VS_CANONICAL_RESTAURANT_BOUNDARY?.createsDuplicateRestaurantMasterRecord === false
    && ia.PROSPECT_VS_CANONICAL_RESTAURANT_BOUNDARY?.beforeOnboarding?.includes("Prospect")
    && registryPage.includes("不會建立第二筆餐廳主檔"));
check("14. Business Development separate from Restaurant Operations",
  ia.BUSINESS_DEVELOPMENT_RESTAURANT_OPERATIONS_BOUNDARY?.duplicateMasterRecord === false
    && ia.BUSINESS_DEVELOPMENT_RESTAURANT_OPERATIONS_BOUNDARY?.businessDevelopmentOwns?.includes("commercial relationship"));
check("15. Business Development separate from Platform Operations",
  ia.BUSINESS_DEVELOPMENT_VS_PLATFORM_OPERATIONS_BOUNDARY?.salesAndMarketingMerged === false);

// ---------------------------------------------------------------------
// 66. PLATFORM OPERATIONS
// ---------------------------------------------------------------------
const operations = routeById.get("operations");
check("16. Platform Operations still exists top-level", ia.ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes("operations"));
check("17. label remains 平台營運", operations?.zhTWLabel === "平台營運");
check("18. Marketing/Platform Operations staff domain exists", ia.ADMIN_STAFF_DOMAINS.includes("PLATFORM_OPERATIONS"));
check("19. campaigns route exists", routeById.get("operations-campaigns")?.parentId === "operations");
check("20. promotions route exists", routeById.get("operations-promotions")?.parentId === "operations");
check("21. ads remains under Platform Operations",
  routeById.get("operations-ads")?.parentId === "operations"
    && routeById.get("operations-ads")?.legacyRoutes.some((legacy) => legacy.route === "/ad-review"));
check("22. sponsored remains under Platform Operations",
  routeById.get("operations-sponsored")?.parentId === "operations"
    && routeById.get("operations-sponsored")?.legacyRoutes.some((legacy) => legacy.route === "/sponsored"));
check("23. placements exists", routeById.get("operations-placements")?.parentId === "operations");
check("24. marketing communications exists", routeById.get("operations-communications")?.parentId === "operations");
check("25. marketing performance exists", routeById.get("operations-performance")?.parentId === "operations");
const operationsSources = walk("apps/admin-web/app/admin/operations").filter((f) => f.endsWith(".tsx")).map(read).join("\n") + registryPage;
check("26. no fake Marketing KPIs",
  !/(campaign reach|\bCTR\b|\bROAS\b|promotion performance)\s*[:=]\s*[\d$]/i.test(operationsSources)
    && !/revenue\s*[:=]\s*\d/i.test(operationsSources));
check("27. Marketing does not gain raw push-token access",
  ia.MARKETING_PRIVACY_BOUNDARY?.pushDistinction?.marketingHasRawPushTokenAccess === false
    && ia.MARKETING_PRIVACY_BOUNDARY?.mustNotRoutinelyAccess?.includes("push tokens"));
check("28. Marketing does not gain private health/social data",
  ["raw member health data", "member meal history", "private Social content", "precise private GEO"]
    .every((item) => ia.MARKETING_PRIVACY_BOUNDARY?.mustNotRoutinelyAccess?.includes(item)));
check("29. Push campaign work and Engineering Push diagnostics remain distinct",
  ia.MARKETING_PRIVACY_BOUNDARY?.pushDistinction?.platformOperations?.includes("marketing")
    && ia.MARKETING_PRIVACY_BOUNDARY?.pushDistinction?.engineering?.includes("diagnostics")
    && routeById.get("engineering-push")?.parentId === "engineering");
check("30. Platform Operations does not own Restaurant master data",
  !ia.ADMIN_ROUTE_REGISTRY.some((route) => rootWorkspaceOf(route.id) === "operations" && route.dataClass === "RESTAURANT_OPERATIONAL"
    && route.id !== "operations"));

// ---------------------------------------------------------------------
// 67. RESTAURANT OPERATIONS
// ---------------------------------------------------------------------
check("31. Restaurant landing prioritizes Restaurant selection",
  registryPage.includes("RestaurantSelectionFlow") && registryPage.includes("餐廳營運從「選擇餐廳」開始"));
check("32. Restaurant detail remains canonical operational object",
  routeById.get("restaurant-detail")?.parentId === "restaurants" && routeById.get("restaurant-detail")?.navigationVisibility === "CONTEXTUAL");
check("33. Menu management is primarily Restaurant-scoped",
  routeById.get("restaurant-menus")?.parentId === "restaurant-detail"
    && routeById.get("restaurant-menu-detail")?.parentId === "restaurant-menus");
check("34. Menu detail context exists", routeById.get("restaurant-menu-detail")?.route === "/admin/restaurants/[restaurantId]/menus/[menuId]");
check("35. Dish/item detail exists or is explicitly represented",
  routeById.get("restaurant-menu-item-detail")?.route === "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]"
    && routeById.get("restaurant-menu-item-detail")?.parentId === "restaurant-menu-items");
check("36. Ingredients ownership is Restaurant/Dish scoped",
  routeById.get("restaurant-item-ingredients")?.parentId === "restaurant-menu-item-detail" && rootWorkspaceOf("restaurant-item-ingredients") === "restaurants");
check("37. Allergens ownership is Restaurant/Dish scoped",
  routeById.get("restaurant-item-allergens")?.parentId === "restaurant-menu-item-detail" && rootWorkspaceOf("restaurant-item-allergens") === "restaurants");
check("38. Nutrition-data ownership is Restaurant/Dish scoped",
  routeById.get("restaurant-item-nutrition")?.parentId === "restaurant-menu-item-detail" && rootWorkspaceOf("restaurant-item-nutrition") === "restaurants");
check("39. Certification-status ownership is Restaurant/Dish scoped",
  routeById.get("restaurant-item-certification")?.parentId === "restaurant-menu-item-detail" && rootWorkspaceOf("restaurant-item-certification") === "restaurants");
check("40. cross-Restaurant workspace is queue/search only",
  routeById.get("menu-management")?.zhTWLabel === "跨店菜單工作台" && routeById.get("menu-management")?.internalName === "Cross-Restaurant Menu Queue");
check("41. queue copy says actual maintenance occurs in Restaurant/Menu/Dish context",
  registryPage.includes("CROSS_RESTAURANT_QUEUE_COPY_ZH_TW")
    && ia.CROSS_RESTAURANT_QUEUE_COPY_ZH_TW === "此區用於跨店待處理事項；實際資料維護請進入該餐廳／菜單／餐點。");
check("42. no global canonical Ingredients management page", !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-ingredients"));
check("43. no global canonical Allergens management page", !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-allergens"));
check("44. no global canonical Nutrition-data management page", !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-nutrition-data"));
check("45. no global canonical Certification-status management page", !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-certification-status"));
check("46. pending queue preserved where appropriate",
  routeById.get("menu-management-pending")?.parentId === "menu-management"
    && routeById.get("menu-management-pending")?.legacyRoutes.some((legacy) => legacy.route === "/pending-menu-items"));
check("47. duplicates queue preserved",
  routeById.get("menu-management-duplicates")?.parentId === "menu-management"
    && routeById.get("menu-management-duplicates")?.legacyRoutes.some((legacy) => legacy.route === "/duplicate-menu-items"));
check("48. alias/identification queue preserved",
  routeById.get("menu-management-aliases")?.parentId === "menu-management"
    && routeById.get("menu-management-aliases")?.legacyRoutes.some((legacy) => legacy.route === "/alias-review")
    && routeById.get("menu-management-aliases")?.legacyRoutes.some((legacy) => legacy.route === "/identification-audit"));

// ---------------------------------------------------------------------
// 68. NUTRITION
// ---------------------------------------------------------------------
check("49. label remains 營養專業管理", routeById.get("nutrition")?.zhTWLabel === "營養專業管理");
check("50. My Work exists", routeById.get("nutrition-my-work")?.parentId === "nutrition");
check("51. My Restaurants exists", routeById.get("nutrition-my-work-restaurants")?.parentId === "nutrition-my-work");
check("52. My Cases exists", routeById.get("nutrition-my-work-cases")?.parentId === "nutrition-my-work");
check("53. Authorized Members exists", routeById.get("nutrition-my-work-members")?.parentId === "nutrition-my-work");
check("54. Nutrition assignment workspace exists", routeById.get("nutrition-assignments")?.parentId === "nutrition");
check("55. Nutritionist roster exists", routeById.get("nutrition-assignments-nutritionists")?.parentId === "nutrition-assignments");
check("56. Region coverage exists", routeById.get("nutrition-assignments-regions")?.parentId === "nutrition-assignments");
check("57. Restaurant assignment exists", routeById.get("nutrition-assignments-restaurants")?.parentId === "nutrition-assignments");
check("58. Case assignment exists", routeById.get("nutrition-assignments-cases")?.parentId === "nutrition-assignments");
check("59. Workload exists", routeById.get("nutrition-assignments-workload")?.parentId === "nutrition-assignments");
const precedence = ia.NUTRITION_ASSIGNMENT_PRECEDENCE ?? [];
check("60. Region default lowest precedence", precedence[0]?.key === "REGION_DEFAULT_COVERAGE" && precedence[0]?.rank === 1);
check("61. Restaurant/Branch assignment overrides Region", precedence[1]?.key === "RESTAURANT_BRANCH_ASSIGNMENT" && precedence[1]?.rank === 2);
check("62. Case override overrides Restaurant/Branch", precedence[2]?.key === "CASE_SPECIFIC_OVERRIDE" && precedence[2]?.rank === 3);
check("63. assignment precedence documented",
  registryPage.includes("分派優先順序") && precedence.length === 3
    && precedence.every((level, index) => index === 0 || level.rank > precedence[index - 1].rank));
check("64. assignment does not grant member private-data access",
  registryPage.includes("不代表自動取得該餐廳顧客的私密健康或營養資料")
    && registryPage.includes("仍須會員個別明確同意"));
check("65. Nutritionist vs Nutrition Lead distinction documented",
  ia.NUTRITIONIST_VS_NUTRITION_LEAD_BOUNDARY?.ordinaryNutritionistManagesAssignments === false
    && ia.NUTRITIONIST_VS_NUTRITION_LEAD_BOUNDARY?.dbRoleCreatedInThisPhase === false
    && ia.ADMIN_STAFF_DOMAINS.includes("NUTRITION_OPERATIONS_LEAD")
    && routeById.get("nutrition-assignments-regions")?.intendedStaffDomains.includes("NUTRITION_OPERATIONS_LEAD")
    && !routeById.get("nutrition-assignments-regions")?.intendedStaffDomains.includes("NUTRITION_OPERATIONS"));
check("66. sales ownership and Nutrition assignment are separate",
  ia.SALES_OWNERSHIP_VS_NUTRITION_ASSIGNMENT_BOUNDARY?.samePermissionDomain === false);
check("67. Nutrition member-consent boundary preserved",
  ia.FUTURE_MEMBER_NUTRITION_FIELD_ADJUSTMENT_PRINCIPLES?.requiresExplicitMemberConsent === true
    && registryPage.includes("僅會員明確同意並指派給特定 Nutritionist"));
check("68. Restaurant nutrition certification model preserved",
  ia.NUTRITION_CERTIFICATION_QUEUE_SEMANTICS?.dishExistenceAloneDoesNotImplyReview === true
    && routeById.get("nutrition-certification")?.parentId === "nutrition");
check("69. remote review placeholder preserved", routeById.get("nutrition-certification-remote-review")?.route === "/admin/nutrition/certification/remote-review");

// ---------------------------------------------------------------------
// 69. GLOBAL BOUNDARIES
// ---------------------------------------------------------------------
check("70. Restaurant About remains outside Nutrition", rootWorkspaceOf("restaurant-about") === "restaurants");
check("71. Restaurant Verification meaning unchanged",
  JSON.stringify(ia.RESTAURANT_VERIFICATION_BOUNDARY) === JSON.stringify({
    means: ["restaurant identity", "operator legitimacy"],
    doesNotMean: ["nutrition certification", "food safety certification", "platform recommendation", "quality badge", "allergen certification"]
  }));
const management = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "management" || route.parentId === "management");
check("72. Platform Management boundary unchanged", management.length === 4 && management.every((route) => route.availability === "NOT_ENABLED"));
const engineering = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "engineering" || route.parentId === "engineering");
check("73. Engineering boundary unchanged", engineering.length === 8 && engineering.every((route) => route.dataClass === "ENGINEERING_DIAGNOSTIC"));
const breakGlass = routeById.get("break-glass");
check("74. Break-glass hidden/no-page", breakGlass?.navigationVisibility === "HIDDEN" && breakGlass?.availability === "NOT_ENABLED"
  && !exists("apps/admin-web/app/admin/break-glass/page.tsx"));

const legacyPages = [
  "app/page.tsx", "app/login/page.tsx", "app/verification/page.tsx", "app/menu-review/page.tsx",
  "app/restaurant-review/page.tsx", "app/pending-menu-items/page.tsx", "app/duplicate-menu-items/page.tsx",
  "app/alias-review/page.tsx", "app/nutrition-review/page.tsx", "app/data-quality/page.tsx", "app/ad-review/page.tsx",
  "app/sponsored/page.tsx", "app/esg/page.tsx", "app/data-access/page.tsx", "app/consents/page.tsx",
  "app/audit-trail/page.tsx", "app/tags/page.tsx", "app/social-governance/page.tsx",
  "app/identification-audit/page.tsx", "app/self-cooked-audit/page.tsx", "app/exercise-governance/page.tsx",
  "app/settings/page.tsx"
].map((file) => `apps/admin-web/${file}`);
check("75. all original 22 legacy routes remain", legacyPages.length === 22 && legacyPages.every((file) => exists(file)
  && read(file).trimEnd() === git("show", `${P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));

const acceptedApis = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts"
];
check("76. accepted APIs unchanged", acceptedApis.every((file) => exists(file)
  && read(file).trimEnd() === git("show", `${P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));

const adminSources = [...walk("apps/admin-web/app/admin"), ...walk("apps/admin-web/components/admin-shell")]
  .filter((file) => /\.(?:ts|tsx)$/.test(file)).map(read).join("\n");
check("77. no redirects", !/\bredirect\s*\(/.test(adminSources));
check("78. no DB migration", changedFromR1.every((file) => !file.startsWith("supabase/")));
const guardScriptFiles = new Set([
  "scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs",
  "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs"
]);
check("79. no DB permission expansion",
  !/create role|create policy|grant execute|grant update|security definer|role_permissions|alter table\s+public\./i.test(
    changedFromR1.filter((file) => exists(file) && !guardScriptFiles.has(file)).map(read).join("\n")
  ));

const expectedCurrent = ["admin_context.read", "admin_audit.read", "admin_restaurant_branch.status.write"].sort();
const actualCurrent = ia.ADMIN_PERMISSION_REGISTRY.filter((permission) => permission.status === "CURRENT").map((permission) => permission.key).sort();
check("80. current permission set unchanged", JSON.stringify(actualCurrent) === JSON.stringify(expectedCurrent), actualCurrent);
check("81. future permission keys remain PLANNED",
  ia.ADMIN_PERMISSION_REGISTRY.filter((permission) => permission.status === "PLANNED")
    .every((permission) => !ia.isCurrentAdminPermission(permission.key)));
check("82. no live CRM repository", !/services\/business-development|repositories\/business-development/i.test(bizDevSources));
check("83. no live Marketing execution authority", !/sendCampaign|executeCampaign|dispatchPromotion/i.test(operationsSources));
check("84. no Nutritionist DB role", !/create role .*nutritionist/i.test(
  changedFromR1.filter((file) => exists(file) && !guardScriptFiles.has(file)).map(read).join("\n")
));
const nutritionAssignmentSources = walk("apps/admin-web/app/admin/nutrition/assignments").filter((f) => f.endsWith(".tsx")).map(read).join("\n");
check("85. no assignment mutation", !/await\s|fetch\s*\(|\.insert\(|\.update\(|\.upsert\(/i.test(nutritionAssignmentSources));
const bizDevContractSources = walk("apps/admin-web/app/admin/business-development/contracts").map(read).join("\n");
check("86. no contract mutation", !/await\s|fetch\s*\(|\.insert\(|\.update\(|\.upsert\(/i.test(bizDevContractSources));
const memberNutritionSources = [
  "apps/admin-web/app/admin/nutrition/members/page.tsx",
  "apps/admin-web/app/admin/nutrition/members/[memberRef]/page.tsx",
  "apps/admin-web/app/admin/nutrition/my-work/members/page.tsx"
].filter(exists).map(read).join("\n");
check("87. no personal-health loading",
  !/fetch\s*\(|supabase\.|createClient|\.select\(|\.from\(/i.test(memberNutritionSources) && !/await\s/.test(memberNutritionSources));

const pkg = JSON.parse(read("package.json"));
const r1Pkg = JSON.parse(git("show", `${R1_HEAD}:package.json`));
check("88. no dependency changes",
  JSON.stringify(pkg.dependencies ?? {}) === JSON.stringify(r1Pkg.dependencies ?? {})
    && JSON.stringify(pkg.devDependencies ?? {}) === JSON.stringify(r1Pkg.devDependencies ?? {}));
check("89. no lockfile churn", changedFromR1.every((file) => !/lock/i.test(file)));
check("90. no auth/session implementation",
  !/document\.cookie\s*=|setCookie\s*\(|createSession\s*\(|signIn\s*\(|jwt\.sign\s*\(|Authorization["'\s:]*[:=]\s*["'`]Bearer/i.test(adminSources));

const allowedR2Path = (file) =>
  file === "apps/admin-web/auth/admin-route-registry.ts"
  || file === "scripts/admin-ia-p1-guard.mjs" || file === "scripts/admin-ia-p2-guard.mjs"
  || file === "scripts/admin-ia-p2-r1-guard.mjs" || file === "scripts/admin-ia-p2-r2-guard.mjs"
  || file === "package.json"
  || file.startsWith("apps/admin-web/app/admin/")
  || file.startsWith("apps/admin-web/components/admin-shell/");
check("the bounded P2-R2 diff contains only approved paths", changedFromR1.every(allowedR2Path), changedFromR1.filter((file) => !allowedR2Path(file)));

const p1Pkg = JSON.parse(git("show", `${P1_HEAD}:package.json`));
const expectedScripts = {
  ...p1Pkg.scripts,
  "test:admin-ia-p2": "node scripts/admin-ia-p2-guard.mjs",
  "test:admin-ia-p2-r1": "node scripts/admin-ia-p2-r1-guard.mjs",
  "test:admin-ia-p2-r2": "node scripts/admin-ia-p2-r2-guard.mjs"
};
const expectedPkg = { ...p1Pkg, scripts: expectedScripts };
let packageMatches = true;
try { assert.deepEqual(pkg, expectedPkg); } catch { packageMatches = false; }
check("package.json adds only the P2/P2-R1/P2-R2 guard commands with no dependency or lockfile churn", packageMatches);

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-ia-p2-r2-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid",
  expectedRegistryRoutes: EXPECTED_REGISTRY_ROUTES,
  actualRegistryRoutes: ia.ADMIN_ROUTE_REGISTRY.length,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  changedFromR1Count: changedFromR1.length,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length > 0) process.exitCode = 1;

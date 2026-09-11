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
const P2_R2_HEAD = "a3acc21a7eec4ba8051f30bcb7b470a2b2770551";
const P3_P1_SUBJECT = "Add Admin browser session gate";
const P3_P1_HEAD = "a75412a3da1cdf52c37732864975ad926da067f6";
const P3_P2_SUBJECT = "Resolve current Admin permissions";
const P3_P2_HEAD = "ab59cdc13317ee70482ae168923ac45f9b016906";
const P3_P3_SUBJECT = "Enforce current Admin route permissions";
const P3_P3_HEAD = "abb747551a9dd5c97988b44cff0c16f6f555eed8";
const P3_P4_SUBJECT = "Filter Admin navigation by current permissions";
const P3_P4_HEAD = "61256ade3bb8e92d57264bc9ef322f6a351825c4";
const P3_P5_SUBJECT = "Allow Admin APIs from browser sessions";
const P3_P5_HEAD = "2ddc6eadeb344d40cba57958874a808fb79dc19d";
const P3_P5_R1_SUBJECT = "Classify missing Admin sessions as unauthenticated";
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

const permissionVocabulary = executeTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const ia = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return permissionVocabulary;
  throw new Error(`Unexpected registry import: ${request}`);
});
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
const p3Candidate = head === P2_R2_HEAD && origin === P2_R2_HEAD && ahead === 0 && behind === 0;
const p3Frozen = head !== P2_R2_HEAD && git("rev-parse", "HEAD^") === P2_R2_HEAD && origin === P2_R2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P1_SUBJECT && git("status", "--short") === "";
const p3Pushed = head === P3_P1_HEAD && origin === P3_P1_HEAD && ahead === 0 && behind === 0;
const p3P2Frozen = head !== P3_P1_HEAD && git("rev-parse", "HEAD^") === P3_P1_HEAD && origin === P3_P1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P2_SUBJECT && git("status", "--short") === "";
const p3P2Pushed = head === P3_P2_HEAD && origin === P3_P2_HEAD && ahead === 0 && behind === 0;
const p3P3Frozen = head !== P3_P2_HEAD && git("rev-parse", "HEAD^") === P3_P2_HEAD && origin === P3_P2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P3_SUBJECT && git("status", "--short") === "";
const p3P3Pushed = head === P3_P3_HEAD && origin === P3_P3_HEAD && ahead === 0 && behind === 0;
const p3P4Frozen = head !== P3_P3_HEAD && git("rev-parse", "HEAD^") === P3_P3_HEAD && origin === P3_P3_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P4_SUBJECT && git("status", "--short") === "";
const p3P4Pushed = head === P3_P4_HEAD && origin === P3_P4_HEAD && ahead === 0 && behind === 0;
const p3P5Frozen = head !== P3_P4_HEAD && git("rev-parse", "HEAD^") === P3_P4_HEAD && origin === P3_P4_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_SUBJECT && git("status", "--short") === "";
const p3P5R1Candidate = head === P3_P5_HEAD && origin === P3_P4_HEAD && ahead === 1 && behind === 0;
const p3P5R1Frozen = head !== P3_P5_HEAD && git("rev-parse", "HEAD^") === P3_P5_HEAD && origin === P3_P4_HEAD
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_R1_SUBJECT && git("status", "--short") === "";
const p3P5R1Phase = p3P5R1Candidate || p3P5R1Frozen;
const p3P5Phase = p3P4Pushed || p3P5Frozen || p3P5R1Phase;
const p3P4Phase = p3P3Pushed || p3P4Frozen || p3P5Phase;
const p3P3Phase = p3P2Pushed || p3P3Frozen || p3P4Phase;
const p3P2Phase = p3Pushed || p3P2Frozen || p3P3Phase;
const p3Phase = p3Candidate || p3Frozen || p3P2Phase;

check("lifecycle is exactly the P2-R2 candidate/freeze or its bounded P3-P1 successor",
  candidate || frozen || p3Phase, { head, origin, ahead, behind });
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

const adminSourceFiles = [...walk("apps/admin-web/app/admin"), ...walk("apps/admin-web/components/admin-shell")]
  .filter((file) => /\.(?:ts|tsx)$/.test(file));
const adminSources = adminSourceFiles.map(read).join("\n");
const redirectFiles = adminSourceFiles.filter((file) => /\bredirect\s*\(/.test(read(file)));
check("77. redirects stay absent historically and are bounded to the P3-P1 gate successor",
  p3Phase
    ? redirectFiles.every((file) => ["apps/admin-web/app/admin/login/actions.ts", "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"].includes(file))
    : redirectFiles.length === 0,
  redirectFiles);
check("78. no DB migration", changedFromR1.every((file) => !file.startsWith("supabase/")));
const guardScriptFiles = new Set([
  "scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs",
  "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-session-p3-p1-smoke.mjs"
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
check("89. no lockfile churn before the exact dependency-authorized P3-P1 successor",
  changedFromR1.every((file) => !/lock/i.test(file) || (p3Phase && file === "package-lock.json")));
check("90. no hand-written auth/session implementation",
  !/document\.cookie\s*=|setCookie\s*\(|createSession\s*\(|jwt\.sign\s*\(|Authorization["'\s:]*[:=]\s*["'`]Bearer/i.test(adminSources)
    && (!p3Phase || exists("scripts/admin-session-p3-p1-guard.mjs")));

const allowedR2Path = (file) =>
  file === "apps/admin-web/auth/admin-route-registry.ts"
  || file === "scripts/admin-ia-p1-guard.mjs" || file === "scripts/admin-ia-p2-guard.mjs"
  || file === "scripts/admin-ia-p2-r1-guard.mjs" || file === "scripts/admin-ia-p2-r2-guard.mjs"
  || file === "package.json"
  || file.startsWith("apps/admin-web/app/admin/")
  || file.startsWith("apps/admin-web/components/admin-shell/");
const allowedP3Path = (file) => allowedR2Path(file)
  || file === "package-lock.json" || file === "apps/admin-web/package.json" || file === "apps/admin-web/middleware.ts"
  || file.startsWith("apps/admin-web/auth/") || file.startsWith("apps/admin-web/config/")
  || file === "scripts/admin-session-p3-p1-guard.mjs" || file === "scripts/admin-session-p3-p1-smoke.mjs"
  || file === "scripts/admin-current-permissions-p3-p2-guard.mjs" || file === "scripts/admin-current-permissions-p3-p2-smoke.mjs"
  || file === "scripts/admin-route-authorization-p3-p3-guard.mjs" || file === "scripts/admin-route-authorization-p3-p3-smoke.mjs"
  || file === "scripts/admin-navigation-p3-p4-guard.mjs" || file === "scripts/admin-navigation-p3-p4-smoke.mjs"
  || file === "apps/admin-web/server/platformAdminAuditRuntime.ts"
  || file === "apps/admin-web/server/platformAdminBranchStatusRuntime.ts"
  || file === "scripts/admin-api-session-p3-p5-guard.mjs" || file === "scripts/admin-api-session-p3-p5-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-guard.mjs" || file === "scripts/admin-api-session-p3-p5-r1-smoke.mjs";
check("the bounded P2-R2 diff contains only approved successor paths",
  changedFromR1.every(p3Phase ? allowedP3Path : allowedR2Path),
  changedFromR1.filter((file) => !(p3Phase ? allowedP3Path(file) : allowedR2Path(file))));

const p1Pkg = JSON.parse(git("show", `${P1_HEAD}:package.json`));
const expectedScripts = {
  ...p1Pkg.scripts,
  "test:admin-ia-p2": "node scripts/admin-ia-p2-guard.mjs",
  "test:admin-ia-p2-r1": "node scripts/admin-ia-p2-r1-guard.mjs",
  "test:admin-ia-p2-r2": "node scripts/admin-ia-p2-r2-guard.mjs",
  ...(p3Phase ? {
    "test:admin-session-p3-p1": "node scripts/admin-session-p3-p1-guard.mjs",
    "test:admin-session-p3-p1-smoke": "node scripts/admin-session-p3-p1-smoke.mjs"
  } : {}),
  ...(p3P2Phase ? {
    "test:admin-current-permissions-p3-p2": "node scripts/admin-current-permissions-p3-p2-guard.mjs",
    "test:admin-current-permissions-p3-p2-smoke": "node scripts/admin-current-permissions-p3-p2-smoke.mjs"
  } : {}),
  ...(p3P3Phase ? {
    "test:admin-route-authorization-p3-p3": "node scripts/admin-route-authorization-p3-p3-guard.mjs",
    "test:admin-route-authorization-p3-p3-smoke": "node scripts/admin-route-authorization-p3-p3-smoke.mjs"
  } : {}),
  ...(p3P4Phase ? {
    "test:admin-navigation-p3-p4": "node scripts/admin-navigation-p3-p4-guard.mjs",
    "test:admin-navigation-p3-p4-smoke": "node scripts/admin-navigation-p3-p4-smoke.mjs"
  } : {}),
  ...(p3P5Phase ? {
    "test:admin-api-session-p3-p5": "node scripts/admin-api-session-p3-p5-guard.mjs",
    "test:admin-api-session-p3-p5-smoke": "node scripts/admin-api-session-p3-p5-smoke.mjs"
  } : {}),
  ...(p3P5R1Phase ? {
    "test:admin-api-session-p3-p5-r1": "node scripts/admin-api-session-p3-p5-r1-guard.mjs",
    "test:admin-api-session-p3-p5-r1-smoke": "node scripts/admin-api-session-p3-p5-r1-smoke.mjs"
  } : {})
};
const expectedPkg = { ...p1Pkg, scripts: expectedScripts };
let packageMatches = true;
try { assert.deepEqual(pkg, expectedPkg); } catch { packageMatches = false; }
check("package.json adds only the P2/P2-R1/P2-R2 guard commands with no dependency or lockfile churn", packageMatches);

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-ia-p2-r2-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local"
    : p3Candidate ? "p3_p1_candidate" : p3Frozen ? "p3_p1_frozen_local"
      : p3Pushed ? "p3_p1_pushed" : p3P2Frozen ? "p3_p2_frozen_local"
        : p3P2Pushed ? "p3_p2_pushed" : p3P3Frozen ? "p3_p3_frozen_local"
          : p3P3Pushed ? "p3_p3_pushed" : p3P4Frozen ? "p3_p4_frozen_local"
            : p3P4Pushed ? "p3_p4_pushed" : p3P5Frozen ? "p3_p5_frozen_local"
              : p3P5R1Candidate ? "p3_p5_r1_candidate" : p3P5R1Frozen ? "p3_p5_r1_frozen_local" : "invalid",
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

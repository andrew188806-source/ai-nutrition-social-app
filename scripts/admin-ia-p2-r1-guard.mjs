#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";

const P1_HEAD = "0562566b57bab43d948640f7adc138bcf8e359fe";
const P2_HEAD = "981f3ec4976394f1254834cc5188566d1415c000";
const R1_HEAD = "5e4d68cb72ec5a1fcc3c2ce4550a0f9bfca033b0";
const ORIGIN_BASELINE = "500c122a5cfcd806e5d253731033f65727fdc4c0";
const P2_R1_SUBJECT = "Realign Admin nutrition and menu workspaces";
const P2_R2_SUBJECT = "Realign Admin sales marketing restaurant and nutrition workspaces";
const P2_R2_HEAD = "a3acc21a7eec4ba8051f30bcb7b470a2b2770551";
const P3_P1_SUBJECT = "Add Admin browser session gate";
const P3_P1_HEAD = "a75412a3da1cdf52c37732864975ad926da067f6";
const P3_P2_SUBJECT = "Resolve current Admin permissions";
const P3_P2_HEAD = "ab59cdc13317ee70482ae168923ac45f9b016906";
const P3_P3_SUBJECT = "Enforce current Admin route permissions";
const P3_P3_HEAD = "abb747551a9dd5c97988b44cff0c16f6f555eed8";
const P3_P4_SUBJECT = "Filter Admin navigation by current permissions";
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
const changedFromP2 = [...new Set([...lines(git("diff", "--name-only", P2_HEAD)), ...untracked])].sort();
const candidate = head === P2_HEAD && origin === ORIGIN_BASELINE && ahead === 2 && behind === 0;
const frozen = head === R1_HEAD && git("rev-parse", "HEAD^") === P2_HEAD && origin === ORIGIN_BASELINE
  && ahead === 3 && behind === 0 && git("log", "-1", "--format=%s") === P2_R1_SUBJECT && git("status", "--short") === "";
const r2Candidate = head === R1_HEAD && origin === ORIGIN_BASELINE && ahead === 3 && behind === 0;
const r2Frozen = head !== R1_HEAD && git("rev-parse", "HEAD^") === R1_HEAD && origin === ORIGIN_BASELINE
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
const p3Phase = p3Candidate || p3Frozen || p3Pushed || p3P2Frozen || p3P2Pushed || p3P3Frozen || p3P3Pushed || p3P4Frozen;

check("lifecycle is exactly the P2-R1 candidate/freeze or its bounded P2-R2/P3-P1 successor",
  candidate || frozen || r2Candidate || r2Frozen || p3Phase, { head, origin, ahead, behind });
check(`the registry contains the actual final count of ${EXPECTED_REGISTRY_ROUTES}`,
  ia.ADMIN_ROUTE_REGISTRY.length === EXPECTED_REGISTRY_ROUTES, ia.ADMIN_ROUTE_REGISTRY.length);

// 1-2: Nutrition Professional Management rename and professional framing.
const nutrition = routeById.get("nutrition");
check("1. /admin/nutrition label is 營養專業管理", nutrition?.zhTWLabel === "營養專業管理", nutrition?.zhTWLabel);
check("2. Nutrition landing represents a professional Nutritionist workspace",
  registryPage.includes("營養師") && /nutrition:\s*"[^"]*營養師/.test(registryPage.replace(/\s+/g, " ")));

// 3-11: canonical Restaurant Menu Management ownership.
// RA-3-IA-P2-R2 legitimately relabeled menu-management to a queue-only
// workspace and moved ingredients/allergens/nutrition-data/certification-status
// to Restaurant/Dish-scoped context; these checks were updated for that
// explicitly-authorized successor change (see admin-ia-p2-r2-guard.mjs for
// the R2-owned proof of the new locations).
const menuManagement = routeById.get("menu-management");
check("3. Restaurant Operations contains the canonical cross-Restaurant menu workspace",
  menuManagement?.parentId === "restaurants" && rootWorkspaceOf("menu-management") === "restaurants");
const mm = (id) => routeById.get(id);
check("4. ingredients canonical route belongs to Restaurant Operations (Dish-scoped in R2)",
  rootWorkspaceOf("restaurant-item-ingredients") === "restaurants" && !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-ingredients"));
check("5. allergens canonical route belongs to Restaurant Operations (Dish-scoped in R2)",
  rootWorkspaceOf("restaurant-item-allergens") === "restaurants" && !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-allergens"));
check("6. menu data quality canonical route belongs to Restaurant menu management", mm("menu-management-data-quality")?.parentId === "menu-management");
check("7. pending items belong to Restaurant menu management", mm("menu-management-pending")?.parentId === "menu-management"
  && mm("menu-management-pending")?.legacyRoutes.some((legacy) => legacy.route === "/pending-menu-items"));
check("8. duplicates belong to Restaurant menu management", mm("menu-management-duplicates")?.parentId === "menu-management"
  && mm("menu-management-duplicates")?.legacyRoutes.some((legacy) => legacy.route === "/duplicate-menu-items"));
check("9. aliases/identification belong to Restaurant menu management", mm("menu-management-aliases")?.parentId === "menu-management"
  && mm("menu-management-aliases")?.legacyRoutes.some((legacy) => legacy.route === "/alias-review")
  && mm("menu-management-aliases")?.legacyRoutes.some((legacy) => legacy.route === "/identification-audit"));
check("10. Restaurant menu nutrition-data state exists (Dish-scoped in R2)",
  rootWorkspaceOf("restaurant-item-nutrition") === "restaurants" && !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-nutrition-data"));
check("11. Restaurant certification-status location exists (Dish-scoped in R2)",
  rootWorkspaceOf("restaurant-item-certification") === "restaurants" && !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.id === "menu-management-certification-status"));

// 12-15: Nutrition Standards and Scoring.
check("12. Nutrition standards workspace exists", routeById.get("nutrition-standards")?.parentId === "nutrition");
check("13. scoring basis exists", routeById.get("nutrition-standards-scoring")?.parentId === "nutrition-standards");
check("14. recommendation criteria exists", routeById.get("nutrition-standards-recommendation")?.parentId === "nutrition-standards");
check("15. important nutrition parameters exists", routeById.get("nutrition-standards-parameters")?.parentId === "nutrition-standards");
const standardsChildren = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "nutrition-standards" || route.parentId === "nutrition-standards");
check("standards workspace declares no editable settings in this phase",
  standardsChildren.every((route) => route.availability === "NOT_ENABLED"));

// 16-18: consent-scoped Member Nutrition Management.
const members = routeById.get("nutrition-members");
check("16. member nutrition management exists", members?.parentId === "nutrition");
check("17. member nutrition management is consent-scoped in copy/metadata",
  registryPage.includes("僅會員明確同意並指派給特定 Nutritionist")
    && ia.FUTURE_MEMBER_NUTRITION_FIELD_ADJUSTMENT_PRINCIPLES?.requiresExplicitMemberConsent === true
    && ia.FUTURE_MEMBER_NUTRITION_FIELD_ADJUSTMENT_PRINCIPLES?.requiresAssignedAuthorizedNutritionist === true
    && ia.FUTURE_MEMBER_NUTRITION_FIELD_ADJUSTMENT_PRINCIPLES?.noGenericProfileEditor === true);
check("18. no all-members browse semantics",
  registryPage.includes("不是全會員瀏覽器")
    && !/瀏覽全部會員|browse all members|member browser(?!.{0,20}不是)/i.test(registryPage)
    && members?.availability === "NOT_ENABLED");

// 19-24: Restaurant Nutrition Certification workspace.
const certification = routeById.get("nutrition-certification");
check("19. certification workspace exists", certification?.parentId === "nutrition" && certification?.zhTWLabel === "餐廳營養認證");
check("20. pending certification route exists", routeById.get("nutrition-certification-pending")?.parentId === "nutrition-certification");
check("21. discrepancy report route exists", routeById.get("nutrition-certification-discrepancy")?.route === "/admin/nutrition/certification/discrepancy-reports");
check("22. remote Restaurant review route exists", routeById.get("nutrition-certification-remote-review")?.route === "/admin/nutrition/certification/remote-review");
check("23. certification history exists", routeById.get("nutrition-certification-history")?.route === "/admin/nutrition/certification/history");
check("24. re-review route exists", routeById.get("nutrition-certification-re-review")?.route === "/admin/nutrition/certification/re-review");
check("25. Restaurant dish existence alone does not imply mandatory professional review",
  ia.NUTRITION_CERTIFICATION_QUEUE_SEMANTICS?.dishExistenceAloneDoesNotImplyReview === true
    && registryPage.includes("不會僅因存在就進入專業審查佇列"));
check("remote review placeholder implements no live communication or mutation",
  registryPage.includes("不包含視訊、即時通訊、餐廳存取權限或任何營養資料寫入／認證異動")
    && Array.isArray(ia.REMOTE_RESTAURANT_REVIEW_BOUNDARY?.notImplemented)
    && ["video calling", "chat", "real-time collaboration", "restaurant access", "nutrition writes", "certification mutation"]
      .every((item) => ia.REMOTE_RESTAURANT_REVIEW_BOUNDARY.notImplemented.includes(item)));

// 26-27: cross-workspace shortcuts, no duplication.
const nutritionShortcuts = ia.ADMIN_WORKSPACE_SHORTCUTS.filter((shortcut) => shortcut.sourceWorkspaceId === "nutrition");
check("26. Nutrition landing has cross-workspace Restaurant menu shortcuts",
  nutritionShortcuts.length >= 1 && registryPage.includes("WorkspaceShortcuts") && registryPage.includes("相關菜單資料快速連結"));
check("27. shortcuts target existing canonical Restaurant routes",
  nutritionShortcuts.every((shortcut) => routeById.has(shortcut.targetRouteId) && rootWorkspaceOf(shortcut.targetRouteId) === "restaurants"));

// 28-30: no duplicate ownership.
const routesByPath = new Map();
for (const route of ia.ADMIN_ROUTE_REGISTRY) {
  routesByPath.set(route.route, (routesByPath.get(route.route) ?? 0) + 1);
}
check("28. no duplicate Nutrition allergens canonical page", !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.route === "/admin/nutrition/allergens"));
check("29. no duplicate Nutrition ingredients canonical page", !ia.ADMIN_ROUTE_REGISTRY.some((route) => route.route === "/admin/nutrition/ingredients"));
const singleOwnerIds = [
  "menu-management-pending", "menu-management-duplicates", "menu-management-aliases", "menu-management-data-quality",
  "restaurant-item-ingredients", "restaurant-item-allergens", "restaurant-item-nutrition", "restaurant-item-certification"
];
check("30. no duplicate feature ownership created",
  singleOwnerIds.every((id) => ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === id).length === 1)
    && [...routesByPath.values()].every((count) => count === 1));

// 31-33: preserved boundaries and documented distinctions.
check("31. Restaurant About remains outside Nutrition", rootWorkspaceOf("restaurant-about") === "restaurants");
check("32. Restaurant Verification semantics unchanged",
  JSON.stringify(ia.RESTAURANT_VERIFICATION_BOUNDARY) === JSON.stringify({
    means: ["restaurant identity", "operator legitimacy"],
    doesNotMean: ["nutrition certification", "food safety certification", "platform recommendation", "quality badge", "allergen certification"]
  }));
check("33. self-cooked quality classification is explicitly justified",
  registryPage.includes("nutrition-self-cooked-quality")
    && ia.MENU_IDENTIFICATION_VS_NUTRITION_ESTIMATION_BOUNDARY?.rationale?.includes("does not imply shared ownership")
    && routeById.get("nutrition-self-cooked-quality")?.parentId === "nutrition");

// 34-36: unrelated boundaries untouched.
const engineering = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "engineering" || route.parentId === "engineering");
check("34. Engineering boundary unchanged", engineering.length === 8 && engineering.every((route) => route.dataClass === "ENGINEERING_DIAGNOSTIC"));
const management = ia.ADMIN_ROUTE_REGISTRY.filter((route) => route.id === "management" || route.parentId === "management");
check("35. Management boundary unchanged", management.length === 4 && management.every((route) => route.availability === "NOT_ENABLED"));
const breakGlass = routeById.get("break-glass");
check("36. Break-glass remains hidden/no page", breakGlass?.navigationVisibility === "HIDDEN" && breakGlass?.availability === "NOT_ENABLED"
  && !exists("apps/admin-web/app/admin/break-glass/page.tsx"));

// 37-39: legacy invariants.
const legacyPages = [
  "app/page.tsx", "app/login/page.tsx", "app/verification/page.tsx", "app/menu-review/page.tsx",
  "app/restaurant-review/page.tsx", "app/pending-menu-items/page.tsx", "app/duplicate-menu-items/page.tsx",
  "app/alias-review/page.tsx", "app/nutrition-review/page.tsx", "app/data-quality/page.tsx", "app/ad-review/page.tsx",
  "app/sponsored/page.tsx", "app/esg/page.tsx", "app/data-access/page.tsx", "app/consents/page.tsx",
  "app/audit-trail/page.tsx", "app/tags/page.tsx", "app/social-governance/page.tsx",
  "app/identification-audit/page.tsx", "app/self-cooked-audit/page.tsx", "app/exercise-governance/page.tsx",
  "app/settings/page.tsx"
].map((file) => `apps/admin-web/${file}`);
check("37. old 22 legacy routes remain", legacyPages.length === 22 && legacyPages.every((file) => exists(file)
  && read(file).trimEnd() === git("show", `${P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
const acceptedApis = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts"
];
check("38. accepted APIs unchanged", acceptedApis.every((file) => exists(file)
  && read(file).trimEnd() === git("show", `${P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
const adminSourceFiles = [...walk("apps/admin-web/app/admin"), ...walk("apps/admin-web/components/admin-shell")]
  .filter((file) => /\.(?:ts|tsx)$/.test(file));
const adminSources = adminSourceFiles.map(read).join("\n");
const redirectFiles = adminSourceFiles.filter((file) => /\bredirect\s*\(/.test(read(file)));
check("39. redirects stay absent historically and are bounded to the P3-P1 gate successor",
  p3Phase
    ? redirectFiles.every((file) => ["apps/admin-web/app/admin/login/actions.ts", "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"].includes(file))
    : redirectFiles.length === 0,
  redirectFiles);

// 40-43: no authority/dependency expansion.
check("40. no DB migration", changedFromP2.every((file) => !file.startsWith("supabase/")));
check("41. no DB permission expansion",
  !/create role|create policy|grant execute|grant update|security definer|role_permissions|alter table\s+public\./i.test(
    changedFromP2.filter((file) => exists(file) && file !== "scripts/admin-ia-p2-r1-guard.mjs" && file !== "scripts/admin-ia-p2-r2-guard.mjs").map(read).join("\n")
  ));
const pkg = JSON.parse(read("package.json"));
const p2Pkg = JSON.parse(git("show", `${P2_HEAD}:package.json`));
check("42. no dependency change",
  JSON.stringify(pkg.dependencies ?? {}) === JSON.stringify(p2Pkg.dependencies ?? {})
    && JSON.stringify(pkg.devDependencies ?? {}) === JSON.stringify(p2Pkg.devDependencies ?? {}));
check("43. no lockfile churn before the exact dependency-authorized P3-P1 successor",
  changedFromP2.every((file) => !/lock/i.test(file) || (p3Phase && file === "package-lock.json")));

// 44-45: no auth/session implementation, no personal data loading.
check("44. no hand-written auth/session implementation",
  !/document\.cookie\s*=|setCookie\s*\(|createSession\s*\(|jwt\.sign\s*\(|Authorization["'\s:]*[:=]\s*["'`]Bearer/i.test(adminSources)
    && (!p3Phase || exists("scripts/admin-session-p3-p1-guard.mjs")));
const memberNutritionSources = [
  "apps/admin-web/app/admin/nutrition/members/page.tsx",
  "apps/admin-web/app/admin/nutrition/members/[memberRef]/page.tsx"
].filter(exists).map(read).join("\n");
check("45. no personal data loading",
  !/fetch\s*\(|supabase\.|createClient|\.select\(|\.from\(/i.test(memberNutritionSources)
    && !/await\s/.test(memberNutritionSources));

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-ia-p2-r1-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local"
    : r2Candidate ? "p2_r2_candidate" : r2Frozen ? "p2_r2_frozen_local"
      : p3Candidate ? "p3_p1_candidate" : p3Frozen ? "p3_p1_frozen_local"
        : p3Pushed ? "p3_p1_pushed" : p3P2Frozen ? "p3_p2_frozen_local"
          : p3P2Pushed ? "p3_p2_pushed" : p3P3Frozen ? "p3_p3_frozen_local"
            : p3P3Pushed ? "p3_p3_pushed" : p3P4Frozen ? "p3_p4_frozen_local" : "invalid",
  expectedRegistryRoutes: EXPECTED_REGISTRY_ROUTES,
  actualRegistryRoutes: ia.ADMIN_ROUTE_REGISTRY.length,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  changedFromP2Count: changedFromP2.length,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length > 0) process.exitCode = 1;

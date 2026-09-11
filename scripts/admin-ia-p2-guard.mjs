#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";

const P1_HEAD = "0562566b57bab43d948640f7adc138bcf8e359fe";
const ORIGIN_BASELINE = "500c122a5cfcd806e5d253731033f65727fdc4c0";
const P2_HEAD = "981f3ec4976394f1254834cc5188566d1415c000";
const P2_SUBJECT = "Build canonical Admin workspace shell";
const R1_HEAD = "5e4d68cb72ec5a1fcc3c2ce4550a0f9bfca033b0";
const P2_R1_SUBJECT = "Realign Admin nutrition and menu workspaces";
const P2_R2_SUBJECT = "Realign Admin sales marketing restaurant and nutrition workspaces";
const P2_R2_HEAD = "a3acc21a7eec4ba8051f30bcb7b470a2b2770551";
const P3_P1_SUBJECT = "Add Admin browser session gate";
const EXPECTED_REGISTRY_ROUTES = 95;
const EXPECTED_PHYSICAL_PAGES = 94;
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
const navigation = executeTypeScript(
  "apps/admin-web/components/admin-shell/admin-ia-navigation.ts",
  (request) => {
    if (request === "../../auth/admin-route-registry") return ia;
    throw new Error(`Unexpected navigation runtime import: ${request}`);
  }
);

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changed = [...new Set([...lines(git("diff", "--name-only", P1_HEAD)), ...untracked])].sort();
const candidate = head === P1_HEAD && origin === ORIGIN_BASELINE && ahead === 1 && behind === 0;
const frozen = head === P2_HEAD && git("rev-parse", "HEAD^") === P1_HEAD && origin === ORIGIN_BASELINE
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === P2_SUBJECT && git("status", "--short") === "";
const r1Candidate = head === P2_HEAD && origin === ORIGIN_BASELINE && ahead === 2 && behind === 0;
const r1Frozen = head === R1_HEAD && git("rev-parse", "HEAD^") === P2_HEAD && origin === ORIGIN_BASELINE
  && ahead === 3 && behind === 0 && git("log", "-1", "--format=%s") === P2_R1_SUBJECT && git("status", "--short") === "";
const r2Candidate = head === R1_HEAD && origin === ORIGIN_BASELINE && ahead === 3 && behind === 0;
const r2Frozen = head !== R1_HEAD && git("rev-parse", "HEAD^") === R1_HEAD && origin === ORIGIN_BASELINE
  && ahead === 4 && behind === 0 && git("log", "-1", "--format=%s") === P2_R2_SUBJECT && git("status", "--short") === "";
const p3Candidate = head === P2_R2_HEAD && origin === P2_R2_HEAD && ahead === 0 && behind === 0;
const p3Frozen = head !== P2_R2_HEAD && git("rev-parse", "HEAD^") === P2_R2_HEAD && origin === P2_R2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P1_SUBJECT && git("status", "--short") === "";
const p3Phase = p3Candidate || p3Frozen;

const allowedP2Path = (file) =>
  file === "apps/admin-web/auth/admin-route-registry.ts"
  || file === "scripts/admin-ia-p1-guard.mjs"
  || file === "scripts/admin-ia-p2-guard.mjs"
  || file === "scripts/admin-ia-p2-r1-guard.mjs"
  || file === "scripts/admin-ia-p2-r2-guard.mjs"
  || file === "package.json"
  || file.startsWith("apps/admin-web/app/admin/")
  || file.startsWith("apps/admin-web/components/admin-shell/");
const allowedP3Path = (file) => allowedP2Path(file)
  || file === "package-lock.json" || file === "apps/admin-web/package.json" || file === "apps/admin-web/middleware.ts"
  || file.startsWith("apps/admin-web/auth/") || file.startsWith("apps/admin-web/config/")
  || file === "scripts/admin-session-p3-p1-guard.mjs" || file === "scripts/admin-session-p3-p1-smoke.mjs";

check("lifecycle is exactly the P2 candidate/freeze or its bounded P2-R1/P2-R2/P3-P1 successor",
  candidate || frozen || r1Candidate || r1Frozen || r2Candidate || r2Frozen || p3Phase, { head, origin, ahead, behind });
check("the P1 registry remains the single canonical route and authority metadata source",
  read("apps/admin-web/components/admin-shell/admin-ia-navigation.ts").includes("../../auth/admin-route-registry")
    && !exists("apps/admin-web/components/admin-shell/admin-route-registry.ts"));
check("the bounded P2 diff contains only approved successor paths",
  changed.every(p3Phase ? allowedP3Path : allowedP2Path), changed.filter((file) => !(p3Phase ? allowedP3Path(file) : allowedP2Path(file))));
check(`the registry contains the actual final count of ${EXPECTED_REGISTRY_ROUTES}`,
  ia.ADMIN_ROUTE_REGISTRY.length === EXPECTED_REGISTRY_ROUTES, ia.ADMIN_ROUTE_REGISTRY.length);
check("the canonical /admin root physically exists", exists("apps/admin-web/app/admin/page.tsx") && exists("apps/admin-web/app/admin/layout.tsx"));

const topLevelPages = ["business-development", "operations", "restaurants", "nutrition", "members", "social", "audit", "management", "engineering"]
  .map((segment) => `apps/admin-web/app/admin/${segment}/page.tsx`);
check("all nine non-dashboard top-level workspace page locations physically exist", topLevelPages.every(exists), topLevelPages.filter((file) => !exists(file)));
check("Engineering is physically present and structurally separate", exists("apps/admin-web/app/admin/engineering/page.tsx")
  && read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").includes('node.id === "engineering"'));
check("Break-glass has no page implementation", !exists("apps/admin-web/app/admin/break-glass/page.tsx"));
check("the canonical Admin login placeholder exists", exists("apps/admin-web/app/admin/login/page.tsx"));

const routePagePath = (route) => {
  if (route === "/admin") return "apps/admin-web/app/admin/page.tsx";
  return `apps/admin-web/app${route}/page.tsx`;
};
const requiredPhysicalRoutes = ia.ADMIN_ROUTE_REGISTRY.filter((entry) => entry.id !== "break-glass");
const missingPhysicalRoutes = requiredPhysicalRoutes.filter((entry) => !exists(routePagePath(entry.route))).map((entry) => entry.route);
const physicalPages = walk("apps/admin-web/app/admin").filter((file) => file.endsWith("/page.tsx"));
check(`all ${EXPECTED_PHYSICAL_PAGES} canonical UI locations have physical pages`,
  requiredPhysicalRoutes.length === EXPECTED_PHYSICAL_PAGES && physicalPages.length === EXPECTED_PHYSICAL_PAGES
    && missingPhysicalRoutes.length === 0,
  { registered: requiredPhysicalRoutes.length, physical: physicalPages.length, missingPhysicalRoutes });
check("no opaque catch-all route replaces the physical hierarchy",
  walk("apps/admin-web/app/admin").every((file) => !/\[\[?\.\.\./.test(file)));

const sidebar = read("apps/admin-web/components/admin-shell/AdminSidebar.tsx");
const navigationSource = read("apps/admin-web/components/admin-shell/admin-ia-navigation.ts");
const breadcrumbs = read("apps/admin-web/components/admin-shell/AdminBreadcrumbs.tsx");
check("the Sidebar consumes the registry-derived scaffold navigation builder",
  sidebar.includes("buildAdminScaffoldNavigation") && navigationSource.includes("ADMIN_ROUTE_REGISTRY"));
check("the Sidebar contains no independent hardcoded canonical route tree", !/["']\/admin\/(operations|restaurants|members|social|nutrition|audit|management|engineering)/.test(sidebar));
check("breadcrumbs derive from the same registry matcher and parent hierarchy",
  breadcrumbs.includes("getAdminBreadcrumbs") && navigationSource.includes("getAdminRouteChain"));

const matchCases = [
  ["/admin/restaurants", "restaurants"],
  ["/admin/restaurants/abc", "restaurant-detail"],
  ["/admin/restaurants/verification", "restaurant-verification"],
  ["/admin/restaurants/abc/menus/menu-1/items", "restaurant-menu-items"],
  ["/admin/restaurants/abc/branches/xyz", "restaurant-branch-detail"],
  ["/admin/restaurants/abc/branches/xyz/status", "restaurant-branch-status"],
  ["/admin/members/member-1/consents", "member-consents"]
];
check("route matcher resolves static and dynamic paths to the most specific route",
  matchCases.every(([pathname, id]) => navigation.matchAdminRoute(pathname)?.entry.id === id),
  matchCases.map(([pathname, id]) => ({ pathname, expected: id, actual: navigation.matchAdminRoute(pathname)?.entry.id ?? null })));
check("unknown Admin routes fail safely without parent or Dashboard fallback",
  navigation.matchAdminRoute("/admin/restaurants/abc/unknown") === null
    && navigation.matchAdminRoute("/admin/not-a-workspace") === null
    && navigation.matchAdminRoute("/outside-admin") === null);

const badge = read("apps/admin-web/components/admin-shell/AdminAvailabilityBadge.tsx");
check("availability badges consume the exact LIVE, DEMO and NOT_ENABLED registry labels",
  badge.includes("ADMIN_AVAILABILITY_ZH_TW") && ["LIVE", "DEMO", "NOT_ENABLED"].every((state) => state in ia.ADMIN_AVAILABILITY_ZH_TW));
check("the runtime ERROR copy remains explicit and separate from stored availability",
  ia.ADMIN_RUNTIME_ERROR_ZH_TW === "正式資料暫時無法使用" && !ia.ADMIN_AVAILABILITIES.includes("ERROR"));
check("the scaffold notice says permission integration is pending",
  read("apps/admin-web/components/admin-shell/AdminIaScaffoldNotice.tsx").includes("正式人員權限將於下一階段接入"));

const registryPage = read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx");
check("Engineering states its private-data boundary and creates no dangerous tooling",
  registryPage.includes("工程診斷不代表可存取使用者私密內容")
    && !/(SQL console|token viewer|photo browser|chat browser|credential viewer)/i.test(registryPage));
check("Management pages remain NOT_ENABLED and operator authority is not wired",
  ia.ADMIN_ROUTE_REGISTRY.filter((entry) => entry.id === "management" || entry.parentId === "management")
    .every((entry) => entry.availability === "NOT_ENABLED")
    && registryPage.includes("並未透過管理後台開放"));
check("Restaurant Verification semantics remain bounded",
  registryPage.includes("店家身分／經營權確認") && registryPage.includes("不代表營養認證、品質推薦、食安認證或過敏原認證"));
check("Restaurant About and nutrition certification remain separate",
  registryPage.includes("Restaurant About 是店家提供的介紹文字，不是平台營養認證")
    && registryPage.includes("營養認證屬於獨立治理資訊"));
check("Member Support privacy copy is present", registryPage.includes("只提供處理案件所需的最小會員資訊")
  && registryPage.includes("不提供任意瀏覽會員或健康資料"));
check("Social Safety privacy copy is present", registryPage.includes("只提供處理案件所需的範圍資料")
  && registryPage.includes("不提供任意瀏覽聊天、精確位置或推播 token"));

const legacyPages = [
  "app/page.tsx", "app/login/page.tsx", "app/verification/page.tsx", "app/menu-review/page.tsx",
  "app/restaurant-review/page.tsx", "app/pending-menu-items/page.tsx", "app/duplicate-menu-items/page.tsx",
  "app/alias-review/page.tsx", "app/nutrition-review/page.tsx", "app/data-quality/page.tsx", "app/ad-review/page.tsx",
  "app/sponsored/page.tsx", "app/esg/page.tsx", "app/data-access/page.tsx", "app/consents/page.tsx",
  "app/audit-trail/page.tsx", "app/tags/page.tsx", "app/social-governance/page.tsx",
  "app/identification-audit/page.tsx", "app/self-cooked-audit/page.tsx", "app/exercise-governance/page.tsx",
  "app/settings/page.tsx"
].map((file) => `apps/admin-web/${file}`);
check("all 22 legacy UI pages remain present and byte-equivalent",
  legacyPages.length === 22 && legacyPages.every((file) => exists(file)
    && read(file).trimEnd() === git("show", `${P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));

const acceptedApis = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts"
];
check("accepted Platform Admin API paths remain present and byte-equivalent",
  acceptedApis.every((file) => exists(file) && read(file).trimEnd() === git("show", `${P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("no database or migration path changed", changed.every((file) => !file.startsWith("supabase/")));

const pkg = JSON.parse(read("package.json"));
const p1Pkg = JSON.parse(git("show", `${P1_HEAD}:package.json`));
const expectedScripts = {
  ...p1Pkg.scripts,
  "test:admin-ia-p2": "node scripts/admin-ia-p2-guard.mjs",
  ...((r1Candidate || r1Frozen || r2Candidate || r2Frozen || p3Phase) ? { "test:admin-ia-p2-r1": "node scripts/admin-ia-p2-r1-guard.mjs" } : {}),
  ...((r2Candidate || r2Frozen || p3Phase) ? { "test:admin-ia-p2-r2": "node scripts/admin-ia-p2-r2-guard.mjs" } : {}),
  ...(p3Phase ? {
    "test:admin-session-p3-p1": "node scripts/admin-session-p3-p1-guard.mjs",
    "test:admin-session-p3-p1-smoke": "node scripts/admin-session-p3-p1-smoke.mjs"
  } : {})
};
const expectedPkg = { ...p1Pkg, scripts: expectedScripts };
let packageMatches = true;
try { assert.deepEqual(pkg, expectedPkg); } catch { packageMatches = false; }
check("package.json adds only the P2/P2-R1/P2-R2 guard commands with no dependency or lockfile churn",
  packageMatches && changed.every((file) => !/lock/i.test(file) || (p3Phase && file === "package-lock.json")));

const adminSourceFiles = [...walk("apps/admin-web/app/admin"), ...walk("apps/admin-web/components/admin-shell")]
  .filter((file) => /\.(?:ts|tsx)$/.test(file));
const adminSources = adminSourceFiles.map(read).join("\n");
const redirectFiles = adminSourceFiles.filter((file) => /\bredirect\s*\(/.test(read(file)));
check("redirect stays absent historically and is bounded to the P3-P1 gate successor",
  p3Phase
    ? redirectFiles.every((file) => ["apps/admin-web/app/admin/login/actions.ts", "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"].includes(file))
    : redirectFiles.length === 0,
  redirectFiles);
check("the legacy AdminShell remains byte-equivalent", read("apps/admin-web/components/AdminShell.tsx").trimEnd()
  === git("show", `${P1_HEAD}:apps/admin-web/components/AdminShell.tsx`).replace(/\r\n/g, "\n").trimEnd());
check("no token-in-URL or localStorage authentication workaround exists",
  !/localStorage|sessionStorage|searchParams\.(?:get|set)\s*\(\s*["'](?:token|access_token|authorization)/i.test(adminSources));
check("the scaffold uses registry status counts and adds no fake business metrics",
  registryPage.includes("statusCounts") && !/(fake KPI|mock restaurant count|review count:|revenue|conversion rate)/i.test(adminSources));

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-ia-p2-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local"
    : r1Candidate ? "p2_r1_candidate" : r1Frozen ? "p2_r1_frozen_local"
      : r2Candidate ? "p2_r2_candidate" : r2Frozen ? "p2_r2_frozen_local"
        : p3Candidate ? "p3_p1_candidate" : p3Frozen ? "p3_p1_frozen_local" : "invalid",
  expectedRegistryRoutes: EXPECTED_REGISTRY_ROUTES,
  actualRegistryRoutes: ia.ADMIN_ROUTE_REGISTRY.length,
  expectedPhysicalPages: EXPECTED_PHYSICAL_PAGES,
  actualPhysicalPages: physicalPages.length,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  changedPathCount: changed.length,
  changedPaths: changed,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length > 0) process.exitCode = 1;

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const issues = [];
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function check(name, condition, details = "") {
  checks.push({ name, pass: Boolean(condition), details });
  if (!condition) issues.push({ name, details });
}
function extractFunctionBody(source, functionName) {
  const startMatch = source.match(new RegExp(`export async function ${functionName}\\s*\\([^)]*\\)\\s*\\{`));
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const rest = source.slice(start);
  const nextExportIndex = rest.search(/\nexport (async function|function)\s/);
  return nextExportIndex === -1 ? rest : rest.slice(0, nextExportIndex);
}

const liveReads = read("apps/restaurant-web/runtime/live-restaurant-reads.ts");
const ownerRepository = read("apps/restaurant-web/repositories/supabase/restaurant-owner-rpc-repository.ts");
const dashboardPage = read("apps/restaurant-web/app/restaurant/page.tsx");
const menuPage = read("apps/restaurant-web/app/restaurant/menu/page.tsx");
const factory = read("apps/restaurant-web/repositories/restaurant-read-repository-factory.ts");
const publicRepository = read("apps/restaurant-web/repositories/supabase/supabase-public-nutrition-repository.ts");
const closure = read("docs/runtime-integration-phase-2v-e/raw-runtime-dependency-closure.md");
const n4 = read("docs/runtime-integration-phase-2v-e/n4-revocation-contract.md");
const actors = read("docs/runtime-integration-phase-2v-e/dv-001-actor-validation-plan.md");
const performance = read("docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md");
const audit = read("docs/runtime-integration-phase-2v-e/development-readonly-query-plan-audit.sql");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const ts = requireFromRoot("typescript");
const configSource = read("apps/restaurant-web/config/restaurant-data-source.ts").replace('import "server-only";', "");
const configOutput = ts.transpileModule(configSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const configModule = { exports: {} };
new Function("module", "exports", configOutput)(configModule, configModule.exports);
const { getRestaurantDataSourceConfig } = configModule.exports;

const pageBudgets = {
  dashboard: { access: 1, data: 5, total: 6 },
  locations: { access: 1, data: 1, total: 2 },
  menu: { access: 1, data: 5, total: 6 },
  nutrition: { access: 1, data: 2, total: 3 }
};
// Superseded 2026-07-23: five-way Promise.all on Dashboard/Menu was proven to
// intermittently trigger Postgres statement-timeout cancellation (SQLSTATE
// 57014) on the Development instance under connection contention, even
// though each individual RPC call is fast. Dashboard/Menu now fetch their
// five data RPCs sequentially instead; these two checks assert that
// corrected behavior. Nutrition (two calls) was never observed to fail and
// remains Promise.all by design.
const dashboardBody = extractFunctionBody(liveReads, "loadLiveDashboard");
const menuBody = extractFunctionBody(liveReads, "loadLiveMenu");
check("dashboard fetches five data RPCs sequentially, not via Promise.all",
  !/Promise\.all\(/.test(dashboardBody) &&
  /await repository\.listBranches\(restaurant\.id\)/.test(dashboardBody) &&
  /await repository\.listMenus\(restaurant\.id\)/.test(dashboardBody) &&
  /await repository\.listMenuItems\(restaurant\.id\)/.test(dashboardBody) &&
  /await repository\.listBranchMenuItems\(restaurant\.id\)/.test(dashboardBody) &&
  /await repository\.listCurrentNutrition\(restaurant\.id\)/.test(dashboardBody));
check("menu fetches five data RPCs sequentially, not via Promise.all",
  !/Promise\.all\(/.test(menuBody) &&
  /await repository\.listMenus\(restaurant\.id\)/.test(menuBody) &&
  /await repository\.listMenuCategories\(restaurant\.id\)/.test(menuBody) &&
  /await repository\.listMenuItems\(restaurant\.id\)/.test(menuBody) &&
  /await repository\.listBranchMenuItems\(restaurant\.id\)/.test(menuBody) &&
  /await repository\.listCurrentNutrition\(restaurant\.id\)/.test(menuBody));
check("nutrition uses two parallel data RPCs", /loadLiveNutrition[\s\S]*Promise\.all\(\[repository\.listMenuItems[\s\S]*repository\.listCurrentNutrition/.test(liveReads));

// 2026-07-23 retry hardening: the owner RPC repository retries only the
// specific transient SQLSTATE 57014 (Postgres statement-timeout
// cancellation), bounded, and never retries any other error code.
check("owner RPC retry targets only SQLSTATE 57014",
  /const TRANSIENT_RETRY_CODE = "57014"/.test(ownerRepository));
check("owner RPC retry count is bounded and explicit",
  /const MAX_TRANSIENT_RETRIES = 1/.test(ownerRepository));
check("owner RPC retry gate requires the transient code before retrying",
  /result\.error\.code === TRANSIENT_RETRY_CODE && attempt < MAX_TRANSIENT_RETRIES/.test(ownerRepository));
check("owner RPC throws (never silently succeeds) once retries are exhausted",
  /throw new SupabaseQueryError\(`\$\{name\} failed: \$\{result\.error\.code/.test(ownerRepository));

// 2026-07-23 branch filter wiring (Phase 2V-F Test Group 7): Dashboard and
// Menu must both source their branch context from the existing
// loadValidatedBranch() and fail closed (redirect, no data load) on an
// invalid selection.
for (const [label, page] of [["dashboard", dashboardPage], ["menu", menuPage]]) {
  check(`${label} page validates branch selection via loadValidatedBranch()`,
    /loadValidatedBranch/.test(page));
  check(`${label} page redirects on invalid branch before loading live data`,
    /branch\.invalid[\s\S]{0,40}redirect\(/.test(page) &&
    page.indexOf("branch.invalid") < page.indexOf(label === "dashboard" ? "loadLiveDashboard()" : "loadLiveMenu()"));
}
check("public-safe repository has exactly two read methods", (publicRepository.match(/async\s+(?:get|list)PublicPublishedNutrition/g) ?? []).length === 2);
check("public-safe repository queries one approved view", (publicRepository.match(/client\.select/g) ?? []).length === 2 && !/restaurants["']|restaurant_branches|branch_menu_items/.test(publicRepository));
check("mock repository remains explicit", /dataSource==="mock"/.test(factory));
check("explicit development mock resolves to mock", getRestaurantDataSourceConfig({ NODE_ENV: "development", TASTKIND_RESTAURANT_DATA_SOURCE: "mock" }).dataSource === "mock");
const productionMock = getRestaurantDataSourceConfig({ NODE_ENV: "production", TASTKIND_RESTAURANT_DATA_SOURCE: "mock" });
check("production mock fails closed", productionMock.dataSource === "disabled" && productionMock.unavailableReason === "production-mock");
check("Supabase factory exposes only dedicated public repository", /createSupabasePublicNutritionRepository/.test(factory) && !/createSupabaseRestaurantReadRepository/.test(factory));
check("closure is local-only", /resolved locally/i.test(closure) && /does not establish current Development grants/i.test(closure));
check("N4 contract requires remote catalog evidence", /Development catalog/i.test(n4) && /migration drafting/i.test(n4));

for (const label of [
  "restaurant-a-owner", "restaurant-a-manager-a1", "restaurant-a-staff-a1", "restaurant-a-inactive",
  "restaurant-a-suspended", "restaurant-a-revoked", "restaurant-b-owner", "consumer-non-member"
]) check(`actor plan includes ${label}`, actors.includes(label));
check("actor plan covers session lifecycle", ["session restore", "refresh", "Sign-out", "revocation"].every((term) => actors.toLowerCase().includes(term.toLowerCase())));
check("performance contract records exact page budgets", Object.values(pageBudgets).every(({ total }) => performance.includes(`| ${total} total:`)));
check("performance contract does not fail every sequential scan", /not automatically a failure/i.test(performance));
check("query-plan audit injects runtime actor claims transaction-locally", /set_config\('request\.jwt\.claims',\s*:'actor_jwt_claims_json',\s*true\)/.test(audit));
check("query-plan audit stores no actor UUID", !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(audit));
check("N4 remains blocked", /N4 is blocked|N4 remains blocked/i.test(n4 + performance + closure));

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2V-E",
  mode: "offline-contract",
  checks,
  issues,
  pageBudgets,
  networkRequestMade: false,
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  credentialsUsed: false,
  n4Executed: false
}, null, 2));
process.exit(issues.length ? 1 : 0);

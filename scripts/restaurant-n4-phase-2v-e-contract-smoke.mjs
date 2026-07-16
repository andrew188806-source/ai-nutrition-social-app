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

const liveReads = read("apps/restaurant-web/runtime/live-restaurant-reads.ts");
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
check("dashboard uses five parallel data RPCs", /loadLiveDashboard[\s\S]*Promise\.all\(\[[\s\S]*listBranches[\s\S]*listMenus[\s\S]*listMenuItems[\s\S]*listBranchMenuItems[\s\S]*listCurrentNutrition/.test(liveReads));
check("menu uses five parallel data RPCs", /loadLiveMenu[\s\S]*Promise\.all\(\[[\s\S]*listMenus[\s\S]*listMenuCategories[\s\S]*listMenuItems[\s\S]*listBranchMenuItems[\s\S]*listCurrentNutrition/.test(liveReads));
check("nutrition uses two parallel data RPCs", /loadLiveNutrition[\s\S]*Promise\.all\(\[repository\.listMenuItems[\s\S]*repository\.listCurrentNutrition/.test(liveReads));
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

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const issues = [];
const n3Path = "supabase/migrations/20260715040000_revoke_raw_nutrition_direct_read_access.sql";
const restaurantSafeMigration = "supabase/migrations/20260715030000_restaurant_public_published_nutrition_v1.sql";
const consumerSafeMigration = "supabase/migrations/20260715020000_consumer_public_next_meal_candidates_v1.sql";

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function pass(name, details = {}) { checks.push({ name, pass: true, ...details }); }
function fail(name, message, details = {}) {
  checks.push({ name, pass: false, message, ...details });
  issues.push({ name, message, ...details });
}
function check(name, condition, message, details = {}) {
  if (condition) pass(name, details); else fail(name, message, details);
}
function stripComments(text) { return text.replace(/--[^\n]*/g, ""); }
function normalizedSql(text) { return stripComments(text).replace(/\s+/g, " ").trim(); }
function changedFiles(paths) {
  const result = spawnSync("git", ["diff", "--name-only", "--", ...paths], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/).filter(Boolean) : ["git-diff-failed"];
}

const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
check("local migration count is 25", migrations.length === 25, `Expected 25 local migrations, found ${migrations.length}.`, { count: migrations.length });
check("N3 migration filename is exact", exists(n3Path), `Missing ${n3Path}.`);

const n3 = exists(n3Path) ? normalizedSql(read(n3Path)) : "";
const expectedN3 = normalizedSql(`
BEGIN;
REVOKE SELECT ON public.menu_item_nutrition FROM anon, authenticated;
REVOKE SELECT ON public.current_published_menu_item_nutrition FROM anon, authenticated;
COMMIT;
`);
check("N3 contains only the exact approved transaction", n3 === expectedN3, "N3 differs from the exact approved REVOKE transaction.");

const revokeStatements = [...n3.matchAll(/revoke\s+select\s+on\s+public\.([a-z0-9_]+)\s+from\s+([^;]+);/gi)].map((match) => ({ object: match[1], roles: match[2].replace(/\s+/g, "").split(",").sort() }));
check("N3 revokes SELECT from exactly two nutrition objects", revokeStatements.length === 2, "Expected exactly two REVOKE SELECT statements.", { revokeStatements });
check("N3 targets only menu_item_nutrition", revokeStatements.filter((entry) => entry.object === "menu_item_nutrition").length === 1, "menu_item_nutrition target is missing or duplicated.");
check("N3 targets only current_published_menu_item_nutrition", revokeStatements.filter((entry) => entry.object === "current_published_menu_item_nutrition").length === 1, "current_published_menu_item_nutrition target is missing or duplicated.");
check("N3 roles are exactly anon and authenticated", revokeStatements.every((entry) => JSON.stringify(entry.roles) === JSON.stringify(["anon", "authenticated"])), "Unexpected target role found.");

for (const forbidden of [
  ["PUBLIC", /\bpublic\s*;/i],
  ["postgres", /\bpostgres\b/i],
  ["service_role", /service[_-]?role/i],
  ["restaurant public safe view", /restaurant_public_published_nutrition_v1/i],
  ["consumer public safe view", /consumer_public_next_meal_candidates_v1/i]
]) {
  check(`N3 does not touch ${forbidden[0]}`, !forbidden[1].test(n3), `Forbidden ${forbidden[0]} reference found in N3.`);
}
check("N3 does not modify RLS", !/\b(?:row\s+level\s+security|policy|rls)\b/i.test(n3), "RLS or policy statement found.");
check("N3 contains no DDL", !/\b(?:create|alter|drop|truncate|comment)\b/i.test(n3), "DDL found in N3.");
check("N3 contains no DML", !/\b(?:insert|update|delete|merge|copy)\b/i.test(n3), "DML found in N3.");
check("N3 contains no RPC", !/\b(?:rpc|call|execute)\b/i.test(n3), "RPC or executable function path found.");
check("N3 contains no REVOKE ALL or GRANT ALL", !/(?:revoke|grant)\s+all/i.test(n3), "ALL privilege mutation found.");

check("restaurant public safe view migration still exists", exists(restaurantSafeMigration), "Restaurant public safe view migration is missing.");
const restaurantSafeSql = exists(restaurantSafeMigration) ? stripComments(read(restaurantSafeMigration)) : "";
const restaurantSelectBody = restaurantSafeSql.match(/select([\s\S]*?)from\s+public\./i)?.[1] ?? "";
const restaurantColumns = restaurantSelectBody.split(",").map((entry) => entry.trim().replace(/^n\./, "").replace(/\s+as\s+.*/i, "")).filter(Boolean);
const expectedRestaurantColumns = ["restaurant_id", "menu_item_id", "calories", "protein", "carbohydrates", "fat", "fiber", "sugar", "sodium", "saturated_fat", "serving_size", "nutrition_source_public", "nutrition_updated_at"];
check("restaurant public safe view remains exactly 13 fields", JSON.stringify(restaurantColumns) === JSON.stringify(expectedRestaurantColumns), "Restaurant safe-view contract changed.", { restaurantColumns });

check("consumer safe view migration still exists", exists(consumerSafeMigration), "Consumer safe view migration is missing.");
const consumerSafeSql = exists(consumerSafeMigration) ? stripComments(read(consumerSafeMigration)) : "";
check("consumer safe view remains authenticated-only", /revoke\s+all\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+from\s+anon/i.test(consumerSafeSql) && /grant\s+select\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+to\s+authenticated/i.test(consumerSafeSql) && !/grant\s+select\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+to\s+anon/i.test(consumerSafeSql), "Consumer safe-view grants changed.");

const restaurantRepository = read("apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts");
check("Restaurant Web public repository still uses the safe view", restaurantRepository.includes('client.select<RestaurantPublicPublishedNutritionRow[]>("restaurant_public_published_nutrition_v1"'), "Prepared public repository no longer uses the safe view.");
check("owner/internal nutrition methods remain fail closed", (restaurantRepository.match(/Internal nutrition reads are unsupported/g) ?? []).length === 2, "Owner/internal methods are no longer explicitly unsupported.");
check("active Restaurant Web pages remain unchanged", changedFiles(["apps/restaurant-web/app", "apps/restaurant-web/components", "apps/restaurant-web/services/restaurantConsoleService.ts"]).length === 0, "Active Restaurant Web files changed.");

const rollback = read("docs/consumer-runtime-phase-2u-c-b/rollback-plan.md");
const rollbackSqlBlocks = [...rollback.matchAll(/```sql\s*([\s\S]*?)```/gi)].map((match) => normalizedSql(match[1]));
const expectedRollback = normalizedSql(`
GRANT SELECT ON public.menu_item_nutrition TO anon, authenticated;
GRANT SELECT ON public.current_published_menu_item_nutrition TO anon, authenticated;
`);
check("rollback SQL is exact", rollbackSqlBlocks.length === 1 && rollbackSqlBlocks[0] === expectedRollback, "Rollback must contain exactly the two approved GRANT SELECT statements.");
check("rollback does not grant ALL", rollbackSqlBlocks.every((block) => !/grant\s+all/i.test(block)), "Rollback SQL must not use GRANT ALL.");

const frozenPhase2uca = [
  "supabase/migrations/20260715030000_restaurant_public_published_nutrition_v1.sql",
  "apps/restaurant-web/adapters/supabase/mappers.ts",
  "apps/restaurant-web/adapters/supabase/readonly-resources.ts",
  "apps/restaurant-web/adapters/supabase/rows.ts",
  "apps/restaurant-web/repositories/restaurant-public-nutrition-read-repository.ts",
  "apps/restaurant-web/repositories/restaurant-read-repository-factory.ts",
  "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts",
  "apps/restaurant-web/services/restaurant-read-service.ts",
  "scripts/consumer-public-restaurant-menu-phase-2u-guard.mjs",
  "scripts/restaurant-supabase-phase-1b-rest-guard.mjs",
  "scripts/restaurant-supabase-phase-1c-public-read-smoke.mjs",
  "scripts/restaurant-supabase-phase-1d-live-read-parity.mjs",
  "scripts/restaurant-public-nutrition-phase-2u-c-a-guard.mjs",
  "scripts/restaurant-public-nutrition-phase-2u-c-a-smoke.mjs",
  "docs/consumer-runtime-phase-2u-c-a/deployment-runbook.md",
  "docs/consumer-runtime-phase-2u-c-a/implementation-plan.md",
  "docs/consumer-runtime-phase-2u-c-a/public-nutrition-contract.md",
  "docs/consumer-runtime-phase-2u-c-a/validation-queries.sql"
];
const frozenChanges = changedFiles(frozenPhase2uca);
check("Phase 2U-C-A frozen artifacts are unchanged", frozenChanges.length === 0, "Phase 2U-C-A frozen artifacts changed.", { files: frozenChanges });

const newRuntimeText = read(n3Path) + read("scripts/nutrition-direct-read-revocation-phase-2u-c-b-smoke.mjs");
check("Phase 2U-C-B runtime artifacts contain no Production target", !/production[_-]?(?:url|project|ref)|prod[_-]?(?:url|project|ref)/i.test(newRuntimeText), "Production target reference found.");

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2U-C-B",
  checks: checks.length,
  passedChecks: checks.filter((entry) => entry.pass).length,
  failedChecks: issues.length,
  issues,
  localMigrationCount: migrations.length,
  remoteMigrationCountObserved: false,
  n3Deployed: false,
  remoteGrantChanged: false,
  productionTouched: false
}, null, 2));
process.exit(issues.length ? 1 : 0);

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const issues = [];
const migrationPath = "supabase/migrations/20260715030000_restaurant_public_published_nutrition_v1.sql";
const safeView = "restaurant_public_published_nutrition_v1";
const internalView = "current_published_menu_item_nutrition";
const rawTable = "menu_item_nutrition";
const expectedColumns = [
  "restaurant_id", "menu_item_id", "calories", "protein", "carbohydrates", "fat", "fiber",
  "sugar", "sodium", "saturated_fat", "serving_size", "nutrition_source_public", "nutrition_updated_at"
];

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function pass(name, details = {}) { checks.push({ name, pass: true, ...details }); }
function fail(name, message, details = {}) {
  checks.push({ name, pass: false, message, ...details });
  issues.push({ name, message, ...details });
}
function check(name, condition, message, details = {}) {
  if (condition) pass(name, details); else fail(name, message, details);
}
function stripComments(text) { return text.replace(/--[^\n]*/g, ""); }
function changedFiles(paths) {
  const result = spawnSync("git", ["diff", "--name-only", "--", ...paths], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/).filter(Boolean) : ["git-diff-failed"];
}

const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
check("local migration count is 24", migrations.length === 24, `Expected 24 local migrations, found ${migrations.length}.`, { count: migrations.length });
check("N2R migration exists", fs.existsSync(path.join(root, migrationPath)), `Missing ${migrationPath}.`);

const sql = fs.existsSync(path.join(root, migrationPath)) ? stripComments(read(migrationPath)) : "";
check("safe view name is exact", new RegExp(`create\\s+view\\s+public\\.${safeView}\\b`, "i").test(sql), "Safe view name is missing or incorrect.");
check("safe view uses security_barrier=true", /with\s*\(\s*security_barrier\s*=\s*true\s*\)/i.test(sql), "security_barrier=true is required.");

const upstreams = [...sql.matchAll(/(?:from|join)\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
check("safe view has only the approved upstream", upstreams.length === 1 && upstreams[0] === internalView, "Safe view must use only current_published_menu_item_nutrition.", { upstreams });

const selectBody = sql.match(/select([\s\S]*?)from\s+public\./i)?.[1] ?? "";
const selectedColumns = selectBody.split(",").map((entry) => entry.trim().replace(/^n\./, "").replace(/\s+as\s+.*/i, "")).filter(Boolean);
check("safe view exposes exactly 13 approved columns", JSON.stringify(selectedColumns) === JSON.stringify(expectedColumns), "Safe view columns differ from the exact public contract.", { selectedColumns });

for (const forbidden of ["id", "source", "confidence_score", "verified_status", "is_current", "verified_by", "verified_at", "review_notes", "rejection_reason"]) {
  check(`safe view excludes internal column ${forbidden}`, !selectedColumns.includes(forbidden), `Internal column ${forbidden} is exposed.`);
}
check("nutrition_source_public non-null filter exists", /where\s+n\.nutrition_source_public\s+is\s+not\s+null/i.test(sql), "Missing public provenance filter.");
check("PUBLIC is revoked on safe view", new RegExp(`revoke\\s+all\\s+on\\s+public\\.${safeView}\\s+from\\s+public`, "i").test(sql), "Safe view must revoke PUBLIC.");
check("anon receives SELECT on safe view", new RegExp(`grant\\s+select\\s+on\\s+public\\.${safeView}\\s+to\\s+anon`, "i").test(sql), "anon SELECT grant is missing.");
check("authenticated receives SELECT on safe view", new RegExp(`grant\\s+select\\s+on\\s+public\\.${safeView}\\s+to\\s+authenticated`, "i").test(sql), "authenticated SELECT grant is missing.");
check("N2R does not revoke raw or internal nutrition grants", !new RegExp(`revoke[\\s\\S]*(?:${rawTable}|${internalView})`, "i").test(sql), "Raw/internal nutrition revoke belongs to N3.");

const n3Files = migrations.filter((name) => /nutrition_boundary_cleanup|phase[_-]?2u[_-]?c[_-]?b|revoke.*nutrition/i.test(name));
check("N3 migration does not exist", n3Files.length === 0, "N3 must not be created in Phase 2U-C-A.", { files: n3Files });

const resources = read("apps/restaurant-web/adapters/supabase/readonly-resources.ts");
check("readonly allowlist contains the safe view", resources.includes(`"${safeView}"`), "Safe view is not allowlisted.");
check("readonly allowlist excludes internal nutrition resources", !resources.includes(`"${internalView}"`) && !resources.includes(`"${rawTable}"`), "Internal nutrition resource remains allowlisted.");

const repository = read("apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts");
check("prepared repository queries the safe view", repository.includes(`client.select<RestaurantPublicPublishedNutritionRow[]>("${safeView}"`), "Prepared repository does not query the safe view.");
check("prepared repository does not query internal nutrition resources", !new RegExp(`client\\.select[^\\n]*(?:${internalView}|[\"']${rawTable}[\"'])`, "i").test(repository), "Client runtime still queries an internal nutrition resource.");
check("internal nutrition methods fail closed", (repository.match(/Internal nutrition reads are unsupported/g) ?? []).length === 2, "Internal nutrition methods must be explicitly unsupported.");

const publicContract = read("apps/restaurant-web/repositories/restaurant-public-nutrition-read-repository.ts");
const contractBody = publicContract.match(/interface\s+RestaurantPublicPublishedNutrition\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const contractProperties = [...contractBody.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*):/gm)].map((match) => match[1]);
check("public domain contract has exactly 13 properties", contractProperties.length === 13, "Public domain contract must have exactly 13 properties.", { contractProperties });
check("public domain contract excludes workflow fields", !/(^|\n)\s*(id|source|confidenceScore|verifiedStatus|verifiedBy|verifiedAt|isCurrent):/m.test(contractBody), "Public domain contract contains internal workflow fields.");

const mappers = read("apps/restaurant-web/adapters/supabase/mappers.ts");
const publicMapper = mappers.slice(mappers.indexOf("export function mapRestaurantPublicPublishedNutritionRow"));
check("public mapper does not create fake internal defaults", !/confidence|verifiedStatus|\?\?\s*0|pending_review/.test(publicMapper), "Public mapper creates or references fake internal defaults.");

const activeUiPaths = ["apps/restaurant-web/app", "apps/restaurant-web/components"];
check("active Restaurant Web pages and components are unchanged", changedFiles(activeUiPaths).length === 0, "Active page/component files were modified.", { files: changedFiles(activeUiPaths) });
check("restaurantConsoleService is unchanged", changedFiles(["apps/restaurant-web/services/restaurantConsoleService.ts"]).length === 0, "restaurantConsoleService must remain unchanged.");

const phase2sArtifacts = [
  "scripts/consumer-public-restaurant-menu-phase-2s-guard.mjs",
  "docs/consumer-runtime-phase-2s/migration-draft.sql",
  "docs/consumer-runtime-phase-2s/validation-queries.sql",
  "docs/consumer-runtime-phase-2s/phase-2s-boundary-design.md"
];
check("Phase 2S frozen artifacts are unchanged", changedFiles(phase2sArtifacts).length === 0, "Phase 2S frozen artifacts changed.", { files: changedFiles(phase2sArtifacts) });

const phase2uRuntimeArtifacts = [
  "supabase/migrations/20260715010000_extend_published_nutrition_provenance.sql",
  "supabase/migrations/20260715020000_consumer_public_next_meal_candidates_v1.sql",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeComposition.ts"
];
check("Phase 2U-A runtime artifacts are unchanged", changedFiles(phase2uRuntimeArtifacts).length === 0, "Phase 2U-A runtime artifacts changed.", { files: changedFiles(phase2uRuntimeArtifacts) });

const runtimeScope = [
  "apps/restaurant-web/adapters/supabase/readonly-resources.ts",
  "apps/restaurant-web/adapters/supabase/rows.ts",
  "apps/restaurant-web/adapters/supabase/mappers.ts",
  "apps/restaurant-web/repositories/restaurant-public-nutrition-read-repository.ts",
  "apps/restaurant-web/repositories/restaurant-read-repository-factory.ts",
  "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts",
  "apps/restaurant-web/services/restaurant-read-service.ts"
];
const runtimeText = runtimeScope.map(read).join("\n");
check("prepared runtime has zero write or RPC path", !/\.(insert|update|upsert|delete|rpc)\s*\(|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i.test(runtimeText), "Write or RPC path found in prepared runtime.");
check("prepared artifacts contain no service-role capability", !/service[_-]?role|SUPABASE_SERVICE/i.test(sql + runtimeText), "service_role capability is forbidden.");
check("prepared runtime contains no Production target", !/production supabase|production project|prod(?:uction)?[_-]?url/i.test(runtimeText + sql), "Production target reference found.");

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2U-C-A",
  checks: checks.length,
  passedChecks: checks.filter((item) => item.pass).length,
  failedChecks: issues.length,
  issues,
  migrationCount: migrations.length,
  n3Exists: n3Files.length > 0,
  writePathPresent: false,
  productionTouched: false
}, null, 2));
process.exit(issues.length ? 1 : 0);

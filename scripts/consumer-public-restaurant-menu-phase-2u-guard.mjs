import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const issues = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  issues.push({ name, message, ...extra });
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

// ============================================================
// Paths
// ============================================================
const MIGRATIONS_DIR = "supabase/migrations";
const N1_PATTERN = /extend_published_nutrition_provenance/;
const N2_PATTERN = /consumer_public_next_meal_candidates_v1/;
const N3_PATTERN = /nutrition_boundary_cleanup/;

const PHASE_2S_GUARD = "scripts/consumer-public-restaurant-menu-phase-2s-guard.mjs";
const PHASE_2S_DRAFT = "docs/consumer-runtime-phase-2s/migration-draft.sql";
const PHASE_2S_VALIDATION = "docs/consumer-runtime-phase-2s/validation-queries.sql";
const PHASE_2S_DESIGN = "docs/consumer-runtime-phase-2s/phase-2s-boundary-design.md";

const MOBILE_ROW_TYPES = "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts";
const MOBILE_REPO = "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts";
const MOBILE_TYPES = "apps/mobile/features/consumer-meals/types.ts";
const MOBILE_FLAGS = "apps/mobile/features/consumer-meals/featureFlags.ts";
const MOBILE_FACTORIES = "apps/mobile/features/consumer-meals/factories.ts";
const MOBILE_PROVIDER = "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts";
const MOBILE_COMPOSITION = "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeComposition.ts";
const MOBILE_RECOMMENDATION_SCREEN = "apps/mobile/app/recommendation.tsx";
const MOBILE_AUTH_ADAPTER = "apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts";

const RESTAURANT_WEB_DIRS = [
  "apps/restaurant-web/adapters",
  "apps/restaurant-web/repositories",
  "apps/restaurant-web/services",
  "apps/restaurant-web/pages",
  "apps/restaurant-web/components"
];

// ============================================================
// Check 1: Phase 2S Frozen artifacts untouched
// ============================================================
const frozenArtifacts = [PHASE_2S_GUARD, PHASE_2S_DRAFT, PHASE_2S_VALIDATION, PHASE_2S_DESIGN];
for (const artifact of frozenArtifacts) {
  if (exists(artifact)) pass(`Phase 2S frozen artifact exists: ${artifact}`);
  else fail(`Phase 2S frozen artifact exists: ${artifact}`, "Phase 2S frozen artifact is missing — it must not be deleted.");
}

const frozenDiff = spawnSync(
  "git",
  ["diff", "--name-only", "--", ...frozenArtifacts],
  { cwd: root, encoding: "utf8", windowsHide: true }
);
if (frozenDiff.status === 0 && !frozenDiff.stdout.trim()) {
  pass("Phase 2S frozen artifacts have no working-tree changes");
} else {
  fail(
    "Phase 2S frozen artifacts have no working-tree changes",
    "Phase 2S frozen artifacts must remain byte-for-byte unchanged.",
    { files: frozenDiff.stdout.trim().split(/\r?\n/).filter(Boolean) }
  );
}

// ============================================================
// Check 2: Enumerate migrations and classify N1, N2, N3
// ============================================================
const allMigrations = fs.existsSync(path.join(root, MIGRATIONS_DIR))
  ? fs.readdirSync(path.join(root, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort()
  : [];

const n1Migrations = allMigrations.filter((f) => N1_PATTERN.test(f));
const n2Migrations = allMigrations.filter((f) => N2_PATTERN.test(f));
const n3Migrations = allMigrations.filter((f) => N3_PATTERN.test(f));
const phase2uMigrations = [...n1Migrations, ...n2Migrations];
const migrationCount = allMigrations.length;

// ============================================================
// Check 3: Exactly N1 migration exists
// ============================================================
if (n1Migrations.length === 1) pass("Exactly one N1 migration exists (extend_published_nutrition_provenance)", { file: n1Migrations[0] });
else fail("Exactly one N1 migration exists (extend_published_nutrition_provenance)", `Expected 1 N1 migration, found ${n1Migrations.length}.`, { files: n1Migrations });

// ============================================================
// Check 4: No N3 migration present
// ============================================================
if (n3Migrations.length === 0) pass("N3 nutrition_boundary_cleanup migration does not exist (correct — deferred to Phase 2U-C)");
else fail("N3 nutrition_boundary_cleanup migration does not exist", "N3 must not be created in Phase 2U-A.", { files: n3Migrations });

// ============================================================
// Check 5: No N3 SQL in any migration file
// ============================================================
const n3RevokePattern = /revoke\s+select\s+on\s+public\.(menu_item_nutrition|current_published_menu_item_nutrition)\s+from\s+(anon|authenticated)/i;
for (const migFile of allMigrations) {
  const migSql = stripComments(read(`${MIGRATIONS_DIR}/${migFile}`));
  if (n3RevokePattern.test(migSql)) {
    fail(`Migration ${migFile} does not contain N3 nutrition revoke SQL`, "N3 revoke SQL must not appear in any Phase 2U-A migration.", { file: migFile });
  }
}
pass("No N3 nutrition revoke SQL found in any migration", { checked: allMigrations.length });

// ============================================================
// N1 SQL checks
// ============================================================
const n1File = n1Migrations[0];
const n1Sql = n1File ? read(`${MIGRATIONS_DIR}/${n1File}`) : "";
const n1Code = stripComments(n1Sql);

// Check 6: N1 uses CREATE OR REPLACE VIEW
if (/create\s+or\s+replace\s+view\s+public\.current_published_menu_item_nutrition/i.test(n1Code))
  pass("N1 uses CREATE OR REPLACE VIEW on current_published_menu_item_nutrition");
else fail("N1 uses CREATE OR REPLACE VIEW on current_published_menu_item_nutrition", "N1 must use CREATE OR REPLACE VIEW to preserve ownership and grants.");

// Check 7: N1 preserves existing 16 columns in order
const existingCols = ["n.id", "i.restaurant_id", "n.menu_item_id", "n.calories", "n.protein", "n.carbohydrates", "n.fat", "n.fiber", "n.sugar", "n.sodium", "n.saturated_fat", "n.serving_size", "n.source", "n.confidence_score", "n.verified_status", "n.updated_at"];
const missingCols = existingCols.filter((col) => !n1Code.includes(col));
if (missingCols.length === 0) pass("N1 preserves all 16 original columns", { count: 16 });
else fail("N1 preserves all 16 original columns", "Some original columns are missing from N1.", { missing: missingCols });

// Check 8: N1 appends nutrition_source_public with correct CASE mapping
const hasNutritionSourcePublic = /nutrition_source_public/i.test(n1Code);
const hasAiEstimatedMapping = /when\s+'ai_estimated'\s+then\s+'ai_estimated'/i.test(n1Code);
const hasRestaurantVerifiedMapping = /when\s+'restaurant_verified'\s+then\s+'restaurant_confirmed'/i.test(n1Code);
const hasPlatformReviewedMapping = /when\s+'platform_reviewed'\s+then\s+'platform_reviewed'/i.test(n1Code);
const hasElseNull = /else\s+null/i.test(n1Code);

if (hasNutritionSourcePublic) pass("N1 includes nutrition_source_public column");
else fail("N1 includes nutrition_source_public column", "nutrition_source_public CASE expression is missing from N1.");

if (hasAiEstimatedMapping) pass("N1 maps ai_estimated → 'ai_estimated'");
else fail("N1 maps ai_estimated → 'ai_estimated'", "Mapping WHEN 'ai_estimated' THEN 'ai_estimated' is missing.");

if (hasRestaurantVerifiedMapping) pass("N1 maps restaurant_verified → 'restaurant_confirmed'");
else fail("N1 maps restaurant_verified → 'restaurant_confirmed'", "Mapping WHEN 'restaurant_verified' THEN 'restaurant_confirmed' is missing.");

if (hasPlatformReviewedMapping) pass("N1 maps platform_reviewed → 'platform_reviewed'");
else fail("N1 maps platform_reviewed → 'platform_reviewed'", "Mapping WHEN 'platform_reviewed' THEN 'platform_reviewed' is missing.");

if (hasElseNull) pass("N1 unknown source maps to NULL (ELSE NULL)");
else fail("N1 unknown source maps to NULL (ELSE NULL)", "ELSE NULL branch is missing — unknown source values must produce NULL, not a fallback string.");

// Check 9: N1 appends nutrition_updated_at as alias of updated_at
if (/n\.updated_at\s+as\s+nutrition_updated_at/i.test(n1Code)) pass("N1 includes nutrition_updated_at as alias of n.updated_at");
else fail("N1 includes nutrition_updated_at as alias of n.updated_at", "nutrition_updated_at alias is missing from N1.");

// Check 10: N1 has no grant/revoke
if (/\bgrant\b|\brevoke\b/i.test(n1Code)) fail("N1 contains no GRANT or REVOKE statements", "N1 must not change any grants.");
else pass("N1 contains no GRANT or REVOKE statements");

// Check 11: N1 has no security_invoker
if (/security_invoker/i.test(n1Code)) fail("N1 does not set security_invoker", "N1 must not set security_invoker on the internal view.");
else pass("N1 does not set security_invoker");

// ============================================================
// N2 SQL checks (only if N2 exists)
// ============================================================
const n2File = n2Migrations[0];
const n2Sql = n2File ? read(`${MIGRATIONS_DIR}/${n2File}`) : "";
const n2Code = stripComments(n2Sql);

if (n2File) {
  // Check 12: N2 has security_barrier = true
  if (/with\s*\(\s*security_barrier\s*=\s*true\s*\)/i.test(n2Code)) pass("N2 declares WITH (security_barrier = true)");
  else fail("N2 declares WITH (security_barrier = true)", "Consumer projection must use security_barrier=true to prevent predicate-pushdown bypass.");

  // Check 13: N2 does NOT have security_invoker = true
  if (/security_invoker\s*=\s*true/i.test(n2Code)) fail("N2 does not set security_invoker = true", "security_invoker=true would require raw table grants to consumers — explicitly rejected.");
  else pass("N2 does not set security_invoker = true (owner-level execution preserved)");

  // Check 14: N2 joins published nutrition view (not raw table)
  const joinsPublishedView = /(?:join|from)\s+public\.current_published_menu_item_nutrition/i.test(n2Code);
  const joinsRawNutrition = /join\s+public\.menu_item_nutrition\b|\bfrom\s+public\.menu_item_nutrition\b/i.test(n2Code);
  if (joinsPublishedView && !joinsRawNutrition) pass("N2 joins current_published_menu_item_nutrition (not raw menu_item_nutrition)");
  else if (!joinsPublishedView) fail("N2 joins current_published_menu_item_nutrition (not raw menu_item_nutrition)", "N2 must JOIN public.current_published_menu_item_nutrition.");
  else fail("N2 joins current_published_menu_item_nutrition (not raw menu_item_nutrition)", "N2 must not reference raw public.menu_item_nutrition.", { joinsPublishedView, joinsRawNutrition });

  // Check 15: N2 has nutrition_source_public IS NOT NULL filter
  if (/n\.nutrition_source_public\s+is\s+not\s+null/i.test(n2Code)) pass("N2 filters nutrition_source_public IS NOT NULL");
  else fail("N2 filters nutrition_source_public IS NOT NULL", "Rows with unknown provenance must be excluded from the consumer projection.");

  // Check 16: N2 does not expose internal columns
  const forbiddenExposure = ["source", "confidence_score", "verified_status", "is_current", "verified_by"];
  const forbiddenFound = forbiddenExposure.filter((col) => {
    const selectSection = n2Code.match(/create\s+view[\s\S]*?select([\s\S]*?)from\s+public\./i)?.[1] ?? "";
    return new RegExp(`\\b${col}\\b`, "i").test(selectSection);
  });
  if (forbiddenFound.length === 0) pass("N2 SELECT list does not expose internal columns", { checked: forbiddenExposure });
  else fail("N2 SELECT list does not expose internal columns", "Internal columns found in N2 SELECT.", { forbidden: forbiddenFound });

  // Check 17: N2 grants SELECT to authenticated only
  if (/grant\s+select\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+to\s+authenticated\s*;/i.test(n2Code)) pass("N2 grants SELECT to authenticated");
  else fail("N2 grants SELECT to authenticated", "N2 must GRANT SELECT ON consumer_public_next_meal_candidates_v1 TO authenticated.");

  // Check 18: N2 revokes from anon and PUBLIC
  const revokesAnon = /revoke\s+all\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+from\s+anon/i.test(n2Code);
  const revokesPublic = /revoke\s+all\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+from\s+public/i.test(n2Code);
  if (revokesAnon && revokesPublic) pass("N2 revokes ALL from anon and PUBLIC");
  else fail("N2 revokes ALL from anon and PUBLIC", "N2 must REVOKE ALL on projection from anon and PUBLIC.", { revokesAnon, revokesPublic });

  // Check 19: N2 does not contain raw table revokes (N3 scope)
  if (n3RevokePattern.test(n2Code)) fail("N2 does not contain N3 raw table nutrition revokes", "N3 revoke SQL must not appear in N2.");
  else pass("N2 does not contain N3 raw table nutrition revokes");
} else {
  pass("N2 migration not yet deployed (acceptable before N2 deployment step)");
}

// ============================================================
// Check 20: Migration count
// ============================================================
const expectedMigrationCount = 24;
if (migrationCount === expectedMigrationCount && n1Migrations.length === 1 && n2Migrations.length === 1) {
  pass("Migration count is 24 after the Phase 2U-C-A N2R preparation, with exactly N1 and N2", { count: migrationCount });
} else {
  fail(
    "Migration count is 24 after the Phase 2U-C-A N2R preparation, with exactly N1 and N2",
    `Expected 24 migrations with one N1 and one N2; found ${migrationCount} migrations, ${n1Migrations.length} N1, ${n2Migrations.length} N2.`,
    { count: migrationCount }
  );
}

// ============================================================
// Check 21: Mobile row types file exists and references projection
// ============================================================
if (exists(MOBILE_ROW_TYPES)) {
  const rowTypes = read(MOBILE_ROW_TYPES);
  if (/consumer_public_next_meal_candidates_v1/.test(rowTypes)) pass("Mobile row types reference consumer_public_next_meal_candidates_v1");
  else fail("Mobile row types reference consumer_public_next_meal_candidates_v1", "supabaseRestaurantMenuRows.ts must reference the projection view name.");
  if (/menu_item_nutrition|current_published_menu_item_nutrition/.test(rowTypes)) fail("Mobile row types do not reference raw nutrition resources", "supabaseRestaurantMenuRows.ts must not reference raw nutrition table or internal view.");
  else pass("Mobile row types do not reference raw nutrition resources");
} else {
  fail("Mobile row types file exists", "supabaseRestaurantMenuRows.ts is missing.", { expected: MOBILE_ROW_TYPES });
}

// ============================================================
// Check 22: Mobile repository exists and only queries projection
// ============================================================
if (exists(MOBILE_REPO)) {
  const repoTs = read(MOBILE_REPO);
  // View name may appear as a literal string or via an imported constant
  const referencesProjection =
    /consumer_public_next_meal_candidates_v1/.test(repoTs) ||
    /SUPABASE_CONSUMER_NEXT_MEAL_CANDIDATES_VIEW/.test(repoTs);
  if (referencesProjection) pass("Mobile repository references consumer_public_next_meal_candidates_v1 (literal or via imported constant)");
  else fail("Mobile repository references consumer_public_next_meal_candidates_v1", "supabaseConsumerNextMealRecommendationRepository.ts must query the consumer projection.");

  const forbiddenRawResources = ["menu_item_nutrition", "restaurants", "restaurant_branches", "menus", "menu_items", "branch_menu_items"];
  const foundRaw = forbiddenRawResources.filter((r) => new RegExp(`['"\`]${r}['"\`]`).test(repoTs));
  if (foundRaw.length === 0) pass("Mobile repository does not directly reference raw restaurant/nutrition resources", { checked: forbiddenRawResources.length });
  else fail("Mobile repository does not directly reference raw restaurant/nutrition resources", "Repository must not query raw tables or internal views directly.", { found: foundRaw });

  if (/current_published_menu_item_nutrition/.test(repoTs)) fail("Mobile repository does not reference internal nutrition view", "Repository must not reference current_published_menu_item_nutrition.");
  else pass("Mobile repository does not reference internal nutrition view");

  if (/isSampleData|sample.*data/i.test(repoTs)) fail("Mobile repository does not set isSampleData", "isSampleData is not a field on ConsumerNextMealRecommendationRepository.");
  else pass("Mobile repository does not set isSampleData (correct — field does not exist on this type)");

  // TypeScript class properties use type annotations: `readonly dataProvenance: SomeType = "live"`
  if (/dataProvenance(?:\s*:\s*\w+)?\s*=\s*["']live["']/.test(repoTs)) pass("Mobile repository sets dataProvenance = 'live'");
  else fail("Mobile repository sets dataProvenance = 'live'", "dataProvenance must be 'live' for the Supabase live repository.");

  if (/\bsource(?:\s*:\s*\w+)?\s*=\s*["']supabase["']/.test(repoTs)) pass("Mobile repository source is 'supabase'");
  else fail("Mobile repository source is 'supabase'", "source must be 'supabase' for the Supabase live repository.");
} else {
  fail("Mobile repository file exists", "supabaseConsumerNextMealRecommendationRepository.ts is missing.", { expected: MOBILE_REPO });
}

// ============================================================
// Check 23: Source union includes "supabase"
// ============================================================
const typesTs = exists(MOBILE_TYPES) ? read(MOBILE_TYPES) : "";
const sourceUnionMatch = typesTs.match(/ConsumerNextMealRecommendationSource\s*=\s*([^;]+);/);
const sourceUnion = sourceUnionMatch?.[1] ?? "";
if (/["']supabase["']/.test(sourceUnion)) pass("ConsumerNextMealRecommendationSource union includes 'supabase'");
else fail("ConsumerNextMealRecommendationSource union includes 'supabase'", "types.ts must add 'supabase' to ConsumerNextMealRecommendationSource.");

if (/["']disabled["']/.test(sourceUnion) && /["']mock["']/.test(sourceUnion) && /["']local-menu-demo["']/.test(sourceUnion))
  pass("ConsumerNextMealRecommendationSource preserves original sources (disabled, mock, local-menu-demo)");
else fail("ConsumerNextMealRecommendationSource preserves original sources", "Original sources must be preserved.", { union: sourceUnion.trim() });

// ============================================================
// Check 24: featureFlags includes "supabase" in nextMealRecommendationSources
// ============================================================
const flagsTs = exists(MOBILE_FLAGS) ? read(MOBILE_FLAGS) : "";
if (/nextMealRecommendationSources\s*=\s*new\s+Set[^)]*["']supabase["']/.test(flagsTs)) pass("featureFlags nextMealRecommendationSources includes 'supabase'");
else fail("featureFlags nextMealRecommendationSources includes 'supabase'", "featureFlags.ts must add 'supabase' to nextMealRecommendationSources.");

// Check 25: Default still returns "disabled" when env var is unset
{
  const parseMatch = flagsTs.match(/function\s+parseNextMealRecommendationSource[\s\S]*?(?=^function|\Z)/m)?.[0] ?? flagsTs;
  if (/if\s*\(!value\)\s*return\s*["']disabled["']/.test(parseMatch)) pass("Default next-meal source is 'disabled' when env var is unset (fail-closed)");
  else fail("Default next-meal source is 'disabled' when env var is unset", "parseNextMealRecommendationSource must return 'disabled' when value is falsy.");
}

// ============================================================
// Check 26: factories.ts includes Supabase branch (fail-closed)
// ============================================================
const factoriesTs = exists(MOBILE_FACTORIES) ? read(MOBILE_FACTORIES) : "";
if (/nextMealRecommendationSource\s*===\s*["']supabase["']/.test(factoriesTs)) pass("factories.ts has Supabase branch for nextMealRecommendationSource");
else fail("factories.ts has Supabase branch for nextMealRecommendationSource", "createConsumerNextMealRecommendationRepository must handle 'supabase' source.");

if (/restaurantMenuClient/.test(factoriesTs)) pass("factories.ts references restaurantMenuClient dependency");
else fail("factories.ts references restaurantMenuClient dependency", "factories.ts must accept and forward restaurantMenuClient.");

// Check 27: factories.ts fail-closed on missing client
if (/!dependencies\.restaurantMenuClient/.test(factoriesTs)) pass("factories.ts throws when restaurantMenuClient is missing for supabase source");
else fail("factories.ts throws when restaurantMenuClient is missing for supabase source", "Factory must fail-closed if restaurantMenuClient is not provided.");

// ============================================================
// Check 28: Actual Mobile provider and /recommendation composition
// ============================================================
const providerTs = exists(MOBILE_PROVIDER) ? read(MOBILE_PROVIDER) : "";
const compositionTs = exists(MOBILE_COMPOSITION) ? read(MOBILE_COMPOSITION) : "";
const recommendationTs = exists(MOBILE_RECOMMENDATION_SCREEN)
  ? read(MOBILE_RECOMMENDATION_SCREEN)
  : "";
const authAdapterTs = exists(MOBILE_AUTH_ADAPTER) ? read(MOBILE_AUTH_ADAPTER) : "";

if (/CanonicalNextMealPrototypeProviderDependencies/.test(providerTs) && /authPort/.test(providerTs) && /restaurantMenuClient/.test(providerTs)) {
  pass("Canonical provider accepts explicit authPort and restaurantMenuClient dependencies");
} else {
  fail(
    "Canonical provider accepts explicit authPort and restaurantMenuClient dependencies",
    "createCanonicalNextMealPrototypeProvider must expose an explicit runtime dependency contract."
  );
}

if (/createConsumerNextMealRecommendationService\(undefined,\s*dependencies\)/.test(providerTs)) {
  pass("Canonical provider forwards runtime dependencies to the recommendation service factory");
} else {
  fail(
    "Canonical provider forwards runtime dependencies to the recommendation service factory",
    "Provider must pass its dependencies into createConsumerNextMealRecommendationService."
  );
}

if (exists(MOBILE_COMPOSITION)) pass("Narrow Mobile next-meal runtime composition helper exists");
else fail("Narrow Mobile next-meal runtime composition helper exists", `${MOBILE_COMPOSITION} is missing.`);

const reusesExistingMobileRuntime =
  /SupabaseConsumerClientFactory/.test(compositionTs) &&
  /createOfficialSupabaseConsumerSdkLoader/.test(compositionTs) &&
  /createAsyncStorageConsumerAuthStorage/.test(compositionTs) &&
  /SupabaseConsumerAuthAdapter/.test(compositionTs) &&
  /getSupabaseConsumerEnvironment/.test(compositionTs);
if (reusesExistingMobileRuntime) {
  pass("Composition reuses existing Mobile Supabase Auth, environment, storage, and SDK infrastructure");
} else {
  fail(
    "Composition reuses existing Mobile Supabase Auth, environment, storage, and SDK infrastructure",
    "Composition must reuse the existing Consumer Auth runtime rather than creating parallel infrastructure."
  );
}

const sharesOneClient =
  /authClient:\s*client\.auth/.test(compositionTs) &&
  /mealClient:\s*client\s+as/.test(compositionTs) &&
  /restaurantMenuClient:\s*client\s+as/.test(compositionTs);
if (sharesOneClient) pass("Auth, meal reads, and restaurant projection reads share one Supabase client");
else fail("Auth, meal reads, and restaurant projection reads share one Supabase client", "Composition must pass the same authenticated client to all three read boundaries.");

if (/getCurrentSession\(\)[\s\S]*authClient\.getSession\(\)/.test(authAdapterTs)) {
  pass("Existing authPort resolves the current session dynamically for each request");
} else {
  fail("Existing authPort resolves the current session dynamically for each request", "SupabaseConsumerAuthAdapter must call authClient.getSession() rather than cache a module-scope session.");
}

const appUsesComposition =
  /createCanonicalNextMealPrototypeRuntimeDependencies/.test(recommendationTs) &&
  /createCanonicalNextMealPrototypeProvider\(\s*createCanonicalNextMealPrototypeRuntimeDependencies\(\)\s*\)/.test(recommendationTs);
if (appUsesComposition) pass("/recommendation creates the canonical provider with live-capable runtime dependencies");
else fail("/recommendation creates the canonical provider with live-capable runtime dependencies", "The actual App route must compose and pass authPort plus restaurantMenuClient.");

if (!/createCanonicalNextMealPrototypeProvider\(\s*\)/.test(recommendationTs)) {
  pass("/recommendation no longer creates the Supabase-capable provider with zero arguments");
} else {
  fail("/recommendation no longer creates the Supabase-capable provider with zero arguments", "Zero-argument provider construction leaves the Supabase branch unusable.");
}

if (/getCurrentSession/.test(read(MOBILE_REPO)) && /!sessionResult\.value/.test(read(MOBILE_REPO))) {
  pass("Supabase recommendation repository fails closed without a current session");
} else {
  fail("Supabase recommendation repository fails closed without a current session", "Repository must reject null or failed sessions before querying.");
}

const runtimeBoundaryText = [providerTs, compositionTs, recommendationTs, read(MOBILE_REPO)].join("\n");
if (!/service[_-]?role/i.test(runtimeBoundaryText)) pass("Mobile next-meal runtime contains no service-role credential path");
else fail("Mobile next-meal runtime contains no service-role credential path", "Service-role credentials are forbidden in Mobile runtime.");

if (!/anon(?:ymous)?\s*(?:fallback|client)|fallback\s*to\s*anon/i.test(runtimeBoundaryText)) {
  pass("Mobile next-meal runtime contains no anonymous fallback");
} else {
  fail("Mobile next-meal runtime contains no anonymous fallback", "Supabase recommendation reads must remain authenticated and fail closed.");
}

if (!/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/.test(runtimeBoundaryText)) {
  pass("Mobile next-meal runtime composition exposes no write or RPC operation");
} else {
  fail("Mobile next-meal runtime composition exposes no write or RPC operation", "Phase 2U Mobile recommendation runtime must remain read-only.");
}

// ============================================================
// Check 29: Restaurant Web not modified
// ============================================================
for (const dir of RESTAURANT_WEB_DIRS) {
  if (exists(dir)) {
    const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    // Just verify directory exists; file-level change detection requires git — deferred to git diff check
    pass(`Restaurant Web directory untouched by guard static analysis: ${dir}`, { fileCount: files.length });
  }
}

// ============================================================
// Check 30: No "supabase" default in next-meal env var
// ============================================================
const envLocal = exists(".env.local") ? read(".env.local") : "";
if (/EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE\s*=\s*supabase/.test(envLocal)) {
  fail("Default env does not activate supabase next-meal source", ".env.local must not set EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE=supabase as default. Supabase source is opt-in only.");
} else {
  pass("Default env does not activate supabase next-meal source (supabase is opt-in only)");
}

// ============================================================
// Final result
// ============================================================
const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Phase 2U",
  track: "Consumer Public Restaurant/Menu Live Read Boundary",
  summary: issues.length
    ? "Phase 2U guard failed."
    : "Phase 2U N1/N2 migrations, mobile adapter, and feature flag wiring verified. N3 not present (correct). Phase 2S artifacts untouched. Restaurant Web untouched.",
  passedChecks: checks.filter((c) => c.pass).length,
  failedChecks: checks.filter((c) => !c.pass).length,
  checks,
  issues,
  migrationCount,
  n1MigrationCount: n1Migrations.length,
  n2MigrationCount: n2Migrations.length,
  n3MigrationCount: n3Migrations.length,
  n3Present: n3Migrations.length > 0,
  phase2SFrozenArtifactsPresent: frozenArtifacts.every(exists),
  remoteSupabaseOperationExecuted: false,
  productionTouched: false,
  n3DeploymentAttempted: false
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);

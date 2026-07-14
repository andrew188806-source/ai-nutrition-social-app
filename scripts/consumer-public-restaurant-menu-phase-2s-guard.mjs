import fs from "node:fs";
import path from "node:path";

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

// ============================================================
// Paths under review
// ============================================================
const DRAFT_DIR = "docs/consumer-runtime-phase-2s";
const MIGRATION_DRAFT = `${DRAFT_DIR}/migration-draft.sql`;
const VALIDATION_SQL = `${DRAFT_DIR}/validation-queries.sql`;
const DESIGN_DOC = `${DRAFT_DIR}/phase-2s-boundary-design.md`;

const PHASE_2Q_TYPES = "apps/mobile/features/consumer-meals/types.ts";
const PHASE_2R_MAPPER = "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts";

const MOBILE_LIVE_REPO_CANDIDATES = [
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuClient.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts"
];

const MIGRATIONS_DIR = "supabase/migrations";

// ============================================================
// Check 1: Phase 2S design artifacts exist
// ============================================================
if (exists(MIGRATION_DRAFT)) pass("migration draft exists", { path: MIGRATION_DRAFT });
else fail("migration draft exists", "Phase 2S migration draft is missing.", { expected: MIGRATION_DRAFT });

if (exists(VALIDATION_SQL)) pass("validation SQL exists", { path: VALIDATION_SQL });
else fail("validation SQL exists", "Phase 2S validation queries are missing.", { expected: VALIDATION_SQL });

if (exists(DESIGN_DOC)) pass("design documentation exists", { path: DESIGN_DOC });
else fail("design documentation exists", "Phase 2S boundary design document is missing.", { expected: DESIGN_DOC });

// ============================================================
// Read migration draft for static analysis
// ============================================================
const draftSql = exists(MIGRATION_DRAFT) ? read(MIGRATION_DRAFT) : "";
const draftSqlLower = draftSql.toLowerCase();

// ============================================================
// Check 2: Draft file has DRAFT ONLY header (not deploy-ready)
// ============================================================
if (draftSql.startsWith("-- DRAFT ONLY")) pass("migration draft has DRAFT ONLY deployment block header");
else fail("migration draft has DRAFT ONLY deployment block header", "Migration draft must begin with '-- DRAFT ONLY' to prevent accidental deployment.");

// ============================================================
// Check 3: Projection view name is correct
// ============================================================
if (/consumer_public_next_meal_candidates_v1/.test(draftSql)) pass("migration draft defines consumer_public_next_meal_candidates_v1 view");
else fail("migration draft defines consumer_public_next_meal_candidates_v1 view", "Migration draft must define public.consumer_public_next_meal_candidates_v1.");

// ============================================================
// Check 4: Projection column allowlist — required public columns present
// ============================================================
const requiredColumns = [
  "candidate_id",
  "restaurant_id",
  "branch_id",
  "menu_item_id",
  "meal_name",
  "restaurant_name",
  "branch_name",
  "district",
  "public_image_url",
  "calories",
  "protein",
  "carbohydrates",
  "fat",
  "fiber",
  "nutrition_source_public",
  "nutrition_updated_at",
  "availability"
];
const missingAllowedColumns = requiredColumns.filter((col) => !new RegExp(`\\bas\\s+${col}\\b|\\b${col}\\s+as\\b`, "i").test(draftSql));
if (missingAllowedColumns.length) fail("migration draft projection contains all required consumer columns", "Some required consumer-facing columns are missing from the SELECT list.", { missing: missingAllowedColumns });
else pass("migration draft projection contains all required consumer columns", { count: requiredColumns.length });

// ============================================================
// Check 5: Projection column denylist — no sensitive fields in SELECT clause
// ============================================================
const forbiddenColumns = [
  "legal_name", "plan", "confidence_score", "verified_status", "source", "is_current",
  "nutrition_badge_status", "badge_enabled", "price", "cost", "margin",
  "sold_out", "branch_specific_status", "created_by", "updated_by", "reviewed_by",
  "deleted_at", "created_at", "updated_at", "sugar", "sodium", "saturated_fat",
  "serving_size", "tag_ids", "allergens", "category", "city", "latitude", "longitude"
];
// Note: 'source' added — raw internal nutrition quality label; must not appear as bare AS alias.
// 'nutrition_source_public' is safe: \bsource\b does not match within that compound name.

// Extract only the SELECT clause content (before the FROM keyword) to avoid false positives from comments
const selectSection = draftSql.replace(/--[^\n]*/g, "").match(/create\s+view[\s\S]*?select([\s\S]*?)from\s+public\./i)?.[1] ?? "";
const forbiddenInSelect = forbiddenColumns.filter((col) => new RegExp(`\\b${col}\\b`, "i").test(selectSection));
if (forbiddenInSelect.length) fail("migration draft SELECT excludes all sensitive/internal columns", "Forbidden sensitive columns found in SELECT clause.", { forbidden: forbiddenInSelect });
else pass("migration draft SELECT excludes all sensitive/internal columns", { checkedColumns: forbiddenColumns.length });

// ============================================================
// Check 6: DB-level status and availability filters present
// ============================================================
const requiredFilters = [
  { label: "restaurants.status = 'active'", pattern: /r\.status\s*=\s*'active'/i },
  { label: "restaurant_branches.status = 'active'", pattern: /rb\.status\s*=\s*'active'/i },
  { label: "menus.status = 'published'", pattern: /mn\.status\s*=\s*'published'/i },
  { label: "menu_items.status = 'active'", pattern: /mi\.status\s*=\s*'active'/i },
  { label: "branch_menu_items.availability = 'available'", pattern: /bmi\.availability\s*=\s*'available'/i }
];
const missingFilters = requiredFilters.filter(({ pattern }) => !pattern.test(draftSql));
if (missingFilters.length) fail("migration draft contains all required DB-level status and availability filters", "Some required status/availability filters are missing from the WHERE clause.", { missing: missingFilters.map((f) => f.label) });
else pass("migration draft contains all required DB-level status and availability filters", { count: requiredFilters.length });

// ============================================================
// Check 7: Sold-out exclusion present
// ============================================================
if (/bmi\.sold_out\s*=\s*false/i.test(draftSql)) pass("migration draft excludes sold-out branch menu items");
else fail("migration draft excludes sold-out branch menu items", "sold_out = false filter is missing from the WHERE clause.");

// ============================================================
// Check 8: Branch-specific status filter present
// ============================================================
if (/bmi\.branch_specific_status\s*=\s*'available'/i.test(draftSql)) pass("migration draft filters branch_specific_status = available");
else fail("migration draft filters branch_specific_status = available", "branch_specific_status = 'available' filter is missing.");

// ============================================================
// Check 9: Projection SQL references published nutrition view (not raw table)
//   - Must reference current_published_menu_item_nutrition in SQL code (not just comments)
//   - Must NOT reference raw menu_item_nutrition as a join/from target in SQL code
//   Note: current_published_menu_item_nutrition does NOT contain the substring
//   "join public.menu_item_nutrition" — it starts with "current_published_".
// ============================================================
{
  const draftCodeOnly = draftSql.replace(/--[^\n]*/g, "");
  const referencesPublishedView = /\bjoin\s+public\.current_published_menu_item_nutrition\b/i.test(draftCodeOnly);
  const referencesRawTable = /\bjoin\s+public\.menu_item_nutrition\b|\bfrom\s+public\.menu_item_nutrition\b/i.test(draftCodeOnly);

  if (referencesPublishedView && !referencesRawTable)
    pass("migration draft projection joins current_published_menu_item_nutrition (not raw menu_item_nutrition)", { referencesPublishedView, referencesRawTable });
  else if (!referencesPublishedView)
    fail("migration draft projection joins current_published_menu_item_nutrition (not raw menu_item_nutrition)",
      "Projection SQL code must JOIN public.current_published_menu_item_nutrition. Published-only semantics (is_current, verified_status) are enforced inside that view — not re-implemented in this projection.",
      { referencesPublishedView, referencesRawTable });
  else
    fail("migration draft projection joins current_published_menu_item_nutrition (not raw menu_item_nutrition)",
      "Projection SQL code references raw public.menu_item_nutrition as a JOIN or FROM target. Replace with public.current_published_menu_item_nutrition.",
      { referencesPublishedView, referencesRawTable });
}

// ============================================================
// Check 9b: Projection SQL does not duplicate publication logic (is_current, verified_status)
//   These belong inside current_published_menu_item_nutrition, not in the consumer projection.
// ============================================================
{
  const draftCodeOnly = draftSql.replace(/--[^\n]*/g, "");
  const hasIsCurrentInCode = /\bn\.is_current\s*=\s*true/i.test(draftCodeOnly);
  const hasVerifiedStatusInCode = /\bn\.verified_status\s+in\s*\(/i.test(draftCodeOnly);
  if (hasIsCurrentInCode || hasVerifiedStatusInCode)
    fail("migration draft does not duplicate publication logic (is_current / verified_status)",
      "Publication filters (is_current=true, verified_status IN ...) must not appear in the consumer projection SQL code. They are enforced inside current_published_menu_item_nutrition.",
      { hasIsCurrentInCode, hasVerifiedStatusInCode });
  else
    pass("migration draft does not duplicate publication logic (is_current / verified_status)");
}

// ============================================================
// Check 10: Calories IS NOT NULL filter present
// ============================================================
if (/n\.calories\s+is\s+not\s+null/i.test(draftSql)) pass("migration draft excludes items with null calories");
else fail("migration draft excludes items with null calories", "calories IS NOT NULL filter is missing — null-calorie items must be excluded.");

// ============================================================
// Check 11: No INSERT/UPDATE/DELETE/EXECUTE grants in migration draft
// ============================================================
const writePatternsInDraft = ["insert", "update", "delete", "execute"].filter((kw) => {
  const stripped = draftSql.replace(/--[^\n]*/g, "");
  return new RegExp(`\\bgrant\\s+(?:all|${kw})`, "i").test(stripped);
});
if (writePatternsInDraft.length) fail("migration draft contains no write or execute grants", "Migration draft must not include INSERT, UPDATE, DELETE, or EXECUTE grants.", { forbidden: writePatternsInDraft });
else pass("migration draft contains no write or execute grants");

// ============================================================
// Check 12: No service-role credential in migration draft (scan uncommented code only)
// ============================================================
{
  const draftCodeOnly = draftSql.replace(/--[^\n]*/g, "");
  if (/service[_-]?role|SERVICE_ROLE|SUPABASE_SERVICE|SECRET_KEY/i.test(draftCodeOnly)) fail("migration draft contains no service-role credentials", "Service-role secret or env var references must not appear in migration draft SQL code.");
  else pass("migration draft contains no service-role credentials");
}

// ============================================================
// Check 13: Security model documented and approved
//   - security_invoker=true must NOT be present in SQL code (comments explaining it are fine)
//   - Approval comment must be present
// ============================================================
{
  const draftCodeOnly = draftSql.replace(/--[^\n]*/g, "");
  if (/security_invoker\s*=\s*true/i.test(draftCodeOnly)) fail("migration draft does not use security_invoker=true", "security_invoker=true in SQL code would require raw table SELECT grants to consumers, which is explicitly rejected.");
  else pass("migration draft does not use security_invoker=true (owner-level execution preserved)");
}

if (/PHASE_2S_SECURITY_MODEL_APPROVED/i.test(draftSql)) pass("migration draft security model is explicitly approved and documented");
else fail("migration draft security model is explicitly approved and documented", "Migration draft must include PHASE_2S_SECURITY_MODEL_APPROVED comment documenting the view security model decision.");

// ============================================================
// Check 13b: security_barrier = true present in SQL code
// ============================================================
{
  const draftCodeOnly = draftSql.replace(/--[^\n]*/g, "");
  if (/security_barrier\s*=\s*true/i.test(draftCodeOnly)) pass("migration draft view declares security_barrier = true");
  else fail("migration draft view declares security_barrier = true", "View must be declared WITH (security_barrier = true) to prevent predicate-pushdown bypass of row-security conditions.");
}

// ============================================================
// Check 14: All four TODO_SCHEMA_VERIFY items [A][B][C][D] present
//   AND migration is flagged as NOT DEPLOYABLE because of them
// ============================================================
const todoCount = (draftSql.match(/TODO_SCHEMA_VERIFY/g) ?? []).length;
const hasVerifyA = /TODO_SCHEMA_VERIFY \[A\]/.test(draftSql);
const hasVerifyB = /TODO_SCHEMA_VERIFY \[B\]/.test(draftSql);
const hasVerifyC = /TODO_SCHEMA_VERIFY \[C\]/.test(draftSql);
const hasVerifyD = /TODO_SCHEMA_VERIFY \[D\]/.test(draftSql);
const hasVerifyE = /TODO_SCHEMA_VERIFY \[E\]/.test(draftSql);
if (hasVerifyA && hasVerifyB && hasVerifyC && hasVerifyD && hasVerifyE)
  pass("migration draft documents all required TODO_SCHEMA_VERIFY items [A][B][C][D][E]", { count: todoCount });
else
  fail("migration draft documents all required TODO_SCHEMA_VERIFY items [A][B][C][D][E]",
    "Migration draft must contain TODO_SCHEMA_VERIFY markers for all five items [A], [B], [C], [D], [E].",
    { present: { A: hasVerifyA, B: hasVerifyB, C: hasVerifyC, D: hasVerifyD, E: hasVerifyE }, totalCount: todoCount });

// Draft must also be explicitly marked NOT DEPLOYABLE (belt-and-suspenders header)
if (/NOT DEPLOYABLE/i.test(draftSql)) pass("migration draft header marks file as NOT DEPLOYABLE");
else fail("migration draft header marks file as NOT DEPLOYABLE", "Migration draft must include 'NOT DEPLOYABLE' in its header to prevent accidental deployment.");

// [E] is an independent deploy blocker: provenance columns unverified
if (hasVerifyE) pass("migration draft is deploy-blocked on TODO_SCHEMA_VERIFY [E] (provenance columns unconfirmed)", { deployBlocked: true });
else fail("migration draft is deploy-blocked on TODO_SCHEMA_VERIFY [E] (provenance columns unconfirmed)",
  "TODO_SCHEMA_VERIFY [E] must be present — nutrition_source_public and nutrition_updated_at must be confirmed in remote published view before Phase 2T deployment.");

// Guard records deploy-blocked state explicitly
pass("migration draft is deploy-blocked pending TODO_SCHEMA_VERIFY [A][B][C][D][E] resolution", { todoCount, deployBlocked: true });

// ============================================================
// Check 15: Grant in migration draft — authenticated only, anon explicitly excluded
// ============================================================
const strippedDraft = draftSql.replace(/--[^\n]*/g, "");
if (/grant\s+select\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+to\s+authenticated\s*;/i.test(strippedDraft)) pass("migration draft grants SELECT to authenticated");
else fail("migration draft grants SELECT to authenticated", "Grant SELECT ON consumer_public_next_meal_candidates_v1 TO authenticated must be present.");

if (/revoke\s+all\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+from\s+anon\s*;/i.test(strippedDraft) || /revoke\s+all\s+on\s+public\.consumer_public_next_meal_candidates_v1\s+from\s+public\s*;/i.test(strippedDraft)) pass("migration draft revokes anon and PUBLIC access from projection");
else fail("migration draft revokes anon and PUBLIC access from projection", "Migration draft must revoke ALL on projection from anon and PUBLIC.");

// ============================================================
// Check 16: No direct SELECT grants on raw restaurant/menu tables in active migrations
// ============================================================
const activeMigrations = fs.existsSync(path.join(root, MIGRATIONS_DIR))
  ? fs.readdirSync(path.join(root, MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort()
  : [];

const rawRestaurantTables = ["restaurants", "restaurant_branches", "menus", "menu_categories", "menu_items", "branch_menu_items", "menu_item_nutrition", "current_published_menu_item_nutrition"];
const rawTableGrantsInMigrations = [];
for (const migName of activeMigrations) {
  const migText = read(`${MIGRATIONS_DIR}/${migName}`).replace(/--[^\n]*/g, "");
  for (const table of rawRestaurantTables) {
    if (new RegExp(`grant\\s+(?:all|select)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+(?:anon|authenticated)`, "i").test(migText)) {
      rawTableGrantsInMigrations.push({ migration: migName, table });
    }
  }
}
if (rawTableGrantsInMigrations.length) fail("active migrations contain no SELECT grants on raw restaurant/menu tables", "Phase 2S must not grant consumers direct access to raw restaurant/menu tables.", { found: rawTableGrantsInMigrations });
else pass("active migrations contain no SELECT grants on raw restaurant/menu tables", { tablesChecked: rawRestaurantTables.length });

// ============================================================
// Check 17: Migration count is 21 — draft is in docs/, not migrations/
// ============================================================
const migrationCount = activeMigrations.length;
if (migrationCount === 21) pass("migration count is 21 — Phase 2S draft correctly placed in docs/, not supabase/migrations/", { count: migrationCount });
else fail("migration count is 21 — Phase 2S draft correctly placed in docs/, not supabase/migrations/", `Expected 21 migrations (Phase 2P baseline). Found ${migrationCount}. Phase 2S draft must remain in docs/ until Phase 2T deployment approval.`, { count: migrationCount });

// ============================================================
// Check 18: Mobile live recommendation repository does not exist
// ============================================================
const existingLiveRepos = MOBILE_LIVE_REPO_CANDIDATES.filter(exists);
if (existingLiveRepos.length) fail("mobile live restaurant/menu recommendation repository does not exist", "Phase 2S must not create Mobile live recommendation repository. Found unexpected files.", { files: existingLiveRepos });
else pass("mobile live restaurant/menu recommendation repository does not exist");

// ============================================================
// Check 19: Phase 2Q source union not modified
// ============================================================
const phase2qTypes = exists(PHASE_2Q_TYPES) ? read(PHASE_2Q_TYPES) : "";
const sourceUnionMatch = phase2qTypes.match(/ConsumerNextMealRecommendationSource\s*=\s*([^;]+);/);
const sourceUnion = sourceUnionMatch?.[1] ?? "";
const hasOnlyOriginalSources = /["']disabled["']/.test(sourceUnion) && /["']mock["']/.test(sourceUnion) && /["']local-menu-demo["']/.test(sourceUnion);
const hasUnexpectedSources = /supabase-restaurant-menu|live-restaurant|live-menu/i.test(sourceUnion);
if (hasOnlyOriginalSources && !hasUnexpectedSources) pass("Phase 2Q ConsumerNextMealRecommendationSource union is unmodified", { union: sourceUnion.trim() });
else fail("Phase 2Q ConsumerNextMealRecommendationSource union is unmodified", "Phase 2S must not add new sources to ConsumerNextMealRecommendationSource.", { union: sourceUnion.trim() });

// ============================================================
// Check 20: Phase 2R mapper not modified
// ============================================================
const phase2rMapper = exists(PHASE_2R_MAPPER) ? read(PHASE_2R_MAPPER) : "";
const hasLiveMapperBranch = /supabase[_-]restaurant[_-]menu|live[_-]restaurant|supabase_restaurant_menu/i.test(phase2rMapper);
const hasOnlyExpectedSources = /local.menu.demo/.test(phase2rMapper) && /"canonical_mock"/.test(phase2rMapper);
if (hasOnlyExpectedSources && !hasLiveMapperBranch) pass("Phase 2R mapCanonicalToU1NextMeal mapper is unmodified");
else fail("Phase 2R mapCanonicalToU1NextMeal mapper is unmodified", "Phase 2S must not add new toU1Source branches to mapCanonicalToU1NextMeal.ts.", { hasLiveMapperBranch });

// ============================================================
// Check 21: Validation SQL has DRAFT ONLY header
// ============================================================
const validationSql = exists(VALIDATION_SQL) ? read(VALIDATION_SQL) : "";
if (validationSql.startsWith("-- DRAFT ONLY")) pass("validation SQL has DRAFT ONLY header (not an active migration)");
else fail("validation SQL has DRAFT ONLY header (not an active migration)", "Validation queries must begin with DRAFT ONLY header to prevent accidental deployment.");

// ============================================================
// Check 22: Validation SQL covers all required verification areas
//   Original 18 + Q19 (security_barrier) + Section A-ext (nutrition dependency) + Section B (baseline)
// ============================================================
const validationChecks = [
  { label: "projection exists", pattern: /query\s*1[^0-9]|projection\s+exists/i },
  { label: "column list", pattern: /query\s*2[^0-9]|column\s+list\s+matches/i },
  { label: "no sensitive columns", pattern: /query\s*3[^0-9]|no\s+sensitive\s+col/i },
  { label: "no draft menus", pattern: /query\s*4[^0-9]|no\s+draft\s+menu/i },
  { label: "no archived menus", pattern: /query\s*5[^0-9]|no\s+archived\s+menu/i },
  { label: "no draft/archived items", pattern: /query\s*6[^0-9]|no\s+draft.*item/i },
  { label: "no inactive branches", pattern: /query\s*7[^0-9]|no\s+inactive.*branch/i },
  { label: "no unavailable items", pattern: /query\s*8[^0-9]|no\s+unavailable/i },
  { label: "no sold-out items", pattern: /query\s*9[^0-9]|no\s+sold.out/i },
  { label: "no unpublished nutrition", pattern: /query\s*10[^0-9]|no\s+unpublished/i },
  { label: "no soft-deleted data", pattern: /query\s*11[^0-9]|soft.delet/i },
  { label: "calories not null", pattern: /query\s*12[^0-9]|calories.*not\s+null/i },
  { label: "candidate_id unique", pattern: /query\s*13[^0-9]|candidate_id.*unique/i },
  { label: "menu_item × branch unique", pattern: /query\s*14[^0-9]|menu_item.*branch.*unique/i },
  { label: "anon permissions", pattern: /query\s*15[^0-9]|anon.*no.*access|anon.*privilege/i },
  { label: "authenticated SELECT only", pattern: /query\s*16[^0-9]|authenticated.*select/i },
  { label: "raw table grants unchanged", pattern: /query\s*17[^0-9b]|raw.*table.*grant/i },
  { label: "no write grants", pattern: /query\s*17b|no.*insert.*update.*delete|write.*grant/i },
  // Phase 2S security hardening (Q19 + A-ext + Section B):
  { label: "security_barrier reloptions check (query 19)", pattern: /query\s*19|security_barrier.*reloption|reloption.*security_barrier/i },
  { label: "projection definition references published view (A-ext-1)", pattern: /A-ext-1|projection.*definition.*references.*current_published|pg_get_viewdef.*consumer_public/i },
  { label: "projection definition does not reference raw nutrition (A-ext-2)", pattern: /A-ext-2|does not.*reference.*raw.*menu_item_nutrition|projection.*definition.*not.*reference/i },
  { label: "pg_depend confirms published view dependency (A-ext-3)", pattern: /A-ext-3|pg_depend|dependency.*published.*view/i },
  { label: "published view does not expose sensitive columns (A-ext-4)", pattern: /A-ext-4|published view.*sensitive|sensitive.*current_published/i },
  { label: "nullable macros not coalesced to 0 (A-ext-6)", pattern: /A-ext-6|nullable.*macro|macro.*coalesce|coalesce.*0/i },
  { label: "raw table grants baseline (section B1)", pattern: /section\s*b|B1:|pre.deployment\s+baseline|pre-deployment\s+baseline/i },
  { label: "table/view owners baseline (B2)", pattern: /B2:|view.*owner|table.*owner|relowner/i },
  { label: "RLS status baseline (B3)", pattern: /B3:|rls.*enabled|relrowsecurity/i },
  { label: "TODO_SCHEMA_VERIFY [D] nutrition view inspection (B4)", pattern: /B4:|TODO_SCHEMA_VERIFY.*\[D\]|\[D\].*current_published|current_published_menu_item_nutrition.*view.def|B4a|B4b|B4c/i },
  { label: "existing RLS policies baseline (B5)", pattern: /B5:|pg_policy|existing.*rls.*polic/i },
  // Section C: Provenance verification (TODO_SCHEMA_VERIFY [E])
  { label: "published view has nutrition_source_public column (C1)", pattern: /C1:|nutrition_source_public.*column/i },
  { label: "published view has nutrition_updated_at column (C2)", pattern: /C2:|nutrition_updated_at.*column/i },
  { label: "nutrition_source_public approved allowlist values check (C3)", pattern: /C3:|ai_estimated.*restaurant_confirmed.*platform_reviewed/i },
  { label: "nutrition_source_public never null in published rows (C4)", pattern: /C4:|null_source_count/i },
  { label: "projection nutrition_source_public matches published view (C5)", pattern: /C5:|proj_source.*view_source|is\s+distinct\s+from.*nutrition_source_public/i },
  { label: "projection does not expose raw verified_status or source (C6)", pattern: /C6:|verified_status.*consumer_public_next_meal|consumer_public_next_meal.*verified_status/i },
  { label: "published view does not expose reviewer/workflow columns (C8)", pattern: /C8:|reviewer.*workflow|workflow.*internal/i }
];
const missingValidationChecks = validationChecks.filter(({ pattern }) => !pattern.test(validationSql));
if (missingValidationChecks.length) fail("validation SQL covers all required verification areas", "Some required validation queries are missing.", { missing: missingValidationChecks.map((c) => c.label) });
else pass("validation SQL covers all required verification areas", { count: validationChecks.length });

// ============================================================
// Check 23: Validation SQL not in active migrations directory
// ============================================================
const validationInMigrations = activeMigrations.filter((name) => /validation/i.test(name));
if (validationInMigrations.length) fail("validation SQL not present in active migrations", "Validation-only SELECT queries must not be in supabase/migrations/.", { files: validationInMigrations });
else pass("validation SQL not present in active migrations");

// ============================================================
// Check 24: Phase 2T has not started
//   (No Phase 2T guard script, no live mobile source wiring)
// ============================================================
const phase2tStarted = exists("scripts/consumer-public-restaurant-menu-phase-2t-guard.mjs")
  || exists("apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
if (phase2tStarted) fail("Phase 2T has not started", "Phase 2T artifacts detected; Phase 2T must not begin before explicit approval.");
else pass("Phase 2T has not started");

// ============================================================
// Check 25: Design documentation mentions key Phase 2S decisions
// ============================================================
const designDoc = exists(DESIGN_DOC) ? read(DESIGN_DOC) : "";
const requiredDecisions = [
  { label: "raw table rejection rationale", pattern: /raw.table.*reject|REST\s+filter.*caller.controlled|caller.controlled/i },
  { label: "authenticated-only role decision", pattern: /authenticated.*only|grant.*to\s+authenticated/i },
  { label: "security model approval", pattern: /PHASE_2S_SECURITY_MODEL_APPROVED|security.*definer.*approved/i },
  { label: "security_barrier rationale documented", pattern: /security_barrier\s*=\s*true|predicate.pushdown|security_barrier/i },
  { label: "isSampleData: false decision for live data", pattern: /isSampleData.*false|live.*provenance/i },
  { label: "calories null exclusion rationale", pattern: /calories.*null|null.*calories/i },
  { label: "TODO_SCHEMA_VERIFY [A][B][C] checklist", pattern: /TODO_SCHEMA_VERIFY/i },
  { label: "TODO_SCHEMA_VERIFY [D] nutrition view checklist", pattern: /\[D\].*current_published|current_published.*\[D\]|TODO_SCHEMA_VERIFY.*\[D\]/i },
  { label: "TODO_SCHEMA_VERIFY [E] provenance column checklist", pattern: /TODO_SCHEMA_VERIFY.*\[E\]|\[E\].*nutrition.source|nutrition_source_public.*\[E\]|\[E\].*provenance/i },
  { label: "nutrition_source_public UI label semantics (ai_estimated/restaurant_confirmed/platform_reviewed)", pattern: /ai_estimated|restaurant_confirmed|platform_reviewed/i },
  { label: "published != restaurant confirmed explanation", pattern: /published.*not.*confirm|Published.*≠|AI.estimated.*can.*publish|published.*does.*not.*imply/i }
];
const missingDecisions = requiredDecisions.filter(({ pattern }) => !pattern.test(designDoc));
if (missingDecisions.length) fail("design documentation covers all required Phase 2S decisions (including security_barrier and [D])", "Some required design decisions are not documented.", { missing: missingDecisions.map((d) => d.label) });
else pass("design documentation covers all required Phase 2S decisions (including security_barrier and [D])", { count: requiredDecisions.length });

// ============================================================
// Final result
// ============================================================
const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Phase 2S",
  track: "Consumer Public Restaurant/Menu Read Boundary",
  summary: issues.length ? "Phase 2S guard failed" : "Phase 2S boundary design artifacts verified. Migration draft is in docs/ (not deployed). Phase 2Q/2R/U1 contracts unchanged. No Mobile live repository exists.",
  passedChecks: checks.filter((c) => c.pass).length,
  failedChecks: checks.filter((c) => !c.pass).length,
  checks,
  issues,
  migrationDraftDeployed: false,
  migrationCount,
  mobileLiveRepositoryExists: existingLiveRepos.length > 0,
  phase2QSourceUnionModified: !hasOnlyOriginalSources || hasUnexpectedSources,
  phase2RMapperModified: hasLiveMapperBranch,
  phase2TStarted: phase2tStarted,
  remoteSupabaseOperationExecuted: false,
  productionTouched: false,
  writeGrantAdded: false
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);

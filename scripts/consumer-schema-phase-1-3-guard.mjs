import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const draftsDir = path.join(root, "docs", "supabase-consumer-schema-drafts");
const migrationsDir = path.join(root, "supabase", "migrations");
const consumerAuthDir = path.join(root, "apps", "mobile", "features", "consumer-auth");
const issues = [];
const checks = [];

const expectedDraftFiles = [
  "001_consumer_enums_and_helpers.sql",
  "002_consumer_profiles.sql",
  "003_consumer_preferences_and_goals.sql",
  "004_meal_records.sql",
  "005_meal_analysis_and_corrections.sql",
  "006_meal_consumption_and_sharing.sql",
  "007_planned_meals_and_daily_summaries.sql",
  "008_ratings_and_favorites.sql",
  "009_recommendation_feedback.sql",
  "010_consumer_privacy_and_consents.sql",
  "011_consumer_audit_and_legacy_mapping.sql",
  "012_consumer_indexes.sql",
  "013_consumer_public_private_views.sql",
  "014_consumer_rls_policy_drafts.sql",
  "015_consumer_validation_queries.sql"
];

const expectedMigrationFiles = [
  "20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql",
  "20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql",
  "20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql",
  "20260712130400_consumer_schema_phase_1_3_meal_records.sql",
  "20260712130500_consumer_schema_phase_1_3_meal_analysis_and_corrections.sql",
  "20260712130600_consumer_schema_phase_1_3_meal_consumption_and_sharing.sql",
  "20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql",
  "20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql",
  "20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql",
  "20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql",
  "20260712131100_consumer_schema_phase_1_3_consumer_audit_and_legacy_mapping.sql",
  "20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql",
  "20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql",
  "20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql"
];

const requiredTables = [
  "consumer_profiles",
  "consumer_private_profiles",
  "consumer_preferences",
  "taste_profiles",
  "dietary_restrictions",
  "nutrition_goals",
  "subscription_entitlements",
  "meal_records",
  "meal_record_items",
  "meal_analyses",
  "meal_corrections",
  "meal_consumption_adjustments",
  "meal_sharing_allocations",
  "planned_meals",
  "daily_nutrition_summaries",
  "user_restaurant_ratings",
  "user_menu_item_ratings",
  "favorite_restaurants",
  "favorite_menu_items",
  "recommendation_sessions",
  "recommendation_feedback",
  "consumer_data_consents",
  "consumer_data_deletion_requests",
  "consumer_data_change_logs",
  "legacy_consumer_entity_mappings"
];

const expectedObjectCounts = {
  tables: 25,
  views: 3,
  indexes: 28,
  policies: 24,
  types: 13,
  functions: 1
};

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  issues.push({ name, message, ...extra });
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

function matches(text, regex) {
  return [...text.matchAll(regex)];
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, predicate));
    if (entry.isFile() && predicate(full)) files.push(full);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

const draftFiles = fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir).filter((name) => name.endsWith(".sql")).sort() : [];
const migrationFiles = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter((name) => name.includes("consumer_schema_phase_1_3") && name.endsWith(".sql")).sort() : [];

if (JSON.stringify(draftFiles) === JSON.stringify(expectedDraftFiles)) pass("draft package inventory preserved", { count: draftFiles.length });
else fail("draft package inventory preserved", "Draft SQL inventory changed unexpectedly.", { draftFiles });

if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("active migration package inventory and ordering", { count: migrationFiles.length });
else fail("active migration package inventory and ordering", "Active migration inventory or ordering is incorrect.", { migrationFiles });

const draftHeaderFailures = [];
for (const fileName of expectedDraftFiles) {
  const file = path.join(draftsDir, fileName);
  if (!fs.existsSync(file) || !read(file).startsWith("-- DRAFT ONLY")) draftHeaderFailures.push(fileName);
}
if (draftHeaderFailures.length) fail("draft files remain review-only", "Draft SQL files must retain the review-only warning.", { matches: draftHeaderFailures });
else pass("draft files remain review-only");

const activeTexts = [];
for (const fileName of migrationFiles) {
  const file = path.join(migrationsDir, fileName);
  activeTexts.push({ fileName, rel: relative(file), text: read(file), clean: stripComments(read(file)) });
}
const allActiveSql = activeTexts.map((item) => item.clean).join("\n");

const markdownFenceFailures = activeTexts
  .filter((item) => item.text.includes("```"))
  .map((item) => item.rel);
if (markdownFenceFailures.length) fail("active migrations contain no Markdown code fences", "Active migration SQL must not contain Markdown code fences.", { matches: markdownFenceFailures });
else pass("active migrations contain no Markdown code fences");

const backtickFailures = activeTexts
  .filter((item) => item.text.includes("`"))
  .map((item) => item.rel);
if (backtickFailures.length) fail("active migrations contain no backticks", "Active migration SQL must not contain Markdown backticks or SQL wrapper characters.", { matches: backtickFailures });
else pass("active migrations contain no backticks");

const standaloneBacktickFailures = activeTexts
  .filter((item) => /(^|\r?\n)\s*`\s*(\r?\n|$)/.test(item.text))
  .map((item) => item.rel);
if (standaloneBacktickFailures.length) fail("active migrations contain no standalone backtick wrapper lines", "Active migration SQL must not start or end a Markdown wrapper with a standalone backtick line.", { matches: standaloneBacktickFailures });
else pass("active migrations contain no standalone backtick wrapper lines");

const sqlPackagingFailures = activeTexts
  .filter((item) => {
    const firstSqlLine = item.text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
    return !firstSqlLine || firstSqlLine.startsWith("```") || firstSqlLine === "`";
  })
  .map((item) => item.rel);
if (sqlPackagingFailures.length) fail("active migrations are pure PostgreSQL SQL files", "Active migration files must be directly parseable as PostgreSQL SQL, not Markdown-wrapped content.", { matches: sqlPackagingFailures });
else pass("active migrations are pure PostgreSQL SQL files", { count: activeTexts.length });

const activeDraftMarkers = activeTexts.filter((item) => /DRAFT ONLY|NOT AN ACTIVE MIGRATION|DO NOT APPLY TO PRODUCTION/i.test(item.text)).map((item) => item.rel);
if (activeDraftMarkers.length) fail("active migrations have formal headers", "Active migration files must not keep draft-only warning headers.", { matches: activeDraftMarkers });
else pass("active migrations have formal headers");

const draftMarkdownFenceFailures = [];
for (const fileName of expectedDraftFiles) {
  const file = path.join(draftsDir, fileName);
  if (!fs.existsSync(file)) continue;
  const text = read(file);
  if (text.startsWith("```") || /(^|\r?\n)\s*```\w*\s*(\r?\n|$)/.test(text)) draftMarkdownFenceFailures.push(fileName);
}
if (draftMarkdownFenceFailures.length) fail("draft headers are not Markdown-fenced", "Draft review headers must remain SQL comments, not Markdown-fenced blocks.", { matches: draftMarkdownFenceFailures });
else pass("draft headers are not Markdown-fenced");

const validationSelectPromoted = migrationFiles.filter((name) => name.includes("validation_queries"));
if (validationSelectPromoted.length) fail("validation queries excluded from active migrations", "Validation-only SELECT SQL must not be in active migration state.", { matches: validationSelectPromoted });
else pass("validation queries excluded from active migrations");

const objectCounts = {
  tables: new Set(),
  views: new Set(),
  indexes: new Set(),
  policies: new Set(),
  types: new Set(),
  functions: new Set()
};
for (const item of activeTexts) {
  for (const match of matches(item.clean, /create\s+table\s+([a-z_][a-z0-9_]*)\s*\(/gi)) objectCounts.tables.add(match[1]);
  for (const match of matches(item.clean, /create\s+view\s+([a-z_][a-z0-9_]*)\s+as/gi)) objectCounts.views.add(match[1]);
  for (const match of matches(item.clean, /create\s+(?:unique\s+)?index\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) objectCounts.indexes.add(match[1]);
  for (const match of matches(item.clean, /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) objectCounts.policies.add(match[1]);
  for (const match of matches(item.clean, /create\s+type\s+([a-z_][a-z0-9_]*)\s+as\s+enum/gi)) objectCounts.types.add(match[1]);
  for (const match of matches(item.clean, /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)\s*\(/gi)) objectCounts.functions.add(match[1]);
}

const actualObjectCounts = {
  tables: objectCounts.tables.size,
  views: objectCounts.views.size,
  indexes: objectCounts.indexes.size,
  policies: objectCounts.policies.size,
  types: objectCounts.types.size,
  functions: objectCounts.functions.size
};
const inventoryMismatches = Object.entries(expectedObjectCounts)
  .filter(([key, expected]) => actualObjectCounts[key] !== expected)
  .map(([key, expected]) => ({ key, expected, actual: actualObjectCounts[key] }));
if (inventoryMismatches.length) fail("active migration object inventory unchanged", "Active migration object inventory changed unexpectedly.", { expectedObjectCounts, actualObjectCounts, inventoryMismatches });
else pass("active migration object inventory unchanged", { objectCounts: actualObjectCounts });

const missingTables = requiredTables.filter((table) => !objectCounts.tables.has(table));
if (missingTables.length) fail("required Consumer tables present", "Active migration package is missing required Consumer tables.", { missingTables });
else pass("required Consumer tables present", { count: requiredTables.length });

if (objectCounts.tables.has("consumer_profiles") && !allActiveSql.includes("create table user_profiles")) pass("canonical profile table is consumer_profiles");
else fail("canonical profile table is consumer_profiles", "Active migration package must create consumer_profiles and must not create user_profiles.");

if (!/\buser_profiles\b/.test(allActiveSql)) pass("no user_profiles compatibility object");
else fail("no user_profiles compatibility object", "Phase 1.3 must not create or reference user_profiles compatibility objects.");

const forbiddenSqlPatterns = [
  [/\binsert\s+into\b/i, "No seed or fixture INSERT is allowed."],
  [/\btruncate\s+table\b/i, "No destructive TRUNCATE is allowed."],
  [/\bdrop\s+table\b/i, "No destructive DROP TABLE is allowed."],
  [/\bdelete\s+from\b/i, "No data DELETE is allowed."],
  [/\bupdate\s+[a-z_][a-z0-9_]*\s+set\b/i, "No data UPDATE is allowed."],
  [/\b(create|alter|drop)\s+table\s+(restaurants?|restaurant_branches|menus|menu_categories|menu_items|branch_menu_items)\b/i, "Restaurant schema must not be modified."],
  [/service[_-]?role/i, "Service-role wording must not appear in active migration package."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in active migration package."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in active migration package."],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, "Hardcoded UUIDs must not appear in active migration package."]
];

for (const [pattern, message] of forbiddenSqlPatterns) {
  const found = activeTexts.filter((item) => pattern.test(item.clean)).map((item) => item.rel);
  if (found.length) fail(`forbidden active migration pattern: ${pattern}`, message, { matches: found });
  else pass(`forbidden active migration pattern absent: ${pattern}`);
}

const authFkTables = [...matches(allActiveSql, /user_id\s+uuid\s+(?:not\s+null\s+)?(?:unique\s+)?references\s+auth\.users\(id\)/gi)];
if (authFkTables.length >= 20) pass("auth.users ownership foreign keys present", { count: authFkTables.length });
else fail("auth.users ownership foreign keys present", "Expected Consumer user_id ownership foreign keys to auth.users(id).", { count: authFkTables.length });

const missingRls = requiredTables.filter((table) => !new RegExp(`alter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(allActiveSql));
if (missingRls.length) fail("RLS enabled for Consumer tables", "Some Consumer tables are missing RLS enablement.", { missingRls });
else pass("RLS enabled for Consumer tables", { count: requiredTables.length });

const requiredPolicyFragments = [
  "create policy consumer_profiles_owner_read on consumer_profiles for select using (auth.uid() = user_id)",
  "create policy consumer_profiles_owner_update on consumer_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id)",
  "create policy meal_records_owner_all on meal_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id)",
  "create policy recommendation_feedback_owner_all on recommendation_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id)"
];
const missingPolicyFragments = requiredPolicyFragments.filter((fragment) => !allActiveSql.toLowerCase().includes(fragment));
if (missingPolicyFragments.length) fail("ownership policy fragments present", "Required owner policies are missing.", { missingPolicyFragments });
else pass("ownership policy fragments present");

const consumerAuthFiles = walk(consumerAuthDir, (file) => file.endsWith(".ts"));
const consumerAuthText = consumerAuthFiles.map((file) => ({ rel: relative(file), text: read(file) }));
const runtimeUserProfileRefs = consumerAuthText.filter((item) => /\buser_profiles\b/.test(item.text)).map((item) => item.rel);
if (runtimeUserProfileRefs.length) fail("Phase 1D runtime no longer targets user_profiles", "Runtime source must not reference user_profiles.", { matches: runtimeUserProfileRefs });
else pass("Phase 1D runtime no longer targets user_profiles");

const contractText = read(path.join(consumerAuthDir, "supabaseProfileContracts.ts"));
if (/SUPABASE_CONSUMER_PROFILE_TABLE\s*=\s*"consumer_profiles"/.test(contractText)) pass("Phase 1D runtime table target is consumer_profiles");
else fail("Phase 1D runtime table target is consumer_profiles", "supabaseProfileContracts.ts must target consumer_profiles.");

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-auth|@supabase\/supabase-js|react-native-url-polyfill/.test(read(file))).map(relative);
if (uiImports.length) fail("Mobile UI remains unwired", "Phase 1.3 must not wire UI to Consumer Auth/Profile.", { matches: uiImports });
else pass("Mobile UI remains unwired");

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Schema Phase 1.3",
  reason: issues.length ? "Phase 1.3 guard failed" : "Formal migration package and Phase 1D table alignment verified statically",
  migrationFiles,
  objectCounts: {
    tables: objectCounts.tables.size,
    views: objectCounts.views.size,
    indexes: objectCounts.indexes.size,
    policies: objectCounts.policies.size,
    types: objectCounts.types.size,
    functions: objectCounts.functions.size
  },
  checks,
  issues,
  remoteSupabaseMigrationExecuted: false,
  seedCreated: false,
  fixtureCreated: false,
  authUsersModified: false,
  productionTouched: false,
  phase2Started: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;

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
  "20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql",
  "20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql",
  "20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql",
  "20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql",
  "20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql",
  "20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql",
  "20260713080100_consumer_schema_phase_1_3_authenticated_planned_meal_read_grant.sql",
  "20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql"
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
  functions: 6
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

function readBytes(file) {
  return fs.readFileSync(file);
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
  const bytes = readBytes(file);
  const text = read(file);
  activeTexts.push({ fileName, rel: relative(file), bytes, text, clean: stripComments(text) });
}
const allActiveSql = activeTexts.map((item) => item.clean).join("\n");
const grantMigrationName = "20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql";
const grantMigration = activeTexts.find((item) => item.fileName === grantMigrationName);
const mealGrantMigrationName = "20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql";
const mealGrantMigration = activeTexts.find((item) => item.fileName === mealGrantMigrationName);
const atomicMealWriteMigrationName = "20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql";
const dailySummaryGrantMigrationName = "20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql";
const atomicDailySummaryPersistenceMigrationName = "20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql";
const plannedMealGrantMigrationName = "20260713080100_consumer_schema_phase_1_3_authenticated_planned_meal_read_grant.sql";
const atomicPlannedMealWriteMigrationName = "20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql";
const dailySummaryGrantMigration = activeTexts.find((item) => item.fileName === dailySummaryGrantMigrationName);
const atomicDailySummaryPersistenceMigration = activeTexts.find((item) => item.fileName === atomicDailySummaryPersistenceMigrationName);
const plannedMealGrantMigration = activeTexts.find((item) => item.fileName === plannedMealGrantMigrationName);

const bomByteFailures = activeTexts
  .filter((item) => item.bytes.length >= 3 && item.bytes[0] === 0xef && item.bytes[1] === 0xbb && item.bytes[2] === 0xbf)
  .map((item) => item.rel);
if (bomByteFailures.length) fail("active migrations do not start with UTF-8 BOM bytes", "Active migration SQL must be UTF-8 without BOM.", { matches: bomByteFailures });
else pass("active migrations do not start with UTF-8 BOM bytes");

const unicodeBomFailures = activeTexts
  .filter((item) => item.text.codePointAt(0) === 0xfeff)
  .map((item) => item.rel);
if (unicodeBomFailures.length) fail("active migrations first code point is not U+FEFF", "Active migration SQL must not start with U+FEFF.", { matches: unicodeBomFailures });
else pass("active migrations first code point is not U+FEFF");

const utf8WithoutBomFailures = activeTexts
  .filter((item) => item.bytes.length >= 3 && item.bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
  .map((item) => item.rel);
if (utf8WithoutBomFailures.length) fail("active migrations are encoded as UTF-8 without BOM", "Active migration files must not include a UTF-8 BOM prefix.", { matches: utf8WithoutBomFailures });
else pass("active migrations are encoded as UTF-8 without BOM", { count: activeTexts.length });

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

if (grantMigration && /^grant\s+select\s+on\s+table\s+public\.consumer_profiles\s+to\s+authenticated\s*;\s*$/i.test(grantMigration.clean.trim())) {
  pass("authenticated consumer_profiles SELECT grant is forward-only and minimal");
} else {
  fail("authenticated consumer_profiles SELECT grant is forward-only and minimal", "Forward-only grant migration must contain only GRANT SELECT ON TABLE public.consumer_profiles TO authenticated.");
}

const grantStatements = matches(allActiveSql, /\bgrant\b[\s\S]*?;/gi).map((match) => match[0].replace(/\s+/g, " ").trim().toLowerCase());
const expectedGrant = "grant select on table public.consumer_profiles to authenticated;";
const expectedMealRecordGrant = "grant select on table public.meal_records to authenticated;";
const expectedMealRecordItemGrant = "grant select on table public.meal_record_items to authenticated;";
const expectedDailySummaryGrant = "grant select on table public.daily_nutrition_summaries to authenticated;";
const expectedPlannedMealGrant = "grant select on table public.planned_meals to authenticated;";
const expectedMealWriteFunctionGrant = "grant execute on function public.create_current_user_meal_record( public.meal_type, timestamptz, date, text, text, text, public.meal_source_type, jsonb ) to authenticated;";
const expectedDailySummaryWriteFunctionGrant = "grant execute on function public.persist_authenticated_daily_nutrition_summary( date, text, text, numeric, numeric, numeric, numeric, numeric, integer, integer, timestamptz, timestamptz ) to authenticated;";
const expectedSavePlannedMealFunctionGrant = "grant execute on function public.save_authenticated_planned_meal( date, text, text, text, text, text, text, jsonb ) to authenticated;";
const expectedUpdatePlannedMealFunctionGrant = "grant execute on function public.update_authenticated_planned_meal( uuid, date, text, text, text, text, text, text, jsonb, text ) to authenticated;";
const expectedRemovePlannedMealFunctionGrant = "grant execute on function public.remove_authenticated_planned_meal(uuid) to authenticated;";
const allowedGrantStatements = [expectedGrant, expectedMealRecordGrant, expectedMealRecordItemGrant, expectedDailySummaryGrant, expectedPlannedMealGrant, expectedMealWriteFunctionGrant, expectedDailySummaryWriteFunctionGrant, expectedSavePlannedMealFunctionGrant, expectedUpdatePlannedMealFunctionGrant, expectedRemovePlannedMealFunctionGrant];
const unexpectedGrants = grantStatements.filter((statement) => !allowedGrantStatements.includes(statement));
if (unexpectedGrants.length) fail("no unexpected grants in active migrations", "Only authenticated SELECT grants for consumer_profiles, meal_records, meal_record_items, daily_nutrition_summaries, planned_meals, and approved atomic write function execute grants are allowed in active Phase 1.3 migrations.", { unexpectedGrants });
else pass("no unexpected grants in active migrations", { grantCount: grantStatements.length });

if (grantStatements.includes(expectedGrant)) pass("authenticated has SELECT on consumer_profiles");
else fail("authenticated has SELECT on consumer_profiles", "Missing authenticated SELECT grant for public.consumer_profiles.");

const mealGrantSql = mealGrantMigration?.clean.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
const expectedMealGrantSql = [
  expectedMealRecordGrant,
  expectedMealRecordItemGrant,
  "revoke all on table public.meal_records from anon;",
  "revoke all on table public.meal_record_items from anon;"
].join(" ");
if (mealGrantSql === expectedMealGrantSql) {
  pass("authenticated meal table SELECT grants are forward-only and minimal");
} else {
  fail("authenticated meal table SELECT grants are forward-only and minimal", "Forward-only meal read grant migration must contain only authenticated SELECT grants and anon revokes for meal_records and meal_record_items.");
}

if (grantStatements.includes(expectedMealRecordGrant) && grantStatements.includes(expectedMealRecordItemGrant)) pass("authenticated has SELECT on meal read tables");
else fail("authenticated has SELECT on meal read tables", "Missing authenticated SELECT grants for meal_records and meal_record_items.");

const dailySummaryGrantSql = dailySummaryGrantMigration?.clean.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
const expectedDailySummaryGrantSql = [
  expectedDailySummaryGrant,
  "revoke all on table public.daily_nutrition_summaries from anon;"
].join(" ");
if (dailySummaryGrantSql === expectedDailySummaryGrantSql) {
  pass("authenticated daily summary SELECT grant is forward-only and minimal");
} else {
  fail("authenticated daily summary SELECT grant is forward-only and minimal", "Forward-only daily summary read grant migration must contain only authenticated SELECT grant and anon revoke for daily_nutrition_summaries.");
}

if (grantStatements.includes(expectedDailySummaryGrant)) pass("authenticated has SELECT on daily_nutrition_summaries");
else fail("authenticated has SELECT on daily_nutrition_summaries", "Missing authenticated SELECT grant for daily_nutrition_summaries.");

const plannedMealGrantSql = plannedMealGrantMigration?.clean.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
const expectedPlannedMealGrantSql = [
  expectedPlannedMealGrant,
  "revoke all on table public.planned_meals from anon;"
].join(" ");
if (plannedMealGrantSql === expectedPlannedMealGrantSql) {
  pass("authenticated planned_meals SELECT grant is forward-only and minimal");
} else {
  fail("authenticated planned_meals SELECT grant is forward-only and minimal", "Forward-only planned meals read grant migration must contain only authenticated SELECT grant and anon revoke for planned_meals.");
}

if (grantStatements.includes(expectedPlannedMealGrant)) pass("authenticated has SELECT on planned_meals");
else fail("authenticated has SELECT on planned_meals", "Missing authenticated SELECT grant for planned_meals.");

const anonConsumerProfileGrants = grantStatements.filter((statement) => /\bto\s+anon\b/.test(statement) && /\bconsumer_profiles\b/.test(statement));
if (anonConsumerProfileGrants.length) fail("anon has no consumer_profiles privileges", "Consumer profile privileges must not be granted to anon.", { matches: anonConsumerProfileGrants });
else pass("anon has no consumer_profiles privileges");

const anonMealGrants = grantStatements.filter((statement) => /\bto\s+anon\b/.test(statement) && /\b(meal_records|meal_record_items)\b/.test(statement));
if (anonMealGrants.length) fail("anon has no meal table SELECT privileges", "Consumer meal table privileges must not be granted to anon.", { matches: anonMealGrants });
else pass("anon has no meal table SELECT privileges");

const anonDailySummaryGrants = grantStatements.filter((statement) => /\bto\s+anon\b/.test(statement) && /\bdaily_nutrition_summaries\b/.test(statement));
if (anonDailySummaryGrants.length) fail("anon has no daily_nutrition_summaries privileges", "Consumer daily summary privileges must not be granted to anon.", { matches: anonDailySummaryGrants });
else pass("anon has no daily_nutrition_summaries privileges");

const anonPlannedMealGrants = grantStatements.filter((statement) => /\bto\s+anon\b/.test(statement) && /\bplanned_meals\b/.test(statement));
if (anonPlannedMealGrants.length) fail("anon has no planned_meals privileges", "Consumer planned meal privileges must not be granted to anon.", { matches: anonPlannedMealGrants });
else pass("anon has no planned_meals privileges");

const authenticatedWriteGrants = grantStatements.filter((statement) => /\bto\s+authenticated\b/.test(statement) && /\b(insert|update|delete|all)\b/.test(statement));
if (authenticatedWriteGrants.length) fail("authenticated has no consumer_profiles write privileges", "Consumer Runtime Phase 1D may not grant INSERT, UPDATE, DELETE, or ALL privileges.", { matches: authenticatedWriteGrants });
else pass("authenticated has no consumer_profiles write privileges");

const otherConsumerTableGrants = grantStatements.filter((statement) => /\bto\s+authenticated\b/.test(statement) && /\bconsumer_|meal_|favorite_|recommendation_|nutrition_|taste_|dietary_|subscription_|planned_|daily_|user_/i.test(statement) && !allowedGrantStatements.includes(statement));
if (otherConsumerTableGrants.length) fail("no other Consumer table grants", "Forward-only privilege migration must not grant access to other Consumer tables.", { matches: otherConsumerTableGrants });
else pass("no other Consumer table grants");

const grantAllStatements = grantStatements.filter((statement) => /\bgrant\s+all\b/.test(statement));
if (grantAllStatements.length) fail("no GRANT ALL in active migrations", "Consumer Phase 1.3 corrective migration must not use GRANT ALL.", { matches: grantAllStatements });
else pass("no GRANT ALL in active migrations");

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
  for (const match of matches(item.clean, /create\s+(?:or\s+replace\s+)?function\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) objectCounts.functions.add(match[2]);
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
  const found = activeTexts
    .filter((item) => item.fileName !== atomicMealWriteMigrationName && item.fileName !== atomicDailySummaryPersistenceMigrationName && item.fileName !== atomicPlannedMealWriteMigrationName && pattern.test(item.clean))
    .map((item) => item.rel);
  if (found.length) fail(`forbidden active migration pattern: ${pattern}`, message, { matches: found });
  else pass(`forbidden active migration pattern absent: ${pattern}`);
}

const atomicMigration = activeTexts.find((item) => item.fileName === atomicMealWriteMigrationName);
if (atomicMigration) {
  const clean = atomicMigration.clean.toLowerCase();
  if (/create\s+or\s+replace\s+function\s+public\.create_current_user_meal_record/.test(clean)) pass("atomic meal write function exists");
  else fail("atomic meal write function exists", "Phase 2D migration must create public.create_current_user_meal_record.");
  if (/security\s+definer/.test(clean) && /set\s+search_path\s*=\s*public\s*,\s*pg_temp/.test(clean)) pass("atomic meal write function has safe security configuration");
  else fail("atomic meal write function has safe security configuration", "Atomic function must be SECURITY DEFINER with fixed search_path.");
  if (/auth\.uid\(\)/.test(clean) && !/\bp_user_id\b|\buser_id\s+uuid\s+default\b/.test(clean)) pass("atomic meal write function derives user from auth.uid only");
  else fail("atomic meal write function derives user from auth.uid only", "Atomic function must not accept caller-provided user identity.");
  if (/revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*;/.test(clean) && /revoke\s+all\s+on\s+function[\s\S]*from\s+anon\s*;/.test(clean) && /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated\s*;/.test(clean)) pass("atomic meal write function execute grants are bounded");
  else fail("atomic meal write function execute grants are bounded", "Atomic function must revoke public and anon execute, then grant authenticated execute.");
  if (!/\bexecute\s*\(/i.test(clean) && !/\bformat\s*\(/i.test(clean)) pass("atomic meal write function contains no dynamic SQL helpers");
  else fail("atomic meal write function contains no dynamic SQL helpers", "Atomic function must not use dynamic SQL.");
  if (/insert\s+into\s+public\.meal_records/.test(clean) && /insert\s+into\s+public\.meal_record_items/.test(clean)) pass("atomic meal write function inserts parent and items");
  else fail("atomic meal write function inserts parent and items", "Atomic function must insert parent and item rows in one function transaction.");
} else {
  fail("atomic meal write function migration exists", "Missing Phase 2D atomic meal write function migration.");
}

if (atomicDailySummaryPersistenceMigration) {
  const clean = atomicDailySummaryPersistenceMigration.clean.toLowerCase();
  if (/create\s+or\s+replace\s+function\s+public\.persist_authenticated_daily_nutrition_summary/.test(clean)) pass("atomic daily summary persistence function exists");
  else fail("atomic daily summary persistence function exists", "Phase 2K migration must create public.persist_authenticated_daily_nutrition_summary.");
  if (/security\s+definer/.test(clean) && /set\s+search_path\s*=\s*public\s*,\s*pg_temp/.test(clean)) pass("atomic daily summary function has safe security configuration");
  else fail("atomic daily summary function has safe security configuration", "Summary persistence function must be SECURITY DEFINER with fixed search_path.");
  if (/auth\.uid\(\)/.test(clean) && !/\bp_user_id\b|\buser_id\s+uuid\s+default\b/.test(clean)) pass("atomic daily summary function derives user from auth.uid only");
  else fail("atomic daily summary function derives user from auth.uid only", "Summary persistence function must not accept caller-provided user identity.");
  if (/on\s+conflict\s+\(user_id,\s*local_date,\s*timezone,\s*calculation_version\)\s+where\s+is_current\s*=\s*true\s+do\s+update\s+set/.test(clean)) pass("atomic daily summary function upserts current user/date summary");
  else fail("atomic daily summary function upserts current user/date summary", "Summary persistence function must upsert by the current summary identity.");
  if (/revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*;/.test(clean) && /revoke\s+all\s+on\s+function[\s\S]*from\s+anon\s*;/.test(clean) && /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated\s*;/.test(clean)) pass("atomic daily summary function execute grants are bounded");
  else fail("atomic daily summary function execute grants are bounded", "Summary persistence function must revoke public and anon execute, then grant authenticated execute.");
} else {
  fail("atomic daily summary persistence migration exists", "Missing Phase 2K atomic daily summary persistence migration.");
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

const consumerProfileReadPolicy = allActiveSql.match(/create\s+policy\s+consumer_profiles_owner_read\s+on\s+consumer_profiles\s+for\s+select(?:\s+to\s+([a-z_,\s]+?))?\s+using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)\s*;/i);
if (consumerProfileReadPolicy) pass("consumer_profiles owner read policy uses auth.uid equals user_id");
else fail("consumer_profiles owner read policy uses auth.uid equals user_id", "consumer_profiles_owner_read must remain a current-user SELECT policy using auth.uid() = user_id.");

const readPolicyRoles = consumerProfileReadPolicy?.[1]?.split(",").map((role) => role.trim().toLowerCase()).filter(Boolean) ?? ["public"];
if (readPolicyRoles.includes("authenticated") || readPolicyRoles.includes("public")) {
  pass("consumer_profiles owner read policy includes authenticated role", { roles: readPolicyRoles });
} else {
  fail("consumer_profiles owner read policy includes authenticated role", "consumer_profiles_owner_read must apply to authenticated users.", { roles: readPolicyRoles });
}

const consumerAuthFiles = walk(consumerAuthDir, (file) => file.endsWith(".ts"));
const consumerAuthText = consumerAuthFiles.map((file) => ({ rel: relative(file), text: read(file) }));
const runtimeUserProfileRefs = consumerAuthText.filter((item) => /\buser_profiles\b/.test(item.text)).map((item) => item.rel);
if (runtimeUserProfileRefs.length) fail("Phase 1D runtime no longer targets user_profiles", "Runtime source must not reference user_profiles.", { matches: runtimeUserProfileRefs });
else pass("Phase 1D runtime no longer targets user_profiles");

const contractText = read(path.join(consumerAuthDir, "supabaseProfileContracts.ts"));
if (/SUPABASE_CONSUMER_PROFILE_TABLE\s*=\s*"consumer_profiles"/.test(contractText)) pass("Phase 1D runtime table target is consumer_profiles");
else fail("Phase 1D runtime table target is consumer_profiles", "supabaseProfileContracts.ts must target consumer_profiles.");

const phase1dUnneededTables = consumerAuthText
  .filter((item) => /\b(consumer_preferences|taste_profiles)\b/.test(item.text))
  .map((item) => item.rel);
if (phase1dUnneededTables.length) fail("Phase 1D runtime does not require preference or taste tables", "Current live profile smoke must only require consumer_profiles reads.", { matches: phase1dUnneededTables });
else pass("Phase 1D runtime does not require preference or taste tables");

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

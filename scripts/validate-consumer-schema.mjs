import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const draftsDir = path.join(root, "docs", "supabase-consumer-schema-drafts");
const issues = [];
const warnings = [];
const objects = {
  types: new Set(),
  tables: new Set(),
  views: new Set(),
  functions: new Set(),
  indexes: new Set(),
  policies: new Set()
};

const requiredFiles = [
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
const requiredViews = ["consumer_public_profiles", "consumer_meal_record_owner_view", "restaurant_consumer_aggregate_metrics"];
const requiredIndexes = [
  "meal_records_user_occurred_idx",
  "nutrition_goals_one_active_per_user",
  "user_restaurant_ratings_one_current",
  "user_menu_item_ratings_one_current",
  "favorite_restaurants_one_active",
  "favorite_menu_items_one_active",
  "recommendation_feedback_idempotency_idx",
  "subscription_entitlements_user_idx",
  "planned_meals_conversion_idempotency_idx",
  "daily_nutrition_summaries_one_current"
];
const allowedExternalReferences = new Set(["auth.users"]);

function addIssue(file, kind, message) {
  issues.push({ file, kind, message });
}
function addWarning(file, kind, message) {
  if (!warnings.some((warning) => warning.file === file && warning.kind === kind && warning.message === message)) {
    warnings.push({ file, kind, message });
  }
}
function stripComments(sql) {
  return sql.replace(/--.*$/gm, "");
}
function matches(text, regex) {
  return [...text.matchAll(regex)];
}
function read(fileName) {
  return fs.readFileSync(path.join(draftsDir, fileName), "utf8");
}

if (!fs.existsSync(draftsDir)) {
  addIssue("docs/supabase-consumer-schema-drafts", "missing_directory", "Consumer schema draft directory is missing.");
}

const existingFiles = fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir).filter((name) => name.endsWith(".sql")).sort() : [];
for (const file of requiredFiles) {
  if (!existingFiles.includes(file)) addIssue(`docs/supabase-consumer-schema-drafts/${file}`, "missing_required_file", "Required draft SQL file is missing.");
}

const fileTexts = [];
for (const fileName of existingFiles) {
  const relativePath = `docs/supabase-consumer-schema-drafts/${fileName}`;
  const text = read(fileName);
  const clean = stripComments(text);
  fileTexts.push({ fileName, relativePath, text, clean });

  if (!text.startsWith("-- DRAFT ONLY")) addIssue(relativePath, "missing_draft_header", "Draft SQL file must begin with DRAFT ONLY warning.");
  const cleanWithoutPolicyUpdates = clean.replace(/for\s+update\s+using/gi, "for policy_update using");
  if (/\b(drop\s+table|truncate\s+table|insert\s+into|update\s+[a-z_]|delete\s+from)\b/i.test(cleanWithoutPolicyUpdates)) {
    addIssue(relativePath, "forbidden_active_data_operation", "Draft package must not contain data write/destructive operations.");
  }
  if (/production/i.test(clean) && !/do not apply to production/i.test(text)) {
    addWarning(relativePath, "production_reference", "Production is mentioned outside the standard draft warning; review wording.");
  }

  for (const match of matches(clean, /create\s+type\s+([a-z_][a-z0-9_]*)\s+as\s+enum/gi)) objects.types.add(match[1]);
  for (const match of matches(clean, /create\s+table\s+([a-z_][a-z0-9_]*)\s*\(/gi)) objects.tables.add(match[1]);
  for (const match of matches(clean, /create\s+view\s+([a-z_][a-z0-9_]*)\s+as/gi)) objects.views.add(match[1]);
  for (const match of matches(clean, /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)\s*\(/gi)) objects.functions.add(match[1]);
  for (const match of matches(clean, /create\s+(?:unique\s+)?index\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) objects.indexes.add(match[1]);
  for (const match of matches(clean, /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) objects.policies.add(match[1]);
}

const relationNames = new Set([...objects.tables, ...objects.views]);
for (const { relativePath, clean } of fileTexts) {
  for (const match of matches(clean, /\breferences\s+([a-z_][a-z0-9_\.]*)(?:\s*\(|\s|$)/gi)) {
    const target = match[1];
    const shortTarget = target.split(".").pop();
    if (!relationNames.has(shortTarget) && !allowedExternalReferences.has(target)) {
      addIssue(relativePath, "missing_fk_target", `Foreign key references missing relation: ${target}`);
    }
  }
  for (const match of matches(clean, /create\s+(?:unique\s+)?index\s+[a-z_][a-z0-9_]*\s+on\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!relationNames.has(match[1])) addIssue(relativePath, "missing_index_target", `Index targets missing relation: ${match[1]}`);
  }
  for (const match of matches(clean, /alter\s+table\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!relationNames.has(match[1])) addIssue(relativePath, "missing_alter_table_target", `ALTER TABLE targets missing relation: ${match[1]}`);
  }
  for (const match of matches(clean, /create\s+policy\s+[a-z_][a-z0-9_]*\s+on\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!relationNames.has(match[1])) addIssue(relativePath, "missing_policy_target", `Policy targets missing relation: ${match[1]}`);
  }
  for (const fn of matches(clean, /\b(auth\.(?:uid|jwt))\s*\(/gi)) {
    addWarning(relativePath, "supabase_auth_dependency", `Uses Supabase auth helper ${fn[1]}(); requires Supabase environment or test stub.`);
  }
}

for (const table of requiredTables) {
  if (!objects.tables.has(table)) addIssue("consumer schema", "missing_required_table", `Missing table: ${table}`);
}
for (const view of requiredViews) {
  if (!objects.views.has(view)) addIssue("consumer schema", "missing_required_view", `Missing view: ${view}`);
}
for (const index of requiredIndexes) {
  if (!objects.indexes.has(index)) addIssue("consumer schema", "missing_required_index", `Missing index: ${index}`);
}

const allText = fileTexts.map((item) => item.clean).join("\n");
const requiredFragments = [
  ["profile_id text not null unique", "profile_id canonical product identity"],
  ["user_id uuid not null references auth.users", "auth ownership user_id references"],
  ["deletion_requested", "account lifecycle deletion_requested state"],
  ["anonymizing", "account lifecycle anonymizing state"],
  ["nutrition_snapshot jsonb", "meal item nutrition snapshot"],
  ["nutrition_schema_version text not null", "nutrition snapshot schema version"],
  ["source_entity_version text", "nutrition source entity version"],
  ["occurred_at timestamptz not null", "meal event timestamp snapshot"],
  ["consumed_ratio >= 0 and consumed_ratio <= 1", "consumed ratio constraint"],
  ["converted_meal_record_id uuid references meal_records", "planned meal conversion target"],
  ["conversion_idempotency_key text", "planned meal conversion idempotency"],
  ["calculation_version text not null", "daily summary calculation version"],
  ["source_cutoff_at timestamptz", "daily summary source cutoff"],
  ["recalculated_at timestamptz", "daily summary recalculation timestamp"],
  ["is_current boolean not null default true", "current daily summary marker"],
  ["policy_version text not null", "consent policy version"],
  ["withdrawn_at timestamptz", "consent withdrawal timestamp"],
  ["plan_code text not null", "subscription entitlement plan code"],
  ["source_dataset_version text not null", "legacy dataset version"],
  ["source_row_checksum text", "legacy row checksum"],
  ["having count(distinct user_id) >= 10", "aggregate privacy threshold"],
  ["recommendation_feedback_entity_present", "recommendation entity reference constraint"]
];
for (const [fragment, label] of requiredFragments) {
  if (!allText.includes(fragment)) addIssue("consumer schema", "missing_required_fragment", `Missing ${label}: ${fragment}`);
}

const docs = [
  "docs/consumer-canonical-data-mapping.md",
  "docs/consumer-schema-decision-register.md",
  "docs/consumer-schema-status-enum-mapping.md",
  "docs/consumer-schema-phase-1-1-freeze-review.md",
  "docs/consumer-schema-migration-order.md",
  "docs/consumer-schema-rls-matrix.md",
  "docs/consumer-schema-privacy-classification.md",
  "docs/consumer-schema-validation-plan.md",
  "docs/consumer-schema-runtime-handoff.md",
  "docs/consumer-schema-freeze-manifest.md"
];
for (const doc of docs) {
  if (!fs.existsSync(path.join(root, doc))) addIssue(doc, "missing_required_doc", "Required consumer mapping document is missing.");
}

const result = {
  filesReviewed: existingFiles.length,
  requiredFiles: requiredFiles.length,
  objectCounts: {
    types: objects.types.size,
    tables: objects.tables.size,
    views: objects.views.size,
    functions: objects.functions.size,
    indexes: objects.indexes.size,
    policies: objects.policies.size
  },
  issues,
  warnings
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;

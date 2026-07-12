import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const draftsDir = path.join(root, "docs", "supabase-schema-drafts");
const files = fs.readdirSync(draftsDir).filter((name) => name.endsWith(".sql")).sort();
const objects = {
  types: new Set(),
  tables: new Set(),
  views: new Set(),
  materializedViews: new Set(),
  functions: new Set(),
  indexes: new Set(),
  policies: new Set()
};
const issues = [];
const warnings = [];
const fileTexts = [];

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

function addIssue(file, kind, message) {
  issues.push({ file, kind, message });
}

function addWarning(file, kind, message) {
  warnings.push({ file, kind, message });
}

function findMatches(text, regex) {
  return [...text.matchAll(regex)];
}

for (const fileName of files) {
  const relativePath = `docs/supabase-schema-drafts/${fileName}`;
  const text = fs.readFileSync(path.join(draftsDir, fileName), "utf8");
  const clean = stripComments(text);
  fileTexts.push({ file: relativePath, text, clean });

  for (const match of findMatches(clean, /create\s+type\s+([a-z_][a-z0-9_]*)\s+as\s+enum/gi)) objects.types.add(match[1]);
  for (const match of findMatches(clean, /create\s+table\s+([a-z_][a-z0-9_]*)\s*\(/gi)) objects.tables.add(match[1]);
  for (const match of findMatches(clean, /create\s+view\s+([a-z_][a-z0-9_]*)\s+as/gi)) objects.views.add(match[1]);
  for (const match of findMatches(clean, /create\s+materialized\s+view\s+([a-z_][a-z0-9_]*)\s+as/gi)) objects.materializedViews.add(match[1]);
  for (const match of findMatches(clean, /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) objects.functions.add(match[1]);
  for (const match of findMatches(clean, /create\s+(?:unique\s+)?index\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) objects.indexes.add(match[1]);
  for (const match of findMatches(clean, /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)/gi)) objects.policies.add(match[1]);
}

const relationNames = new Set([...objects.tables, ...objects.views, ...objects.materializedViews]);
const allowedExternalReferences = new Set(["auth.uid", "auth.jwt"]);

for (const { file, text, clean } of fileTexts) {
  if (!text.startsWith("-- DRAFT ONLY")) {
    addWarning(file, "missing_draft_header", "Draft SQL file should begin with the DRAFT ONLY warning.");
  }

  for (const match of findMatches(clean, /references\s+([a-z_][a-z0-9_\.]*)(?:\s*\(|\s|$)/gi)) {
    const target = match[1].split(".").pop();
    if (!relationNames.has(target)) addIssue(file, "missing_fk_target", `Foreign key references missing relation: ${match[1]}`);
  }

  for (const match of findMatches(clean, /create\s+(?:unique\s+)?index\s+[a-z_][a-z0-9_]*\s+on\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!relationNames.has(match[1])) addIssue(file, "missing_index_target", `Index targets missing relation: ${match[1]}`);
  }

  for (const match of findMatches(clean, /alter\s+table\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!relationNames.has(match[1])) addIssue(file, "missing_alter_table_target", `ALTER TABLE targets missing relation: ${match[1]}`);
  }

  for (const match of findMatches(clean, /create\s+policy\s+[a-z_][a-z0-9_]*\s+on\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!relationNames.has(match[1])) addIssue(file, "missing_policy_target", `Policy targets missing relation: ${match[1]}`);
  }

  if (file.endsWith("012_views.sql") || file.endsWith("015_validation_queries.sql")) {
    for (const match of findMatches(clean, /(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)) {
      const target = match[1];
      if (!relationNames.has(target)) addIssue(file, "missing_query_relation", `Query references missing relation: ${target}`);
    }
  }

  for (const fn of findMatches(clean, /\b(auth\.(?:uid|jwt))\s*\(/gi)) {
    if (allowedExternalReferences.has(fn[1])) addWarning(file, "supabase_auth_dependency", `Uses Supabase auth helper ${fn[1]}(); requires Supabase environment or test stub.`);
  }

  if (/security\s+definer/i.test(clean)) {
    addWarning(file, "security_definer_present", "SECURITY DEFINER appears in draft SQL; external security review required.");
  }
}

const textByName = Object.fromEntries(fileTexts.map((item) => [item.file, item.text]));
if (!/create\s+type\s+nutrition_badge_status\s+as\s+enum/i.test(textByName["docs/supabase-schema-drafts/002_enums_and_lookup_tables.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/002_enums_and_lookup_tables.sql", "missing_nutrition_badge_enum", "nutrition_badge_status enum is required by menu_items.");
}
if (/nutrition_badge_status\s+nutrition_verification_status/i.test(textByName["docs/supabase-schema-drafts/005_menus_and_menu_items.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/005_menus_and_menu_items.sql", "wrong_nutrition_badge_type", "menu_items.nutrition_badge_status must not use nutrition_verification_status.");
}
if (!/create\s+unique\s+index\s+menu_item_nutrition_one_current_per_item/i.test(textByName["docs/supabase-schema-drafts/006_ingredients_and_nutrition.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/006_ingredients_and_nutrition.sql", "missing_current_nutrition_constraint", "Current nutrition partial unique index is required.");
}
if (!/anonymous_id\s+text/i.test(textByName["docs/supabase-schema-drafts/009_analytics_events.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/009_analytics_events.sql", "missing_anonymous_id", "analytics_events should include anonymous_id.");
}
if (!/event_idempotency_key\s+text/i.test(textByName["docs/supabase-schema-drafts/009_analytics_events.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/009_analytics_events.sql", "missing_idempotency_key", "analytics_events should include event_idempotency_key.");
}
if (!/user_id\s+is\s+not\s+null\s+or\s+anonymous_id\s+is\s+not\s+null/i.test(textByName["docs/supabase-schema-drafts/009_analytics_events.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/009_analytics_events.sql", "missing_actor_context_constraint", "analytics_events should enforce actor context or admin/server exception.");
}
if (!/source_dataset_version\s+text\s+not\s+null/i.test(textByName["docs/supabase-schema-drafts/014_seed_mapping_strategy.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/014_seed_mapping_strategy.sql", "missing_dataset_version", "legacy_entity_mappings should include source_dataset_version.");
}
if (!/source_row_checksum\s+text/i.test(textByName["docs/supabase-schema-drafts/014_seed_mapping_strategy.sql"] ?? "")) {
  addIssue("docs/supabase-schema-drafts/014_seed_mapping_strategy.sql", "missing_row_checksum", "legacy_entity_mappings should include source_row_checksum.");
}

const result = {
  filesReviewed: files.length,
  objectCounts: {
    types: objects.types.size,
    tables: objects.tables.size,
    views: objects.views.size,
    materializedViews: objects.materializedViews.size,
    functions: objects.functions.size,
    indexes: objects.indexes.size,
    policies: objects.policies.size
  },
  issues,
  warnings
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;

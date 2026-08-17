#!/usr/bin/env node
// SR-2C-R1 meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Three families: the SQL AUTHORITY (schema + data + projection) mutated as text, the pure
// AGGREGATION behaviour mutated through an executable model, and the SETTINGS/CARD OWNERSHIP
// boundary mutated so a snapshot design cannot pass as a settings design.
import fs from "node:fs";
import path from "node:path";
import {
  SR2CR1_DATA_MIGRATION, SR2CR1_MAX_FOOD, SR2CR1_MAX_GENERAL,
  SR2CR1_PROJECTION_MIGRATION, SR2CR1_SCHEMA_MIGRATION
} from "./social-interest-sr2c-r1-successor-manifest.mjs";

const root = process.cwd();
const sqlExec = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const readSql = (f) => sqlExec(fs.readFileSync(path.join(root, f), "utf8"));
const SCHEMA = readSql(SR2CR1_SCHEMA_MIGRATION);
const DATA = readSql(SR2CR1_DATA_MIGRATION);
const PROJECTION = readSql(SR2CR1_PROJECTION_MIGRATION);

function sqlViolations({ schema, data, projection }) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const all = `${schema}\n${data}\n${projection}`;

  rec("the catalog is a table, never a PostgreSQL enum", /create table public\.social_interest_catalog/.test(schema) && !/as enum/i.test(all));
  rec("identity is the stable machine key", /tag_key text primary key/.test(schema));
  rec("hierarchy is a self-referencing parent with a depth", /parent_key text references public\.social_interest_catalog\(tag_key\)/.test(schema) && /depth integer not null/.test(schema));
  rec("the two namespaces are constrained and separate", /check \(namespace in \('general', 'food'\)\)/.test(schema));
  rec("selection namespace is pinned by referential integrity", /foreign key \(tag_key, namespace\)/.test(schema));
  // The trailing paren matters: without it a renamed table such as `..._label_removed` would still
  // satisfy the prefix and the mutant would survive.
  rec("labels are separated from identity", /create table public\.social_interest_catalog_label \(/.test(schema));
  rec("the actor comes from authentication only", /auth\.uid\(\)/.test(schema) && !/p_user_id|p_owner_user_id/.test(schema));
  rec("the general limit is eight and the food limit is five",
    new RegExp(`when 'general' then ${SR2CR1_MAX_GENERAL} else ${SR2CR1_MAX_FOOD} end`).test(schema));
  rec("a limit breach is rejected", /SOCIAL_INTEREST_LIMIT_EXCEEDED/.test(schema));
  rec("unknown, inactive, non-selectable and cross-namespace keys are rejected",
    /c\.active/.test(schema) && /c\.selectable/.test(schema) && /c\.namespace = v_namespace/.test(schema));
  rec("inputs are deduplicated before any write", /array_agg\(distinct/.test(schema));
  rec("duplicate canonical rows are impossible", /primary key \(user_id, tag_key\)/.test(schema));
  rec("direct client writes stay closed", /revoke insert, update, delete on table public\.social_profile_interest_selection from public, anon, authenticated;/.test(schema));
  rec("a null or empty request clears rather than fabricating a default", /coalesce\(p_tag_keys, '\{\}'::text\[\]\)/.test(schema));
  rec("top categories are never selectable", !/, 0, true,/.test(data));
  rec("fine tags are always selectable", !/, 1, false,/.test(data));
  rec("the frozen SR-2C primitive is not redefined", !/project_exposed_social_profiles/.test(all));
  rec("the interest primitive is denied to every client role",
    ["anon", "authenticated", "service_role"].every((r) =>
      new RegExp(`revoke all on function social_internal\\.project_public_social_interests\\(uuid, uuid\\[\\]\\) from ${r};`).test(projection)));
  rec("only the executor receives EXECUTE", /to social_runtime_executor;/.test(projection));
  rec("the projection re-checks the canonical candidate pool", /canonical_candidate_pool\(p_actor_user_id\)/.test(projection));
  rec("the projection reads the current selection table", /join public\.social_profile_interest_selection as selection/.test(projection));
  rec("no migration references meal_buddy_cards", !/meal_buddy_cards/.test(all));
  rec("no snapshot or override concept exists", !/interest_snapshot|cardInterestOverride|interestAtCardCreation/i.test(all));
  rec("no Taste, meal or favorite source is referenced", !/taste_profiles|preferred_cuisine_tags|meal_records|favorite_restaurants/.test(all));
  rec("no restriction, allergy or health source is referenced", !/dietary_restriction|allerg|health_notes|nutrition_goal/i.test(all));
  rec("interests never reach ranking", !/rank_score|similarity|jaccard|cosine/i.test(all));
  rec("interests never reach eligibility", !/dining_date|meal_period|canonical_meal_buddy_candidate_cards/.test(all));
  rec("interests never reach exposure or entitlement", !/subscription_entitlements|entitlement/i.test(all));
  rec("every transient grantor borrow is restored by grantor",
    (projection.match(/grant \w+ to postgres with inherit false, set true;/g) ?? []).length ===
    (projection.match(/revoke \w+ from postgres granted by postgres;/g) ?? []).length);
  rec("the proven-incorrect WITH SET FALSE restoration is never used", !/with set false/i.test(all));
  rec("transient schema CREATE is revoked again", /revoke create on schema social_internal from social_profile_projection_authority;/.test(projection));
  return failed;
}

// --- executable aggregation model ------------------------------------------------------------------
const ROWS = Object.freeze([
  { namespace: "general", tag_key: "g.a.movie", category_key: "g.a", display_order: 101 },
  { namespace: "general", tag_key: "g.a.anime", category_key: "g.a", display_order: 103 },
  { namespace: "general", tag_key: "g.b.console", category_key: "g.b", display_order: 203 },
  { namespace: "general", tag_key: "g.c.fitness", category_key: "g.c", display_order: 301 },
  { namespace: "general", tag_key: "g.d.photo", category_key: "g.d", display_order: 601 },
  { namespace: "food", tag_key: "f.a.sushi", category_key: "f.a", display_order: 202 }
]);

function aggregate(rows, rules) {
  const ordered = [...rows].sort((l, r) => l.display_order - r.display_order || l.tag_key.localeCompare(r.tag_key));
  const general = ordered.filter((r) => rules.mergeNamespaces || r.namespace === "general");
  const tags = rules.truncateCanonical ? general.slice(0, 3) : general;
  const cats = [];
  const seen = new Set();
  for (const t of tags) {
    if (!rules.allowDuplicateCategories && seen.has(t.category_key)) continue;
    seen.add(t.category_key);
    cats.push(t.category_key);
  }
  const visible = cats.slice(0, rules.compactVisible);
  return {
    tags: tags.map((t) => t.tag_key),
    categories: cats,
    visible,
    overflow: rules.persistOverflowLabel ? `+${Math.max(cats.length - rules.compactVisible, 0)}` : Math.max(cats.length - rules.compactVisible, 0)
  };
}

const AGG_CANONICAL = Object.freeze({
  mergeNamespaces: false, truncateCanonical: false, allowDuplicateCategories: false,
  compactVisible: 3, persistOverflowLabel: false
});

function aggViolations(rules) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const out = aggregate(ROWS, rules);
  rec("the general namespace is not merged with food", !out.tags.some((t) => t.startsWith("f.")));
  rec("canonical fine tags are not truncated", out.tags.length === 5);
  rec("top categories are unique", new Set(out.categories).size === out.categories.length);
  rec("the compact line shows at most three categories", out.visible.length <= 3);
  rec("the compact line shows exactly the first three", JSON.stringify(out.visible) === JSON.stringify(["g.a", "g.b", "g.c"]));
  rec("overflow is a derived number, never a persisted label", typeof out.overflow === "number" && out.overflow === 1);
  return failed;
}

// --- executable settings/card ownership model ---------------------------------------------------------
function presentation(rules) {
  const card = { id: "card-1", dining_date: "2026-08-21", ...(rules.cardStoresInterests ? { interest_tags: ["movie"] } : {}) };
  const settings = { general: ["photography"] };
  const shown = rules.readFromCard ? (card.interest_tags ?? []) : settings.general;
  return { card, shown, recreatedCard: rules.requiresRecreation };
}
function ownershipViolations(rules) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const out = presentation(rules);
  rec("the card stores no interest field", !Object.keys(out.card).some((k) => /interest/i.test(k)));
  rec("presentation reads current settings, not the card", out.shown[0] === "photography");
  rec("no card recreation is required after a settings change", out.recreatedCard === false);
  return failed;
}
const OWN_CANONICAL = Object.freeze({ cardStoresInterests: false, readFromCard: false, requiresRecreation: false });

// --- mutants ----------------------------------------------------------------------------------------------
const sqlMutants = [
  ["catalog options become a PostgreSQL enum", (s) => ({ ...s, schema: s.schema.replace("create table public.social_interest_catalog", "create type social_interest_option as enum ('movie');\ncreate table public.social_interest_catalog") })],
  ["arbitrary free-form strings are accepted", (s) => ({ ...s, schema: s.schema.replace(/and c\.active\n/, "") })],
  ["inactive tags become selectable", (s) => ({ ...s, schema: s.schema.replace("      and c.active\n", "") })],
  ["non-selectable categories become selectable", (s) => ({ ...s, schema: s.schema.replace("      and c.selectable\n", "") })],
  ["the namespaces are merged", (s) => ({ ...s, schema: s.schema.replace("      and c.namespace = v_namespace\n", "") })],
  ["the general limit is raised", (s) => ({ ...s, schema: s.schema.replace(`then ${SR2CR1_MAX_GENERAL} else`, "then 20 else") })],
  ["the food limit is raised", (s) => ({ ...s, schema: s.schema.replace(`else ${SR2CR1_MAX_FOOD} end`, "else 20 end") })],
  ["the limit check is removed entirely", (s) => ({ ...s, schema: s.schema.replace(/raise exception 'SOCIAL_INTEREST_LIMIT_EXCEEDED'[^;]*;/, "null;") })],
  ["a caller-supplied owner replaces auth.uid()", (s) => ({ ...s, schema: s.schema.replace("v_user_id uuid := auth.uid();", "v_user_id uuid := p_user_id;") })],
  ["duplicate inputs are no longer deduplicated", (s) => ({ ...s, schema: s.schema.replace("array_agg(distinct", "array_agg(") })],
  ["duplicate canonical rows become possible", (s) => ({ ...s, schema: s.schema.replace("primary key (user_id, tag_key),", "") })],
  ["direct client writes are opened", (s) => ({ ...s, schema: s.schema.replace("revoke insert, update, delete on table public.social_profile_interest_selection from public, anon, authenticated;", "grant insert, update, delete on table public.social_profile_interest_selection to authenticated;") })],
  ["referential namespace integrity is dropped", (s) => ({ ...s, schema: s.schema.replace(/foreign key \(tag_key, namespace\)[\s\S]*?on delete restrict/, "") })],
  ["labels become identity", (s) => ({ ...s, schema: s.schema.replace("create table public.social_interest_catalog_label", "create table public.social_interest_catalog_label_removed") })],
  ["interests are stored on meal_buddy_cards", (s) => ({ ...s, schema: s.schema.replace("commit;", "alter table public.meal_buddy_cards add column interest_tags text[];\n\ncommit;") })],
  ["an interest snapshot is taken at card creation", (s) => ({ ...s, schema: s.schema.replace("commit;", "create table public.meal_buddy_card_interest_snapshot (card_id uuid, tag_key text);\n\ncommit;") })],
  ["the projection reads a card override instead of current settings", (s) => ({ ...s, projection: s.projection.replace("join public.social_profile_interest_selection as selection", "join public.cardInterestOverride as selection") })],
  ["interests are derived from Taste", (s) => ({ ...s, projection: s.projection.replace("join public.social_profile_interest_selection as selection", "join public.taste_profiles as selection") })],
  ["interests are derived from meal history", (s) => ({ ...s, projection: s.projection.replace("join public.social_profile_interest_selection as selection", "join public.meal_records as selection") })],
  ["interests are derived from favorites", (s) => ({ ...s, projection: s.projection.replace("join public.social_profile_interest_selection as selection", "join public.favorite_restaurants as selection") })],
  ["interests are derived from dietary restrictions", (s) => ({ ...s, projection: s.projection.replace("join public.social_profile_interest_selection as selection", "join public.dietary_restriction as selection") })],
  ["interests feed ranking", (s) => ({ ...s, projection: s.projection.replace("catalog.display_order", "catalog.display_order as rank_score") })],
  ["interests feed Meal Buddy eligibility", (s) => ({ ...s, projection: s.projection.replace("where catalog.active", "where catalog.active and selection.tag_key in (select meal_period from public.meal_buddy_cards)") })],
  ["interests feed exposure entitlement", (s) => ({ ...s, projection: s.projection.replace("where catalog.active", "where catalog.active and exists (select 1 from public.subscription_entitlements)") })],
  ["a client role is granted EXECUTE on the primitive", (s) => ({ ...s, projection: s.projection.replace(/revoke all on function social_internal\.project_public_social_interests\(uuid, uuid\[\]\) from authenticated;\n/, "") })],
  ["the candidate pool re-check is removed", (s) => ({ ...s, projection: s.projection.replace(/canonical_candidate_pool\(p_actor_user_id\)/, "unnest(p_candidate_user_ids)") })],
  ["a transient borrow is left unrestored", (s) => ({ ...s, projection: s.projection.replace("revoke social_profile_projection_authority from postgres granted by postgres;", "") })],
  ["restoration uses the proven-incorrect WITH SET FALSE form", (s) => ({ ...s, projection: s.projection.replace("revoke social_profile_projection_authority from postgres granted by postgres;", "grant social_profile_projection_authority to postgres with set false;") })],
  ["transient schema CREATE is left in place", (s) => ({ ...s, projection: s.projection.replace("revoke create on schema social_internal from social_profile_projection_authority;", "") })],
  ["the frozen SR-2C primitive is redefined", (s) => ({ ...s, projection: s.projection.replace("commit;", "create or replace function social_internal.project_exposed_social_profiles(uuid, uuid[]) returns void language sql as $x$ select $x$;\n\ncommit;") })],
  ["a top category becomes selectable", (s) => ({ ...s, data: s.data.replace(", 0, false,", ", 0, true,") })],
  ["a fine tag becomes non-selectable", (s) => ({ ...s, data: s.data.replace(", 1, true,", ", 1, false,") })]
];

const aggMutants = [
  ["the namespaces are merged", { mergeNamespaces: true }],
  ["canonical fine tags are truncated to three", { truncateCanonical: true }],
  ["duplicate top categories are emitted", { allowDuplicateCategories: true }],
  ["the compact line shows more than three categories", { compactVisible: 5 }],
  ["the overflow marker is persisted as a '+N' label", { persistOverflowLabel: true }]
];

const ownMutants = [
  ["interests are stored on the card", { cardStoresInterests: true, readFromCard: true }],
  ["presentation reads the card snapshot instead of current settings", { readFromCard: true }],
  ["a settings change requires card recreation", { requiresRecreation: true }]
];

const results = [];
const push = (name, applied, failed) => {
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
};

for (const [label, value, fn] of [
  ["canonical SQL authority satisfies the exact SR-2C-R1 contract", { schema: SCHEMA, data: DATA, projection: PROJECTION }, sqlViolations],
  ["canonical aggregation satisfies the exact SR-2C-R1 contract", AGG_CANONICAL, aggViolations],
  ["canonical settings ownership satisfies the exact SR-2C-R1 contract", OWN_CANONICAL, ownershipViolations]
]) {
  const failed = fn(value);
  results.push({ name: label, applied: true, killed: failed.length === 0, status: failed.length === 0 ? "killed" : "survived", violations: failed });
  if (failed.length) console.log(`BASELINE BROKEN ${label}: ${failed.join(" | ")}`);
}

const BASE = { schema: SCHEMA, data: DATA, projection: PROJECTION };
for (const [name, apply] of sqlMutants) {
  const mutated = apply(BASE);
  const applied = JSON.stringify(mutated) !== JSON.stringify(BASE);
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  push(name, applied, applied ? sqlViolations(mutated) : ["mutation did not apply"]);
}
for (const [name, override] of aggMutants) push(name, true, aggViolations({ ...AGG_CANONICAL, ...override }));
for (const [name, override] of ownMutants) push(name, true, ownershipViolations({ ...OWN_CANONICAL, ...override }));

const survivors = results.filter((r) => r.status === "survived");
console.log(JSON.stringify({
  suite: "social-interest-sr2c-r1-mutations",
  total: results.length, killed: results.length - survivors.length, survived: survivors.length,
  survivors, repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260828010000_candidate_taste_data_authority.sql";
const contractPath = "packages/shared/src/domain/candidate-taste/candidateTasteAuthority.ts";
let sql = fs.readFileSync(path.join(root, migrationPath), "utf8");
let contractSource = fs.readFileSync(path.join(root, contractPath), "utf8");
const mutation = process.env.RECBP0_MUTATION ?? "";
const TARGET_NOT_FOUND = 97;

const mutate = (target, replacement, surface = "sql") => {
  const source = surface === "sql" ? sql : contractSource;
  if (!source.includes(target)) process.exit(TARGET_NOT_FOUND);
  if (surface === "sql") sql = source.replace(target, replacement);
  else contractSource = source.replace(target, replacement);
};

switch (mutation) {
  case "drop_spice_facet":
    mutate('  "spice"\n] as const', '  \n] as const', "contract");
    break;
  case "allow_free_value":
    mutate("value_key ~ '^[a-z0-9][a-z0-9._-]{0,126}$'", "value_key ~ '.*'");
    break;
  case "allow_ai_provenance":
    mutate("  'canonical_mapping'\n);", "  'canonical_mapping',\n  'ai_estimated'\n);");
    break;
  case "allow_missing_source":
    mutate("source_reference text not null", "source_reference text");
    break;
  case "allow_dual_scope":
    mutate("(menu_item_id is not null)::integer = 1", "(menu_item_id is not null)::integer >= 1");
    break;
  case "reverse_scope_precedence":
    mutate("where eligible.menu_scoped\n   or not exists (", "where not eligible.menu_scoped\n   or not exists (");
    break;
  case "per_value_precedence":
    // The pre-decision behaviour: scopes mix for one facet whenever the values differ.
    mutate("       and specific.facet_key = eligible.facet_key", "       and specific.value_key = eligible.value_key");
    break;
  case "collapse_multi_value":
    mutate("select distinct on (eligible.candidate_id, eligible.facet_key, eligible.value_key)",
      "select distinct on (eligible.candidate_id, eligible.facet_key)");
    break;
  case "expose_anon":
    mutate("to authenticated;", "to anon;", "sql");
    break;
  case "collapse_unknown":
    mutate("knownFacetKeys.length === 0", "knownFacetKeys.length < 0", "contract");
    break;
  case "leak_private_taste":
    mutate("from public.consumer_public_next_meal_candidates_v1 as candidate", "from public.consumer_public_next_meal_candidates_v1 as candidate\njoin public.taste_profiles on true");
    break;
  case "introduce_rank":
    contractSource += "\nexport const tasteScore = 1;\n";
    break;
  case "":
    break;
  default:
    throw new Error(`unknown mutation ${mutation}`);
}

const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const { outputText } = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: path.join(root, contractPath)
});
const module = { exports: {} };
new Function("require", "module", "exports", outputText)(require_, module, module.exports);
const authority = module.exports;

expect(JSON.stringify(authority.CANDIDATE_TASTE_FACET_KEYS) === JSON.stringify(["cuisine", "flavor", "meal_type", "spice"]),
  "A1 the runtime facet vocabulary is the exact deterministic four-facet set", authority.CANDIDATE_TASTE_FACET_KEYS);
expect(authority.CANDIDATE_TASTE_TAXONOMY_VERSION === "candidate-taste-v1",
  "A2 taxonomy identity is stable and versioned");
expect(JSON.stringify(authority.CANDIDATE_TASTE_PROVENANCE_VALUES) === JSON.stringify([
  "restaurant_verified", "admin_verified", "provider_imported", "canonical_mapping"
]), "A3 runtime provenance is a closed non-AI vocabulary", authority.CANDIDATE_TASTE_PROVENANCE_VALUES);

const unknown = authority.classifyCandidateTasteCoverage([]);
const partial = authority.classifyCandidateTasteCoverage(["meal_type", "not_a_facet", "meal_type"]);
const mapped = authority.classifyCandidateTasteCoverage(["spice", "cuisine", "meal_type", "flavor"]);
expect(unknown.mappingState === "unknown" && unknown.knownFacetKeys.length === 0
  && JSON.stringify(unknown.unknownFacetKeys) === JSON.stringify(["cuisine", "flavor", "meal_type", "spice"]),
  "B1 no facts is explicit unknown coverage", unknown);
expect(partial.mappingState === "partial"
  && JSON.stringify(partial.knownFacetKeys) === JSON.stringify(["meal_type"])
  && !partial.knownFacetKeys.includes("not_a_facet"),
  "B2 partial coverage ignores uncontrolled values and deduplicates facets", partial);
expect(mapped.mappingState === "mapped" && mapped.unknownFacetKeys.length === 0,
  "B3 all four facets is mapped coverage", mapped);
expect(Object.isFrozen(mapped) && Object.isFrozen(mapped.knownFacetKeys) && Object.isFrozen(mapped.unknownFacetKeys),
  "B4 coverage results are immutable");

expect(/value_key ~ '\^\[a-z0-9\]\[a-z0-9\._-\]\{0,126\}\$'/.test(sql),
  "C1 arbitrary free-text value identity is rejected");
expect(sql.includes("(restaurant_id is not null)::integer + (menu_item_id is not null)::integer = 1"),
  "C2 a fact has exactly one mapping scope");
expect(/source_reference text not null/.test(sql) && /provenance public\.candidate_taste_provenance not null/.test(sql),
  "C3 a fact cannot be known without provenance and evidence reference");
expect(!/candidate_taste_provenance as enum \([\s\S]{0,180}ai_estimated/.test(sql),
  "C4 AI estimation is not approved fact provenance");
expect(/where eligible\.menu_scoped\s+or not exists \(/.test(sql)
  && /specific\.facet_key = eligible\.facet_key/.test(sql)
  && /specific\.menu_scoped/.test(sql)
  && !/specific\.value_key = eligible\.value_key/.test(sql),
  "C5 any menu mapping for a facet suppresses every restaurant mapping for that same facet");
expect(/distinct on \(eligible\.candidate_id, eligible\.facet_key, eligible\.value_key\)/.test(sql)
  && !/distinct on \(eligible\.candidate_id, eligible\.facet_key\)/.test(sql),
  "C5b the winning scope still carries several distinct values for one facet");
expect((sql.match(/grant select on public\.consumer_public_next_meal_candidate_taste_[a-z_0-9]+ to authenticated/g) ?? []).length === 2
  && !/grant select on public\.consumer_public_next_meal_candidate_taste_[a-z_0-9]+ to anon/.test(sql),
  "C6 both additive projections are authenticated-only");
expect(!/(?:join|from) public\.(?:taste_profiles|consumer_profiles|social_profile_interest_selection)/i.test(
  sql.slice(sql.indexOf("create view public.consumer_public_next_meal_candidate_taste_facts_v1"))),
  "C7 projections read no private Taste or Social profile source");
expect(!/tasteScore|tasteRank|similarityScore/i.test(contractSource + "\n" + sql),
  "C8 P0 contains no user-to-meal score or rank contract");

// Independent deterministic model of the normalized projection contract. This is deliberately not
// recommendation logic: it only expands restaurant/menu facts onto fixed canonical candidates.
const candidates = [
  { candidateId: "offer-a-1", restaurantId: "r-a", branchId: "b-1", menuItemId: "m-full" },
  { candidateId: "offer-a-2", restaurantId: "r-a", branchId: "b-2", menuItemId: "m-full" },
  { candidateId: "offer-a-3", restaurantId: "r-a", branchId: "b-1", menuItemId: "m-partial" },
  { candidateId: "offer-b-1", restaurantId: "r-b", branchId: "b-3", menuItemId: "m-unknown" },
  // The three worked examples of the frozen precedence decision.
  { candidateId: "offer-c-1", restaurantId: "r-c", branchId: "b-4", menuItemId: "m-conflict" },
  { candidateId: "offer-c-2", restaurantId: "r-c", branchId: "b-4", menuItemId: "m-silent" }
];
const mappings = [
  { scope: "restaurant", target: "r-a", facetKey: "cuisine", valueKey: "cuisine.fixture", provenance: "restaurant_verified", sourceReference: "fixture:r-a" },
  { scope: "restaurant", target: "r-a", facetKey: "spice", valueKey: "spice.medium", provenance: "provider_imported", sourceReference: "fixture:provider" },
  { scope: "menu_item", target: "m-full", facetKey: "cuisine", valueKey: "cuisine.fixture", provenance: "admin_verified", sourceReference: "fixture:m-full" },
  { scope: "menu_item", target: "m-full", facetKey: "flavor", valueKey: "flavor.savory", provenance: "canonical_mapping", sourceReference: "fixture:flavor" },
  { scope: "menu_item", target: "m-full", facetKey: "meal_type", valueKey: "lunch", provenance: "restaurant_verified", sourceReference: "fixture:meal" },
  { scope: "menu_item", target: "m-partial", facetKey: "meal_type", valueKey: "dinner", provenance: "restaurant_verified", sourceReference: "fixture:partial" },
  // r-c: a differing single value, and a multi-value menu facet over a single-value restaurant facet.
  { scope: "restaurant", target: "r-c", facetKey: "meal_type", valueKey: "lunch", provenance: "canonical_mapping", sourceReference: "fixture:r-c-meal" },
  { scope: "restaurant", target: "r-c", facetKey: "cuisine", valueKey: "cuisine.japanese", provenance: "canonical_mapping", sourceReference: "fixture:r-c-cuisine" },
  { scope: "menu_item", target: "m-conflict", facetKey: "meal_type", valueKey: "dinner", provenance: "admin_verified", sourceReference: "fixture:m-conflict-meal" },
  { scope: "menu_item", target: "m-conflict", facetKey: "cuisine", valueKey: "cuisine.fusion", provenance: "admin_verified", sourceReference: "fixture:m-conflict-a" },
  { scope: "menu_item", target: "m-conflict", facetKey: "cuisine", valueKey: "cuisine.modern_japanese", provenance: "admin_verified", sourceReference: "fixture:m-conflict-b" }
];
// FACET-LEVEL SPECIFICITY. Any menu mapping for a facet suppresses every restaurant mapping for that
// same facet; a facet the menu is silent about inherits. Within the winning scope several distinct
// values survive and duplicates collapse.
const factsFor = (candidate) => {
  const applicable = mappings.filter((mapping) => mapping.scope === "menu_item"
    ? mapping.target === candidate.menuItemId : mapping.target === candidate.restaurantId);
  const menuOwnedFacets = new Set(
    applicable.filter((mapping) => mapping.scope === "menu_item").map((mapping) => mapping.facetKey));
  const winning = applicable.filter((mapping) =>
    mapping.scope === "menu_item" || !menuOwnedFacets.has(mapping.facetKey));
  const byFact = new Map();
  for (const mapping of winning) {
    const key = `${mapping.facetKey}\0${mapping.valueKey}`;
    if (!byFact.has(key)) byFact.set(key, mapping);
  }
  return [...byFact.values()].sort((a, b) => `${a.facetKey}\0${a.valueKey}`.localeCompare(`${b.facetKey}\0${b.valueKey}`));
};
const facts = new Map(candidates.map((candidate) => [candidate.candidateId, factsFor(candidate)]));
const fullA = facts.get("offer-a-1"); const fullB = facts.get("offer-a-2");
expect(fullA.length === 4 && fullA.find((fact) => fact.facetKey === "cuisine").scope === "menu_item",
  "D1 a mapped item exposes four unique facts and menu evidence wins duplicate inheritance", fullA);
expect(JSON.stringify(fullA) === JSON.stringify(fullB),
  "D2 the same menu at two branches shares facts without collapsing candidate identity");
expect(candidates[0].candidateId !== candidates[1].candidateId && candidates[0].branchId !== candidates[1].branchId,
  "D3 branch-offer identities remain distinct");
expect(authority.classifyCandidateTasteCoverage(facts.get("offer-a-3").map((fact) => fact.facetKey)).mappingState === "partial",
  "D4 inherited and menu facts produce partial coverage for the partial item");
expect(authority.classifyCandidateTasteCoverage(facts.get("offer-b-1").map((fact) => fact.facetKey)).mappingState === "unknown",
  "D5 a different restaurant/menu with no facts stays unknown without leakage");
expect([...facts.values()].flat().every((fact) => fact.provenance && fact.sourceReference),
  "D6 every projected known fact retains provenance and evidence reference");

// ---- the three worked examples of the frozen precedence decision --------------------------------
const conflict = facts.get("offer-c-1");
const conflictMealTypes = conflict.filter((f) => f.facetKey === "meal_type").map((f) => f.valueKey);
expect(JSON.stringify(conflictMealTypes) === JSON.stringify(["dinner"]),
  "E1 restaurant lunch + menu dinner yields dinner ONLY, never both", conflictMealTypes);
const conflictCuisines = conflict.filter((f) => f.facetKey === "cuisine").map((f) => f.valueKey);
expect(JSON.stringify(conflictCuisines) === JSON.stringify(["cuisine.fusion", "cuisine.modern_japanese"]),
  "E2 a multi-value menu facet fully replaces the single-value restaurant facet", conflictCuisines);
expect(conflict.every((f) => f.scope === "menu_item"),
  "E3 no restaurant fact survives for a facet the menu speaks to", conflict);
const silent = facts.get("offer-c-2");
expect(JSON.stringify(silent.map((f) => `${f.facetKey}=${f.valueKey}`))
  === JSON.stringify(["cuisine=cuisine.japanese", "meal_type=lunch"])
  && silent.every((f) => f.scope === "restaurant"),
  "E4 a menu silent on every facet inherits the restaurant facts unchanged", silent);
expect(JSON.stringify(factsFor(candidates[4])) === JSON.stringify(conflict),
  "E5 the precedence result is deterministic across repeated evaluation");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-b-p0-smoke",
  status: failed.length ? "failed" : "passed",
  mutation: mutation || null,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  failures: failed.map((entry) => entry.name),
  candidateFixtureCount: candidates.length,
  mappedFactCount: [...facts.values()].reduce((total, rows) => total + rows.length, 0),
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

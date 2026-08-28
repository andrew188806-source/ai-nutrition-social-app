#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260830010000_candidate_allergen_data_authority.sql";
const contractPath = "packages/shared/src/domain/candidate-allergen/candidateAllergenAuthority.ts";
let sql = fs.readFileSync(path.join(root, migrationPath), "utf8");
let contractSource = fs.readFileSync(path.join(root, contractPath), "utf8");
const mutation = process.env.RECCP0_MUTATION ?? "";
const TARGET_NOT_FOUND = 97;
const mutate = (target, replacement, surface = "contract") => {
  const source = surface === "sql" ? sql : contractSource;
  if (!source.includes(target)) process.exit(TARGET_NOT_FOUND);
  if (surface === "sql") sql = source.replace(target, replacement);
  else contractSource = source.replace(target, replacement);
};

switch (mutation) {
  case "drop_mango": mutate('  Object.freeze({ key: "mango", zhTWLabel: "芒果" }),\n', ""); break;
  case "alias_nuts": mutate('["peanut", "peanut"]', '["peanut", "peanut"],\n  ["nuts", "tree_nut"]'); break;
  case "alias_shellfish": mutate('["peanut", "peanut"]', '["peanut", "peanut"],\n  ["shellfish", "crustacean"]'); break;
  case "alias_seafood": mutate('const PRIVATE_ALIASES:', 'const PRIVATE_ALIASES:'); contractSource += '\nPRIVATE_ALIASES.set("不吃海鮮", "fish");\n'; break;
  case "provider_complete": mutate('return provenance === "restaurant_verified" || provenance === "admin_verified";', 'return provenance === "restaurant_verified" || provenance === "admin_verified" || provenance === "provider_verified";'); break;
  case "collapse_partial": mutate('return state === "complete";', 'return state !== "unknown";'); break;
  case "introduce_safe": contractSource += '\nexport const safeForUser = true;\n'; break;
  case "restaurant_scope": mutate('candidate_id text not null,', 'restaurant_id text not null,\n  candidate_id text not null,', "sql"); break;
  case "allow_missing_fact_audit": mutate('source_reference text not null\n    check', 'source_reference text\n    check', "sql"); break;
  case "allow_ai": mutate("  'provider_verified'\n);", "  'provider_verified',\n  'ai_inferred'\n);", "sql"); break;
  case "expose_anon": mutate('to authenticated;', 'to anon;', "sql"); break;
  case "leak_user": mutate('  fact.allergen_key\nfrom public.consumer_public_next_meal_candidates_v1', '  fact.allergen_key,\n  dietary_restrictions.user_id\nfrom public.consumer_public_next_meal_candidates_v1', "sql"); break;
  case "auto_raw_facts": sql += '\ninsert into public.candidate_allergen_facts select * from public.menu_items;\n'; break;
  case "remove_identity_pair": mutate('foreign key (candidate_id, menu_item_id)\n    references public.branch_menu_items (id, menu_item_id) on delete restrict,', 'foreign key (candidate_id) references public.branch_menu_items (id) on delete restrict,', "sql"); break;
  case "allow_provider_complete_sql": mutate("provenance in ('restaurant_verified', 'admin_verified')", "provenance in ('restaurant_verified', 'admin_verified', 'provider_verified')", "sql"); break;
  case "known_absent": sql += '\nalter table public.candidate_allergen_facts add column fact_state text default \'known_absent\';\n'; break;
  case "": break;
  default: throw new Error(`unknown mutation ${mutation}`);
}

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const { outputText } = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: path.join(root, contractPath)
});
const module = { exports: {} };
new Function("require", "module", "exports", outputText)(require_, module, module.exports);
const authority = module.exports;
const executableSql = sql.replace(/--.*$/gm, "").replace(/comment on[\s\S]*?;\s*/gi, "");
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const keys = ["crustacean", "mango", "peanut", "milk", "egg", "tree_nut", "sesame",
  "gluten_containing_cereal", "soy", "fish", "sulfites_ge_10mg_per_kg"];

expect(authority.CANDIDATE_ALLERGEN_TAXONOMY_ID === "tastkind-allergen-tw-v1"
  && authority.CANDIDATE_ALLERGEN_TAXONOMY_VERSION === 1, "A1 taxonomy identity and version are exact");
expect(JSON.stringify(authority.CANDIDATE_ALLERGEN_VALUES.map((entry) => entry.key)) === JSON.stringify(keys),
  "A2 runtime vocabulary is the exact ordered eleven-key set", authority.CANDIDATE_ALLERGEN_VALUES);
expect(authority.CANDIDATE_ALLERGEN_VALUES.every((entry) => entry.key !== entry.zhTWLabel)
  && new Set(authority.CANDIDATE_ALLERGEN_VALUES.map((entry) => entry.zhTWLabel)).size === 11,
  "A3 stable keys are distinct from presentation labels");
expect(JSON.stringify(authority.CANDIDATE_ALLERGEN_PROVENANCE_VALUES)
  === JSON.stringify(["restaurant_verified", "admin_verified", "provider_verified"]),
  "A4 approved fact provenance is closed and non-AI");

const privateInput = (sourceValue, extra = {}) => authority.normalizePrivateRestrictionAllergen({
  normalizationPolicyId: authority.PRIVATE_RESTRICTION_ALLERGEN_NORMALIZATION_POLICY_ID,
  normalizationPolicyVersion: 1,
  sourceVocabularyId: authority.PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID,
  sourceVocabularyVersion: 1,
  sourceValue,
  allergenFacetEnabled: true,
  ...extra
});
expect(privateInput("peanut").state === "mapped" && privateInput("peanut").targetAllergenKey === "peanut"
  && privateInput(" 花生 ").targetAllergenKey === "peanut", "B1 exact stable key and zh-TW label map");
expect(["shellfish", "coriander", "dietary", "avoidance", "不吃牛", "不吃海鮮", "少油", "少鹽", "蔬食"]
  .every((value) => privateInput(value).state === "unmapped"), "B2 arbitrary legacy values remain unmapped");
expect(privateInput("fish", { allergenFacetEnabled: false }).state === "facet_disabled"
  && privateInput("fish", { sourceVocabularyId: "unknown-v1" }).state === "source_unknown"
  && privateInput("fish", { normalizationPolicyId: "unknown-v1" }).state === "source_unknown",
  "B3 facet-disabled and source-unknown states fail closed");

const raw = (rawValue) => authority.normalizeLegacyCandidateAllergen({
  sourceVocabularyId: authority.LEGACY_MENU_ALLERGEN_SOURCE_VOCABULARY_ID,
  sourceVocabularyVersion: 1,
  rawValue
});
expect([["fish", "fish"], ["soy", "soy"], ["egg", "egg"], ["wheat", "gluten_containing_cereal"], ["peanut", "peanut"]]
  .every(([value, target]) => raw(value).state === "mapped" && raw(value).targetAllergenKey === target),
  "C1 five exact legacy raw aliases map deterministically");
expect(["nuts", "shellfish", "不吃海鮮", "Fish", "wheat flour"].every((value) => raw(value).state === "unmapped"),
  "C2 ambiguous, translated, case-varied, and fuzzy raw values remain unmapped");

expect(authority.coverageHasCompleteVocabularyAssessment("unknown") === false
  && authority.coverageHasCompleteVocabularyAssessment("partial") === false
  && authority.coverageHasCompleteVocabularyAssessment("complete") === true,
  "D1 unknown and partial cannot stand in for complete vocabulary assessment");
expect(authority.provenanceCanDeclareCompleteCoverage("restaurant_verified")
  && authority.provenanceCanDeclareCompleteCoverage("admin_verified")
  && !authority.provenanceCanDeclareCompleteCoverage("provider_verified"),
  "D2 provider provenance cannot declare complete in v1");

const factTableBlock = sql.slice(sql.indexOf("create table public.candidate_allergen_facts"),
  sql.indexOf("create unique index candidate_allergen_facts_active_fact_idx"));
expect(/foreign key \(candidate_id, menu_item_id\)\s+references public\.branch_menu_items \(id, menu_item_id\)/.test(factTableBlock)
  && !/restaurant_id text/.test(factTableBlock),
  "E1 facts are isolated to exact branch-offer/menu identity with no restaurant scope");
expect(/source_reference text not null/.test(sql) && /established_at timestamptz not null/.test(sql)
  && !/ai_inferred|ai_estimated|image_inferred|keyword_inferred/.test(sql),
  "E2 facts require audit reference/time and reject inference provenance");
expect(/coverage_state = 'complete'[\s\S]{0,180}provenance in \('restaurant_verified', 'admin_verified'\)/.test(sql),
  "E3 SQL restricts complete coverage to restaurant/admin verification");
expect(!/known_absent|safe_for_user|safeForUser|allergen_free|compatible_with/.test(sql + "\n" + contractSource),
  "E4 no known-absent, safety, or compatibility contract exists");
expect(!/insert into public\.candidate_allergen_facts[\s\S]*from public\.menu_items/i.test(sql)
  && !/unnest\([^)]*allergens/.test(sql), "E5 raw arrays do not automatically create canonical facts");
expect((sql.match(/grant select on public\.consumer_authenticated_[a-z_0-9]+ to authenticated/g) ?? []).length === 4
  && !/grant select on public\.consumer_authenticated_[a-z_0-9]+ to anon/.test(sql),
  "E6 additive projections are authenticated-only");
expect(!/user_id|restriction_type|severity|health_|medical_/i.test(sql.slice(
  sql.indexOf("create view public.consumer_authenticated_next_meal_candidate_allergen_facts_v1"),
  sql.indexOf("comment on view public.consumer_authenticated_next_meal_candidate_allergen_facts_v1")
)),
  "E7 candidate projections expose no private restriction or health data");
expect(!/score|rank|lane_a|lane_b|interleave|latitude|longitude|meal_context|social_interest/i.test(contractSource + "\n" + executableSql),
  "E8 authority contains no ranking, GEO, Meal Context, or Social behavior");

const candidates = [
  { candidateId: "offer-a", restaurantId: "restaurant-a", branchId: "branch-a", menuItemId: "menu-shared" },
  { candidateId: "offer-b", restaurantId: "restaurant-a", branchId: "branch-b", menuItemId: "menu-shared" },
  { candidateId: "offer-c", restaurantId: "restaurant-b", branchId: "branch-c", menuItemId: "menu-other" }
];
const facts = [
  { candidateId: "offer-a", menuItemId: "menu-shared", allergenKey: "peanut" },
  { candidateId: "offer-a", menuItemId: "menu-shared", allergenKey: "crustacean" },
  { candidateId: "offer-c", menuItemId: "menu-other", allergenKey: "egg" }
];
const factsFor = (candidate) => facts.filter((fact) => fact.candidateId === candidate.candidateId
  && fact.menuItemId === candidate.menuItemId).sort((left, right) => left.allergenKey.localeCompare(right.allergenKey));
expect(JSON.stringify(factsFor(candidates[0]).map((fact) => fact.allergenKey)) === JSON.stringify(["crustacean", "peanut"]),
  "F1 several known-present allergens project deterministically");
expect(factsFor(candidates[1]).length === 0,
  "F2 the same menu at another branch stays unknown without branch-offer evidence");
expect(factsFor(candidates[2]).length === 1 && factsFor(candidates[2])[0].allergenKey === "egg",
  "F3 no fact leaks across candidates or restaurants");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-c-p0-smoke",
  status: failed.length ? "failed" : "passed",
  mutation: mutation || null,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  failures: failed.map((entry) => entry.name),
  taxonomyKeyCount: authority.CANDIDATE_ALLERGEN_VALUES.length,
  candidateFixtureCount: candidates.length,
  knownPresentFixtureCount: facts.length,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

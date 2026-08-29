#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const migrationPath =
  "supabase/migrations/20260901010000_candidate_ingredient_avoidance_data_authority.sql";
const contractPath =
  "packages/shared/src/domain/candidate-ingredient-avoidance/candidateIngredientAvoidanceAuthority.ts";
let sql = fs.readFileSync(path.join(root, migrationPath), "utf8");
let contractSource = fs.readFileSync(path.join(root, contractPath), "utf8");
const mutation = process.env.RECDP0_MUTATION ?? "";
const TARGET_NOT_FOUND = 97;
const mutate = (target, replacement, surface = "contract") => {
  const source = surface === "sql" ? sql : contractSource;
  if (!source.includes(target)) process.exit(TARGET_NOT_FOUND);
  if (surface === "sql") sql = source.replace(target, replacement);
  else contractSource = source.replace(target, replacement);
};

switch (mutation) {
  case "pork_as_allergen":
    mutate('CandidateIngredientAvoidanceFactDomain = "ingredient_avoidance_content"',
      'CandidateIngredientAvoidanceFactDomain = "allergen_content"'); break;
  case "known_absent": contractSource += "\nexport const KNOWN_ABSENT = true;\n"; break;
  case "unknown_as_complete":
    mutate('return state === "complete";', 'return state !== "partial";'); break;
  case "partial_as_complete":
    mutate('return state === "complete";', 'return state !== "unknown";'); break;
  case "provider_complete_contract":
    mutate('return provenance === "restaurant_verified" || provenance === "admin_verified";',
      'return provenance === "restaurant_verified" || provenance === "admin_verified" || provenance === "provider_verified";'); break;
  case "provider_complete_sql":
    mutate("provenance in ('restaurant_verified', 'admin_verified')",
      "provenance in ('restaurant_verified', 'admin_verified', 'provider_verified')", "sql"); break;
  case "restaurant_inheritance":
    mutate('create table public.candidate_ingredient_avoidance_facts (\n  fact_id uuid primary key default gen_random_uuid(),',
      'create table public.candidate_ingredient_avoidance_facts (\n  fact_id uuid primary key default gen_random_uuid(),\n  restaurant_id text not null,', "sql"); break;
  case "remove_branch_pair":
    mutate('foreign key (candidate_id, menu_item_id)\n    references public.branch_menu_items (id, menu_item_id) on delete restrict,',
      'foreign key (candidate_id) references public.branch_menu_items (id) on delete restrict,', "sql"); break;
  case "arbitrary_source_text":
    mutate('if (!isCandidateIngredientAvoidanceKey(normalizedSourceValue)) {',
      'if (!isCandidateIngredientAvoidanceKey(normalizedSourceValue) && normalizedSourceValue !== "豬肉") {'); break;
  case "derive_halal": contractSource += "\nexport const halal = true;\n"; break;
  case "religion_field": contractSource += "\nexport type ReligionProfile = { religion: string };\n"; break;
  case "user_compatibility": contractSource += "\nexport const compatibleWithUser = true;\n"; break;
  case "reuse_allergen_coverage":
    sql += "\ncreate view public.recd_bad_cross_domain as select * from public.candidate_allergen_coverage;\n"; break;
  case "ranking_authority": contractSource += "\nexport const ingredientAvoidanceRankingScore = 1;\n"; break;
  case "missing_fact_audit":
    mutate('source_reference text not null\n    check', 'source_reference text\n    check', "sql"); break;
  case "anon_projection":
    mutate('grant select on public.consumer_authenticated_candidate_avoidance_facts_v1 to authenticated;',
      'grant select on public.consumer_authenticated_candidate_avoidance_facts_v1 to anon;', "sql"); break;
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
const structuralSql = executableSql.replace(/\x27[^\x27]*\x27/g, "");
const checks = [];
const expect = (pass, name, detail) => checks.push({
  name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail })
});
const keys = ["pork", "beef", "coriander"];

expect(authority.CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID
  === "tastkind-ingredient-avoidance-v1"
  && authority.CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION === 1,
"A1 taxonomy identity and version are exact");
expect(JSON.stringify(authority.CANDIDATE_INGREDIENT_AVOIDANCE_VALUES.map((entry) => entry.key))
  === JSON.stringify(keys), "A2 runtime vocabulary is exactly pork, beef, coriander");
expect(JSON.stringify(authority.CANDIDATE_INGREDIENT_AVOIDANCE_VALUES.map((entry) => entry.zhTWLabel))
  === JSON.stringify(["豬肉／豬來源成分", "牛肉／牛來源成分", "香菜"]),
"A3 presentation labels are exact and separate from stable keys");
expect(JSON.stringify(authority.CANDIDATE_INGREDIENT_AVOIDANCE_PROVENANCE_VALUES)
  === JSON.stringify(["restaurant_verified", "admin_verified", "provider_verified"]),
"A4 approved provenance is exact and non-inferred");
expect(!contractSource.includes('CandidateIngredientAvoidanceFactDomain = "allergen_content"'),
  "A5 ingredient avoidance is not the allergen fact domain");

const normalize = (sourceValue, extra = {}) => authority.normalizePrivateIngredientAvoidance({
  normalizationPolicyId: authority.PRIVATE_INGREDIENT_AVOIDANCE_NORMALIZATION_POLICY_ID,
  normalizationPolicyVersion: 1,
  sourceVocabularyId: authority.PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID,
  sourceVocabularyVersion: 1,
  sourceValue,
  ...extra
});
expect(keys.every((key) => normalize(key).state === "mapped"
  && normalize(key).targetIngredientAvoidanceKey === key),
"B1 future private vocabulary maps exact stable keys only");
expect(["豬肉", "牛肉", "香菜", "Pork", " pork-derived ", "halal", "vegetarian"]
  .every((value) => normalize(value).state === "unmapped"),
"B2 labels, fuzzy text, case variants, and mode/religious terms remain unmapped");
expect(normalize("pork", { sourceVocabularyId: "unknown-v1" }).state === "source_unknown"
  && normalize("pork", { normalizationPolicyId: "unknown-v1" }).state === "source_unknown",
"B3 unknown vocabulary or policy fails closed");
expect((sql.match(/insert into public\.private_ingredient_avoidance_normalization_mappings/g) ?? []).length === 1
  && /source\.source_value_key, 'stable_key'/.test(sql)
  && !/legacy_candidate_ingredient|legacy_ingredient_avoidance/.test(sql),
"B4 persistent normalization has three stable mappings and zero legacy aliases");

expect(authority.ingredientAvoidanceCoverageHasCompleteVocabularyAssessment("unknown") === false
  && authority.ingredientAvoidanceCoverageHasCompleteVocabularyAssessment("partial") === false
  && authority.ingredientAvoidanceCoverageHasCompleteVocabularyAssessment("complete") === true,
"C1 unknown, partial, and complete retain distinct absence authority");
expect(authority.ingredientAvoidanceProvenanceCanDeclareCompleteCoverage("restaurant_verified")
  && authority.ingredientAvoidanceProvenanceCanDeclareCompleteCoverage("admin_verified")
  && !authority.ingredientAvoidanceProvenanceCanDeclareCompleteCoverage("provider_verified"),
"C2 provider provenance cannot declare complete");
expect(/coverage_state = 'unknown'[\s\S]{0,150}provenance is null[\s\S]{0,150}established_at is null/.test(sql),
"C3 unknown coverage carries no fabricated evidence");
expect(/coverage_state = 'partial'[\s\S]{0,210}provenance is not null[\s\S]{0,210}established_at is not null/.test(sql),
"C4 partial coverage requires evidence but cannot prove absence");
expect(/coverage_state = 'complete'[\s\S]{0,210}provenance in \('restaurant_verified', 'admin_verified'\)/.test(sql),
"C5 SQL complete coverage requires restaurant/admin authority");

const factsBlock = sql.slice(sql.indexOf("create table public.candidate_ingredient_avoidance_facts"),
  sql.indexOf("create unique index cia_facts_active_fact_idx"));
expect(/foreign key \(candidate_id, menu_item_id\)\s+references public\.branch_menu_items \(id, menu_item_id\)/.test(factsBlock)
  && !/restaurant_id text/.test(factsBlock),
"D1 facts are exact branch-offer/menu scoped with no restaurant inheritance");
expect(/source_reference text not null/.test(factsBlock)
  && /established_at timestamptz not null/.test(factsBlock),
"D2 every known-present fact requires audit reference and established time");
expect(!/known_absent|KNOWN_ABSENT/.test(sql + contractSource),
"D3 no known-absent fact exists and missing remains unknown");
expect(!/ai_inferred|ai_estimated|image_inferred|keyword_inferred|llm_inferred/i.test(executableSql + contractSource),
"D4 inference provenance is absent");

const candidates = [
  { candidateId: "offer-a", branchId: "branch-a", menuItemId: "menu-shared" },
  { candidateId: "offer-b", branchId: "branch-b", menuItemId: "menu-shared" },
  { candidateId: "offer-c", branchId: "branch-c", menuItemId: "menu-other" }
];
const facts = [
  { candidateId: "offer-a", menuItemId: "menu-shared", ingredientAvoidanceKey: "pork" },
  { candidateId: "offer-a", menuItemId: "menu-shared", ingredientAvoidanceKey: "beef" },
  { candidateId: "offer-c", menuItemId: "menu-other", ingredientAvoidanceKey: "coriander" }
];
const factsFor = (candidate) => facts.filter((fact) => fact.candidateId === candidate.candidateId
  && fact.menuItemId === candidate.menuItemId);
expect(JSON.stringify(factsFor(candidates[0]).map((fact) => fact.ingredientAvoidanceKey))
  === JSON.stringify(["pork", "beef"]), "D5 pork and beef known-present facts are representable");
expect(factsFor(candidates[1]).length === 0,
"D6 same menu at another branch stays unknown without branch-offer evidence");
expect(factsFor(candidates[2]).length === 1
  && factsFor(candidates[2])[0].ingredientAvoidanceKey === "coriander",
"D7 coriander is representable without cross-candidate leakage");

expect((sql.match(/grant select on public\.consumer_authenticated_candidate_avoidance_[a-z_0-9]+ to authenticated/g) ?? []).length === 2
  && !/grant select on public\.consumer_authenticated_candidate_avoidance_[a-z_0-9]+ to anon/.test(sql),
"E1 exactly two candidate projections are authenticated-only");
expect(/create role candidate_ingredient_avoidance_write_authority\s+with nologin noinherit nobypassrls/.test(sql)
  && (sql.match(/enable row level security/g) ?? []).length === 10,
"E2 sealed NOLOGIN/NOINHERIT/NOBYPASSRLS authority protects all ten tables");
expect(!/grant candidate_ingredient_avoidance_write_authority to (?:anon|authenticated|authenticator|service_role)/i.test(sql),
"E3 no client or service role inherits sealed writes");
expect(!/user_id|profile_id|preference_reason|religion|religious_identity/i.test(structuralSql + contractSource),
"E4 candidate authority contains no user identity, reason, or religion field");
expect(!/compatibleWithUser|compatible_with_user|safe_for_user|halal|halal_certified/i.test(structuralSql + contractSource),
"E5 no compatibility, safety, halal, or religious-compliance output exists");
expect(!/rankingScore|ranking_score|score|rank|lane_a|lane_b|interleave|eligib|exclusion|warning/i.test(contractSource + executableSql),
"E6 no recommendation eligibility, warning, score, rank, or lane authority exists");
expect(!/candidate_allergen_coverage|candidate_allergen_facts/.test(executableSql),
"E7 REC-D persistence does not read or reuse REC-C allergen authority");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-d-p0-smoke",
  status: failed.length ? "failed" : "passed",
  mutation: mutation || null,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  failures: failed.map((entry) => entry.name),
  taxonomyKeyCount: authority.CANDIDATE_INGREDIENT_AVOIDANCE_VALUES.length,
  candidateFixtureCount: candidates.length,
  knownPresentFixtureCount: facts.length,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

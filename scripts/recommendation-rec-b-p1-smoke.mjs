#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260829010000_private_taste_normalization_authority.sql";
const contractPath = "packages/shared/src/domain/user-taste-normalization/privateTasteNormalization.ts";
let sql = fs.readFileSync(path.join(root, migrationPath), "utf8");
let contractSource = fs.readFileSync(path.join(root, contractPath), "utf8");
const mutation = process.env.RECBP1_MUTATION ?? "";
const TARGET_NOT_FOUND = 97;
const mutate = (target, replacement, surface = "contract") => {
  const source = surface === "sql" ? sql : contractSource;
  if (!source.includes(target)) process.exit(TARGET_NOT_FOUND);
  if (surface === "sql") sql = source.replace(target, replacement);
  else contractSource = source.replace(target, replacement);
};

switch (mutation) {
  case "drop_cuisine_value":
    mutate("  ('candidate-taste-v1', 'cuisine', 'fusion'),\n", "", "sql");
    break;
  case "seed_unauthorized_alias":
    mutate("from public.private_taste_source_value_labels as label\nwhere label.locale = 'zh-TW';",
      "from public.private_taste_source_value_labels as label\nwhere label.locale = 'zh-TW';\n-- '日式'", "sql");
    break;
  case "lowercase_input":
    mutate('value.normalize("NFC").trim()', 'value.normalize("NFC").trim().toLowerCase()');
    break;
  case "fuzzy_lookup":
    mutate("entry.normalizedSourceValue === normalizedSourceValue",
      "normalizedSourceValue.includes(entry.normalizedSourceValue)");
    break;
  case "allow_cross_facet":
    mutate("entry.targetFacet === input.sourceFacet", "true");
    break;
  case "promote_unknown_source":
    mutate("if (!sourceKnown) {", "if (false) {");
    break;
  case "ignore_disabled_facet":
    mutate("if (!input.enabledFacets.includes(input.sourceFacet)) {", "if (false) {");
    break;
  case "allow_label_write":
    mutate("entry.sourceValueKey === normalized", "entry.label === normalized");
    break;
  case "swap_spice_order":
    mutate('Object.freeze({ valueKey: "none", semanticOrdinal: 0 })',
      'Object.freeze({ valueKey: "none", semanticOrdinal: 3 })');
    break;
  case "allow_client_write":
    mutate("from public, anon, authenticated, authenticator, service_role;",
      "from public, anon, authenticator, service_role;", "sql");
    break;
  case "seed_candidate_mapping":
    sql += "\ninsert into public.candidate_taste_mappings default values;\n";
    break;
  case "introduce_rank":
    contractSource += "\nexport const tasteRank = 1;\n";
    break;
  case "":
    break;
  default:
    throw new Error(`unknown mutation ${mutation}`);
}

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const { outputText } = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: path.join(root, contractPath)
});
const module = { exports: {} };
new Function("require", "module", "exports", outputText)(require_, module, module.exports);
const authorityModule = module.exports;

const cuisine = [
  ["taiwanese", "台灣料理"], ["japanese", "日本料理"], ["korean", "韓國料理"],
  ["chinese", "中式料理"], ["hong_kong_cantonese", "港式／粵菜"], ["thai", "泰式料理"],
  ["vietnamese", "越南料理"], ["southeast_asian", "東南亞料理"], ["indian", "印度料理"],
  ["italian", "義式料理"], ["french", "法式料理"], ["american", "美式料理"],
  ["mexican", "墨西哥料理"], ["mediterranean", "地中海料理"],
  ["middle_eastern", "中東料理"], ["fusion", "創意融合料理"]
];
const flavor = [
  ["sweet", "甜味"], ["salty", "鹹味"], ["sour", "酸味"], ["bitter", "苦味"],
  ["umami", "鮮味"], ["smoky", "煙燻味"], ["creamy", "奶香"], ["fermented", "發酵風味"]
];
const spice = [["none", "不辣"], ["mild", "微辣"], ["medium", "中辣"], ["hot", "愛吃辣"]];
const sets = { cuisine, flavor, spice };
const vocabularyFor = (facet) => authorityModule.PRIVATE_TASTE_SOURCE_VOCABULARIES[facet];
const sourceValues = Object.entries(sets).flatMap(([facet, entries]) => entries.map(([sourceValueKey, label]) => ({
  ...vocabularyFor(facet), sourceFacet: facet, sourceValueKey, locale: "zh-TW", label
})));
const spiceOrder = new Map(authorityModule.PRIVATE_TASTE_SPICE_SEMANTIC_ORDER
  .map((entry) => [entry.valueKey, entry.semanticOrdinal]));
const mappings = sourceValues.flatMap((source) => [
  { normalizedSourceValue: source.sourceValueKey, aliasKind: "stable_key", sourceLocale: null },
  { normalizedSourceValue: source.label, aliasKind: "localized_label", sourceLocale: "zh-TW" }
].map((alias) => ({
  normalizationPolicyId: authorityModule.PRIVATE_TASTE_NORMALIZATION_POLICY_ID,
  normalizationPolicyVersion: authorityModule.PRIVATE_TASTE_NORMALIZATION_POLICY_VERSION,
  sourceVocabularyId: source.sourceVocabularyId,
  sourceVocabularyVersion: source.sourceVocabularyVersion,
  sourceFacet: source.sourceFacet,
  sourceValueKey: source.sourceValueKey,
  ...alias,
  targetTaxonomyVersion: "candidate-taste-v1",
  targetFacet: source.sourceFacet,
  targetValueKey: source.sourceValueKey,
  semanticOrdinal: source.sourceFacet === "spice" ? spiceOrder.get(source.sourceValueKey) : null,
  provenance: "canonical_mapping",
  auditReference: "rec-b-p1-product-authority-addendum"
})));
const authority = Object.freeze({ sourceValues: Object.freeze(sourceValues), mappings: Object.freeze(mappings) });
const inputFor = (facet, sourceValue, extra = {}) => ({
  normalizationPolicyId: authorityModule.PRIVATE_TASTE_NORMALIZATION_POLICY_ID,
  normalizationPolicyVersion: authorityModule.PRIVATE_TASTE_NORMALIZATION_POLICY_VERSION,
  ...vocabularyFor(facet), sourceFacet: facet, sourceValue,
  enabledFacets: ["cuisine", "flavor", "spice"], ...extra
});

const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const resolve = (facet, value, extra) => authorityModule.resolvePrivateTasteSourceValue(authority, inputFor(facet, value, extra));

expect(sourceValues.filter((value) => value.sourceFacet === "cuisine").length === 16,
  "A1 source authority contains exactly sixteen cuisines");
expect(sourceValues.filter((value) => value.sourceFacet === "flavor").length === 8,
  "A2 source authority contains exactly eight flavors");
expect(sourceValues.filter((value) => value.sourceFacet === "spice").length === 4,
  "A3 source authority contains exactly four spice values");
expect(mappings.length === 56 && mappings.filter((entry) => entry.aliasKind === "stable_key").length === 28
  && mappings.filter((entry) => entry.aliasKind === "localized_label").length === 28,
  "A4 every value has exactly stable-key and zh-TW-label aliases");

expect(resolve("cuisine", "japanese").state === "mapped"
  && resolve("cuisine", "japanese").targetValueKey === "japanese",
  "B1 exact cuisine stable key resolves");
expect(resolve("cuisine", "  日本料理  ").state === "mapped"
  && resolve("cuisine", "  日本料理  ").targetValueKey === "japanese",
  "B2 exact cuisine label resolves after trim");
expect(resolve("flavor", "甜味").state === "mapped"
  && resolve("flavor", "甜味").targetValueKey === "sweet",
  "B3 exact flavor label resolves");
expect(resolve("spice", "微辣").state === "mapped"
  && resolve("spice", "微辣").targetValueKey === "mild",
  "B4 exact spice label resolves");
expect(["日式", "日本菜"].every((value) => resolve("cuisine", value).state === "unmapped")
  && ["小辣", "辣一點"].every((value) => resolve("spice", value).state === "unmapped")
  && resolve("flavor", "奶味重").state === "unmapped",
  "B5 unauthorized synonyms stay unmapped");
expect(resolve("cuisine", "Japanese").state === "unmapped",
  "B6 case variants are not silently folded");
expect(authorityModule.normalizePrivateTasteSourceValue("  e\u0301  ") === "é",
  "B7 Unicode NFC and trim are deterministic");
expect(resolve("cuisine", "日本料理 extra").state === "unmapped",
  "B8 keyword/fuzzy containment cannot resolve");

const crossFacetAuthority = {
  sourceValues,
  mappings: [{ ...mappings.find((entry) => entry.sourceFacet === "cuisine" && entry.sourceValueKey === "japanese"), targetFacet: "flavor" }]
};
expect(authorityModule.resolvePrivateTasteSourceValue(crossFacetAuthority, inputFor("cuisine", "japanese")).state === "unmapped",
  "C1 corrupt cross-facet authority fails closed");
expect(authorityModule.resolvePrivateTasteSourceValue(authority, inputFor("cuisine", "japanese", { enabledFacets: ["flavor"] })).state === "facet_disabled",
  "C2 disabled facets return facet_disabled");
expect(authorityModule.resolvePrivateTasteSourceValue(authority, inputFor("cuisine", "japanese", { sourceVocabularyId: "unknown-v1" })).state === "source_unknown",
  "C3 unknown source vocabulary returns source_unknown");
expect(authorityModule.resolvePrivateTasteSourceValue(authority, inputFor("cuisine", "japanese", { normalizationPolicyVersion: 99 })).state === "source_unknown",
  "C4 unknown normalization policy returns source_unknown");
const withoutJapaneseLabel = { sourceValues, mappings: mappings.filter((entry) => entry.normalizedSourceValue !== "日本料理") };
expect(authorityModule.resolvePrivateTasteSourceValue(withoutJapaneseLabel, inputFor("cuisine", "日本料理")).state === "unmapped",
  "C5 retired/absent mapping does not resolve while its source vocabulary remains known");

expect(authorityModule.validatePrivateTasteProfileWriteValue(sourceValues, {
  ...vocabularyFor("cuisine"), sourceFacet: "cuisine", value: "japanese"
}).accepted === true, "D1 new write contract accepts a stable source key");
expect(authorityModule.validatePrivateTasteProfileWriteValue(sourceValues, {
  ...vocabularyFor("cuisine"), sourceFacet: "cuisine", value: "日本料理"
}).accepted === false, "D2 new write contract rejects a localized label as persisted identity");
expect(authorityModule.PRIVATE_TASTE_DIRECT_MEAL_TYPE_KEYS.length === 6
  && authorityModule.isDirectPrivateTasteMealTypeKey("late_night")
  && !authorityModule.isDirectPrivateTasteMealTypeKey("brunch"),
  "D3 meal_type remains direct closed compatibility without a mapping dictionary");
expect(JSON.stringify(authorityModule.PRIVATE_TASTE_SPICE_SEMANTIC_ORDER)
  === JSON.stringify([{ valueKey: "none", semanticOrdinal: 0 }, { valueKey: "mild", semanticOrdinal: 1 },
    { valueKey: "medium", semanticOrdinal: 2 }, { valueKey: "hot", semanticOrdinal: 3 }]),
  "D4 spice order is explicit semantic metadata");

const targetBlock = sql.slice(sql.indexOf("insert into public.candidate_taste_values"),
  sql.indexOf("insert into public.candidate_taste_value_labels"));
expect((targetBlock.match(/\('candidate-taste-v1', '(?:cuisine|flavor|spice)', '[^']+'\)/g) ?? []).length === 28,
  "E1 migration seeds exactly twenty-eight target values");
expect((sql.match(/insert into public\.private_taste_normalization_mappings/g) ?? []).length === 2
  && !/["'](?:日式|日本菜|小辣|辣一點|奶味重)["']/.test(sql),
  "E2 migration seeds only the two authorized alias classes");
expect(/private_taste_normalization_same_facet check \(source_facet = target_facet\)/.test(sql),
  "E3 database rejects cross-facet mappings");
expect(/where mapping\.active and mapping\.retired_at is null/.test(sql),
  "E4 inactive and retired mappings are absent from the read contract");
expect((sql.match(/from public, anon, authenticated, authenticator, service_role/g) ?? []).length === 6,
  "E5 client and runtime roles cannot mutate six base authorities");
expect(!/insert into public\.candidate_taste_mappings/i.test(sql),
  "E6 taxonomy completion creates no candidate fact");
expect(!/tasteScore|tasteRank|rankingWeight|toleranceBand|flavorPenalty|spiceDistance/i.test(contractSource + "\n" + sql),
  "E7 P1 contains no ranking or penalty contract");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-b-p1-smoke",
  status: failed.length ? "failed" : "passed",
  mutation: mutation || null,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  failures: failed.map((entry) => entry.name),
  sourceValueCount: sourceValues.length,
  activeAliasCount: mappings.length,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

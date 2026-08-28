#!/usr/bin/env node
// REC-C-P1 in-memory mutation suite. Repository bytes are never rewritten.
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260831010000_user_allergy_setting_authority.sql";
const canonical = Object.freeze({
  sql: fs.readFileSync(migrationPath, "utf8"),
  repository: fs.readFileSync("apps/mobile/features/consumer-allergy-settings/repository.ts", "utf8"),
  route: fs.readFileSync("apps/mobile/app/allergy-settings.tsx", "utf8"),
  taste: fs.readFileSync("apps/mobile/features/consumer-taste-profile/adapters/supabaseConsumerTasteFoundationRepository.ts", "utf8")
});

function violations(source) {
  const failed = []; const require = (name, pass) => { if (!pass) failed.push(name); };
  const { sql, repository, route, taste } = source;
  require("tuple is all-null or all-present", /source_vocabulary_id is null and source_vocabulary_version is null and source_value_key is null/.test(sql)
    && /source_vocabulary_id is not null and source_vocabulary_version is not null and source_value_key is not null/.test(sql));
  require("tuple references P0 composite source identity", /foreign key \(source_vocabulary_id, source_vocabulary_version, source_value_key\)[\s\S]{0,180}private_restriction_allergen_source_values/.test(sql));
  require("legacy rows remain unclassified", !/update public\.dietary_restrictions|restriction_type\s*=\s*'allergy'|where label\s*=/i.test(sql));
  require("legacy text cannot block governed uniqueness", /dietary_restrictions_legacy_unique_label_idx[\s\S]{0,180}where source_vocabulary_id is null/.test(sql)
    && /dietary_restrictions_governed_source_unique_idx/.test(sql));
  require("actor is auth uid only", /v_user_id uuid := auth\.uid\(\)/.test(sql) && !/p_(?:user|actor|owner)_id/i.test(sql));
  require("writer accepts only key array", /replace_authenticated_allergy_settings_v1\(\s*p_source_value_keys text\[\]/.test(sql)
    && !/p_source_vocabulary|p_source_version/.test(sql));
  require("exact source vocabulary and domain", /private-restriction-allergen-v1/.test(sql) && /source_domain = 'allergy'/.test(sql));
  require("exact P0 policy and taxonomy", /private-restriction-allergen-normalization-v1/.test(sql) && /tastkind-allergen-tw-v1/.test(sql));
  require("duplicate input rejects", /ALLERGY_SOURCE_KEY_DUPLICATE/.test(sql) && /v_key_count <> v_distinct_count/.test(sql));
  require("inactive and arbitrary keys reject", /ALLERGY_SOURCE_KEY_NOT_ACTIVE/.test(sql)
    && /source\.active and source\.retired_at is null/.test(sql) && /mapping\.active and mapping\.retired_at is null/.test(sql));
  require("validation precedes mutation", sql.indexOf("ALLERGY_SOURCE_KEY_NOT_ACTIVE") < sql.indexOf("delete from public.dietary_restrictions"));
  require("unresolved governed row is counted", /unresolved_selection_count/.test(sql)
    && /'unresolved_selection_count', v_unresolved_count/.test(sql)
    && /not exists \([\s\S]{0,2600}target\.active and target\.retired_at is null/.test(sql));
  require("anonymous and direct writes remain closed", /revoke insert, update, delete on table public\.dietary_restrictions from public, anon, authenticated/.test(sql)
    && /revoke all on function public\.replace_authenticated_allergy_settings_v1\(text\[\]\) from anon/.test(sql));
  require("Social projection excludes governed rows", /as restrictive[\s\S]{0,120}social_pair_read_authority[\s\S]{0,120}source_vocabulary_id is null/.test(sql));
  require("Taste query excludes governed rows", /\.is\("source_vocabulary_id", null\)/.test(taste));
  require("Mobile cannot forge source tuple", /p_source_value_keys: \[\.\.\.selectedAllergenKeys\]/.test(repository)
    && !/p_source_vocabulary|p_user_id/.test(repository));
  require("localized labels never become writer identity", !/p_source_value_keys:.*label/.test(repository) && !/onPress=.*option\.label/.test(route));
  require("no free text or safety badge", !/TextInput|severity|safeFor|allergenFree/i.test(route));
  return failed;
}

const mutants = [
  ["partial tuple is allowed", (s) => ({ ...s, sql: s.sql.replace("    or\n    (source_vocabulary_id is not null", "    or\n    (source_vocabulary_id is null") })],
  ["P0 composite FK is removed", (s) => ({ ...s, sql: s.sql.replace(/  add constraint dietary_restrictions_governed_source_fk[\s\S]*?on delete restrict;/, "") })],
  ["legacy allergy text is backfilled", (s) => ({ ...s, sql: s.sql.replace("commit;", "update public.dietary_restrictions set source_value_key = label where restriction_type = 'allergy';\ncommit;") })],
  ["legacy rows share governed uniqueness", (s) => ({ ...s, sql: s.sql.replace("where source_vocabulary_id is null;", "where source_vocabulary_id is not null;") })],
  ["caller actor replaces auth uid", (s) => ({ ...s, sql: s.sql.replace("v_user_id uuid := auth.uid();", "v_user_id uuid := p_user_id;") })],
  ["writer accepts caller vocabulary", (s) => ({ ...s, sql: s.sql.replace("p_source_value_keys text[]", "p_source_value_keys text[], p_source_vocabulary text") })],
  ["allergy domain validation is removed", (s) => ({ ...s, sql: s.sql.replace(/\s+and vocabulary\.source_domain = 'allergy'/g, "") })],
  ["duplicate keys are accepted", (s) => ({ ...s, sql: s.sql.replace("v_key_count <> v_distinct_count", "false") })],
  ["retired source value is accepted", (s) => ({ ...s, sql: s.sql.replace(/\s+and source\.active and source\.retired_at is null/g, "") })],
  ["write occurs before validation", (s) => ({ ...s, sql: s.sql.replace("begin\n  if v_user_id", "begin\n  delete from public.dietary_restrictions where false;\n  if v_user_id") })],
  ["retired row silently becomes absent", (s) => ({ ...s, sql: s.sql.replace("'unresolved_selection_count', v_unresolved_count", "'unresolved_selection_count', 0") })],
  ["anonymous writer execution opens", (s) => ({ ...s, sql: s.sql.replace("revoke all on function public.replace_authenticated_allergy_settings_v1(text[]) from anon;", "grant execute on function public.replace_authenticated_allergy_settings_v1(text[]) to anon;") })],
  ["Social sees governed Allergy rows", (s) => ({ ...s, sql: s.sql.replace("as restrictive", "as permissive") })],
  ["Taste reads governed Allergy rows", (s) => ({ ...s, taste: s.taste.replace('.is("source_vocabulary_id", null)', "") })],
  ["Mobile sends caller vocabulary", (s) => ({ ...s, repository: s.repository.replace("p_source_value_keys: [...selectedAllergenKeys]", "p_source_value_keys: [...selectedAllergenKeys], p_source_vocabulary: 'caller'") })],
  ["localized label becomes toggle identity", (s) => ({ ...s, route: s.route.replace("controller.toggle(option.key)", "controller.toggle(option.label)") })],
  ["free-text Allergy entry is added", (s) => ({ ...s, route: s.route.replace("<Card>", "<Card><TextInput />") })],
  ["safety badge is added", (s) => ({ ...s, route: s.route.replace("copy.title", "'allergenFree'") })]
];

const results = [];
const baseline = violations(canonical);
results.push({ name: "canonical REC-C-P1 authority passes", applied: true, killed: baseline.length === 0, violations: baseline });
console.log(`${baseline.length === 0 ? "PASS    " : "BROKEN  "} canonical REC-C-P1 authority`);
for (const [name, mutate] of mutants) {
  const mutated = mutate(canonical); const applied = Object.keys(canonical).some((key) => mutated[key] !== canonical[key]);
  const failed = applied ? violations(mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}
const survivors = results.filter((result) => !result.killed);
console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-c-p1-mutations", total: mutants.length,
  killed: mutants.length - survivors.filter((item) => item.name !== "canonical REC-C-P1 authority passes").length,
  survived: survivors.length, survivors,
  repositoryBytesRewritten: false, productionTouched: false
}, null, 2));
if (survivors.length) process.exitCode = 1;

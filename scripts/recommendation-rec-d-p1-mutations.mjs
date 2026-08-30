#!/usr/bin/env node
// REC-D-P1 in-memory mutation suite. Repository bytes are never rewritten.
import fs from "node:fs";

const canonical = Object.freeze({
  sql: fs.readFileSync(
    "supabase/migrations/20260902010000_user_ingredient_avoidance_setting_authority.sql", "utf8"
  ),
  repository: fs.readFileSync(
    "apps/mobile/features/consumer-ingredient-avoidance-settings/repository.ts", "utf8"
  ),
  controller: fs.readFileSync(
    "apps/mobile/features/consumer-ingredient-avoidance-settings/controller.ts", "utf8"
  ),
  route: fs.readFileSync("apps/mobile/app/ingredient-avoidance-settings.tsx", "utf8"),
  composition: fs.readFileSync(
    "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts", "utf8"
  )
});

function violations(source) {
  const failed = []; const require = (name, pass) => { if (!pass) failed.push(name); };
  const { sql, repository, controller, route, composition } = source;
  const executable = sql.replace(/--.*$/gm, "").replace(/comment on[\s\S]*?;\s*/gi, "");
  const settingTable = sql.match(/create table public\.private_user_ingredient_avoidance_settings \([\s\S]*?\n\);/i)?.[0] ?? "";
  require("separate private table binds exact P0 tuple",
    /create table public\.private_user_ingredient_avoidance_settings/.test(sql)
      && /foreign key \(source_vocabulary_id, source_vocabulary_version, source_value_key\)[\s\S]{0,180}private_ingredient_avoidance_source_values/.test(sql));
  require("Allergy and legacy tables are untouched",
    !/alter table public\.dietary_restrictions|insert into public\.dietary_restrictions|delete from public\.dietary_restrictions|private_restriction_allergen/.test(executable));
  require("actor is auth uid only", /v_user_id uuid := auth\.uid\(\)/.test(sql)
    && !/p_(?:user|actor|owner)_id/i.test(sql));
  require("writer accepts only source key array",
    /replace_authenticated_ingredient_avoidance_settings_v1\(\s*p_source_value_keys text\[\]/.test(sql)
      && !/p_source_vocabulary|p_source_version/.test(sql));
  require("exact source vocabulary, policy, taxonomy, and domain are server owned",
    ["private-ingredient-avoidance-v1", "private-ingredient-avoidance-normalization-v1",
      "tastkind-ingredient-avoidance-v1", "source_domain = 'ingredient_avoidance'",
      "fact_domain = 'ingredient_avoidance_content'"].every((value) => sql.includes(value)));
  require("duplicate input rejects", /INGREDIENT_AVOIDANCE_SOURCE_KEY_DUPLICATE/.test(sql)
    && /v_key_count <> v_distinct_count/.test(sql));
  require("inactive and arbitrary keys reject", /INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE/.test(sql)
    && /source\.active and source\.retired_at is null/.test(sql)
    && /if v_invalid_key is not null then/.test(sql)
    && /mapping\.active and mapping\.retired_at is null/.test(sql));
  require("validation precedes atomic replacement",
    sql.indexOf("INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE")
      < sql.indexOf("delete from public.private_user_ingredient_avoidance_settings"));
  require("deselect and empty clear target only current actor REC-D rows",
    /delete from public\.private_user_ingredient_avoidance_settings[\s\S]{0,180}setting\.user_id = v_user_id/.test(sql)
      && /from pg_catalog\.unnest\(v_keys\)/.test(sql));
  require("unresolved governed rows remain counted", /'unresolved_selection_count', v_unresolved_count/.test(sql)
    && /not exists \([\s\S]{0,2800}target\.active and target\.retired_at is null/.test(sql));
  require("direct client/service table access and anon RPC are closed",
    /revoke all on table public\.private_user_ingredient_avoidance_settings[\s\S]{0,120}public, anon, authenticated, authenticator, service_role/.test(sql)
      && /revoke all on function public\.replace_authenticated_ingredient_avoidance_settings_v1\(text\[\]\) from anon/.test(sql));
  require("Taste Social and public projections receive no authority",
    !/grant[^;]*(?:taste|social|public_profile|meal_buddy)|create view/i.test(executable));
  require("no user reason religion or medical field exists",
    !/^\s*(?:reason|religion|religious_identity|medical_reason|severity)\s+/im.test(settingTable));
  require("Mobile sends only stable keys and no actor tuple",
    /p_source_value_keys: \[\.\.\.selectedKeys\]/.test(repository)
      && !/p_(?:user|actor|owner|source_vocabulary)/i.test(repository));
  require("Mobile validates exact P0 keys", /isCandidateIngredientAvoidanceKey/.test(repository)
    && /keys\.length <= OPTIONS\.length/.test(repository));
  require("real Save preserves failure and verifies response",
    /repository\.replaceCurrentUser\(draft\)/.test(controller)
      && /if \(!result\.ok \|\| !sameKeys\(result\.value\.selectedIngredientAvoidanceKeys, draft\)\)/.test(controller)
      && /invalid_server_response/.test(controller) && /phase: "save_failed"/.test(controller));
  require("localized labels and free text never become writer identity",
    !/controller\.toggle\(option\.label\)|TextInput|reasonPicker|religionPicker|severityPicker/i.test(route));
  require("recommendation remains disconnected",
    !/applyIngredientAvoidance|ingredientAvoidanceSettingsReader|ingredient_avoidance_keys/.test(composition));
  return failed;
}

const mutants = [
  ["client user id is accepted", (s) => ({ ...s,
    sql: s.sql.replace("p_source_value_keys text[]", "p_source_value_keys text[], p_user_id uuid") })],
  ["arbitrary key is accepted", (s) => ({ ...s,
    sql: s.sql.replace("if v_invalid_key is not null then", "if false then") })],
  ["Allergy FK is reused", (s) => ({ ...s,
    sql: s.sql.replace("private_ingredient_avoidance_source_values", "private_restriction_allergen_source_values") })],
  ["legacy text is promoted", (s) => ({ ...s,
    sql: s.sql.replace("commit;", "insert into public.dietary_restrictions select * from public.private_user_ingredient_avoidance_settings;\ncommit;") })],
  ["duplicate selection is allowed", (s) => ({ ...s,
    sql: s.sql.replace("v_key_count <> v_distinct_count", "false") })],
  ["deselect no longer removes old rows", (s) => ({ ...s,
    sql: s.sql.replace(/  delete from public\.private_user_ingredient_avoidance_settings[\s\S]*?source_vocabulary_version = 1;\n/, "") })],
  ["empty clear touches Allergy", (s) => ({ ...s,
    sql: s.sql.replace("delete from public.private_user_ingredient_avoidance_settings",
      "delete from public.dietary_restrictions") })],
  ["Actor B can be caller-selected", (s) => ({ ...s,
    sql: s.sql.replace("v_user_id uuid := auth.uid();", "v_user_id uuid := p_actor_id;") })],
  ["unresolved row silently disappears", (s) => ({ ...s,
    sql: s.sql.replace("'unresolved_selection_count', v_unresolved_count",
      "'unresolved_selection_count', 0") })],
  ["Taste receives table access", (s) => ({ ...s,
    sql: s.sql.replace("commit;", "grant select on public.private_user_ingredient_avoidance_settings to taste_read_authority;\ncommit;") })],
  ["Social receives table access", (s) => ({ ...s,
    sql: s.sql.replace("commit;", "grant select on public.private_user_ingredient_avoidance_settings to social_pair_read_authority;\ncommit;") })],
  ["recommendation behavior is connected", (s) => ({ ...s,
    composition: `${s.composition}\nconst ingredientAvoidanceSettingsReader = applyIngredientAvoidance();\n` })],
  ["religion field is added", (s) => ({ ...s,
    sql: s.sql.replace("source_value_key text not null,", "source_value_key text not null,\n  religion text,") })],
  ["localized label becomes toggle identity", (s) => ({ ...s,
    route: s.route.replace("controller.toggle(option.key)", "controller.toggle(option.label)") })],
  ["Mobile sends caller vocabulary", (s) => ({ ...s,
    repository: s.repository.replace("p_source_value_keys: [...selectedKeys]",
      "p_source_value_keys: [...selectedKeys], p_source_vocabulary: 'caller'") })],
  ["save success ignores server mismatch", (s) => ({ ...s,
    controller: s.controller.replace("!result.ok || !sameKeys(result.value.selectedIngredientAvoidanceKeys, draft)",
      "!result.ok") })]
];

const results = [];
const baseline = violations(canonical);
results.push({ name: "canonical REC-D-P1 authority passes", applied: true,
  killed: baseline.length === 0, violations: baseline });
console.log(`${baseline.length === 0 ? "PASS    " : "BROKEN  "} canonical REC-D-P1 authority`);
for (const [name, mutate] of mutants) {
  const mutated = mutate(canonical);
  const applied = Object.keys(canonical).some((key) => mutated[key] !== canonical[key]);
  const failed = applied ? violations(mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}
const survivors = results.filter((result) => !result.killed);
console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-d-p1-mutations",
  total: mutants.length,
  killed: mutants.length - survivors.filter((item) =>
    item.name !== "canonical REC-D-P1 authority passes").length,
  survived: survivors.length,
  survivors,
  repositoryBytesRewritten: false,
  productionTouched: false
}, null, 2));
if (survivors.length) process.exitCode = 1;

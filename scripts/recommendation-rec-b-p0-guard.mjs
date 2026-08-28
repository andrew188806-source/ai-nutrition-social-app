#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import {
  RECBP0_BASELINE,
  RECBP0_COMMIT_SUBJECT,
  RECBP0_MIGRATION,
  RECBP0_NPM_KEYS,
  RECBP0_PATHS,
  classifyRecbp0Lifecycle,
  createRecbp0Manifest
} from "./recommendation-rec-b-p0-successor-manifest.mjs";
import {
  RECBP1_BASELINE,
  RECBP1_COMMIT_SUBJECT,
  RECBP1_MIGRATION,
  classifyRecbp1Lifecycle
} from "./recommendation-rec-b-p1-successor-manifest.mjs";
import { RECB_BASELINE, classifyRecbLifecycle } from "./recommendation-rec-b-successor-manifest.mjs";

const root = process.cwd();
const git = (args, options = {}) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], {
    cwd: root, encoding: options.encoding ?? "utf8", maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || "git_failed");
  return options.encoding === null ? result.stdout : (result.stdout ?? "").trim();
};
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = []; const failures = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
};

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const unstaged = lines(git(["diff", "--name-only"]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const deltaPaths = head === RECBP0_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECBP0_BASELINE}..HEAD`]));
const deltaStatuses = head === RECBP0_BASELINE ? [] : lines(git(["diff", "--name-status", `${RECBP0_BASELINE}..HEAD`]));
const lifecycle = classifyRecbp0Lifecycle({
  head,
  parent: head === RECBP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
    || deltaStatuses.some((line) => line.startsWith("D\t"))
});
const recbp1DeltaPaths = head === RECBP1_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECBP1_BASELINE}..HEAD`]));
const recbp1DeltaStatuses = head === RECBP1_BASELINE ? [] : lines(git(["diff", "--name-status", `${RECBP1_BASELINE}..HEAD`]));
const recbp1Lifecycle = classifyRecbp1Lifecycle({
  head,
  parent: head === RECBP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths: recbp1DeltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
    || recbp1DeltaStatuses.some((line) => line.startsWith("D\t"))
});
const recbLifecycle = classifyRecbLifecycle({
  head, parent: head === RECB_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECB_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECB_BASELINE}..HEAD`])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const activeLifecycle = recbLifecycle.valid
  ? Object.freeze({ ...recbLifecycle, phase: `rec_b_${recbLifecycle.phase}` })
  : recbp1Lifecycle.valid
  ? Object.freeze({ ...recbp1Lifecycle, phase: `rec_b_p1_${recbp1Lifecycle.phase}` })
  : lifecycle;

check("lifecycle is the exact REC-B-P0 freeze or REC-B-P1 successor", activeLifecycle.valid, activeLifecycle);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains the expected frozen predecessor authority",
  originHead === (recbLifecycle.valid ? RECB_BASELINE : recbp1Lifecycle.valid ? RECBP1_BASELINE : RECBP0_BASELINE), originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest", new Set(RECBP0_PATHS).size === RECBP0_PATHS.length
  && RECBP0_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/")));
check("every manifest path exists", RECBP0_PATHS.every((file) => fs.existsSync(path.join(root, file))));
const activeMigration = recbp1Lifecycle.valid ? RECBP1_MIGRATION : RECBP0_MIGRATION;
const activeDeltaPaths = recbp1Lifecycle.valid ? recbp1DeltaPaths : deltaPaths;
check("the active round adds exactly its declared migration and mutates no frozen migration",
  recbLifecycle.valid
    ? lines(git(["diff", "--name-only", RECB_BASELINE, "--", "supabase/migrations"])).length === 0
    : worktreePaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === activeMigration)
      && activeDeltaPaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === activeMigration));
check("Production/deploy/workflow surfaces are absent", !activeLifecycle.manifest.some((file) => /production|deploy|\.github\/workflows/i.test(file)));
check("Mobile product surfaces are unchanged before the authorized REC-B runtime successor",
  recbLifecycle.valid || !activeLifecycle.manifest.some((file) => file.startsWith("apps/mobile/")));

const frozenPaths = [
  "supabase/migrations/20260715020000_consumer_public_next_meal_candidates_v1.sql",
  "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql",
  "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql",
  "supabase/migrations/20260821010000_meal_buddy_recommendation_context_handoff.sql",
  "apps/mobile/features/consumer-taste-profile/types.ts",
  "apps/mobile/features/consumer-taste-profile/foundationMappers.ts",
  "packages/shared/src/domain/taste-similarity/index.ts",
  "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts",
  "apps/mobile/features/consumer-meals/nutritionRankingPolicy.ts"
];
check("frozen Taste, Social, Meal Context, candidate, and REC-A product bytes are unchanged",
  recbLifecycle.valid
    ? [RECBP0_MIGRATION, "packages/shared/src/domain/candidate-taste/candidateTasteAuthority.ts"]
      .every((file) => git(["diff", "--name-only", RECB_BASELINE, "--", file]) === "")
    : frozenPaths.every((file) => git(["diff", "--name-only", RECBP0_BASELINE, "--", file]) === ""));

const sql = read(RECBP0_MIGRATION);
const contract = read("packages/shared/src/domain/candidate-taste/candidateTasteAuthority.ts");
const docs = read("docs/recommendation/rec-b-p0-candidate-taste-data-authority.md");
const packageJson = JSON.parse(read("package.json"));

check("closed four-facet authority is exact in SQL and TypeScript",
  ["cuisine", "meal_type", "flavor", "spice"].every((key) => sql.includes(`'${key}'`) && contract.includes(`"${key}"`))
  && /facet_key in \('cuisine', 'meal_type', 'flavor', 'spice'\)/.test(sql)
  && (contract.match(/^\s+"(?:cuisine|meal_type|flavor|spice)",?$/gm) ?? []).length === 4);
check("meal_type reuses the six canonical enum values",
  ["breakfast", "lunch", "dinner", "late_night", "snack", "other"]
    .every((key) => sql.includes(`'meal_type', '${key}'`)));
check("stable version/keys, labels, and lifecycle are normalized",
  /create table public\.candidate_taste_taxonomies/.test(sql)
  && /candidate-taste-v1/.test(sql)
  && /create table public\.candidate_taste_values/.test(sql)
  && /create table public\.candidate_taste_value_labels/.test(sql)
  && (sql.match(/retired_at timestamptz/g) ?? []).length >= 4
  && !/jsonb/.test(sql));
check("facts target exactly one restaurant or menu item",
  /candidate_taste_mappings_one_scope/.test(sql)
  && /\(restaurant_id is not null\)::integer \+ \(menu_item_id is not null\)::integer = 1/.test(sql)
  && /candidate_taste_mappings_restaurant_fact_idx/.test(sql)
  && /candidate_taste_mappings_menu_item_fact_idx/.test(sql));
check("every fact requires closed provenance and an audit reference",
  /create type public\.candidate_taste_provenance as enum/.test(sql)
  && ["restaurant_verified", "admin_verified", "provider_imported", "canonical_mapping"]
    .every((key) => sql.includes(`'${key}'`))
  && /provenance public\.candidate_taste_provenance not null/.test(sql)
  && /source_reference text not null/.test(sql)
  && !/candidate_taste_provenance[\s\S]{0,180}ai_estimated/.test(sql));
check("migration seeds taxonomy structure but no candidate mapping",
  !/insert into public\.candidate_taste_mappings/i.test(sql));
check("write authority is sealed and unattached to client/runtime roles",
  /create role candidate_taste_write_authority with nologin noinherit nobypassrls/.test(sql)
  && (sql.match(/enable row level security/g) ?? []).length === 5
  && (sql.match(/from public, anon, authenticated, authenticator, service_role/g) ?? []).length === 5
  && !/grant candidate_taste_write_authority to (?:anon|authenticated|authenticator|service_role|social_runtime_executor)/i.test(sql));
check("facts projection preserves canonical identity, provenance, and deterministic ordering",
  /consumer_public_next_meal_candidate_taste_facts_v1/.test(sql)
  && /candidate\.candidate_id/.test(sql) && /candidate\.branch_id/.test(sql)
  && /eligible\.provenance::text as provenance/.test(sql)
  && /distinct on \(eligible\.candidate_id, eligible\.facet_key, eligible\.value_key\)/.test(sql)
  && /order by\s+eligible\.candidate_id,\s+eligible\.facet_key,\s+eligible\.value_key,\s+eligible\.mapping_id/.test(sql));
// Facet-level specificity: ANY menu mapping for a facet suppresses EVERY restaurant mapping for that
// same facet. A per-VALUE rule would silently let the two scopes mix whenever the values differ.
check("facts projection applies facet-level specificity precedence, not per-value precedence",
  /where eligible\.menu_scoped\s+or not exists \(/.test(sql)
  && /from eligible as specific/.test(sql)
  && /specific\.candidate_id = eligible\.candidate_id/.test(sql)
  && /specific\.facet_key = eligible\.facet_key/.test(sql)
  && /specific\.menu_scoped/.test(sql)
  && !/specific\.value_key = eligible\.value_key/.test(sql));
check("the winning scope still supports several distinct values for one facet",
  /distinct on \(eligible\.candidate_id, eligible\.facet_key, eligible\.value_key\)/.test(sql)
  && !/distinct on \(eligible\.candidate_id, eligible\.facet_key\)/.test(sql));
check("state projection is one-row additive coverage with explicit unknown/partial/mapped",
  /consumer_public_next_meal_candidate_taste_state_v1/.test(sql)
  && /then 'unknown'/.test(sql) && /then 'mapped'/.test(sql) && /else 'partial'/.test(sql)
  && /known_facet_keys/.test(sql) && /unknown_facet_keys/.test(sql));
check("candidate projections are authenticated read-only and anon denied",
  (sql.match(/grant select on public\.consumer_public_next_meal_candidate_taste_[a-z_0-9]+ to authenticated/g) ?? []).length === 2
  && (sql.match(/revoke all on public\.consumer_public_next_meal_candidate_taste_[a-z_0-9]+ from public, anon, service_role/g) ?? []).length === 2);
check("no user/private/Social tables feed either candidate projection",
  !/from public\.(?:taste_profiles|social_profile_interest_selection|consumer_profiles|meal_records|consumer_ratings)/i.test(
    sql.slice(sql.indexOf("create view public.consumer_public_next_meal_candidate_taste_facts_v1"))));
check("Meal Context stays an explicit separate authority",
  !/(?:join|from) public\.(?:social_interest_catalog|meal_buddy_menu_item_food_context_mapping)/i.test(sql)
  && /Meal Context remains separate/.test(sql)
  && /not silently copied/.test(docs));
check("no scorer, ranking policy, combined order, dietary, or Geo behavior is introduced",
  !/tasteScore|tasteRank|similarityScore|combined(?:Nutrition|_nutrition).*taste|order by[^;]*(?:score|distance)|dietary_restriction|latitude|longitude/i.test(contract + "\n" + sql));
check("shared contract classifies unknown, partial, and mapped without a weight",
  /classifyCandidateTasteCoverage/.test(contract)
  && /knownFacetKeys\.length === 0/.test(contract)
  && /unknownFacetKeys\.length === 0/.test(contract)
  && !/weight|score|rank/i.test(contract));
check("reconnaissance and Development cleanup handoff are recorded",
  /Reconstructed authority/.test(docs) && /Cleanup is mandatory/.test(docs)
  && /fully mapped item/.test(docs) && /partially mapped item/.test(docs) && /unmapped item/.test(docs));
check("all four dedicated commands are registered",
  RECBP0_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-b-p0")));

if (!recbLifecycle.valid && ["frozen_local", "frozen_pushed"].includes(lifecycle.phase)) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECBP0_COMMIT_SUBJECT);
} else if (["frozen_local", "frozen_pushed"].includes(recbp1Lifecycle.phase)) {
  check("successor freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECBP1_COMMIT_SUBJECT);
}
const manifest = createRecbp0Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths", manifest.entries.length === RECBP0_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECBP0_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-b-p0-guard",
  lifecycle: activeLifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: manifest.entries.find((entry) => entry.path === RECBP0_MIGRATION)?.sha256,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;

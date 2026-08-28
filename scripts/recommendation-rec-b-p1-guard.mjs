#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import {
  RECBP1_BASELINE,
  RECBP1_COMMIT_SUBJECT,
  RECBP1_MIGRATION,
  RECBP1_NPM_KEYS,
  RECBP1_PATHS,
  classifyRecbp1Lifecycle,
  createRecbp1Manifest
} from "./recommendation-rec-b-p1-successor-manifest.mjs";
import { RECB_BASELINE, classifyRecbLifecycle } from "./recommendation-rec-b-successor-manifest.mjs";
import { RECCP0_BASELINE, RECCP0_MIGRATION, RECCP0_PATHS, classifyReccp0Lifecycle } from "./recommendation-rec-c-p0-successor-manifest.mjs";
import { RECCP1_BASELINE, RECCP1_MIGRATION, classifyReccp1Lifecycle } from "./recommendation-rec-c-p1-successor-manifest.mjs";

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

const cuisines = [
  "taiwanese", "japanese", "korean", "chinese", "hong_kong_cantonese", "thai",
  "vietnamese", "southeast_asian", "indian", "italian", "french", "american", "mexican",
  "mediterranean", "middle_eastern", "fusion"
];
const flavors = ["sweet", "salty", "sour", "bitter", "umami", "smoky", "creamy", "fermented"];
const spices = ["none", "mild", "medium", "hot"];
const sourceIds = ["private-taste-cuisine-v1", "private-taste-flavor-v1", "private-taste-spice-v1"];

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const unstaged = lines(git(["diff", "--name-only"]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const deltaPaths = head === RECBP1_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECBP1_BASELINE}..HEAD`]));
const deltaStatuses = head === RECBP1_BASELINE ? [] : lines(git(["diff", "--name-status", `${RECBP1_BASELINE}..HEAD`]));
const recbp1Lifecycle = classifyRecbp1Lifecycle({
  head,
  parent: head === RECBP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
    || deltaStatuses.some((line) => line.startsWith("D\t"))
});
const recbLifecycle = classifyRecbLifecycle({
  head, parent: head === RECB_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECB_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECB_BASELINE}..HEAD`])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
// REC-C-P0 is the next successor in flight on top of the pushed REC-B freeze. It is recognised on
// exactly the same terms as the REC-B successor already was: by its own exact path set, nothing else.
const reccp0Lifecycle = classifyReccp0Lifecycle({
  head, parent: head === RECCP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECCP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp0Successor = reccp0Lifecycle.valid;
const reccp1Lifecycle = classifyReccp1Lifecycle({
  head, parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECCP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp1Successor = reccp1Lifecycle.valid;
const lifecycle = recbLifecycle.valid ? recbLifecycle
  : reccp1Successor ? reccp1Lifecycle
  : reccp0Successor ? reccp0Lifecycle : recbp1Lifecycle;

check("lifecycle is the exact REC-B-P1 candidate/freeze",
  lifecycle.valid || reccp0Successor || reccp1Successor,
  { active: lifecycle, reccp0: reccp0Lifecycle.phase, reccp1: reccp1Lifecycle.phase });
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main is the frozen REC-B-P0 predecessor or the exact pushed P1 freeze",
  originHead === RECBP1_BASELINE || originHead === RECB_BASELINE
    || (lifecycle.phase === "frozen_pushed" && originHead === head)
    || (reccp0Successor && originHead === RECCP0_BASELINE)
    || (reccp1Successor && originHead === RECCP1_BASELINE), originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest", new Set(RECBP1_PATHS).size === RECBP1_PATHS.length
  && RECBP1_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/")));
check("every manifest path exists", RECBP1_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("the round adds exactly one migration and mutates no frozen migration",
  reccp1Successor
    ? lines(git(["diff", "--name-only", RECB_BASELINE, "--", "supabase/migrations"]))
        .every((file) => file === RECCP0_MIGRATION || file === RECCP1_MIGRATION)
    : reccp0Successor
    ? lines(git(["diff", "--name-only", RECB_BASELINE, "--", "supabase/migrations"]))
        .every((file) => file === RECCP0_MIGRATION)
    : recbLifecycle.valid
    ? lines(git(["diff", "--name-only", RECB_BASELINE, "--", "supabase/migrations"])).length === 0
    : worktreePaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === RECBP1_MIGRATION)
      && deltaPaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === RECBP1_MIGRATION));
check("Production/deploy/workflow and Mobile product surfaces are absent",
  !lifecycle.manifest.some((file) => /production|deploy|\.github\/workflows/i.test(file))
    && (recbLifecycle.valid || reccp0Successor || reccp1Successor
      || !lifecycle.manifest.some((file) => file.startsWith("apps/mobile/"))));

const frozenPaths = [
  "supabase/migrations/20260828010000_candidate_taste_data_authority.sql",
  "packages/shared/src/domain/candidate-taste/candidateTasteAuthority.ts",
  "apps/mobile/features/consumer-taste-profile/foundationMappers.ts",
  "apps/mobile/features/consumer-taste-profile/consumerTasteProfileService.ts",
  "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts",
  "apps/mobile/features/consumer-meals/nutritionRankingPolicy.ts",
  "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql",
  "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql",
  "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql"
];
check("frozen P0, Taste, REC-A, Social, Meal Context, and GEO bytes are unchanged",
  recbLifecycle.valid || reccp0Successor || reccp1Successor
    ? [RECBP1_MIGRATION, "packages/shared/src/domain/user-taste-normalization/privateTasteNormalization.ts"]
      .every((file) => git(["diff", "--name-only", RECB_BASELINE, "--", file]) === "")
    : frozenPaths.every((file) => git(["diff", "--name-only", RECBP1_BASELINE, "--", file]) === ""));

const sql = read(RECBP1_MIGRATION);
const contract = read("packages/shared/src/domain/user-taste-normalization/privateTasteNormalization.ts");
const docs = read("docs/recommendation/rec-b-p1-user-taste-normalization-authority.md");
const packageJson = JSON.parse(read("package.json"));
const targetValueBlock = sql.slice(
  sql.indexOf("insert into public.candidate_taste_values"),
  sql.indexOf("insert into public.candidate_taste_value_labels")
);
const targetTuples = [...targetValueBlock.matchAll(/\('candidate-taste-v1', '(cuisine|flavor|spice)', '([^']+)'\)/g)]
  .map((match) => `${match[1]}:${match[2]}`);

check("source vocabulary identities and version are exact",
  sourceIds.every((id) => sql.includes(`'${id}', 1`))
  && /private-taste-normalization', 1, 'candidate-taste-v1'/.test(sql)
  && sourceIds.every((id) => contract.includes(`sourceVocabularyId: "${id}"`)));
check("candidate cuisine vocabulary is the exact authorized 16-key set",
  JSON.stringify(targetTuples.filter((value) => value.startsWith("cuisine:")).map((value) => value.slice(8)))
    === JSON.stringify(cuisines));
check("candidate flavor vocabulary is the exact authorized 8-key set",
  JSON.stringify(targetTuples.filter((value) => value.startsWith("flavor:")).map((value) => value.slice(7)))
    === JSON.stringify(flavors));
check("candidate spice vocabulary is the exact authorized 4-key set",
  JSON.stringify(targetTuples.filter((value) => value.startsWith("spice:")).map((value) => value.slice(6)))
    === JSON.stringify(spices));
check("labels are separate and private hot wording stays distinct from candidate wording",
  /candidate_taste_value_labels/.test(sql)
  && /'spice', 'hot', 'zh-TW', '重辣'/.test(sql)
  && /label\.value_key = 'hot' then '愛吃辣'/.test(sql));
check("only exact stable-key and exact zh-TW label aliases are seeded",
  (sql.match(/insert into public\.private_taste_normalization_mappings/g) ?? []).length === 2
  && /source\.source_value_key, 'stable_key', null/.test(sql)
  && /label\.label, 'localized_label', label\.locale/.test(sql)
  && !/['"](?:日式|日本菜|小辣|辣一點|奶味重)['"]/.test(sql));
check("normalization is NFC+trim then case-sensitive exact lookup with no inference",
  /normalize\(pg_catalog\.btrim\(normalized_source_value\), NFC\)/.test(sql)
  && /value\.normalize\("NFC"\)\.trim\(\)/.test(contract)
  && /entry\.normalizedSourceValue === normalizedSourceValue/.test(contract)
  && !/toLowerCase|localeCompare|levenshtein|similarity|fuzzy|openai|anthropic/i.test(contract));
check("cross-facet normalization is rejected by schema and fails closed in the resolver",
  /private_taste_normalization_same_facet check \(source_facet = target_facet\)/.test(sql)
  && /entry\.targetFacet === input\.sourceFacet/.test(contract));
check("active/retired lifecycle controls policy, vocabulary, values, and mappings",
  (sql.match(/constraint private_taste_[a-z_]+_lifecycle/g) ?? []).length >= 4
  && /where mapping\.active and mapping\.retired_at is null/.test(sql)
  && /source\.active and source\.retired_at is null/.test(sql));
check("one active alias is deterministic and every mapping has provenance plus audit reference",
  /private_taste_normalization_active_alias_idx/.test(sql)
  && /where active;/.test(sql)
  && /provenance public\.candidate_taste_provenance not null/.test(sql)
  && /audit_reference text not null/.test(sql));
check("spice semantic order is explicit exact metadata without a coefficient",
  spices.every((key, index) => sql.includes(`'candidate-taste-v1', 'spice', '${key}', ${index}`))
  && /candidate_taste_spice_order/.test(sql)
  && /semanticOrdinal: 0/.test(contract) && /semanticOrdinal: 3/.test(contract)
  && !/coefficient|distancePenalty|spiceScore/i.test(sql + "\n" + contract));
check("meal_type remains a direct six-key contract with no redundant source vocabulary",
  /PRIVATE_TASTE_DIRECT_MEAL_TYPE_KEYS/.test(contract)
  && ["breakfast", "lunch", "dinner", "late_night", "snack", "other"]
    .every((key) => contract.includes(`"${key}"`))
  && !/private-taste-meal/.test(sql + "\n" + contract));
check("pure result states are exact and mapped output has no user or candidate identity",
  ["mapped", "unmapped", "source_unknown", "facet_disabled"].every((state) => contract.includes(`state: "${state}"`))
  && /targetTaxonomyVersion/.test(contract) && /targetValueKey/.test(contract)
  && !/userId|candidateId/.test(contract));
check("new-write validator accepts stable keys only while legacy labels remain readable aliases",
  /validatePrivateTasteProfileWriteValue/.test(contract)
  && /entry\.sourceValueKey === normalized/.test(contract)
  && /Display labels remain readable legacy aliases/.test(contract));
check("no live profile write UI is invented and the recon conclusion is recorded",
  (recbLifecycle.valid || reccp0Successor || reccp1Successor
    || !lifecycle.manifest.some((file) => file.startsWith("apps/mobile/")))
  && /no live private Taste profile write UI/.test(docs));
check("normalization base authority contains no private-user or behavioral columns",
  !/\buser_id\b|\bprofile_id\b|favorite|rating|meal_history|nutrition_goal|latitude|longitude/i.test(
    sql.slice(0, sql.indexOf("-- Product-authorized candidate values only"))
  ));
check("sealed roles own writes and client/runtime roles cannot mutate base authority",
  /create role private_taste_normalization_write_authority with nologin noinherit nobypassrls/.test(sql)
  && (sql.match(/enable row level security/g) ?? []).length === 6
  && (sql.match(/from public, anon, authenticated, authenticator, service_role/g) ?? []).length === 6
  && !/grant private_taste_normalization_write_authority to (?:anon|authenticated|authenticator|service_role)/i.test(sql));
check("authenticated views expose vocabulary only and no normalized-user projection",
  (sql.match(/grant select on public\.consumer_private_taste_[a-z_0-9]+ to authenticated/g) ?? []).length === 2
  && !/grant select on public\.consumer_private_taste_[a-z_0-9]+ to anon/.test(sql)
  && !/create view public\.[a-z_]*normalized_user/i.test(sql));
check("taxonomy completion creates zero candidate restaurant/menu mappings",
  !/insert into public\.candidate_taste_mappings/i.test(sql));
check("P1 contains no Taste ranking, Nutrition composition, GEO, restriction, Social, or Meal Context behavior",
  !/tasteScore|tasteRank|rankingWeight|toleranceBand|flavorPenalty|spiceDistance|nutritionScore|latitude|longitude|dietary_restriction/i.test(contract + "\n" + sql));
check("all four dedicated commands are registered",
  RECBP1_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-b-p1")));
check("Development cleanup handoff is exact and Production remains forbidden",
  /Claude Development acceptance handoff/.test(docs)
  && /Cleanup must/.test(docs)
  && /Production must never be addressed/.test(docs));
const secretPatterns = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}"].join("")),
  new RegExp(["sb", "_secret_[A-Za-z0-9_-]{10,}"].join("")),
  new RegExp(["sb", "p_[A-Za-z0-9]{20,}"].join("")),
  new RegExp(["postgres", "(?:ql)?://[^\\s\"']*:[^\\s\"']*@"].join("")),
  new RegExp(["-----BEGIN ", "[A-Z ]*PRIVATE KEY-----"].join(""))
];
check("manifest bytes contain no credential-shaped secret, CRLF, UTF-8 BOM, or NUL",
  RECBP1_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    const text = bytes.toString("utf8");
    return !secretPatterns.some((pattern) => pattern.test(text))
      && !bytes.includes(Buffer.from("\r\n"))
      && !bytes.includes(0)
      && !(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
  }));

// A successor round's own freeze commit carries that round's subject, not this one's. REC-B was
// already excluded here for that reason; REC-C-P0 is excluded on identical terms.
if (!recbLifecycle.valid && !reccp0Successor && !reccp1Successor
  && (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed")) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECBP1_COMMIT_SUBJECT);
}
const manifest = createRecbp1Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths", manifest.entries.length === RECBP1_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECBP1_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-b-p1-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: manifest.entries.find((entry) => entry.path === RECBP1_MIGRATION)?.sha256,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;

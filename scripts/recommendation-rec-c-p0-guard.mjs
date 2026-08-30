#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import {
  RECCP0_BASELINE,
  RECCP0_COMMIT_SUBJECT,
  RECCP0_MIGRATION,
  RECCP0_NPM_KEYS,
  RECCP0_PATHS,
  classifyReccp0Lifecycle,
  createReccp0Manifest
} from "./recommendation-rec-c-p0-successor-manifest.mjs";
import {
  RECCP1_BASELINE,
  RECCP1_MIGRATION,
  classifyReccp1Lifecycle
} from "./recommendation-rec-c-p1-successor-manifest.mjs";
import { classifyReccLifecycle } from "./recommendation-rec-c-successor-manifest.mjs";
import {
  RECDP0_BASELINE,
  RECDP0_MIGRATION,
  classifyRecdp0Lifecycle
} from "./recommendation-rec-d-p0-successor-manifest.mjs";
import {
  RECDP1_BASELINE, RECDP1_MIGRATION, classifyRecdp1Lifecycle
} from "./recommendation-rec-d-p1-successor-manifest.mjs";

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
const deltaPaths = head === RECCP0_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECCP0_BASELINE}..HEAD`]));
const deltaStatuses = head === RECCP0_BASELINE ? [] : lines(git(["diff", "--name-status", `${RECCP0_BASELINE}..HEAD`]));
const lifecycle = classifyReccp0Lifecycle({
  head,
  parent: head === RECCP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
    || deltaStatuses.some((line) => line.startsWith("D\t"))
});
const reccp1Lifecycle = classifyReccp1Lifecycle({
  head,
  parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths: head === RECCP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp1Successor = reccp1Lifecycle.valid;
const reccLifecycle = classifyReccLifecycle({
  head,
  parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths: head === RECCP1_BASELINE ? [] : lines(git([
    "diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"
  ])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccSuccessor = reccLifecycle.valid;
// REC-D-P0 successor seam ONLY, on the same terms as the REC-C successor above. The stale-origin
// assertion below is deliberately NOT relaxed: that debt is pre-existing, not this round's.
const recdp0Lifecycle = classifyRecdp0Lifecycle({
  head,
  parent: head === RECDP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind,
  ahead,
  worktreePaths,
  stagedPaths,
  deltaPaths: head === RECDP0_BASELINE ? [] : lines(git([
    "diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"
  ])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp0Successor = recdp0Lifecycle.valid;
const recdp1Lifecycle = classifyRecdp1Lifecycle({
  head, parent: head === RECDP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead, behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECDP1_BASELINE ? [] : lines(git([
    "diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"
  ])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp1Successor = recdp1Lifecycle.valid;

check("lifecycle is the exact REC-C-P0 candidate/freeze or REC-C-P1 successor",
  lifecycle.valid || reccp1Successor || reccSuccessor || recdp0Successor || recdp1Successor,
  { reccp0: lifecycle, reccp1: reccp1Lifecycle.phase, recc: reccLifecycle.phase,
    recdp0: recdp0Lifecycle.phase, recdp1: recdp1Lifecycle.phase });
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains the frozen REC-B authority or exact pushed REC-C-P0 freeze",
  originHead === RECCP0_BASELINE || (lifecycle.phase === "frozen_pushed" && originHead === head)
    || (reccp1Successor && originHead === RECCP1_BASELINE), originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest", new Set(RECCP0_PATHS).size === RECCP0_PATHS.length
  && RECCP0_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/")));
check("every manifest path exists", RECCP0_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("the round adds exactly one migration and mutates no frozen migration",
  recdp1Successor
    ? worktreePaths.filter((file) => file.startsWith("supabase/migrations/"))
        .every((file) => file === RECDP1_MIGRATION)
      && deltaPaths.filter((file) => file.startsWith("supabase/migrations/"))
        .every((file) => file === RECCP0_MIGRATION || file === RECCP1_MIGRATION
          || file === RECDP0_MIGRATION || file === RECDP1_MIGRATION)
    : recdp0Successor
    ? worktreePaths.filter((file) => file.startsWith("supabase/migrations/"))
        .every((file) => file === RECDP0_MIGRATION)
      && deltaPaths.filter((file) => file.startsWith("supabase/migrations/"))
        .every((file) => file === RECCP0_MIGRATION || file === RECCP1_MIGRATION
          || file === RECDP0_MIGRATION)
    : reccSuccessor
    ? worktreePaths.every((file) => !file.startsWith("supabase/migrations/"))
      && deltaPaths.filter((file) => file.startsWith("supabase/migrations/"))
        .every((file) => file === RECCP0_MIGRATION || file === RECCP1_MIGRATION)
    : reccp1Successor
    ? worktreePaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === RECCP1_MIGRATION)
      && deltaPaths.filter((file) => file.startsWith("supabase/migrations/"))
        .every((file) => file === RECCP0_MIGRATION || file === RECCP1_MIGRATION)
    : worktreePaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === RECCP0_MIGRATION)
      && deltaPaths.filter((file) => file.startsWith("supabase/migrations/")).every((file) => file === RECCP0_MIGRATION));
check("Production, deploy, workflow, and Mobile surfaces are absent",
  !(recdp1Successor ? recdp1Lifecycle.manifest
    : recdp0Successor ? recdp0Lifecycle.manifest
    : reccSuccessor ? reccLifecycle.manifest : lifecycle.manifest)
    .some((file) => /production|deploy|\.github\/workflows/i.test(file))
    && (reccp1Successor || reccSuccessor || recdp0Successor || recdp1Successor
      || !lifecycle.manifest.some((file) => file.startsWith("apps/mobile/"))));

const frozenPaths = [
  "supabase/migrations/20260828010000_candidate_taste_data_authority.sql",
  "supabase/migrations/20260829010000_private_taste_normalization_authority.sql",
  "apps/mobile/features/consumer-meals/recommendationCompositionPolicy.ts",
  "apps/mobile/features/consumer-meals/recommendationTasteRanking.ts",
  "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts",
  "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql",
  "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql",
  "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql",
  "packages/shared/src/domain/taste-similarity/restriction.ts"
];
check("frozen REC-A/B, Taste, GEO, Meal Context, Social, and restriction bytes are unchanged",
  frozenPaths.every((file) => git(["diff", "--name-only", RECCP0_BASELINE, "--", file]) === ""));

const sql = read(RECCP0_MIGRATION);
const contract = read("packages/shared/src/domain/candidate-allergen/candidateAllergenAuthority.ts");
const docs = read("docs/recommendation/rec-c-p0-candidate-allergen-data-authority.md");
const packageJson = JSON.parse(read("package.json"));
const keys = ["crustacean", "mango", "peanut", "milk", "egg", "tree_nut", "sesame",
  "gluten_containing_cereal", "soy", "fish", "sulfites_ge_10mg_per_kg"];
const valueBlock = sql.slice(sql.indexOf("insert into public.candidate_allergen_values"),
  sql.indexOf("insert into public.candidate_allergen_value_labels"));
const seededKeys = [...valueBlock.matchAll(/\('tastkind-allergen-tw-v1', 1, '([^']+)'\)/g)].map((match) => match[1]);

check("the taxonomy ID/version/domain are exact",
  /'tastkind-allergen-tw-v1', 1, 'allergen_content'/.test(sql)
  && /CANDIDATE_ALLERGEN_TAXONOMY_ID = "tastkind-allergen-tw-v1"/.test(contract));
check("exactly eleven canonical stable keys are seeded in authorized order",
  JSON.stringify(seededKeys) === JSON.stringify(keys)
  && keys.every((key) => contract.includes(`key: "${key}"`)));
check("zh-TW labels are separate from stable identity",
  /create table public\.candidate_allergen_value_labels/.test(sql)
  && ["甲殼類", "芒果", "花生", "牛奶／羊奶", "蛋", "堅果類", "芝麻", "含麩質之穀物", "大豆", "魚類", "亞硫酸鹽（SO₂ ≥ 10 mg\/kg）"]
    .every((label) => sql.includes(`'zh-TW', '${label}'`) && contract.includes(`zhTWLabel: "${label}"`)));
check("taxonomy, values, policies, source vocabularies, mappings, facts, and coverage have lifecycle",
  (sql.match(/constraint [a-z_]+_lifecycle/g) ?? []).length >= 9
  && (sql.match(/retired_at timestamptz/g) ?? []).length >= 9);
check("private source vocabulary and policy identities are exact",
  /private-restriction-allergen-v1/.test(sql)
  && /private-restriction-allergen-normalization-v1/.test(sql)
  && /source_domain text not null check \(source_domain = 'allergy'\)/.test(sql));
check("private aliases are exact stable keys plus exact zh-TW labels only",
  (sql.match(/insert into public\.private_restriction_allergen_normalization_mappings/g) ?? []).length === 2
  && /source\.source_value_key, 'stable_key', null/.test(sql)
  && /label\.label, 'localized_label', label\.locale/.test(sql)
  && !/不吃海鮮[\s\S]{0,80}(?:fish|crustacean)/.test(sql));
check("legacy raw aliases are exactly fish, soy, egg, wheat, and peanut",
  ["fish", "soy", "egg", "wheat", "peanut"].every((key) => sql.includes(`1, '${key}', 'tastkind-allergen-tw-v1'`))
  && !/1, '(?:nuts|shellfish)', 'tastkind-allergen-tw-v1'/.test(sql));
check("normalization is NFC-trimmed exact lookup with no inference",
  /normalize\(pg_catalog\.btrim\(normalized_source_value\), NFC\)/.test(sql)
  && /value\.normalize\("NFC"\)\.trim\(\)/.test(contract)
  && !/toLowerCase|localeCompare|levenshtein|similarity|fuzzy|openai|anthropic/i.test(contract));
check("normalization states are exact and carry no user identity",
  ["mapped", "unmapped", "source_unknown", "facet_disabled"].every((state) => contract.includes(`state: "${state}"`))
  && !/userId|profileId/.test(contract));
check("facts are known-present, exact branch-offer/menu scoped, and never restaurant inherited",
  /create table public\.candidate_allergen_facts/.test(sql)
  && /foreign key \(candidate_id, menu_item_id\)\s+references public\.branch_menu_items \(id, menu_item_id\)/.test(sql)
  && !/candidate_allergen_facts[\s\S]{0,1200}restaurant_id text/.test(sql)
  && !/known_absent/.test(contract));
check("known facts require approved provenance, source reference, and established timestamp",
  /create type public\.candidate_allergen_provenance as enum \(\s*'restaurant_verified',\s*'admin_verified',\s*'provider_verified'\s*\)/.test(sql)
  && /provenance public\.candidate_allergen_provenance not null/.test(sql)
  && /source_reference text not null/.test(sql)
  && /established_at timestamptz not null/.test(sql));
check("coverage states are exact and domain-specific",
  /create type public\.candidate_allergen_coverage_state as enum \(\s*'unknown',\s*'partial',\s*'complete'\s*\)/.test(sql)
  && (sql.match(/fact_domain = 'allergen_content'/g) ?? []).length >= 3);
check("unknown has no fabricated evidence and partial requires trusted evidence",
  /coverage_state = 'unknown'[\s\S]{0,150}provenance is null[\s\S]{0,150}established_at is null/.test(sql)
  && /coverage_state = 'partial'[\s\S]{0,180}provenance is not null[\s\S]{0,180}established_at is not null/.test(sql));
check("complete requires restaurant/admin authority and provider cannot declare it",
  /coverage_state = 'complete'[\s\S]{0,180}provenance in \('restaurant_verified', 'admin_verified'\)/.test(sql)
  && /!authority\.provenanceCanDeclareCompleteCoverage\("provider_verified"\)/.test(read("scripts/recommendation-rec-c-p0-smoke.mjs")));
check("legacy raw arrays are never auto-promoted and empty arrays never imply absence",
  !/insert into public\.candidate_allergen_facts[\s\S]*from public\.menu_items/i.test(sql)
  && !/unnest\([^)]*allergens/.test(sql)
  && /empty raw array means no trustworthy canonical information/i.test(docs));
check("the write authority is sealed and no client/service role can mutate base authority",
  /create role candidate_allergen_write_authority with nologin noinherit nobypassrls/.test(sql)
  && (sql.match(/enable row level security/g) ?? []).length === 11
  && (sql.match(/from public, anon, authenticated, authenticator, service_role/g) ?? []).length === 11
  && !/grant candidate_allergen_write_authority to (?:anon|authenticated|authenticator|service_role)/i.test(sql));
check("fact and coverage projections preserve candidate identity and deterministic ordering",
  /consumer_authenticated_next_meal_candidate_allergen_facts_v1/.test(sql)
  && /candidate\.candidate_id/.test(sql) && /candidate\.branch_id/.test(sql)
  && /order by candidate\.candidate_id, fact\.allergen_key, fact\.fact_id/.test(sql)
  && /consumer_authenticated_next_meal_candidate_allergen_coverage_v1/.test(sql)
  && /coalesce\(coverage\.coverage_state, 'unknown'/.test(sql));
check("candidate projections expose no provenance internals, user restrictions, severity, or compatibility",
  !/user_id|restriction_type|severity|audit_reference|source_reference|safe_for|compatible_with/i.test(sql.slice(
    sql.indexOf("create view public.consumer_authenticated_next_meal_candidate_allergen_facts_v1"),
    sql.indexOf("comment on view public.consumer_authenticated_next_meal_candidate_allergen_facts_v1")
  )));
check("all four projections are authenticated-only and anon denied",
  (sql.match(/grant select on public\.consumer_authenticated_[a-z_0-9]+ to authenticated/g) ?? []).length === 4
  && !/grant select on public\.consumer_authenticated_[a-z_0-9]+ to anon/.test(sql));
check("no safety boolean, eligibility, ranking, Taste, Nutrition, GEO, Meal Context, or Social behavior is introduced",
  !/safeForUser|allergenFree|compatibilityScore|restrictionPenalty|hardExclusion|tasteScore|nutritionScore|latitude|longitude/i.test(contract));
check("cross-contact and complete limitations are explicit",
  /Cross-contact would require a\s+separate future domain/.test(docs)
  && /does not establish cross-contact safety/.test(docs)
  && /never cross-contact or allergy safety/.test(sql));
check("all four dedicated commands are registered",
  RECCP0_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-c-p0")));
check("Development cleanup handoff and Production prohibition are explicit",
  /Claude Development acceptance handoff/.test(docs)
  && /clean them up completely/.test(docs)
  && /Production must never be\s+addressed/.test(docs));

const secretPatterns = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}"].join("")),
  new RegExp(["sb", "_secret_[A-Za-z0-9_-]{10,}"].join("")),
  new RegExp(["postgres", "(?:ql)?://[^\\s\"']*:[^\\s\"']*@"].join("")),
  new RegExp(["-----BEGIN ", "[A-Z ]*PRIVATE KEY-----"].join(""))
];
check("manifest bytes contain no credential shape, CRLF, BOM, or NUL",
  RECCP0_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file)); const text = bytes.toString("utf8");
    return !secretPatterns.some((pattern) => pattern.test(text)) && !bytes.includes(Buffer.from("\r\n"))
      && !bytes.includes(0) && !(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
  }));

if (!reccSuccessor && (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed")) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECCP0_COMMIT_SUBJECT);
}
const manifest = createReccp0Manifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths", manifest.entries.length === RECCP0_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECCP0_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-c-p0-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: manifest.entries.find((entry) => entry.path === RECCP0_MIGRATION)?.sha256,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;

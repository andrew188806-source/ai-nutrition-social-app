#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RECC_BASELINE,
  RECC_COMMIT_SUBJECT,
  RECC_NPM_KEYS,
  RECC_PATHS,
  classifyReccLifecycle,
  createReccManifest
} from "./recommendation-rec-c-successor-manifest.mjs";
import {
  RECDP0_BASELINE,
  RECDP0_PATHS,
  classifyRecdp0Lifecycle
} from "./recommendation-rec-d-p0-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const bytesSha = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(root, file))).digest("hex");
const git = (args) => child.execFileSync("git", args, {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = []; const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const worktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const deltaPaths = head === RECC_BASELINE ? []
  : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const lifecycle = classifyReccLifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === RECC_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
// REC-D-P0 successor seam ONLY. Recognising the next round's exact lifecycle and exact path set
// stops this guard reporting work that is not its own. Nothing below is weakened: on REC-C's own
// commit the REC-D-P0 set is absent and every assertion evaluates exactly as before.
const recdp0Lifecycle = classifyRecdp0Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths,
  deltaPaths: head === RECDP0_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECDP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp0Successor = recdp0Lifecycle.valid;

const policy = read("packages/shared/src/domain/candidate-allergen/allergyContentEligibility.ts");
const evidence = read("apps/mobile/features/consumer-meals/adapters/supabaseRecommendationAllergyEvidenceReader.ts");
const repository = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
const factories = read("apps/mobile/features/consumer-meals/factories.ts");
const service = read("apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts");
const mapper = read("apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");
const types = read("apps/mobile/features/consumer-meals/types.ts");
const docs = read("docs/recommendation/rec-c-allergy-eligibility-activation.md");
const packageJson = JSON.parse(read("package.json"));

check("lifecycle is exact REC-C candidate or freeze",
  lifecycle.valid || recdp0Successor, lifecycle.phase);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains exact P1 baseline or exact pushed REC-C freeze",
  originHead === RECC_BASELINE || (lifecycle.phase === "frozen_pushed" && originHead === head)
  || (recdp0Successor && originHead === RECDP0_BASELINE));
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("manifest is exact, sorted, unique, wildcard-free, and present",
  JSON.stringify(RECC_PATHS) === JSON.stringify([...RECC_PATHS].sort())
  && new Set(RECC_PATHS).size === RECC_PATHS.length
  && RECC_PATHS.every((file) => !/[?*]/.test(file) && fs.existsSync(path.join(root, file))));
check("REC-C adds no migration and changes no frozen migration path",
  !RECC_PATHS.some((file) => file.startsWith("supabase/migrations/")));
check("P0 migration digest remains frozen",
  bytesSha("supabase/migrations/20260830010000_candidate_allergen_data_authority.sql")
  === "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a");
check("P1 migration digest remains frozen",
  bytesSha("supabase/migrations/20260831010000_user_allergy_setting_authority.sql")
  === "117994481084313b8c5ef2d9483064a0ec893324589a14e6e286cd85f43171a0");

check("shared policy identity and taxonomy are exact",
  /tastkind\.allergy\.content_eligibility/.test(policy)
  && /ALLERGY_CONTENT_ELIGIBILITY_POLICY_VERSION = 1/.test(policy)
  && /CANDIDATE_ALLERGEN_TAXONOMY_ID/.test(policy));
check("user states are exactly no-active, active, and unresolved",
  /no_active_allergies/.test(policy) && /active_allergies/.test(policy)
  && /unresolved_user_allergy/.test(policy) && !/restriction_type|severity|label/.test(policy));
check("candidate states are exact and contain no safety state",
  ["known_allergen_conflict", "allergen_coverage_unknown",
    "allergen_coverage_partial", "complete_no_known_conflict"].every((value) => policy.includes(value))
  && !/allergy_safe|allergen_free|medically_safe/i.test(policy));
check("policy excludes conflict, unknown, and partial and admits only complete/no-conflict",
  /knownConflict: "exclude"/.test(policy)
  && /unknownCoverage: "exclude"/.test(policy)
  && /partialCoverage: "exclude"/.test(policy)
  && /completeNoKnownConflict: "eligible"/.test(policy));
check("missing facts never establish absence",
  /coverageState === "unknown"[\s\S]{0,150}eligible: false/.test(policy)
  && /coverageState === "partial"[\s\S]{0,150}eligible: false/.test(policy));

check("P1 integration uses only the canonical frozen repository reader",
  /SupabaseConsumerAllergySettingsRepository/.test(factories)
  && /allergySettingsReader: dependencies\.allergySettingsReader/.test(factories)
  && /this\.options\.allergySettingsReader\.loadCurrentUser\(\)/.test(repository)
  && !/dietary_restrictions|restriction_type|severity|social/i.test(repository + factories));
check("P0 reader uses only authenticated fact and coverage projections",
  /consumer_authenticated_next_meal_candidate_allergen_facts_v1/.test(evidence)
  && /consumer_authenticated_next_meal_candidate_allergen_coverage_v1/.test(evidence));
check("P0 reader validates taxonomy, domain, coverage, and every branch-offer identity",
  /CANDIDATE_ALLERGEN_TAXONOMY_ID/.test(evidence)
  && /fact_domain !== "allergen_content"/.test(evidence)
  && /coverage\.length !== candidates\.length/.test(evidence)
  && /candidate\.branchId === evidence\.branchId/.test(evidence));
check("P0 fact and coverage failures are unavailable rather than empty",
  (evidence.match(/status: "unavailable"/g) ?? []).length >= 4
  && !/known_absent/.test(evidence));

const allergyPosition = repository.indexOf("applyAllergyEligibility(mapped)");
const nutritionPosition = repository.indexOf("rankNextMealCandidatesByNutrition(");
const tastePosition = repository.indexOf("this.applyTasteRanking(ranked, input)");
check("pipeline order is acquisition/GEO then Allergy then REC-A then REC-B",
  allergyPosition > repository.indexOf("rows.map(mapRowToCandidate)")
  && allergyPosition < nutritionPosition && nutritionPosition < tastePosition);
check("no-active Allergy is neutral and skips P0 evidence",
  /userState\.state === "no_active_allergies"[\s\S]{0,260}candidates,[\s\S]{0,120}status: "not_applied"/.test(repository));
check("unresolved and every authority failure return coarse read_failed",
  /next_meal_allergy_unresolved_user_allergy/.test(repository)
  && (repository.match(/next_meal_allergy_authority_unavailable/g) ?? []).length >= 5);
check("zero survivors returns exact Allergy empty without fallback",
  /allergyResult\.candidates\.length === 0[\s\S]{0,100}reason: "allergy_eligibility"/.test(repository));
check("GEO fallback cannot mistake Allergy failure for GEO infrastructure failure",
  /errorCode\.startsWith\("next_meal_geo_"\)/.test(service)
  && !/"next_meal_geo_(?:allergy|restriction)/.test(repository));
check("entitlement remains a prefix after the canonical result",
  /recommendation\.candidates\)\.slice\(0, visibleLimit\)/.test(mapper)
  && !/reverse\(\)/.test(mapper));

check("output carries only coarse policy application identity",
  /allergyEligibilityStatus: "not_applied" \| "applied"/.test(types)
  && /appliedAllergyPolicyId\?: string/.test(types)
  && !/allergenKeys|severity|sourceVocabulary/.test(types));
check("active notice includes cross-contact caution and no safety claim",
  /交叉接觸/.test(mapper)
  && !/過敏安全|無過敏原|allergy-safe|allergen-free/i.test(mapper));
check("unresolved copy points to the existing settings path",
  /個人設定 → 飲食限制 → 過敏原/.test(mapper));
check("Today Intake and Meal Buddy product bytes remain frozen",
  bytesSha("apps/mobile/app/recommendation.tsx")
    === "cb5c52f02f2c463913dc67540241185c88f2f88bdc9f80543869c15a0521c5a2"
  && bytesSha("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts")
    === "5cadd3723584fd2c2679e2a68d03b30ffcf6f3bdce33d7b4e0b3086ff3ad3b9c"
  && bytesSha("apps/mobile/features/consumer-meals/consumerMealRecordWriteService.ts")
    === "df30ea49d8a8d1b6d2467829f7d17b7fd8137d619ecb16e9235b59dc5775bcf9");
check("docs preserve Allergy-only scope and forbid safety claims",
  /ALLERGY ONLY|Allergy-only/i.test(docs)
  && /not a score, medical advice, a safety/.test(docs)
  && /Production remains forbidden/.test(docs));
check("all three dedicated commands are registered",
  RECC_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-c")));
check("Production, deployment, schema, and migration paths are untouched",
  !RECC_PATHS.some((file) => /production|deploy|schema|supabase\/migrations|\.github\/workflows/i.test(file)));

const secretPatterns = [
  /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
check("manifest bytes contain no credential shape, CRLF, BOM, or NUL",
  RECC_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    const text = bytes.toString("utf8");
    return !secretPatterns.some((pattern) => pattern.test(text))
      && !bytes.includes(Buffer.from("\r\n"))
      && !bytes.includes(0)
      && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
  }));
if (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed") {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECC_COMMIT_SUBJECT);
}
const manifest = createReccManifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths",
  manifest.entries.length === RECC_PATHS.length
  && manifest.entries.every((entry, index) =>
    entry.path === RECC_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-c-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  p0MigrationSha256: "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a",
  p1MigrationSha256: "117994481084313b8c5ef2d9483064a0ec893324589a14e6e286cd85f43171a0",
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;

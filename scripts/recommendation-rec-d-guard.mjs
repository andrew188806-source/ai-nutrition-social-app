#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RECD_BASELINE,
  RECD_COMMIT_SUBJECT,
  RECD_NPM_KEYS,
  RECD_PATHS,
  classifyRecdLifecycle,
  createRecdManifest
} from "./recommendation-rec-d-successor-manifest.mjs";
import {
  GEO1DP0_BASELINE,
  GEO1DP0_MIGRATION,
  GEO1DP0_MIGRATION_SHA256,
  GEO1DP0_PATHS,
  classifyGeo1dp0Lifecycle
} from "./geo-meal-buddy-geo-1d-p0-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(root, file))).digest("hex");
const git = (args, encoding = "utf8") => child.execFileSync("git", args, {
  cwd: root, encoding, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = []; const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(condition || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

const head = git(["rev-parse", "HEAD"]); const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const worktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const deltaPaths = head === RECD_BASELINE ? []
  : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const lifecycle = classifyRecdLifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === RECD_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const geo1dp0Lifecycle = classifyGeo1dp0Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths,
  deltaPaths: head === GEO1DP0_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === GEO1DP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const geo1dp0Successor = geo1dp0Lifecycle.valid;

const policy = read("packages/shared/src/domain/candidate-ingredient-avoidance/ingredientAvoidanceContentEligibility.ts");
const evidence = read("apps/mobile/features/consumer-meals/adapters/supabaseRecommendationIngredientAvoidanceEvidenceReader.ts");
const repository = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
const factories = read("apps/mobile/features/consumer-meals/factories.ts");
const service = read("apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts");
const mapper = read("apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");
const types = read("apps/mobile/features/consumer-meals/types.ts");
const docs = read("docs/recommendation/rec-d-ingredient-avoidance-eligibility-activation.md");
const packageJson = JSON.parse(read("package.json"));

check("lifecycle is exact REC-D candidate or freeze",
  lifecycle.valid || geo1dp0Successor, geo1dp0Successor ? geo1dp0Lifecycle.phase : lifecycle.phase);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains exact P1 baseline or exact pushed REC-D freeze",
  originHead === RECD_BASELINE || (lifecycle.phase === "frozen_pushed" && originHead === head)
    || (geo1dp0Successor && originHead === GEO1DP0_BASELINE), originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("manifest is exact, sorted, unique, wildcard-free, and present",
  JSON.stringify(RECD_PATHS) === JSON.stringify([...RECD_PATHS].sort())
  && new Set(RECD_PATHS).size === RECD_PATHS.length
  && RECD_PATHS.every((file) => !/[?*]/.test(file) && fs.existsSync(path.join(root, file))));
check("round changes exactly the REC-D manifest",
  JSON.stringify(geo1dp0Successor ? geo1dp0Lifecycle.manifest : lifecycle.manifest)
    === JSON.stringify(geo1dp0Successor ? GEO1DP0_PATHS : RECD_PATHS),
  { actual: geo1dp0Successor ? geo1dp0Lifecycle.manifest : lifecycle.manifest,
    expected: geo1dp0Successor ? GEO1DP0_PATHS : RECD_PATHS });
check("REC-D adds no migration", geo1dp0Successor
  ? GEO1DP0_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1
    && GEO1DP0_PATHS.includes(GEO1DP0_MIGRATION)
    && sha(GEO1DP0_MIGRATION) === GEO1DP0_MIGRATION_SHA256
  : !RECD_PATHS.some((file) => file.startsWith("supabase/migrations/")));
check("REC-C-P0 migration digest remains frozen",
  sha("supabase/migrations/20260830010000_candidate_allergen_data_authority.sql")
    === "eccebb25a1d705786256a67c028e35c7a2e2298d39c6036051c5eb0b2ea32b5a");
check("REC-C-P1 migration digest remains frozen",
  sha("supabase/migrations/20260831010000_user_allergy_setting_authority.sql")
    === "117994481084313b8c5ef2d9483064a0ec893324589a14e6e286cd85f43171a0");
check("REC-D-P0 migration digest remains frozen",
  sha("supabase/migrations/20260901010000_candidate_ingredient_avoidance_data_authority.sql")
    === "3e03a4ba3e93a43763861c1669e4193c6b830dcbda2fea630d44b999d11477bd");
check("REC-D-P1 migration digest remains frozen",
  sha("supabase/migrations/20260902010000_user_ingredient_avoidance_setting_authority.sql")
    === "44509ecfd6cefde1ff5360c932a33452a90bd199bbd20d075ce7df0093279e0f");

check("policy identity and frozen taxonomy are exact",
  /tastkind\.ingredient_avoidance\.content_eligibility/.test(policy)
  && /POLICY_VERSION = 1/.test(policy)
  && /CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID/.test(policy));
check("user authority states are exact and fail closed",
  ["no_active_governed_avoidance", "active_governed_avoidance",
    "unresolved_governed_avoidance", "authority_unavailable"].every((value) => policy.includes(value)));
check("candidate states are exact binary eligibility states",
  ["known_ingredient_avoidance_conflict", "ingredient_avoidance_coverage_unknown",
    "ingredient_avoidance_coverage_partial", "complete_no_known_ingredient_avoidance_conflict"]
    .every((value) => policy.includes(value)));
check("policy excludes conflict unknown partial and admits only complete no-conflict",
  /knownConflict: "exclude"/.test(policy) && /unknownCoverage: "exclude"/.test(policy)
  && /partialCoverage: "exclude"/.test(policy) && /completeNoKnownConflict: "eligible"/.test(policy));
check("policy has no score rank safety religion or inferred-key authority",
  !/score|weight|bonus|penalty|halal|religio|safe|infer|fourth/i.test(policy));

check("P1 integration uses only the canonical governed reader",
  /SupabaseConsumerIngredientAvoidanceSettingsRepository/.test(factories)
  && /ingredientAvoidanceSettingsReader: dependencies\.ingredientAvoidanceSettingsReader/.test(factories)
  && /this\.options\.ingredientAvoidanceSettingsReader\.loadCurrentUser\(\)/.test(repository));
check("runtime contains no legacy label Taste Social or name inference fallback",
  !/dietary_restrictions|restriction_type|legacy|menu.?name|cuisine|keyword|social.?fallback|taste.?fallback/i
    .test(repository + evidence + policy));
check("P0 reader uses only exact authenticated fact and coverage projections",
  /consumer_authenticated_candidate_avoidance_facts_v1/.test(evidence)
  && /consumer_authenticated_candidate_avoidance_coverage_v1/.test(evidence)
  && /fact_domain !== "ingredient_avoidance_content"/.test(evidence));
check("P0 evidence validates complete branch-offer identity",
  /candidate\.candidateId === evidence\.candidateId/.test(evidence)
  && /candidate\.restaurantId === evidence\.restaurantId/.test(evidence)
  && /candidate\.branchId === evidence\.branchId/.test(evidence)
  && /candidate\.menuItemId === evidence\.menuItemId/.test(evidence));
check("missing coverage and authority errors stay unavailable",
  /coverage\.length !== candidates\.length/.test(evidence)
  && (evidence.match(/status: "unavailable"/g) ?? []).length >= 4
  && !/known_absent/.test(evidence));

const allergy = repository.indexOf("applyAllergyEligibility(mapped)");
const avoidance = repository.indexOf("applyIngredientAvoidanceEligibility(");
const nutrition = repository.indexOf("rankNextMealCandidatesByNutrition(");
const taste = repository.indexOf("this.applyTasteRanking(ranked, input)");
check("pipeline is GEO then Allergy then Ingredient Avoidance then REC-A then REC-B",
  allergy > repository.indexOf("rows.map(mapRowToCandidate)")
  && allergy < avoidance && avoidance < nutrition && nutrition < taste);
check("REC-D receives only REC-C Allergy survivors",
  /applyIngredientAvoidanceEligibility\(\s*allergyResult\.candidates/.test(repository));
check("no-active governed avoidance is neutral and skips P0 evidence",
  /userState\.state === "no_active_governed_avoidance"[\s\S]{0,300}candidates,[\s\S]{0,120}status: "not_applied"/.test(repository));
check("unresolved and unavailable authorities fail closed",
  /next_meal_ingredient_avoidance_unresolved_governed_avoidance/.test(repository)
  && (repository.match(/next_meal_ingredient_avoidance_authority_unavailable/g) ?? []).length >= 5);
check("zero survivors remains an honest REC-D empty result",
  /ingredientAvoidanceResult\.candidates\.length === 0[\s\S]{0,120}reason: "ingredient_avoidance_eligibility"/.test(repository));
check("GEO fallback responds only to GEO infrastructure failures",
  /errorCode\.startsWith\("next_meal_geo_"\)/.test(service)
  && !/next_meal_geo_ingredient/.test(repository));
check("REC-D is not a ranking lane score or ordering authority",
  !/ingredientAvoidance(?:Score|Weight|Bonus|Penalty|Lane|Rank|Tie)/i.test(repository + types)
  && /ingredientAvoidanceResult\.candidates,\s*input\.nutritionRanking/.test(repository));
check("entitlement remains a prefix of the post-filter canonical order",
  /recommendation\.candidates\)\.slice\(0, visibleLimit\)/.test(mapper) && !/reverse\(\)/.test(mapper));

check("output carries only coarse REC-D application identity",
  /ingredientAvoidanceEligibilityStatus: "not_applied" \| "applied"/.test(types)
  && /appliedIngredientAvoidancePolicyId\?: string/.test(types)
  && !/selectedIngredientAvoidanceKeys|knownPresentIngredientAvoidanceKeys|coverageState/.test(types));
check("presentation is truthful and makes no safety or religious claim",
  /我不吃的食物/.test(mapper)
  && !/清真|宗教|安全|保證|halal|religious.?compliance/i.test(mapper));
check("Allergy remains separate and earlier",
  /allergyEligibilityStatus/.test(types) && allergy < avoidance
  && !/allergen/i.test(policy + evidence));
check("Today Intake canonical write and Meal Buddy handoff bytes are unchanged from baseline",
  git(["diff", "--name-only", RECD_BASELINE, "--", "apps/mobile/app/recommendation.tsx",
    "apps/mobile/features/consumer-meals/consumerMealRecordWriteService.ts",
    "apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts"]) === "");
check("docs freeze separation privacy no-ranking and no-migration boundaries",
  /binary and pre-ranking/.test(docs) && /does not change survivor scoring or ordering/.test(docs)
  && /Raw selected keys/.test(docs) && /No migration is added/.test(docs));
check("all three dedicated commands are registered",
  RECD_NPM_KEYS.every((key) => packageJson.scripts[key]?.includes("recommendation-rec-d")));
check("Production deployment schema and migration paths are untouched",
  !RECD_PATHS.some((file) => /production|deploy|schema|supabase\/migrations|\.github\/workflows/i.test(file)));

const secretPatterns = [
  /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
check("manifest bytes contain no credential shape CRLF BOM or NUL", RECD_PATHS.every((file) => {
  const bytes = fs.readFileSync(path.join(root, file)); const text = bytes.toString("utf8");
  return !secretPatterns.some((pattern) => pattern.test(text))
    && !bytes.includes(Buffer.from("\r\n")) && !bytes.includes(0)
    && !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
}));
if (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed") {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECD_COMMIT_SUBJECT);
}
const manifest = createRecdManifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths",
  manifest.entries.length === RECD_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECD_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-d-guard", lifecycle: lifecycle.phase,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  recdP0MigrationSha256: "3e03a4ba3e93a43763861c1669e4193c6b830dcbda2fea630d44b999d11477bd",
  recdP1MigrationSha256: "44509ecfd6cefde1ff5360c932a33452a90bd199bbd20d075ce7df0093279e0f",
  networkUsed: false, databaseUsed: false, developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;

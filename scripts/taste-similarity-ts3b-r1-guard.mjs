#!/usr/bin/env node
// TS-3B-R1 guard — REPEATED CANONICAL MEAL CONSUMPTION EVIDENCE.
//
// Lifecycle-aware, never lifecycle-dependent: every assertion is a repository CONTENT assertion over
// the working tree, so the verdict is identical before and after the freeze commit. The only
// lifecycle-sensitive input is the manifest, read from the candidate while the round is open and
// from the freeze commit's own diff-tree once it has landed.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const baseline = "8e7592caa351813021c6b9e34a31635a2db6c866";
const freezeMessage = "Add repeated meal evidence to taste similarity";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const manifest = [
  "package.json",
  `${similarityRoot}/comparator.ts`,
  `${similarityRoot}/policy.ts`,
  `${similarityRoot}/reasonCodes.ts`,
  `${similarityRoot}/types.ts`,
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3-mutations.mjs",
  "scripts/taste-similarity-ts3-smoke.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-mutations.mjs",
  "scripts/taste-similarity-ts3b-r1-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// TS-1, TS-2, TS-2D and the TS-3 barrel are frozen. R1 must not have edited a byte of any of them.
const frozenPredecessorPaths = [
  `${domainRoot}/behavior.ts`,
  `${domainRoot}/evidence.ts`,
  `${domainRoot}/evidenceWindow.ts`,
  `${domainRoot}/goal.ts`,
  // TS-3C successor amendment. `${domainRoot}/index.ts` was listed here as a frozen path, which was
  // correct while R1 was the open round — R1 itself added nothing to the barrel. But the barrel is
  // the one file every additive successor module must touch to be exported at all, so freezing it
  // forever would block additive work for a reason unrelated to R1's semantics. The invariant R1
  // actually protects is that no predecessor IMPLEMENTATION changes; the barrel is a re-export
  // surface, and 31b below holds it to a stricter bar than blanket immutability: it must keep
  // exporting the similarity module and may only gain further `export *` lines.
  `${domainRoot}/normalization.ts`,
  `${domainRoot}/preference.ts`,
  `${domainRoot}/restriction.ts`,
  `${domainRoot}/snapshot.ts`,
  `${domainRoot}/sourceState.ts`,
  `${similarityRoot}/index.ts`,
  mobileRoot,
  "supabase"
];

const checks = [];
const failures = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);

function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}

function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of [
    "test:taste-similarity-ts3b-r1",
    "test:taste-similarity-ts3b-r1-smoke",
    "test:taste-similarity-ts3b-r1-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: the two fallback dimensions exist, the repeated codes exist, and no branch or
// social dimension can be named.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts3b-r1-types-"));
  try {
    const importPath = path.join(root, similarityRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "repeated-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        TasteSimilarityDimension,
        TasteSimilarityReasonCode,
        TasteSimilarityResult
      } from ${JSON.stringify(importPath)};

      const repeatedRestaurant: TasteSimilarityDimension = "repeated_meal_restaurant";
      const repeatedMenuItem: TasteSimilarityDimension = "repeated_meal_menu_item";
      const restaurantCode: TasteSimilarityReasonCode = "shared_repeated_restaurant_consumption";
      const menuItemCode: TasteSimilarityReasonCode = "shared_repeated_menu_item_consumption";

      declare const result: TasteSimilarityResult;
      const repeatedCounts: number = result.confidenceInputs.repeatedMealEvidence.qualifyingRestaurantTargets;
      const suppressed: boolean = result.confidenceInputs.repeatedMealEvidence.restaurantSuppressedByFavorites;

      // @ts-expect-error branch identity is not a taste dimension in R1
      const branch: TasteSimilarityDimension = "repeated_meal_branch";
      // @ts-expect-error meal history is not a dimension in its own right
      const rawMeals: TasteSimilarityDimension = "meal_occurrence";
      // @ts-expect-error ratings remain excluded
      const ratings: TasteSimilarityDimension = "rating";
      // @ts-expect-error social logistics compatibility does not start in R1
      const social: TasteSimilarityDimension = "social_logistics";
      // @ts-expect-error visit counts are not part of the explanation vocabulary
      const visits: TasteSimilarityReasonCode = "repeated_visit_count";
      // @ts-expect-error a numeric confidence is still not part of the contract
      const confidence: number = result.confidenceInputs.confidenceScore;
      void [repeatedRestaurant, repeatedMenuItem, restaurantCode, menuItemCode, repeatedCounts, suppressed, branch, rawMeals, ratings, social, visits, confidence];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, similarityRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, similarityRoot, file));
    const program = ts.createProgram([...sourceFiles, probePath], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freezeCandidates = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout.split(/\r?\n/).filter(Boolean)
    .map((entry) => entry.split("\t")).filter(([, subject]) => subject === freezeMessage).map(([commit]) => commit);
  const freezeCommit = freezeCandidates[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]).stdout)
    : candidatePaths();

  const policy = read(`${similarityRoot}/policy.ts`);
  const reasonCodes = read(`${similarityRoot}/reasonCodes.ts`);
  const types = read(`${similarityRoot}/types.ts`);
  const comparator = read(`${similarityRoot}/comparator.ts`);
  const similarityIndex = read(`${similarityRoot}/index.ts`);
  const implementation = [policy, reasonCodes, types, comparator, similarityIndex].join("\n");
  const executable = implementation.split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  const comparatorCode = comparator.split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  // ---- 1-2. repetition authority ----------------------------------------------------------------
  check("1. the repetition boundary is one named constant fixed at exactly 2",
    /export const MIN_REPEATED_MEAL_OCCURRENCES = 2;/.test(policy)
    && (implementation.match(/MIN_REPEATED_MEAL_OCCURRENCES/g) ?? []).length >= 2);
  check("2. qualification is a single inclusive comparison against that constant, so one occurrence can never qualify",
    /evidenceIds\.size >= MIN_REPEATED_MEAL_OCCURRENCES/.test(comparator)
    && (comparatorCode.match(/evidenceIds\.size/g) ?? []).length === 1
    && !/evidenceIds\.size\s*(?:>=|>|===|<|<=)\s*\d/.test(comparatorCode));

  // ---- 3-6. canonical identity ------------------------------------------------------------------
  check("3. repeated restaurant identity is the canonical restaurant id",
    /addOccurrence\(restaurantOccurrenceIds, target\.restaurantId, behavior\.evidence\.evidenceId\)/.test(comparator));
  check("4. repeated menu-item identity stays the composite restaurant and item pair",
    /addOccurrence\(menuItemOccurrenceIds, `\$\{target\.restaurantId\}::\$\{target\.menuItemId\}`, behavior\.evidence\.evidenceId\)/.test(comparator));
  check("5. branch is not a taste dimension and is never inferred as a restaurant visit",
    !/repeated_meal_branch|branch_preference/.test(types) && !/branchId/.test(executable)
    && /target\.kind === "restaurant"/.test(comparator) && /target\.kind === "menu_item"/.test(comparator));
  check("6. no display name of any kind is read as identity",
    !/displayName|restaurantName|menuItemName|\.name\b/.test(implementation));

  // ---- 7-8. the two fallback dimensions ---------------------------------------------------------
  check("7. the repeated restaurant dimension exists", /"repeated_meal_restaurant"/.test(types)
    && /outcomes\.push\(\{ dimension: "repeated_meal_restaurant"/.test(comparator));
  check("8. the repeated menu-item dimension exists", /"repeated_meal_menu_item"/.test(types)
    && /outcomes\.push\(\{ dimension: "repeated_meal_menu_item"/.test(comparator));

  // ---- 9-11. fallback suppression, no double counting -------------------------------------------
  check("9. a comparable favorite restaurant suppresses the repeated restaurant fallback",
    /const restaurantSuppressedByFavorites = favoriteRestaurants !== null && restaurantFamilyHasMeals;/.test(comparator)
    && /if \(favoriteRestaurants === null && restaurantFamilyHasMeals\) \{/.test(comparator));
  check("10. a comparable favorite menu item suppresses the repeated menu-item fallback",
    /const menuItemSuppressedByFavorites = favoriteMenuItems !== null && menuItemFamilyHasMeals;/.test(comparator)
    && /if \(favoriteMenuItems === null && menuItemFamilyHasMeals\) \{/.test(comparator));
  check("11. each identity family can contribute at most one comparable dimension, so nothing is double counted",
    (comparator.match(/outcomes\.push\(\{ dimension: "repeated_meal_restaurant"/g) ?? []).length === 1
    && (comparator.match(/outcomes\.push\(\{ dimension: "repeated_meal_menu_item"/g) ?? []).length === 1
    && !/favoriteRestaurants !== null[\s\S]{0,200}outcomes\.push\(\{ dimension: "repeated_meal_restaurant"/.test(comparator));

  // ---- 12-16. no graded, weighted, recency or decay semantics -----------------------------------
  check("12. repeated sets are compared with the existing parameter-free Jaccard helper",
    /compareSets\(leftFacts\.repeatedRestaurantIds, rightFacts\.repeatedRestaurantIds\)/.test(comparator)
    && /compareSets\(leftFacts\.repeatedMenuItemIds, rightFacts\.repeatedMenuItemIds\)/.test(comparator)
    && /intersectionSize \/ unionSize/.test(comparator));
  check("13. no frequency multiplier or logarithmic frequency scaling exists",
    !/Math\.log|Math\.pow|Math\.sqrt|frequency|multiplier/i.test(executable));
  check("14. the occurrence count is never used as a magnitude, only compared to the boundary",
    (comparatorCode.match(/evidenceIds\.size/g) ?? []).length === 1
    && !/\.size\s*[*/+-]|occurrenceCount|visitCount|streak/i.test(executable));
  check("15. no recency weighting: no timestamp of any kind is read by the scorer",
    !/occurredAt|recordedAt|updatedAt|recency|daysSince|cutoff/i.test(executable)
    && !/latestEvidenceAt|oldestEvidenceAt|confidenceMetadata|generatedAt/.test(executable));
  check("16. no decay formula of any kind",
    !/decay|halfLife|half_life|Math\.exp/i.test(executable));

  // ---- 17-20. excluded inputs -------------------------------------------------------------------
  check("17. sourceConfidence never reaches qualification or scoring", !/sourceConfidence/.test(executable));
  check("18. ratings remain structurally excluded, with no polarity threshold anywhere",
    !/ratingValue|RatingEvidence|behaviorKind === "rating"|dislikeReasons|ratingKind/.test(executable));
  check("19. no consumed-ratio threshold is invented", !/consumedRatio|consumed_ratio|CONSUMED_RATIO/.test(executable));
  // Scoped to the repeated-dimension decision region: truncation must be REPORTED and must never
  // participate in deciding whether a dimension is comparable or what it scores.
  const repeatedDecisionRegion = comparatorCode.slice(
    comparatorCode.indexOf("const restaurantFamilyHasMeals"),
    comparatorCode.indexOf("const comparableDimensions")
  );
  check("20. a truncated meal window is reported, never converted into a negative assertion",
    /mealsTruncated: snapshot\.evidenceWindow\.meals\.truncation !== "not_truncated"/.test(comparator)
    && /mealsTruncatedForEither/.test(types)
    && repeatedDecisionRegion.length > 0
    && !/truncat/i.test(repeatedDecisionRegion)
    && !/truncat/i.test(comparatorCode.slice(
      comparatorCode.indexOf("function selectRepeatedTargets"),
      comparatorCode.indexOf("function compareSets")
    ))
    // Reported only: the flag is declared once, set once from the evidence window, and read once per
    // side into the confidence inputs. Four occurrences and no more.
    && (comparatorCode.match(/mealsTruncated\b/g) ?? []).length === 4);

  // ---- 21-22. missing versus measured -----------------------------------------------------------
  check("21. a non-qualifying or one-sided repeated set is unknown and leaves the denominator",
    /if \(repeatedRestaurants === null\) \{\s*\n\s*unknowns\.push\("repeated_meal_restaurant"\);/.test(comparator)
    && /if \(repeatedMenuItems === null\) \{\s*\n\s*unknowns\.push\("repeated_meal_menu_item"\);/.test(comparator)
    && /if \(left === null \|\| right === null\) return null;/.test(comparator));
  check("22. two qualifying but disjoint repeated sets are a measured zero, never a conflict",
    /conflicts: EMPTY_DIMENSIONS/.test(comparator) && !/conflicts\.push\(/.test(comparator));

  // ---- 23. explanation safety -------------------------------------------------------------------
  const reasonCodesCode = reasonCodes.split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  check("23. the repeated reason codes carry no identity, value or count",
    /"shared_repeated_restaurant_consumption"/.test(reasonCodes) && /"shared_repeated_menu_item_consumption"/.test(reasonCodes)
    && !/rawValue|restaurantId|menuItemId|evidenceId|visit|count/i.test(reasonCodesCode.replace(/REASON_CODE_RANK|reasonCodes/g, "")));

  // ---- 24-26. isolation -------------------------------------------------------------------------
  check("24. no GPS, distance or proximity signal", !/gps|geolocation|latitude|longitude|distanceKm|proximity|nearby/i.test(implementation));
  check("25. no Social compatibility surface starts here",
    !/meal_pattern|dining_context|social_logistics|socialCompatibility|payment_preference|nutrition_goal|restrictionType/.test(executable));
  check("26. no database, network or Supabase dependency, and no Mobile or UI import",
    !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\//i.test(executable)
    && !moduleSpecifiers.some((entry) => /react|expo|components|i18n|fixture|mock\/|social|gps/i.test(entry))
    && moduleSpecifiers.every((entry) => ["../preference", "../behavior", "../snapshot", "./policy", "./reasonCodes", "./types", "./comparator"].includes(entry)),
    { moduleSpecifiers });

  // ---- 27-28. frozen mathematical model ---------------------------------------------------------
  check("27. the score range, rounding precision and rounding authority are unchanged",
    /TASTE_SIMILARITY_SCORE_MIN = 0;/.test(policy) && /TASTE_SIMILARITY_SCORE_MAX = 1;/.test(policy)
    && /TASTE_SIMILARITY_SCORE_PRECISION = 6;/.test(policy)
    && /Math\.round\(value \* factor\) \/ factor/.test(policy)
    && (comparator.match(/roundTasteSimilarityScore\(/g) ?? []).length === 1
    && /outcomes\.reduce\(\(sum, outcome\) => sum \+ outcome\.agreement, 0\)/.test(comparator)
    && /total \/ outcomes\.length/.test(comparator));
  check("28. symmetry authority is unchanged and no magic weight table was introduced",
    /orderSnapshotPair\(snapshotA, snapshotB\)/.test(comparator)
    && /compareCodeUnits\(first\.subjectUserId, second\.subjectUserId\)/.test(comparator)
    && !/localeCompare|Intl\./.test(implementation)
    && !/WEIGHTS?\s*[:=]|weight\s*[:=]\s*\d|\* 0\.\d/.test(executable));

  // ---- 29. versioning ---------------------------------------------------------------------------
  check("29. the successor policy version is pinned and the superseded version stays recorded",
    /TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1\.1" as const;/.test(policy)
    && /"taste-similarity-v1",\s*\n\s*"taste-similarity-v1\.1"/.test(policy)
    && !/policyVersion: "taste-similarity-v1"/.test(implementation)
    && (comparator.match(/policyVersion: TASTE_SIMILARITY_POLICY_VERSION/g) ?? []).length === 2);

  // ---- 30-34. lifecycle, manifest and self-integrity --------------------------------------------
  check("30. candidate or frozen commit has the exact 12-path R1 manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("30a. branch remains main", branch === "main", { branch });
  check("30b. R1 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("30c. freeze lifecycle has at most one exact authority commit", freezeCandidates.length <= 1, { freezeCandidates });
  check("30d. candidate staged diff is empty or the frozen successor hides no staged domain bytes", freezeCommit
    ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
    : git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("30e. package change adds only the three R1 validation commands", packageOnlyAddsValidationScripts(freezeCommit));
  const predecessorDrift = git(["diff", "--name-only", baseline, "--", ...frozenPredecessorPaths]).stdout.trim();
  check("31. TS-1, TS-2, TS-2D and the frozen barrels are byte-unchanged by this round", predecessorDrift === "", { predecessorDrift });
  check("31b. the domain barrel still exports the frozen similarity module and contains only re-exports",
    (() => {
      const barrel = read(`${domainRoot}/index.ts`);
      const statements = barrel.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return barrel.includes('export * from "./similarity";')
        && barrel.includes('export * from "./snapshot";')
        && statements.every((line) => /^export \* from "\.\/[a-zA-Z]+";$/.test(line));
    })());
  check("31a. the only predecessor files this round amends are validation harnesses",
    manifest.filter((entry) => !entry.startsWith(similarityRoot) && entry !== "package.json" && !entry.includes("ts3b-r1"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("32. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components|social|gps/i.test(entry)));

  const probeDiagnostics = compileContractProbe();
  check("32a. the R1 contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts3b-r1-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("33. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("34. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-3B-R1 Repeated Canonical Meal Consumption Evidence Guard",
    totalChecks: checks.length,
    passedChecks: checks.length - failures.length,
    failedChecks: failures.length,
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    freezeCommit,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  console.error(`GUARD ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

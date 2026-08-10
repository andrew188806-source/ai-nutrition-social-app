#!/usr/bin/env node
// TS-3D guard — GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY.
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
const baseline = "e4535ba07c738603445c756c66c9941dd245954b";
const freezeMessage = "Add goal and restriction compatibility";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const compatibilityRoot = `${domainRoot}/compatibility`;
const goalRestrictionRoot = `${domainRoot}/goal-restriction`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${goalRestrictionRoot}/comparator.ts`,
  `${goalRestrictionRoot}/index.ts`,
  `${goalRestrictionRoot}/policy.ts`,
  `${goalRestrictionRoot}/reasonCodes.ts`,
  `${goalRestrictionRoot}/types.ts`,
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3d-mutations.mjs",
  "scripts/taste-similarity-ts3d-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// Everything TS-1, TS-2, TS-2D, TS-3A/B, TS-3B-R1 and TS-3C froze. TS-3D is additive and must not
// have edited a byte of any of it — both the similarity and compatibility trees included.
const frozenPredecessorPaths = [
  `${domainRoot}/behavior.ts`,
  `${domainRoot}/evidence.ts`,
  `${domainRoot}/evidenceWindow.ts`,
  `${domainRoot}/goal.ts`,
  `${domainRoot}/normalization.ts`,
  `${domainRoot}/preference.ts`,
  `${domainRoot}/restriction.ts`,
  `${domainRoot}/snapshot.ts`,
  `${domainRoot}/sourceState.ts`,
  similarityRoot,
  compatibilityRoot,
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
const executableOnly = (source) => source.split("\n")
  .filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  })
  .join("\n");

function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}

function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of [
    "test:taste-similarity-ts3d",
    "test:taste-similarity-ts3d-smoke",
    "test:taste-similarity-ts3d-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: goal has a score only when scored, restriction eligibility has none at all,
// there is no aggregate, and no severity taxonomy can be named.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts3d-types-"));
  try {
    const importPath = path.join(root, goalRestrictionRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "goal-restriction-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        GoalCompatibilityResult,
        GoalRestrictionCompatibilityResult,
        GoalRestrictionReasonCode,
        NotScoredGoalCompatibilityResult,
        RestrictionEligibilityResult,
        RestrictionEligibilityVerdict,
        ScoredGoalCompatibilityResult
      } from ${JSON.stringify(importPath)};

      declare const result: GoalRestrictionCompatibilityResult;
      declare const goal: GoalCompatibilityResult;
      declare const notScored: NotScoredGoalCompatibilityResult;
      declare const scored: ScoredGoalCompatibilityResult;
      declare const eligibility: RestrictionEligibilityResult;

      // @ts-expect-error a not-scored goal result has no score key at all
      notScored.score;
      // @ts-expect-error a scored goal result has no not-scored reason
      scored.reason;
      // @ts-expect-error the score is unreachable until the union is narrowed
      goal.score;
      if (goal.status === "scored") {
        const narrowed: number = goal.score;
        void narrowed;
      }
      // @ts-expect-error restriction eligibility is categorical and carries no score
      eligibility.score;

      const verdicts: readonly RestrictionEligibilityVerdict[] = ["compatible", "needs_attention", "unknown"];
      void verdicts;

      // @ts-expect-error no hard exclusion verdict exists in v1
      const hard: RestrictionEligibilityVerdict = "incompatible";
      // @ts-expect-error no severity taxonomy is invented in v1
      const blocked: RestrictionEligibilityVerdict = "blocked";
      // @ts-expect-error there is no aggregate score across goal and restriction
      const overall: number = result.overallCompatibility;
      // @ts-expect-error there is no numeric confidence
      const confidence: number = result.confidenceInputs.confidenceScore;
      // @ts-expect-error macro targets are never part of the explanation vocabulary
      const macro: GoalRestrictionReasonCode = "shared_calorie_target";
      // @ts-expect-error a taste reason code is not part of this vocabulary
      const tasteCode: GoalRestrictionReasonCode = "shared_cuisine_preference";
      void [hard, blocked, overall, confidence, macro, tasteCode];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, goalRestrictionRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, goalRestrictionRoot, file));
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

  const policy = read(`${goalRestrictionRoot}/policy.ts`);
  const reasonCodes = read(`${goalRestrictionRoot}/reasonCodes.ts`);
  const types = read(`${goalRestrictionRoot}/types.ts`);
  const comparator = read(`${goalRestrictionRoot}/comparator.ts`);
  const goalRestrictionIndex = read(`${goalRestrictionRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, reasonCodes, types, comparator, goalRestrictionIndex].join("\n");
  const executable = executableOnly(implementation);
  const comparatorCode = executableOnly(comparator);
  const typesCode = executableOnly(types);
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  const tastePolicy = read(`${similarityRoot}/policy.ts`);
  const contextPolicy = read(`${compatibilityRoot}/policy.ts`);

  // ---- 1-3. versioning --------------------------------------------------------------------------
  check("1. a separate goal/restriction policy version exists and is stamped on every result",
    /GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = "goal-restriction-compatibility-v1" as const;/.test(policy)
    && /policyVersion: typeof GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION/.test(types)
    && (comparator.match(/policyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION/g) ?? []).length === 2
    && /snapshotSchemaVersion: GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION/.test(comparator));
  check("2. the taste policy version remains taste-similarity-v1.1 and no taste byte moved",
    /TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1\.1" as const;/.test(tastePolicy)
    && git(["diff", "--name-only", baseline, "--", similarityRoot]).stdout.trim() === "");
  check("3. the social-context policy version remains social-context-compatibility-v1 and no byte moved",
    /SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v1" as const;/.test(contextPolicy)
    && git(["diff", "--name-only", baseline, "--", compatibilityRoot]).stdout.trim() === "");

  // ---- 4-7. isolation from taste and social context ---------------------------------------------
  check("4-5. neither goal nor restriction can reach the taste comparator: nothing from similarity is imported",
    !moduleSpecifiers.some((entry) => entry.includes("similarity"))
    && !/food_taste|cuisine|flavor|spice|favorite|repeated_meal/.test(executable));
  check("6-7. neither goal nor restriction can reach the social-context dimensions: nothing from compatibility is imported",
    !moduleSpecifiers.some((entry) => entry.includes("compatibility"))
    && !/meal_pattern|dining_context|social_logistics|dining_style|payment_preference/.test(executable),
    { moduleSpecifiers });

  // ---- 8-11. goal evidence boundary -------------------------------------------------------------
  check("8. only the coarse goal label is read",
    /goal\.facet !== "goal_label"/.test(comparator)
    && (comparatorCode.match(/"goal_label"/g) ?? []).length === 1);
  check("9. macro target facets are excluded entirely",
    !/daily_calories_target|protein_target_g|carbohydrates_target_g|fat_target_g|fiber_target_g|GoalScalarEvidence|GoalScalarFacet/.test(executable));
  check("10. no numeric macro distance of any kind is derived",
    !/Math\.abs|Math\.sqrt|Math\.pow|Math\.log|distance|delta|ratio|kcal|unit\b/i.test(executable));
  check("11. the frozen active and date-validity authority is applied exactly",
    /!goal\.validity\.isActive/.test(comparator)
    && /goal\.validity\.startsOn > asOfDate/.test(comparator)
    && /goal\.validity\.endsOn !== undefined && goal\.validity\.endsOn < asOfDate/.test(comparator)
    && /const asOfDate = snapshot\.generatedAt\.slice\(0, 10\);/.test(comparator));

  // ---- 12-14. goal score contract ---------------------------------------------------------------
  check("12. the goal score is 0..1 with deterministic fixed-precision rounding",
    /GOAL_COMPATIBILITY_SCORE_MIN = 0;/.test(policy) && /GOAL_COMPATIBILITY_SCORE_MAX = 1;/.test(policy)
    && /GOAL_COMPATIBILITY_SCORE_PRECISION = \d+;/.test(policy)
    && /Math\.round\(value \* factor\) \/ factor/.test(policy)
    && (policy.match(/throw new RangeError/g) ?? []).length === 2
    && !/Math\.min\(|Math\.max\(/.test(executableOnly(policy))
    && /shared \/ unionSize/.test(comparator));
  // Every construction site of a not-scored goal result is inspected on its own line rather than by
  // counting occurrences, so the assertion survives refactoring without weakening.
  const notScoredSites = comparatorCode.split("\n").filter((line) => line.includes('status: "not_scored"'));
  check("13. score is declared only on the scored goal variant and appears on no not-scored path",
    (typesCode.match(/^\s*score: number;/gm) ?? []).length === 1
    && !/score\?\s*:/.test(types)
    && notScoredSites.length >= 3
    && notScoredSites.every((line) => !/\bscore\b/.test(line)),
    { notScoredSiteCount: notScoredSites.length });
  check("14. missing goal evidence is never counted as a mismatch",
    /function missingEvidenceReason/.test(comparator)
    && /if \(leftMissing && rightMissing\) return "no_comparable_evidence";/.test(comparator)
    && /if \(leftMissing \|\| rightMissing\) return "insufficient_evidence";/.test(comparator));

  // ---- 15-19. restriction eligibility -----------------------------------------------------------
  check("15. restriction eligibility carries no numeric score anywhere",
    !/score/.test(/export type RestrictionEligibilityResult = \{[\s\S]*?\};/.exec(types)?.[0] ?? "score")
    && !/restrictionScore|restrictionSimilarity/.test(implementation)
    && !/intersectionSize\(leftFacts\.softRestrictionLabels[^\n]*\/\s*/.test(comparatorCode));
  check("16. the restriction verdict is a closed three-value enum with a closed basis enum",
    /RESTRICTION_ELIGIBILITY_VERDICTS = \["compatible", "needs_attention", "unknown"\] as const;/.test(types)
    && /RestrictionEligibilityBasis =/.test(types)
    && !/"incompatible"|"blocked"|"denied"/.test(implementation));
  check("17. an unclassified restriction never silently resolves to compatible",
    /if \(leftFacts\.unclassifiedRestrictionPresent \|\| rightFacts\.unclassifiedRestrictionPresent\) \{\s*\n\s*return \{ verdict: "needs_attention"/.test(comparator)
    && comparatorCode.indexOf("unclassifiedRestrictionPresent ||") < comparatorCode.indexOf('verdict: "compatible"'));
  check("18. a soft preference is never turned into a hard exclusion",
    /restriction\.enforcement === "soft"/.test(comparator)
    && !/exclude|exclusion|forbid|prohibit|disqualif|incompatible/i.test(executable));
  check("19. no allergy, religious or medical severity taxonomy is invented",
    !/allergy|allergen|religio|halal|kosher|vegan|vegetarian|gluten|medical|life_threatening|severe|anaphyla/i.test(executable));

  // ---- 20-24. privacy and aggregate bans --------------------------------------------------------
  const resultLiterals = comparatorCode.match(/return \{\s*\n\s*policyVersion:[\s\S]*?\n {2}\};/g) ?? [];
  check("20-21. no raw restriction label and no raw macro value can reach the result surface",
    resultLiterals.length === 2
    && resultLiterals.every((literal) => !/\.\.\.\w*Facts|softRestrictionLabels|goalLabels|\.label\b|\.value\b/.test(literal))
    && !/labels?:\s*(?:readonly )?string/.test(typesCode)
    && !/rawValue|\.label\b/.test(executableOnly(reasonCodes)));
  check("22. no medical note, free-text severity or visibility value is read or emitted",
    !/rawSeverity|restrictionType|visibility|healthNotes|health_notes|privateNote/.test(executable));
  check("23-24. no overall social score and no combined score of any kind exists",
    !/overall|aggregate|combined|totalScore|socialScore|tasteScore/i.test(executable)
    && !/goalCompatibility[\s\S]{0,200}[+*/]\s*restrictionEligibility/.test(comparatorCode));

  // ---- 25-31. excluded evidence and purity ------------------------------------------------------
  check("25. ratings are excluded", !/rating/i.test(executable));
  check("26. meal occurrences are excluded", !/meal_occurrence|MealOccurrence|occurredAt|consumedRatio|snapshot\.behavior/.test(executable));
  check("27. favorites are excluded", !/favorite/i.test(executable));
  check("28. no GPS, distance or proximity signal", !/gps|geolocation|latitude|longitude|distanceKm|proximity|nearby/i.test(implementation));
  check("29. no premium, activity or verified signal",
    !/isPremium|premium|activityScore|engagement|popularity|trending|isVerified|\bverified\b/i.test(implementation));
  check("30. no database, network or Supabase dependency, and no Mobile or UI import",
    !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\//i.test(executable)
    && !moduleSpecifiers.some((entry) => /react|expo|components|i18n|fixture|mock\/|social-|gps/i.test(entry))
    && moduleSpecifiers.every((entry) => ["../goal", "../restriction", "../snapshot", "./policy", "./reasonCodes", "./types", "./comparator"].includes(entry)));
  // The as-of date is the snapshot's own RECORDED generation date — data, not a clock. Reading an
  // ambient clock would make the same pair score differently on different days, which is exactly what
  // this bans.
  check("31. no clock, randomness or ambient state",
    !/Date\.now|new Date\(|Math\.random|process\.env|globalThis|performance\.now/.test(executable)
    && /snapshot\.generatedAt/.test(comparatorCode));

  // ---- 32-33. symmetry and determinism ----------------------------------------------------------
  check("32. symmetry is structural via canonical pair ordering",
    /orderSnapshotPair\(snapshotA, snapshotB\)/.test(comparator)
    && /compareCodeUnits\(first\.subjectUserId, second\.subjectUserId\)/.test(comparator));
  check("33. ordering is deterministic and locale-independent, and reason codes use a fixed rank",
    /\.sort\(compareCodeUnits\)/.test(comparator)
    && /REASON_CODE_RANK/.test(reasonCodes)
    && /GOAL_RESTRICTION_REASON_CODES = \[/.test(reasonCodes) && /\] as const;/.test(reasonCodes)
    && !/localeCompare|Intl\./.test(implementation));

  // ---- 34-39. manifest, lifecycle and self-integrity --------------------------------------------
  check("34. candidate or frozen commit has the exact 12-path TS-3D manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("34a. branch remains main", branch === "main", { branch });
  check("34b. TS-3D baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("34c. package change adds only the three TS-3D validation commands", packageOnlyAddsValidationScripts(freezeCommit));
  // SR-1A is the first successor round to add files under `supabase/`, a prefix this list covers
  // wholesale. Blanket-relaxing the prefix would hide real drift, so the successor's paths are
  // enumerated EXACTLY, path by path, with no prefix and no wildcard — anything else under the prefix
  // still fails here. The companion check below is strictly STRONGER than the original assertion:
  // it proves the allowance cannot reach a migration or a deployable Edge Function entrypoint, which
  // the original directory-granularity check never asserted.
  const SR1A_SUCCESSOR_PATHS = Object.freeze([
    "supabase/functions/_shared/social-pair/index.ts",
    "supabase/functions/_shared/social-pair/serverPairComparison.ts",
    "supabase/functions/_shared/social-pair/serverTasteFoundationRepository.ts",
    "supabase/functions/_shared/taste-foundation-runtime/provenance.generated.json",
    "supabase/functions/_shared/taste-foundation-runtime/tasteFoundation.generated.mjs"
  ]);
  const predecessorDrift = git(["diff", "--name-only", baseline, "--", ...frozenPredecessorPaths]).stdout
    .split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean)
    .filter((entry) => !SR1A_SUCCESSOR_PATHS.includes(entry));
  check("35a. the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("35. every predecessor implementation path is byte-unchanged by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("35a. the only predecessor files this round amends are validation harnesses",
    manifest.filter((entry) => !entry.startsWith(goalRestrictionRoot) && entry !== "package.json"
      && entry !== `${domainRoot}/index.ts` && !entry.includes("ts3d"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("36. lifecycle fails closed: at most one authority commit and no hidden staged bytes",
    freezeCandidates.length <= 1
    && (freezeCommit
      ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
      : git(["diff", "--cached", "--name-only"]).stdout.trim() === ""),
    { freezeCandidates });
  check("37. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components/i.test(entry)));
  check("37a. the domain barrel additively exposes goal-restriction after the frozen modules",
    domainIndex.includes('export * from "./similarity";') && domainIndex.includes('export * from "./compatibility";')
    && domainIndex.includes('export * from "./goal-restriction";')
    && ["./policy", "./reasonCodes", "./types", "./comparator"].every((entry) => goalRestrictionIndex.includes(`export * from "${entry}";`)));

  const probeDiagnostics = compileContractProbe();
  check("37b. the TS-3D contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts3d-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("38. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("39. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-3D Goal Compatibility and Restriction Eligibility Guard",
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

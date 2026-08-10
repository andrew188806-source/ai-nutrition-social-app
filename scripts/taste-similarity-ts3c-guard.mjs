#!/usr/bin/env node
// TS-3C guard — SOCIAL CONTEXT COMPATIBILITY (meal pattern / dining context / social logistics).
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
const baseline = "91d50dbf98370e8a3848942c52c5e94827329a89";
const freezeMessage = "Add social context compatibility dimensions";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const compatibilityRoot = `${domainRoot}/compatibility`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${compatibilityRoot}/comparator.ts`,
  `${compatibilityRoot}/index.ts`,
  `${compatibilityRoot}/policy.ts`,
  `${compatibilityRoot}/reasonCodes.ts`,
  `${compatibilityRoot}/types.ts`,
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3c-mutations.mjs",
  "scripts/taste-similarity-ts3c-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// Everything TS-1, TS-2, TS-2D, TS-3A/B and TS-3B-R1 froze. TS-3C is additive and must not have
// edited a byte of any of it — the whole `similarity` tree included.
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
    "test:taste-similarity-ts3c",
    "test:taste-similarity-ts3c-smoke",
    "test:taste-similarity-ts3c-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: the contract admits exactly three context dimensions, exposes no aggregate, and
// makes `score` unreachable on a not-scored dimension.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts3c-types-"));
  try {
    const importPath = path.join(root, compatibilityRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "compatibility-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        SocialContextCompatibilityDimension,
        SocialContextCompatibilityReasonCode,
        SocialContextCompatibilityResult,
        SocialContextDimensionResult,
        NotScoredSocialContextDimensionResult,
        ScoredSocialContextDimensionResult
      } from ${JSON.stringify(importPath)};

      declare const result: SocialContextCompatibilityResult;
      declare const dimension: SocialContextDimensionResult;
      declare const notScored: NotScoredSocialContextDimensionResult;
      declare const scored: ScoredSocialContextDimensionResult;

      // @ts-expect-error a not-scored dimension has no score key at all
      notScored.score;
      // @ts-expect-error a scored dimension has no not-scored reason
      scored.reason;
      // @ts-expect-error the score is unreachable until the union is narrowed
      dimension.score;
      if (dimension.status === "scored") {
        const narrowed: number = dimension.score;
        void narrowed;
      }

      const allowed: readonly SocialContextCompatibilityDimension[] = ["meal_pattern", "dining_context", "social_logistics"];
      void allowed;

      // @ts-expect-error food taste is not a social context dimension
      const foodTaste: SocialContextCompatibilityDimension = "food_taste";
      // @ts-expect-error nutrition goals belong to a later round
      const goal: SocialContextCompatibilityDimension = "nutrition_goal";
      // @ts-expect-error dietary restrictions belong to a later round
      const restriction: SocialContextCompatibilityDimension = "dietary_restriction";
      // @ts-expect-error there is no aggregate social compatibility score
      const overall: number = result.overallSocialCompatibility;
      // @ts-expect-error there is no numeric confidence
      const confidence: number = result.confidenceInputs.confidenceScore;
      // @ts-expect-error a taste reason code is not part of this vocabulary
      const tasteCode: SocialContextCompatibilityReasonCode = "shared_cuisine_preference";
      void [foodTaste, goal, restriction, overall, confidence, tasteCode];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, compatibilityRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, compatibilityRoot, file));
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

  const policy = read(`${compatibilityRoot}/policy.ts`);
  const reasonCodes = read(`${compatibilityRoot}/reasonCodes.ts`);
  const types = read(`${compatibilityRoot}/types.ts`);
  const comparator = read(`${compatibilityRoot}/comparator.ts`);
  const compatibilityIndex = read(`${compatibilityRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, reasonCodes, types, comparator, compatibilityIndex].join("\n");
  const executable = executableOnly(implementation);
  const comparatorCode = executableOnly(comparator);
  const typesCode = executableOnly(types);
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  const tastePolicy = read(`${similarityRoot}/policy.ts`);

  // ---- 1-2. versioning --------------------------------------------------------------------------
  check("1. a separate compatibility policy version exists and is stamped on every result",
    /SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v1" as const;/.test(policy)
    && /policyVersion: typeof SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION/.test(types)
    && (comparator.match(/policyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION/g) ?? []).length === 2
    && /snapshotSchemaVersion: SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION/.test(comparator));
  check("2. the taste policy version remains taste-similarity-v1.1 and no taste byte moved",
    /TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1\.1" as const;/.test(tastePolicy)
    // Scoped to executable source: the policy file legitimately names the taste version in prose to
    // record WHY this round did not bump it, and that explanation must not read as a dependency.
    && !/taste-similarity-v/.test(executable)
    && git(["diff", "--name-only", baseline, "--", similarityRoot]).stdout.trim() === "");

  // ---- 3-6. exclusive scope mapping -------------------------------------------------------------
  check("3. meal_pattern feeds only mealPatternCompatibility",
    /preference\.scope === "meal_pattern" && preference\.facet === "meal_type"/.test(comparator)
    && (comparatorCode.match(/"meal_pattern"/g) ?? []).length === 3
    && /mealPatternCompatibility = compareSets\(\s*\n\s*"meal_pattern"/.test(comparator));
  check("4. dining_context feeds only diningCompatibility",
    /preference\.scope === "dining_context" && preference\.facet === "dining_style"/.test(comparator)
    && /diningCompatibility = compareCategories\(\s*\n\s*"dining_context"/.test(comparator));
  check("5. social_logistics feeds only socialLogisticsCompatibility",
    /preference\.scope === "social_logistics" && preference\.facet === "payment_preference"/.test(comparator)
    && /socialLogisticsCompatibility = compareCategories\(\s*\n\s*"social_logistics"/.test(comparator));
  check("6. no context scope can reach the taste comparator: nothing from the similarity module is imported",
    !moduleSpecifiers.some((entry) => entry.includes("similarity"))
    && moduleSpecifiers.every((entry) => ["../preference", "../snapshot", "./policy", "./reasonCodes", "./types", "./comparator"].includes(entry))
    && !/food_taste|cuisine|flavor|spice/.test(executable),
    { moduleSpecifiers });

  // ---- 7-11. score contract ---------------------------------------------------------------------
  check("7. no aggregate or overall social compatibility score exists",
    !/overall|aggregate|combined|totalScore|socialScore/i.test(executable)
    && !/mealPatternCompatibility[\s\S]{0,400}[+*/]\s*diningCompatibility/.test(comparatorCode));
  check("8. the canonical range is 0..1 with deterministic fixed-precision rounding",
    /SOCIAL_CONTEXT_SCORE_MIN = 0;/.test(policy) && /SOCIAL_CONTEXT_SCORE_MAX = 1;/.test(policy)
    && /SOCIAL_CONTEXT_SCORE_PRECISION = \d+;/.test(policy)
    && /Math\.round\(value \* factor\) \/ factor/.test(policy)
    && (policy.match(/throw new RangeError/g) ?? []).length === 2
    && !/Math\.min\(|Math\.max\(/.test(executableOnly(policy)));
  check("9. score is declared only on the scored variant and the not-scored constructor emits none",
    (typesCode.match(/^\s*score: number;/gm) ?? []).length === 1
    && !/score\?\s*:/.test(types)
    && !/\bscore:/.test(/function notScored\([\s\S]*?\n\}/.exec(comparator)?.[0] ?? "score:"));
  check("10. missing evidence is never counted as a zero",
    /function missingEvidenceReason/.test(comparator)
    && /if \(leftMissing && rightMissing\) return "no_comparable_evidence";/.test(comparator)
    && /if \(leftMissing \|\| rightMissing\) return "insufficient_evidence";/.test(comparator)
    && (comparatorCode.match(/const missing = missingEvidenceReason\(/g) ?? []).length === 2);
  check("11. comparison is parameter-free: Jaccard for the set facet, exact equality for the scalar facets",
    /intersectionSize \/ unionSize/.test(comparator)
    && /left === right \? 1 : 0/.test(comparator)
    && /comparisonMode: SocialContextComparisonMode/.test(comparator));

  // ---- 12-18. no weights, no legacy blended scoring ---------------------------------------------
  check("12. no magic weights, bonuses or penalties",
    !/WEIGHTS?\s*[:=]|weight\s*[:=]\s*\d|\* 0\.\d|\+ 0\.\d|bonus|penalt/i.test(executable));
  check("13. no legacy scorer is imported or reused",
    !/mealBuddyRanking|meal-buddy-card|socialMatchingPolicy|socialDiscovery/.test(implementation));
  check("14. no GPS, distance or proximity signal", !/gps|geolocation|latitude|longitude|distanceKm|proximity|nearby/i.test(implementation));
  check("15. no premium signal", !/isPremium|premium/i.test(implementation));
  check("16. no verified signal", !/isVerified|verifiedBadge|\bverified\b/i.test(implementation));
  check("17. no activity or engagement signal", !/activityScore|engagement|popularity|trending/i.test(implementation));
  check("18. no blended rank score", !/rankScore|matchScore|similarityScore|intentionBonus|timeBonus/i.test(implementation));

  // ---- 19-24. excluded evidence -----------------------------------------------------------------
  check("19. nutrition goals are excluded", !/snapshot\.goals|GoalEvidence|daily_calories_target|nutrition_goal/.test(executable));
  check("20. dietary restrictions are excluded", !/snapshot\.restrictions|RestrictionEvidence|restrictionType|dietary_restriction/.test(executable));
  check("21. meal occurrences are excluded", !/meal_occurrence|MealOccurrence|snapshot\.behavior|behaviorKind|occurredAt|consumedRatio/.test(executable));
  check("22. favorites are excluded", !/favorite/i.test(executable));
  check("23. ratings are excluded", !/rating/i.test(executable));
  check("24. sourceConfidence is excluded", !/sourceConfidence/.test(executable));

  // ---- 25-27. purity and determinism ------------------------------------------------------------
  check("25. no database, network or Supabase dependency, and no Mobile or UI import",
    !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\//i.test(executable)
    && !moduleSpecifiers.some((entry) => /react|expo|components|i18n|fixture|mock\/|social-|gps/i.test(entry)));
  check("26. no clock, randomness or ambient state",
    !/Date\.now|new Date\(|Math\.random|process\.env|globalThis|generatedAt/.test(executable));
  check("27. ordering is deterministic and locale-independent, and symmetry is structural",
    /orderSnapshotPair\(snapshotA, snapshotB\)/.test(comparator)
    && /compareCodeUnits\(first\.subjectUserId, second\.subjectUserId\)/.test(comparator)
    && /\.sort\(compareCodeUnits\)/.test(comparator)
    && !/localeCompare|Intl\./.test(implementation));

  // ---- 28-29. explanation safety ----------------------------------------------------------------
  check("28. reason codes are a closed declared enum with a fixed declaration rank",
    /SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES = \[/.test(reasonCodes) && /\] as const;/.test(reasonCodes)
    && /REASON_CODE_RANK/.test(reasonCodes) && !/localeCompare/.test(reasonCodes));
  // Every RESULT literal the comparator can return is extracted and inspected on its own. Raw
  // collected values live only in the private facts object; none of them may appear in a result.
  const resultLiterals = comparatorCode.match(/return \{\s*\n\s*policyVersion:[\s\S]*?\n {2}\};/g) ?? [];
  check("29. no raw evidence value can reach the result surface",
    resultLiterals.length === 2
    && resultLiterals.every((literal) => !/\.\.\.\w*Facts|mealTypes|diningStyle|paymentPreference|\.value\b/.test(literal))
    && !/values?:\s*(?:readonly )?string/.test(typesCode)
    && !/rawValue|preference\.value/.test(executableOnly(reasonCodes)),
    { resultLiteralCount: resultLiterals.length });

  // ---- 30-35. manifest, lifecycle and self-integrity --------------------------------------------
  check("30. candidate or frozen commit has the exact 12-path TS-3C manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("30a. branch remains main", branch === "main", { branch });
  check("30b. TS-3C baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("30c. package change adds only the three TS-3C validation commands", packageOnlyAddsValidationScripts(freezeCommit));
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
  // SR-1B-B adds the first Social migration. `supabase` is covered by this list wholesale, so the
  // one new path is enumerated EXACTLY — anything else under the prefix still fails here. The
  // companion check constrains what the allowance may ever contain: one timestamped migration file,
  // never supabase/config.toml and never an Edge Function directory.
  const SR1B_B_SUCCESSOR_PATHS = Object.freeze([
    "supabase/migrations/20260810010000_social_block_authority.sql"
  ]);
  const predecessorDrift = git(["diff", "--name-only", baseline, "--", ...frozenPredecessorPaths]).stdout
    .split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean)
    .filter((entry) => !SR1A_SUCCESSOR_PATHS.includes(entry) && !SR1B_B_SUCCESSOR_PATHS.includes(entry));
  check("31b. the SR-1B-B successor allowance is one enumerated additive migration that cannot reach config or an Edge Function",
    SR1B_B_SUCCESSOR_PATHS.length === 1 &&
      SR1B_B_SUCCESSOR_PATHS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry)) &&
      !SR1B_B_SUCCESSOR_PATHS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));
  check("31a. the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("31. every predecessor implementation path is byte-unchanged by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("31a. the only predecessor files this round amends are validation harnesses",
    manifest.filter((entry) => !entry.startsWith(compatibilityRoot) && entry !== "package.json"
      && entry !== `${domainRoot}/index.ts` && !entry.includes("ts3c"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("32. successor lifecycle fails closed: at most one authority commit and no hidden staged bytes",
    freezeCandidates.length <= 1
    && (freezeCommit
      ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
      : git(["diff", "--cached", "--name-only"]).stdout.trim() === ""),
    { freezeCandidates });
  check("33. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components/i.test(entry)));
  check("33a. the domain barrel additively exposes compatibility after similarity",
    domainIndex.includes('export * from "./similarity";') && domainIndex.includes('export * from "./compatibility";')
    && ["./policy", "./reasonCodes", "./types", "./comparator"].every((entry) => compatibilityIndex.includes(`export * from "${entry}";`)));

  const probeDiagnostics = compileContractProbe();
  check("33b. the TS-3C contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts3c-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("34. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("35. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-3C Social Context Compatibility Guard",
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

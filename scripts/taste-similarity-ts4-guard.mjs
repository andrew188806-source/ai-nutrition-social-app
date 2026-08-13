#!/usr/bin/env node
// TS-4 guard — EVIDENCE CONFIDENCE V1.
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
const baseline = "938cf3ad0e11215d0525ab147720af866a26c0c4";
const freezeMessage = "Add evidence confidence policy";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const compatibilityRoot = `${domainRoot}/compatibility`;
const goalRestrictionRoot = `${domainRoot}/goal-restriction`;
const comparisonRoot = `${domainRoot}/comparison`;
const confidenceRoot = `${domainRoot}/confidence`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${confidenceRoot}/compute.ts`,
  `${confidenceRoot}/index.ts`,
  `${confidenceRoot}/policy.ts`,
  `${confidenceRoot}/types.ts`,
  // Successor amendment to a validation harness only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts4-mutations.mjs",
  "scripts/taste-similarity-ts4-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// Every frozen implementation TS-4 reads. A confidence round must not edit a byte of any of them.
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
  goalRestrictionRoot,
  comparisonRoot,
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
    "test:taste-similarity-ts4",
    "test:taste-similarity-ts4-smoke",
    "test:taste-similarity-ts4-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: no value on unavailable, no numeric field on restriction or on the four
// single-facet dimensions, no aggregate, no probability-shaped field.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts4-types-"));
  try {
    const importPath = path.join(root, confidenceRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "confidence-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        EvidenceConfidenceBundle,
        EvidenceStateResult,
        NotAvailableEvidenceConfidenceResult,
        RestrictionEvidenceState,
        TasteEvidenceConfidenceResult
      } from ${JSON.stringify(importPath)};

      declare const bundle: EvidenceConfidenceBundle;
      declare const taste: TasteEvidenceConfidenceResult;
      declare const notAvailable: NotAvailableEvidenceConfidenceResult;
      declare const state: EvidenceStateResult;
      declare const restriction: RestrictionEvidenceState;

      // @ts-expect-error an unavailable result has no value key at all
      notAvailable.value;
      // @ts-expect-error the value is unreachable until the union is narrowed
      taste.value;
      if (taste.status === "available") {
        const narrowed: number = taste.value;
        void narrowed;
      }

      // @ts-expect-error restriction evidence carries no numeric field
      restriction.value;
      // @ts-expect-error the four single-facet dimensions carry no numeric confidence
      state.value;
      // @ts-expect-error meal pattern is a non-numeric evidence state
      const mealPatternValue: number = bundle.mealPattern.value;
      // @ts-expect-error goal is a non-numeric evidence state
      const goalValue: number = bundle.goal.value;
      // @ts-expect-error there is no aggregate confidence across dimensions
      const overall: number = bundle.overallConfidence;
      // @ts-expect-error confidence is evidence support, never a probability-shaped field
      const matchProbability: number = bundle.matchProbability;
      void [mealPatternValue, goalValue, overall, matchProbability];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, confidenceRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, confidenceRoot, file));
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

  const policy = read(`${confidenceRoot}/policy.ts`);
  const types = read(`${confidenceRoot}/types.ts`);
  const compute = read(`${confidenceRoot}/compute.ts`);
  const confidenceIndex = read(`${confidenceRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, types, compute, confidenceIndex].join("\n");
  const executable = executableOnly(implementation);
  const computeCode = executableOnly(compute);
  const typesCode = executableOnly(types);
  const policyCode = executableOnly(policy);
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  // ---- 1-3. version authority -------------------------------------------------------------------
  check("1-2. an independent evidence-confidence policy version exists and is stamped",
    /EVIDENCE_CONFIDENCE_POLICY_VERSION = "evidence-confidence-v1" as const;/.test(policy)
    && /evidenceConfidencePolicyVersion: typeof EVIDENCE_CONFIDENCE_POLICY_VERSION/.test(types)
    && /evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION/.test(compute));
  check("3. all five component versions are imported constants, never duplicated literals",
    /snapshotSchemaVersion: TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION/.test(compute)
    && /tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION/.test(compute)
    && /socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION/.test(compute)
    && /goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION/.test(compute)
    && /comparisonBundleVersion: TASTE_COMPARISON_BUNDLE_VERSION/.test(compute)
    && !/"taste-similarity-v|"social-context-compatibility-v|"goal-restriction-compatibility-v|"taste-comparison-bundle-v|"taste-profile-snapshot-v/.test(implementation));

  // ---- 4. the load-bearing isolation ------------------------------------------------------------
  check("4. no component score is reachable from the confidence computation",
    !/\.score\b/.test(executable) && !/\bscore\s*[:=]/.test(computeCode));

  // ---- 5-9. shape of the contract ---------------------------------------------------------------
  check("5. numeric confidence exists only on the taste result",
    (typesCode.match(/^\s*value: number;/gm) ?? []).length === 1
    && /AvailableTasteEvidenceConfidenceResult = \{\s*\n\s*status: "available";\s*\n\s*value: number;/.test(types)
    && !/value\?\s*:/.test(types));
  check("6-7. the four single-facet dimensions and goal are non-numeric evidence states",
    /AvailableEvidenceStateResult = \{\s*\n\s*status: "available";\s*\n\s*basis: EvidenceConfidenceBasis;\s*\n\s*\};/.test(types)
    && /mealPattern: EvidenceStateResult;/.test(types) && /dining: EvidenceStateResult;/.test(types)
    && /socialLogistics: EvidenceStateResult;/.test(types) && /goal: EvidenceStateResult;/.test(types)
    && /return \{ status: "available", basis: "explicit_evidence_only" \};/.test(compute));
  check("8. restriction evidence carries no numeric field of any kind",
    /RestrictionEvidenceState = \{[\s\S]*?\};/.test(types)
    && !/value|score|confidence|percent|safety/i.test(/export type RestrictionEvidenceState = \{[\s\S]*?\};/.exec(typesCode)?.[0] ?? "value"));
  check("9. no aggregate, global, match or rank confidence exists",
    !/overall|aggregate|global|combined|matchScore|rankScore|weightedConfidence/i.test(executable));
  check("10. no probability-shaped wording anywhere in the module",
    !/probabilit|likelihood|percent|accuracy|certaint/i.test(implementation));

  // ---- 11-14. denominators and magnitudes --------------------------------------------------------
  const familyMap = /TASTE_CONFIDENCE_DIMENSION_FAMILIES[\s\S]*?\}\);/.exec(policy)?.[0] ?? "";
  const distinctFamilies = new Set([...familyMap.matchAll(/:\s*"([a-z_]+)"/g)].map((match) => match[1]));
  check("11. the supported denominator is the named constant 5 and matches the distinct family count",
    /TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = 5;/.test(policy)
    && distinctFamilies.size === 5,
    { distinctFamilies: [...distinctFamilies] });
  check("12. the relevant source denominator is the named constant 3",
    /TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = 3;/.test(policy));
  check("13. the denominator is never 7 and is never inferred from the seven-entry dimension array",
    !/SUPPORTED_DIMENSION_COUNT = 7/.test(policy)
    && !/TASTE_SIMILARITY_DIMENSIONS\.length/.test(executable));
  check("14. no raw evidence item count is used as a magnitude",
    !/evidenceCount|explicitEvidenceCount|behavioralEvidenceCount|totalEvidenceCount|qualifyingRestaurantTargets|qualifyingMenuItemTargets|eligibleGoalLabelCount|restrictionEvidenceCount|evidenceCountsByDimension/.test(executable));

  // ---- 15-17. excluded influences ----------------------------------------------------------------
  check("15. no source-recognition quality input", !/sourceConfidence|recognitionConfidence|aiConfidence/i.test(implementation));
  check("16-17. no timestamp, date arithmetic, recency or decay",
    !/occurredAt|recordedAt|createdAt|updatedAt|generatedAt|oldestEvidenceAt|latestEvidenceAt|actualEarliestAt|actualLatestAt/.test(executable)
    && !/Date\.|new Date\(|halfLife|half_life|decay|recency|daysSince|Math\.exp|Math\.log|Math\.pow/i.test(executable));

  // ---- 18-22. source and truncation semantics ----------------------------------------------------
  check("18-19. reachability is inherited from the frozen bundle, never re-derived from source states",
    /bundle\.confidenceInputs\.sourceAvailability/.test(compute)
    && !/"failed"|"disabled"|"unauthenticated"|"deferred"|"available"\s*\|\|/.test(computeCode)
    && !/\.status === "empty"|sourceStates/.test(executable));
  check("20-21. favorites and meals truncation both feed source completeness",
    /favoritesTruncatedForEither/.test(compute) && /mealsTruncatedForEither/.test(compute));
  check("22. ratings truncation and ratings availability are never read",
    !/ratings/i.test(executable));

  // ---- 23-24. privacy ----------------------------------------------------------------------------
  check("23-24. no raw evidence, label, macro or identity value is reachable",
    !/\.value\b(?!\s*[;,)])/.test(computeCode.replace(/taste\.value|entry\.value/g, ""))
    && !/\.label\b|restaurantId|menuItemId|rawSeverity|restrictionType|daily_calories_target|goal_label/.test(executable)
    && !/snapshot[AB]|\.preferences\b|\.behavior\b|\.goals\b|\.restrictions\b/.test(executable));

  // ---- 25-30. consumer-policy and platform isolation ---------------------------------------------
  check("25. no aggregate match or rank score", !/matchScore|rankScore|topN|candidateRank/i.test(executable));
  check("26. no cold-start behaviour",
    !/fallback|popularity|nearby|defaultProfile|recommend|threshold|demographic/i.test(executable));
  check("27. no GPS, distance or proximity signal", !/gps|geolocation|latitude|longitude|distanceKm|proximity|nearby/i.test(implementation));
  check("28. no premium, activity or verified signal",
    !/isPremium|premium|activityScore|engagement|trending|isVerified|\bverified\b/i.test(implementation));
  check("29. no database, network or Supabase dependency, and only frozen domain siblings are imported",
    !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\//i.test(executable)
    && moduleSpecifiers.every((entry) => ["../snapshot", "../similarity", "../compatibility", "../goal-restriction", "../comparison", "./policy", "./types", "./compute"].includes(entry)),
    { moduleSpecifiers });
  check("30. no environment, randomness or clock access",
    !/process\.env|Math\.random|globalThis|performance\.now|localeCompare|Intl\./.test(executable));

  // ---- 31-35. formula and contract invariants ----------------------------------------------------
  check("31. no hidden numeric weight and no rescaling of the reachable floor",
    !/WEIGHTS?\s*[:=]|weight\s*[:=]\s*\d|\* 0\.\d|\* 1\.\d/.test(executable)
    && !/-\s*floor|FLOOR|normali[sz]e/i.test(executable));
  check("32. the formula is exactly the two parameter-free ratios and their unweighted mean",
    /const dimensionCoverage = inputs\.comparableFamilyCount \/ inputs\.supportedFamilyCount;/.test(compute)
    && /const sourceCompleteness = inputs\.completeRelevantSourceCount \/ inputs\.relevantSourceCount;/.test(compute)
    && /roundEvidenceConfidenceValue\(\(dimensionCoverage \+ sourceCompleteness\) \/ 2\)/.test(compute)
    && (computeCode.match(/roundEvidenceConfidenceValue\(/g) ?? []).length === 1);
  check("33. rounding is deterministic 6-decimal with a fail-closed range check and no silent clamp",
    /EVIDENCE_CONFIDENCE_VALUE_PRECISION = 6;/.test(policy)
    && /Math\.round\(value \* factor\) \/ factor/.test(policy)
    && (policy.match(/throw new RangeError/g) ?? []).length === 2
    && !/Math\.min\(|Math\.max\(/.test(policyCode));
  check("34. an unavailable result is constructed without a value on every path",
    (computeCode.match(/status: "not_available"/g) ?? []).length === 4
    && computeCode.split("\n").filter((line) => line.includes('status: "not_available"')).every((line) => !/\bvalue\b/.test(line)));
  check("35. the identity family map counts a suppressed fallback with its favorite counterpart",
    /favorite_restaurant: "restaurant_identity",\s*\n\s*repeated_meal_restaurant: "restaurant_identity",/.test(policy)
    && /favorite_menu_item: "menu_item_identity",\s*\n\s*repeated_meal_menu_item: "menu_item_identity"/.test(policy)
    && /const families = new Set<string>\(\);/.test(compute));

  // ---- 36-41. manifest, lifecycle and self-integrity ---------------------------------------------
  check("36. candidate or frozen commit has the exact 10-path TS-4 manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("36a. branch remains main", branch === "main", { branch });
  check("36b. TS-4 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("36c. package change adds only the three TS-4 validation commands", packageOnlyAddsValidationScripts(freezeCommit));
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
    "supabase/functions/_shared/taste-foundation-runtime/tasteFoundation.generated.mjs",
    "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
    "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
    "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
  ]);
  // The Social Runtime rounds add migrations under `supabase`, which this list covers wholesale.
  // Every such path is enumerated EXACTLY — anything else under the prefix still fails here — and
  // the companion check constrains what the allowance may ever contain: timestamped migration files
  // only, never supabase/config.toml and never an Edge Function directory.
  const SOCIAL_SUCCESSOR_MIGRATIONS = Object.freeze([
    "supabase/migrations/20260810010000_social_block_authority.sql",
    "supabase/migrations/20260810020000_social_participation_authority.sql",
    "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql",
    "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
    "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
  ]);
  const predecessorDrift = git(["diff", "--name-only", baseline, "--", ...frozenPredecessorPaths]).stdout
    .split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean)
    .filter((entry) => !SR1A_SUCCESSOR_PATHS.includes(entry) && !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry));
  check("37b. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1 &&
      new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length &&
      SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry)) &&
      !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));
  check("37a. the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("37. every frozen predecessor implementation is byte-unchanged by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("37a. the only predecessor file this round amends is a validation harness",
    manifest.filter((entry) => !entry.startsWith(confidenceRoot) && entry !== "package.json"
      && entry !== `${domainRoot}/index.ts` && !entry.includes("ts4"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("38. lifecycle fails closed: at most one authority commit and no hidden staged bytes",
    freezeCandidates.length <= 1
    && (freezeCommit
      ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
      : git(["diff", "--cached", "--name-only"]).stdout.trim() === ""),
    { freezeCandidates });
  check("39. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components/i.test(entry)));
  check("39a. the domain barrel additively exposes confidence after all five frozen modules",
    ["./similarity", "./compatibility", "./goal-restriction", "./comparison", "./confidence"]
      .every((entry) => domainIndex.includes(`export * from "${entry}";`))
    && ["./policy", "./types", "./compute"].every((entry) => confidenceIndex.includes(`export * from "${entry}";`)));

  const probeDiagnostics = compileContractProbe();
  check("39b. the TS-4 contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts4-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("40. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("41. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-4 Evidence Confidence Guard",
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

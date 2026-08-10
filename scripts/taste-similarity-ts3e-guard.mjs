#!/usr/bin/env node
// TS-3E guard — CANONICAL COMPARISON BUNDLE (composition only).
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
const baseline = "6dab5f10110c1770da6081a36018a085f7712cad";
const freezeMessage = "Assemble canonical taste comparison bundle";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const compatibilityRoot = `${domainRoot}/compatibility`;
const goalRestrictionRoot = `${domainRoot}/goal-restriction`;
const comparisonRoot = `${domainRoot}/comparison`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${comparisonRoot}/compose.ts`,
  `${comparisonRoot}/index.ts`,
  `${comparisonRoot}/policy.ts`,
  `${comparisonRoot}/types.ts`,
  // Successor amendment to a validation harness only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts3e-mutations.mjs",
  "scripts/taste-similarity-ts3e-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// Every frozen implementation TS-3E composes over. A composition round must not edit a byte of any.
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
    "test:taste-similarity-ts3e",
    "test:taste-similarity-ts3e-smoke",
    "test:taste-similarity-ts3e-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: the bundle exposes no aggregate, no confidence value, and its reason vocabulary
// is exactly the union of the three frozen vocabularies — no code of its own invention.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts3e-types-"));
  try {
    const importPath = path.join(root, comparisonRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "bundle-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        TasteComparisonBundle,
        TasteComparisonBundleStatus,
        TasteComparisonReasonCode
      } from ${JSON.stringify(importPath)};

      declare const bundle: TasteComparisonBundle;

      const status: readonly TasteComparisonBundleStatus[] = ["assembled", "unsupported_snapshot_schema"];
      void status;

      // Codes from all three frozen components are admitted, and only those.
      const tasteCode: TasteComparisonReasonCode = "shared_cuisine_preference";
      const repeatedCode: TasteComparisonReasonCode = "shared_repeated_restaurant_consumption";
      const contextCode: TasteComparisonReasonCode = "compatible_payment_preference";
      const goalCode: TasteComparisonReasonCode = "restriction_requires_attention";

      // @ts-expect-error the bundle invents no reason code of its own
      const invented: TasteComparisonReasonCode = "overall_good_match";
      // @ts-expect-error there is no aggregate similarity score
      const overall: number = bundle.overallSimilarity;
      // @ts-expect-error there is no match or rank score
      const rank: number = bundle.matchScore;
      // @ts-expect-error there is no numeric confidence
      const confidence: number = bundle.confidenceInputs.confidenceScore;
      // @ts-expect-error there is no qualitative confidence band
      const band: string = bundle.confidenceInputs.confidenceLevel;
      // @ts-expect-error the bundle never embeds a raw snapshot
      const raw: unknown = bundle.snapshotA;
      void [tasteCode, repeatedCode, contextCode, goalCode, invented, overall, rank, confidence, band, raw];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, comparisonRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, comparisonRoot, file));
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

  const policy = read(`${comparisonRoot}/policy.ts`);
  const types = read(`${comparisonRoot}/types.ts`);
  const compose = read(`${comparisonRoot}/compose.ts`);
  const comparisonIndex = read(`${comparisonRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, types, compose, comparisonIndex].join("\n");
  const executable = executableOnly(implementation);
  const composeCode = executableOnly(compose);
  const typesCode = executableOnly(types);
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  // ---- 1-6. version authority -------------------------------------------------------------------
  check("1. a separate bundle policy version exists and is stamped on the result",
    /TASTE_COMPARISON_BUNDLE_VERSION = "taste-comparison-bundle-v1" as const;/.test(policy)
    && /bundleVersion: typeof TASTE_COMPARISON_BUNDLE_VERSION/.test(types)
    && /bundleVersion: TASTE_COMPARISON_BUNDLE_VERSION/.test(compose));
  check("2. every component version is the frozen exported constant, imported not restated",
    /tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION/.test(compose)
    && /socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION/.test(compose)
    && /goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION/.test(compose)
    && /snapshotSchemaVersion: TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION/.test(compose)
    && /TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION/.test(policy));
  check("3-6. no component or schema version literal is duplicated anywhere in this module",
    !/"taste-similarity-v/.test(implementation)
    && !/"social-context-compatibility-v/.test(implementation)
    && !/"goal-restriction-compatibility-v/.test(implementation)
    && !/"taste-profile-snapshot-v/.test(implementation));

  // ---- 7-9. composition, never reimplementation -------------------------------------------------
  check("7. all three frozen comparators are imported and each is called exactly once",
    /import \{ TASTE_SIMILARITY_POLICY_VERSION, compareTasteSimilarity \} from "\.\.\/similarity";/.test(compose)
    && /import \{ SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION, compareSocialContextCompatibility \} from "\.\.\/compatibility";/.test(compose)
    && /import \{ GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION, compareGoalRestrictionCompatibility \} from "\.\.\/goal-restriction";/.test(compose)
    && (composeCode.match(/compareTasteSimilarity\(snapshotA, snapshotB\)/g) ?? []).length === 1
    && (composeCode.match(/compareSocialContextCompatibility\(snapshotA, snapshotB\)/g) ?? []).length === 1
    && (composeCode.match(/compareGoalRestrictionCompatibility\(snapshotA, snapshotB\)/g) ?? []).length === 1);
  check("8. no component rule is reimplemented: no evidence is inspected at all",
    !/preference\.scope|preference\.facet|behaviorKind|favoriteKind|enforcement|validity|goal\.facet|restriction\.label|\.polarity/.test(executable)
    && !/snapshot[AB]\.(preferences|behavior|goals|restrictions)\b/.test(executable));
  check("9. no local set-similarity implementation exists",
    !/intersectionSize|unionSize|jaccard|agreement/i.test(executable)
    && !/Math\./.test(executable));

  // ---- 10-15. no aggregate, no confidence, no invented policy -----------------------------------
  check("10-12. no aggregate, weighted, match or rank score is produced",
    !/overall|aggregate|combined|weighted|matchScore|rankScore|totalScore/i.test(executable)
    && !/\.score\s*[*/+-]|[*/+-]\s*[A-Za-z.]*\.score\b/.test(composeCode));
  check("13. the restriction verdict is carried verbatim and never rebuilt or scored",
    /goalRestriction,/.test(composeCode)
    && !/restrictionEligibility\s*[:=]\s*\{/.test(composeCode)
    && /restrictionVerdict: goalRestriction\.restrictionEligibility\.verdict/.test(compose));
  check("14-15. no numeric confidence and no invented qualitative confidence band",
    !/confidenceScore|confidenceLevel|confidenceBand|"high"|"medium"|"low"/.test(executable)
    && /TasteComparisonConfidenceInputs/.test(types));
  check("16-17. no cold-start fallback and no Social ranking, gating or display decision",
    !/coldStart|cold_start|fallback|popularity|demographic|threshold|topN|shouldShow|eligibleForDisplay|recommend|ranking/i.test(executable));

  // ---- 18-26. isolation and privacy -------------------------------------------------------------
  check("18. no GPS, distance or proximity signal", !/gps|geolocation|latitude|longitude|distanceKm|proximity|nearby/i.test(implementation));
  check("19-21. no premium, activity or verified signal",
    !/isPremium|premium|activityScore|engagement|trending|isVerified|\bverified\b/i.test(implementation));
  check("22. no subject user id is read or exposed", !/subjectUserId/.test(implementation));
  // The bundle's own result literal is extracted and inspected on its own, so an argument named
  // `snapshotA` passed to a helper is not mistaken for a snapshot embedded in the output.
  const bundleFunction = /export function compareTasteProfiles\([\s\S]*?\n\}/.exec(composeCode)?.[0] ?? "";
  const bundleResultLiteral = /return \{[\s\S]*?\n {2}\};/.exec(bundleFunction)?.[0] ?? "";
  check("23. no raw evidence array or snapshot object is embedded in the result",
    bundleResultLiteral.length > 0
    // No snapshot is assigned to a field, by shorthand or by name. Passing one to a helper that
    // returns counts is fine; placing one in the output is not.
    && !/^\s*snapshot[AB]\s*[,:]/m.test(bundleResultLiteral)
    && !/:\s*snapshot[AB]\s*[,\n}]/.test(bundleResultLiteral)
    && !/preferences:|behavior:|goals:|restrictions:/.test(bundleResultLiteral)
    && !/snapshot[AB]|preferences:|behavior:|goals:|restrictions:/.test(typesCode));
  check("24-26. no macro value, restriction label or context value can reach the result",
    !/daily_calories_target|protein_target_g|carbohydrates_target_g|fat_target_g|fiber_target_g/.test(executable)
    && !/restrictionType|rawSeverity|\.label\b|dining_style|payment_preference|meal_type|cuisine|flavor|spice/.test(executable));

  // ---- 27-30. determinism, dedupe and fail-closed -----------------------------------------------
  check("27. reason ordering is the fixed component order with no re-sorting",
    /\.\.\.taste\.explanationReasonCodes,\s*\n\s*\.\.\.socialContext\.explanationReasonCodes,\s*\n\s*\.\.\.goalRestriction\.explanationReasonCodes/.test(compose)
    && !/localeCompare|Intl\.|\.sort\(/.test(executable)
    && !/Date\.now|new Date\(|Math\.random|process\.env|globalThis/.test(executable));
  check("28. merged reason codes are deduplicated structurally and returned immutable",
    /Object\.freeze\(\[\.\.\.new Set\(merged\)\]\)/.test(compose));
  check("29. an unsupported snapshot schema fails closed at bundle level",
    /snapshotA\.schemaVersion === TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION &&/.test(compose)
    && /snapshotB\.schemaVersion === TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION;/.test(compose)
    && /status: schemaSupported \? "assembled" : "unsupported_snapshot_schema"/.test(compose));
  check("30. partial component availability cannot short-circuit the bundle",
    bundleFunction.length > 0
    // Exactly one exit, no early return, no conditional that omits a component, no throw.
    && (bundleFunction.match(/\breturn\b/g) ?? []).length === 1
    && !/if \([^)]*status === "not_scored"/.test(bundleFunction)
    && !/throw new/.test(composeCode));

  // ---- 31-36. manifest, lifecycle and self-integrity --------------------------------------------
  check("31. candidate or frozen commit has the exact 10-path TS-3E manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("31a. branch remains main", branch === "main", { branch });
  check("31b. TS-3E baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("31c. package change adds only the three TS-3E validation commands", packageOnlyAddsValidationScripts(freezeCommit));
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
  check("32a. the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("32. every frozen component implementation is byte-unchanged by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("32a. the only predecessor file this round amends is a validation harness",
    manifest.filter((entry) => !entry.startsWith(comparisonRoot) && entry !== "package.json"
      && entry !== `${domainRoot}/index.ts` && !entry.includes("ts3e"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("33. lifecycle fails closed: at most one authority commit and no hidden staged bytes",
    freezeCandidates.length <= 1
    && (freezeCommit
      ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
      : git(["diff", "--cached", "--name-only"]).stdout.trim() === ""),
    { freezeCandidates });
  check("34. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components/i.test(entry)));
  check("34a. the domain barrel additively exposes comparison after all three frozen modules",
    ["./similarity", "./compatibility", "./goal-restriction", "./comparison"]
      .every((entry) => domainIndex.includes(`export * from "${entry}";`))
    && ["./policy", "./types", "./compose"].every((entry) => comparisonIndex.includes(`export * from "${entry}";`))
    && moduleSpecifiers.every((entry) => ["../snapshot", "../similarity", "../compatibility", "../goal-restriction", "./policy", "./types", "./compose"].includes(entry)),
    { moduleSpecifiers });

  const probeDiagnostics = compileContractProbe();
  check("34b. the TS-3E contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts3e-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("35. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("36. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-3E Canonical Comparison Bundle Guard",
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

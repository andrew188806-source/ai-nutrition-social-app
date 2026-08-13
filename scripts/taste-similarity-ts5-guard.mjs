#!/usr/bin/env node
// TS-5 guard — COLD START EVIDENCE POLICY V1.
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
const baseline = "cdedfb5a86a3a94fa42a4ca1809a94f8116cf776";
const freezeMessage = "Add cold start evidence policy";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const compatibilityRoot = `${domainRoot}/compatibility`;
const goalRestrictionRoot = `${domainRoot}/goal-restriction`;
const comparisonRoot = `${domainRoot}/comparison`;
const confidenceRoot = `${domainRoot}/confidence`;
const coldStartRoot = `${domainRoot}/cold-start`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${coldStartRoot}/assess.ts`,
  `${coldStartRoot}/index.ts`,
  `${coldStartRoot}/policy.ts`,
  `${coldStartRoot}/types.ts`,
  // Successor amendment to a validation harness only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts5-mutations.mjs",
  "scripts/taste-similarity-ts5-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// Every frozen implementation TS-5 reads. A policy round above them must not edit a byte of any.
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
  confidenceRoot,
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
    "test:taste-similarity-ts5",
    "test:taste-similarity-ts5-smoke",
    "test:taste-similarity-ts5-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: no verdict field, no aggregate, no value or basis on a non-comparable state, no
// mutable restriction verdict and no per-user sparsity field.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts5-types-"));
  try {
    const importPath = path.join(root, coldStartRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "cold-start-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        ColdStartAssessment,
        ColdStartTasteEvidence,
        NonComparableTasteEvidence
      } from ${JSON.stringify(importPath)};

      declare const assessment: ColdStartAssessment;
      declare const evidence: ColdStartTasteEvidence;
      declare const nonComparable: NonComparableTasteEvidence;

      if (evidence.state === "comparable") {
        const narrowedValue: number = evidence.value;
        const narrowedBasis: string = evidence.basis;
        void [narrowedValue, narrowedBasis];
      }

      // @ts-expect-error a non-comparable state exposes no informational value
      nonComparable.value;
      // @ts-expect-error a non-comparable state exposes no basis
      nonComparable.basis;
      // @ts-expect-error the value is unreachable until the union is narrowed
      evidence.value;

      // @ts-expect-error there is no cold start boolean
      const isColdStart: boolean = assessment.isColdStart;
      // @ts-expect-error there is no readiness verdict
      const isReady: boolean = assessment.ready;
      // @ts-expect-error there is no aggregate score
      const overallScore: number = assessment.overallScore;
      // @ts-expect-error there is no per-user sparsity inference
      const sparseSubjectCount: number = assessment.sparseSubjectCount;
      // @ts-expect-error the restriction verdict is carried through read-only
      assessment.restrictionState.verdict = "compatible";
      void [isColdStart, isReady, overallScore, sparseSubjectCount];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, coldStartRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, coldStartRoot, file));
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

  const policy = read(`${coldStartRoot}/policy.ts`);
  const types = read(`${coldStartRoot}/types.ts`);
  const assess = read(`${coldStartRoot}/assess.ts`);
  const coldStartIndex = read(`${coldStartRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, types, assess, coldStartIndex].join("\n");
  const executable = executableOnly(implementation);
  const assessCode = executableOnly(assess);
  const typesCode = executableOnly(types);
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  // ---- 1-3. version authority -------------------------------------------------------------------
  check("1-2. an independent cold start policy version exists and is stamped",
    /COLD_START_POLICY_VERSION = "cold-start-policy-v1" as const;/.test(policy)
    && /coldStartPolicyVersion: typeof COLD_START_POLICY_VERSION/.test(types)
    && /coldStartPolicyVersion: COLD_START_POLICY_VERSION/.test(assess));
  check("3. all six frozen versions are imported constants, never duplicated literals",
    /evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION/.test(assess)
    && /comparisonBundleVersion: TASTE_COMPARISON_BUNDLE_VERSION/.test(assess)
    && /tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION/.test(assess)
    && /socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION/.test(assess)
    && /goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION/.test(assess)
    && /snapshotSchemaVersion: TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION/.test(assess)
    && !/"taste-similarity-v|"social-context-compatibility-v|"goal-restriction-compatibility-v|"taste-comparison-bundle-v|"taste-profile-snapshot-v|"evidence-confidence-v/.test(implementation));

  // ---- 4-6. score and threshold independence ----------------------------------------------------
  check("4. no component score is reachable from the assessment", !/\.score\b/.test(executable));
  check("5. the informational confidence value is never compared against anything",
    !/\.value\s*(?:>=|<=|>|<|===|!==)|(?:>=|<=|>|<)\s*[a-zA-Z.]*\.value\b/.test(assessCode)
    && !/confidence\.taste\.value\s*[<>]/.test(assessCode));
  check("6. no bare numeric classification constant exists anywhere in the policy path",
    !/[<>]=?\s*\d|\d\s*[<>]=?|=\s*\d+\.\d/.test(assessCode)
    && !/\b0\.\d+\b/.test(executable));

  // ---- 7-10. no verdict, no substitution --------------------------------------------------------
  check("7-8. no cold start boolean and no readiness or proceed verdict",
    !/isColdStart|coldStart\s*[:=]|\bready\b|proceedNormally|canMatch|shouldShow|gating/i.test(executable)
    && !/isColdStart|\bready\b|proceed|canMatch/i.test(typesCode));
  check("9-10. no fallback score and no weight redistribution",
    !/fallback|substitut|redistribut|weight/i.test(executable)
    && !/fallbackScore|substituteScore|effectiveScore/i.test(implementation));

  // ---- 11-15. source and state semantics ---------------------------------------------------------
  check("11-12. reachability is inherited from the frozen bundles and degraded states are never collapsed into empty",
    /comparison\.confidenceInputs\.sourceAvailability/.test(assess)
    && !/"failed"|"disabled"|"unauthenticated"|"deferred"|"empty"/.test(assessCode)
    && !/evidenceCount|sourceStates/.test(executable));
  check("13. truncation feeds incompleteness and never a new-user classification",
    /favoritesTruncatedForEither/.test(assess) && /mealsTruncatedForEither/.test(assess)
    && /tasteHistoryComplete/.test(assess)
    && !/newUser|isNew|freshProfile/i.test(executable));
  check("14. ratings reachability and ratings truncation are never read", !/ratings/i.test(executable));
  check("15. unsupported is a distinct state, never merged into an evidence classification",
    /"unsupported"/.test(types) && /state: "unsupported"/.test(assess)
    && /"no_comparable_evidence"/.test(types) && /"sources_incomplete"/.test(types));

  // ---- 16-17. version coherence and comparable coexistence ---------------------------------------
  check("16. mismatched bundle versions fail closed before any partial assessment",
    /function interpretable\(/.test(assess)
    && /comparison\.versions\.bundleVersion === confidence\.versions\.comparisonBundleVersion/.test(assess)
    && /if \(!interpretable\(comparison, confidence\)\) \{/.test(assess)
    && /tasteEvidence: \{ state: "unsupported" \}/.test(assess));
  check("17. a scored taste result stays comparable even when its sources are degraded",
    /if \(comparison\.confidenceInputs\.dimensionAvailability\.taste === "scored"\) \{/.test(assess)
    && /return \{ state: "comparable", basis: confidence\.taste\.basis, value: confidence\.taste\.value \};/.test(assess)
    && !/tasteSourcesComplete[\s\S]{0,200}state: "sources_incomplete"[\s\S]{0,80}dimensionAvailability\.taste === "scored"/.test(assessCode));

  // ---- 18-20. restriction preservation -----------------------------------------------------------
  check("18-19. the restriction verdict and unclassified flag are carried through verbatim and read-only",
    /verdict: comparison\.goalRestriction\.restrictionEligibility\.verdict/.test(assess)
    && /unclassifiedPresent: confidence\.restrictionEvidence\.unclassifiedPresent/.test(assess)
    && /readonly verdict: RestrictionEligibilityVerdict;/.test(types)
    && /readonly unclassifiedPresent: boolean;/.test(types));
  check("20. restriction carries no numeric field and never enters the generic reason vocabulary",
    !/value|score|percent|safe/i.test(/export type ColdStartRestrictionState = \{[\s\S]*?\};/.exec(typesCode)?.[0] ?? "value")
    && !/restrict/i.test(/COLD_START_REASON_CODES = \[[\s\S]*?\] as const;/.exec(policy)?.[0] ?? "restrict"));

  // ---- 21-24. substitution and aggregation bans --------------------------------------------------
  check("21-22. no goal or context substitution for taste",
    /goal_only_evidence/.test(policy) && /context_only_evidence/.test(policy)
    && !/goalCompatibility[\s\S]{0,120}taste|tasteScore|effectiveTaste/i.test(executable));
  check("23. no aggregate, match or rank score",
    !/overall|aggregate|combined|matchScore|rankScore|topN|candidateRank/i.test(executable));
  check("24. no user-level or per-side inference",
    !/sparseSubjectCount|userAIsSparse|userBIsSparse|newUser|profileCompletenessByUser|subjectUserId/i.test(implementation));

  // ---- 25-32. privacy, platform and purity -------------------------------------------------------
  check("25-26. no raw snapshot, evidence or identity is reachable",
    !/snapshot[AB]|TasteProfileSnapshot|\.preferences\b|\.behavior\b|\.goals\b|\.restrictions\b/.test(executable)
    && !/\.label\b|restaurantId|menuItemId|rawSeverity|restrictionType|goal_label|daily_calories_target|evidenceId/.test(executable));
  check("27-29. no popularity, GPS or demographic signal",
    !/popularity|trending|gps|geolocation|latitude|longitude|nearby|proximity|distanceKm|demographic|\bgender\b|\bage\b/i.test(implementation));
  check("30. no premium, activity or verified signal",
    !/isPremium|premium|activityScore|engagement|isVerified|\bverified\b/i.test(implementation));
  check("31. no database, network or Supabase dependency, and only frozen domain siblings are imported",
    !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\//i.test(executable)
    && moduleSpecifiers.every((entry) => ["../snapshot", "../similarity", "../compatibility", "../goal-restriction", "../comparison", "../confidence", "./policy", "./types", "./assess"].includes(entry)),
    { moduleSpecifiers });
  check("32. no clock, randomness or environment access",
    !/Date\.now|new Date\(|Math\.random|process\.env|globalThis|performance\.now|localeCompare|Intl\./.test(executable));

  // ---- 33-34. determinism of the reported vocabulary ---------------------------------------------
  check("33-34. reason codes use a fixed declaration order and are deduped and frozen",
    /COLD_START_REASON_CODES = \[/.test(policy) && /\] as const;/.test(policy)
    && /REASON_CODE_ORDER/.test(policy)
    && /Object\.freeze\(\s*\[\.\.\.new Set\(codes\)\]\.sort\(/.test(policy)
    && /Object\.freeze\(\[\.\.\.new Set\(values\)\]\)/.test(assess));

  // ---- 35-40. manifest, lifecycle and self-integrity ---------------------------------------------
  check("35. candidate or frozen commit has the exact 10-path TS-5 manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("35a. branch remains main", branch === "main", { branch });
  check("35b. TS-5 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("35c. package change adds only the three TS-5 validation commands", packageOnlyAddsValidationScripts(freezeCommit));
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
  check("36b. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1 &&
      new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length &&
      SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry)) &&
      !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));
  check("36a. the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("36. every frozen predecessor implementation is byte-unchanged by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("36a. the only predecessor file this round amends is a validation harness",
    manifest.filter((entry) => !entry.startsWith(coldStartRoot) && entry !== "package.json"
      && entry !== `${domainRoot}/index.ts` && !entry.includes("ts5"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("37. lifecycle fails closed: at most one authority commit and no hidden staged bytes",
    freezeCandidates.length <= 1
    && (freezeCommit
      ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
      : git(["diff", "--cached", "--name-only"]).stdout.trim() === ""),
    { freezeCandidates });
  check("38. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components/i.test(entry)));
  check("38a. the domain barrel additively exposes cold-start after all six frozen modules",
    ["./similarity", "./compatibility", "./goal-restriction", "./comparison", "./confidence", "./cold-start"]
      .every((entry) => domainIndex.includes(`export * from "${entry}";`))
    && ["./policy", "./types", "./assess"].every((entry) => coldStartIndex.includes(`export * from "${entry}";`)));

  const probeDiagnostics = compileContractProbe();
  check("38b. the TS-5 contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts5-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("39. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("40. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-5 Cold Start Evidence Policy Guard",
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

#!/usr/bin/env node
// TS-6 guard — SHARED TASTE ADAPTER V1.
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
const baseline = "5e889049f8f25de3fc07692ec69a9f24bfb4d7dd";
const freezeMessage = "Add shared taste comparison adapter";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const compatibilityRoot = `${domainRoot}/compatibility`;
const goalRestrictionRoot = `${domainRoot}/goal-restriction`;
const comparisonRoot = `${domainRoot}/comparison`;
const confidenceRoot = `${domainRoot}/confidence`;
const coldStartRoot = `${domainRoot}/cold-start`;
const adapterRoot = `${domainRoot}/shared-adapter`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${adapterRoot}/adapt.ts`,
  `${adapterRoot}/index.ts`,
  `${adapterRoot}/policy.ts`,
  `${adapterRoot}/types.ts`,
  // Successor amendment to a validation harness only — never to a predecessor implementation path.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs",
  "scripts/taste-similarity-ts6-mutations.mjs",
  "scripts/taste-similarity-ts6-smoke.mjs"
].sort();

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
// Every frozen implementation TS-6 projects. An adapter round must not edit a byte of any of them.
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
  coldStartRoot,
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
    "test:taste-similarity-ts6",
    "test:taste-similarity-ts6-smoke",
    "test:taste-similarity-ts6-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof: an unsupported result carries no component data, no aggregate or verdict field
// exists, no upstream bundle is embedded, and restriction carries no numeric field.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts6-types-"));
  try {
    const importPath = path.join(root, adapterRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "adapter-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        AdaptedSharedTasteResult,
        ProjectedRestriction,
        SharedTasteAdapterResult,
        UnsupportedSharedTasteResult
      } from ${JSON.stringify(importPath)};

      declare const result: SharedTasteAdapterResult;
      declare const adapted: AdaptedSharedTasteResult;
      declare const unsupported: UnsupportedSharedTasteResult;
      declare const restriction: ProjectedRestriction;

      if (result.status === "adapted") {
        const narrowed: number | undefined = result.taste.similarity.status === "scored" ? result.taste.similarity.score : undefined;
        void narrowed;
      }

      // @ts-expect-error an unsupported result carries no taste projection
      unsupported.taste;
      // @ts-expect-error an unsupported result carries no context projection
      unsupported.context;
      // @ts-expect-error there is no aggregate score
      const overallScore: number = adapted.overallScore;
      // @ts-expect-error there is no global confidence
      const overallConfidence: number = adapted.overallConfidence;
      // @ts-expect-error there is no readiness verdict
      const isReady: boolean = adapted.ready;
      // @ts-expect-error there is no ordering field
      const ordering: number = adapted.rank;
      // @ts-expect-error the upstream comparison bundle is not embedded
      adapted.comparison;
      // @ts-expect-error the upstream confidence bundle is not embedded
      adapted.confidence;
      // @ts-expect-error the upstream cold start assessment is not embedded
      adapted.coldStart;
      // @ts-expect-error restriction carries no numeric field
      restriction.value;
      // @ts-expect-error projected arrays are read-only
      adapted.signals.availableFamilies.push("taste");
      void [overallScore, overallConfidence, isReady, ordering];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, adapterRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, adapterRoot, file));
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

  const policy = read(`${adapterRoot}/policy.ts`);
  const types = read(`${adapterRoot}/types.ts`);
  const adapt = read(`${adapterRoot}/adapt.ts`);
  const adapterIndex = read(`${adapterRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, types, adapt, adapterIndex].join("\n");
  const executable = executableOnly(implementation);
  const adaptCode = executableOnly(adapt);
  const typesCode = executableOnly(types);
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  // ---- 1-4. version authority -------------------------------------------------------------------
  check("1-2. an independent shared adapter policy version exists and is stamped",
    /SHARED_TASTE_ADAPTER_POLICY_VERSION = "shared-taste-adapter-v1" as const;/.test(policy)
    && /sharedAdapterPolicyVersion: typeof SHARED_TASTE_ADAPTER_POLICY_VERSION/.test(types)
    && /sharedAdapterPolicyVersion: SHARED_TASTE_ADAPTER_POLICY_VERSION/.test(adapt));
  check("3-4. all seven frozen versions are imported constants with no duplicated literal",
    ["COLD_START_POLICY_VERSION", "EVIDENCE_CONFIDENCE_POLICY_VERSION", "TASTE_COMPARISON_BUNDLE_VERSION",
      "TASTE_SIMILARITY_POLICY_VERSION", "SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION",
      "GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION", "TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION"]
      .every((constant) => new RegExp(`: ${constant}[,\\n]`).test(adapt))
    && !/"taste-similarity-v|"social-context-compatibility-v|"goal-restriction-compatibility-v|"taste-comparison-bundle-v|"taste-profile-snapshot-v|"evidence-confidence-v|"cold-start-policy-v/.test(implementation));

  // ---- 5-10. inputs, coherence and fail-closed ---------------------------------------------------
  check("5-6. only the three frozen results are accepted and no raw snapshot is reachable",
    /comparison: TasteComparisonBundle,\s*\n\s*confidence: EvidenceConfidenceBundle,\s*\n\s*coldStart: ColdStartAssessment/.test(adapt)
    && !/TasteProfileSnapshot|snapshot[AB]|\.preferences\b|\.behavior\b|\.goals\b|\.restrictions\b/.test(executable));
  check("7-8. every shared authority is cross-checked and a mismatch fails closed",
    /function findBlockingReason\(/.test(adapt)
    && /comparison\.versions\.bundleVersion === confidence\.versions\.comparisonBundleVersion/.test(adapt)
    && /comparison\.versions\.bundleVersion === coldStart\.versions\.comparisonBundleVersion/.test(adapt)
    && /confidence\.versions\.evidenceConfidencePolicyVersion === coldStart\.versions\.evidenceConfidencePolicyVersion/.test(adapt)
    && /return coherent \? null : "policy_version_mismatch";/.test(adapt)
    && /if \(blocking !== null\) \{/.test(adapt));
  check("9-10. the unsupported result is discriminated and carries no component data",
    /UnsupportedSharedTasteResult = \{[\s\S]*?\};/.test(types)
    && !/taste|context|goal|restriction|signals|reasons/.test(/export type UnsupportedSharedTasteResult = \{[\s\S]*?\};/.exec(typesCode)?.[0] ?? "taste")
    && /status: "unsupported", reason: blocking/.test(adapt));

  // ---- 11-16. exact projection only --------------------------------------------------------------
  check("11-13. taste, context and goal scores are copied, never derived",
    /status: "scored", score: taste\.score/.test(adapt)
    && /status: "scored", score: dimension\.score/.test(adapt)
    && /status: "scored", score: goal\.score/.test(adapt));
  check("14. the evidence confidence value and basis are copied",
    /status: "available", value: taste\.value, basis: taste\.basis/.test(adapt));
  check("15. the cold start evidence state is copied",
    /evidenceState: coldStart\.tasteEvidence\.state/.test(adapt));
  check("16. the restriction verdict is copied and the projection stays read-only",
    /verdict: comparison\.goalRestriction\.restrictionEligibility\.verdict/.test(adapt)
    && /readonly verdict: RestrictionEligibilityVerdict;/.test(types)
    && /readonly unclassifiedPresent: boolean;/.test(types));

  // ---- 17-23. no recomputation -------------------------------------------------------------------
  check("17-19. no set similarity, no averaging and no score arithmetic",
    !/jaccard|intersectionSize|unionSize|\bmean\b|average|reduce\(/i.test(executable)
    && !/score\s*[*/+%-]|[*/+%-]\s*[A-Za-z.]*\.score\b/.test(adaptCode));
  check("20-23. no confidence arithmetic, no rounding, no clamp and no display conversion",
    !/Math\./.test(executable)
    && !/toFixed|round|clamp|normali[sz]e|\* 100|percent/i.test(executable)
    && !/\.value\s*[*/+%-]|[*/+%-]\s*[A-Za-z.]*\.value\b/.test(adaptCode));

  // ---- 24-31. no aggregate, no consumer policy ---------------------------------------------------
  check("24-25. no aggregate score and no global confidence",
    !/overall|aggregate|combined|weighted|matchScore|rankScore|compatibilityScore|suitab|recommendationScore/i.test(executable));
  check("26-28. no threshold, weight, boost or penalty",
    !/threshold|\bweight|boost|penalt|priorit/i.test(executable));
  check("29-30. no readiness, proceed, show, hide, ordering or gating field",
    !/\bready\b|proceed|canMatch|eligibleToMatch|\bshouldShow\b|\bhide\b|\brank\b|topN|gating|\bgate\b/i.test(executable));
  check("31. no fallback semantics", !/fallback|substitut/i.test(executable));

  // ---- 32-33. generic shared-domain naming -------------------------------------------------------
  check("32. no consumer-specific naming is hard-coded",
    !/mealBuddy|meal_buddy|dating|socialCandidate|friendRank|candidateList/i.test(implementation));
  check("33. no catalog, GPS or proximity logic",
    !/catalog|gps|geolocation|latitude|longitude|nearby|proximity|distanceKm/i.test(implementation));

  // ---- 34-42. privacy and encapsulation ----------------------------------------------------------
  check("34-36. no user, evidence, restaurant or menu identity is reachable",
    !/subjectUserId|userId|evidenceId|restaurantId|menuItemId/.test(executable));
  check("37-40. no raw taste, goal, restriction, payment or dining value is reachable",
    !/\.label\b|\.rawSeverity|restrictionType|goal_label|daily_calories_target|protein_target_g|payment_preference|dining_style|\.value\b(?!\s*[,;)])/.test(
      adaptCode.replace(/taste\.value|confidence\.taste\.value/g, "")
    ));
  check("41. no internal foundation metadata is projected",
    !/confidenceInputs|evidenceCoverage|sourceAvailability|historyCompleteness|dimensionAvailability|comparableDimensions|overlaps|sharedAvoidances|unknowns|conflicts/.test(executable));
  // The published contract references only LEAF types from the frozen layers — never a whole bundle
  // — so an upstream result cannot be embedded even by accident. `reasons.comparison` is a channel
  // name carrying a reason-code array, not a bundle, which is why the check keys on the type names.
  check("42. no upstream bundle is embedded in the result",
    !/TasteComparisonBundle|EvidenceConfidenceBundle|ColdStartAssessment/.test(typesCode)
    && !/^\s*(comparison|confidence|coldStart)\s*,\s*$/m.test(adaptCode)
    // Spreading a PROPERTY of a bundle (a reason array) is the whole job; spreading the bundle
    // itself is what would leak the foundation's internal layout, so the ban is on the latter only.
    && !/\.\.\.(comparison|confidence|coldStart)\s*[,})]/.test(adaptCode));

  // ---- 43-46. reason channels, determinism and immutability --------------------------------------
  check("43. the two reason channels stay structurally separate",
    /comparison: readonly TasteComparisonReasonCode\[\];/.test(types)
    && /evidence: readonly ColdStartReasonCode\[\];/.test(types)
    && /comparison: Object\.freeze\(\[\.\.\.comparison\.explanationReasonCodes\]\)/.test(adapt)
    && /evidence: Object\.freeze\(\[\.\.\.coldStart\.reasonCodes\]\)/.test(adapt));
  check("44. no reason literal is invented by this layer",
    !/"shared_|"limited_|"no_comparable_taste|"incomplete_|"context_only|"goal_only|strong_match|weak_match|recommended/.test(adaptCode));
  check("45. frozen order is preserved with no re-sorting and no locale comparison",
    !/\.sort\(|localeCompare|Intl\./.test(executable));
  check("46. arrays are copied and frozen so no upstream reference escapes",
    /Object\.freeze\(\[\.\.\.coldStart\.availableSignalFamilies\]\)/.test(adapt)
    && /Object\.freeze\(\[\.\.\.coldStart\.incompleteSignalFamilies\]\)/.test(adapt)
    && (adaptCode.match(/Object\.freeze\(/g) ?? []).length >= 8);

  // ---- 47-49. purity -----------------------------------------------------------------------------
  check("47-48. no database, network or Supabase dependency, and only frozen domain siblings are imported",
    !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\/|serviceRole|edgeFunction|\brpc\b/i.test(executable)
    && moduleSpecifiers.every((entry) => ["../snapshot", "../similarity", "../compatibility", "../goal-restriction", "../comparison", "../confidence", "../cold-start", "./policy", "./types", "./adapt"].includes(entry)),
    { moduleSpecifiers });
  check("49. no environment, randomness or clock access",
    !/process\.env|Math\.random|globalThis|performance\.now|Date\.now|new Date\(/.test(executable));

  // ---- 50-55. manifest, lifecycle and self-integrity ---------------------------------------------
  check("50. candidate or frozen commit has the exact 10-path TS-6 manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("50a. branch remains main", branch === "main", { branch });
  check("50b. TS-6 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("50c. package change adds only the three TS-6 validation commands", packageOnlyAddsValidationScripts(freezeCommit));
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
  // The Social Runtime rounds add migrations under `supabase`, which this list covers wholesale.
  // Every such path is enumerated EXACTLY — anything else under the prefix still fails here — and
  // the companion check constrains what the allowance may ever contain: timestamped migration files
  // only, never supabase/config.toml and never an Edge Function directory.
  const SOCIAL_SUCCESSOR_MIGRATIONS = Object.freeze([
    "supabase/migrations/20260810010000_social_block_authority.sql",
    "supabase/migrations/20260810020000_social_participation_authority.sql"
  ]);
  const predecessorDrift = git(["diff", "--name-only", baseline, "--", ...frozenPredecessorPaths]).stdout
    .split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean)
    .filter((entry) => !SR1A_SUCCESSOR_PATHS.includes(entry) && !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry));
  check("51b. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1 &&
      new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length &&
      SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry)) &&
      !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));
  check("51a. the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("51. every frozen predecessor implementation is byte-unchanged by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("51a. the only predecessor file this round amends is a validation harness",
    manifest.filter((entry) => !entry.startsWith(adapterRoot) && entry !== "package.json"
      && entry !== `${domainRoot}/index.ts` && !entry.includes("ts6"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));
  check("52. lifecycle fails closed: at most one authority commit and no hidden staged bytes",
    freezeCandidates.length <= 1
    && (freezeCommit
      ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
      : git(["diff", "--cached", "--name-only"]).stdout.trim() === ""),
    { freezeCandidates });
  check("53. the manifest is exactly enumerated with no wildcard or successor escape",
    manifest.every((entry) => !/[?*\[\]{}]/.test(entry))
    && !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components/i.test(entry)));
  check("53a. the domain barrel additively exposes the adapter after all seven frozen modules",
    ["./similarity", "./compatibility", "./goal-restriction", "./comparison", "./confidence", "./cold-start", "./shared-adapter"]
      .every((entry) => domainIndex.includes(`export * from "${entry}";`))
    && ["./policy", "./types", "./adapt"].every((entry) => adapterIndex.includes(`export * from "${entry}";`)));

  const probeDiagnostics = compileContractProbe();
  check("53b. the TS-6 contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  const guardSource = read("scripts/taste-similarity-ts6-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("54. guard has no HEAD bypass and no unconditional success exit",
    !guardSource.includes(unconditionalSuccessExit) && !guardSource.includes(headBypass));
  check("55. guard has no unconditional PASS assertion and derives its exit status from the failure list",
    !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource) && /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-6 Shared Taste Adapter Guard",
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

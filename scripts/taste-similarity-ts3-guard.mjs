#!/usr/bin/env node
// TS-3A + TS-3B guard — VERSIONED TASTE SIMILARITY RESULT CONTRACT AND PURE FOOD-TASTE COMPARATOR.
//
// Lifecycle-aware, never lifecycle-dependent: every assertion is a repository CONTENT assertion over
// the working tree, so the guard produces the same verdict before and after the freeze commit. The
// only lifecycle-sensitive input is the manifest, which is read from the candidate while the round is
// open and from the freeze commit's own diff-tree once it has landed.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const baseline = "d2713c7fec141aeb7876def9c21e07c4d80c04dc";
const freezeMessage = "Freeze versioned taste similarity comparator";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const similarityRoot = `${domainRoot}/similarity`;
const manifest = [
  "package.json",
  `${domainRoot}/index.ts`,
  `${similarityRoot}/comparator.ts`,
  `${similarityRoot}/index.ts`,
  `${similarityRoot}/policy.ts`,
  `${similarityRoot}/reasonCodes.ts`,
  `${similarityRoot}/types.ts`,
  // Successor amendments only, both to validation harnesses, never to implementation. TS-2D check 26
  // was a whole-worktree subset assertion that reports a false scope violation as soon as any later
  // round opens a candidate. The TS-1 mutation harness enumerated domain sources flatly, so a copied
  // compile could not resolve the newly nested module. Neither amendment changes a predecessor
  // semantic assertion, and no predecessor implementation byte moves — proven separately below.
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts1-mutations.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3-mutations.mjs",
  "scripts/taste-similarity-ts3-smoke.mjs"
].sort();

// TS-1, TS-2 and TS-2D froze these. TS-3 is additive and must not have edited a byte of any of them.
const mobileRoot = "apps/mobile/features/consumer-taste-profile";
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
  `${mobileRoot}/adapters`,
  `${mobileRoot}/consumerTasteProfileService.ts`,
  `${mobileRoot}/factories.ts`,
  `${mobileRoot}/featureFlags.ts`,
  `${mobileRoot}/foundationMappers.ts`,
  `${mobileRoot}/index.ts`,
  `${mobileRoot}/supabaseTasteFoundationContracts.ts`,
  `${mobileRoot}/types.ts`,
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
    "test:taste-similarity-ts3",
    "test:taste-similarity-ts3-smoke",
    "test:taste-similarity-ts3-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

// Type-system proof. Content regexes prove what the source says; this proves what the COMPILER
// enforces — that `score` is unreachable on a not-scored result and that no excluded evidence
// category can be named as a comparable dimension or a reason code.
function compileContractProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts3-types-"));
  try {
    const importPath = path.join(root, similarityRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "contract-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        TasteSimilarityResult,
        ScoredTasteSimilarityResult,
        NotScoredTasteSimilarityResult,
        TasteSimilarityDimension,
        TasteSimilarityNotScoredReason,
        TasteSimilarityReasonCode
      } from ${JSON.stringify(importPath)};

      declare const result: TasteSimilarityResult;
      declare const notScored: NotScoredTasteSimilarityResult;
      declare const scored: ScoredTasteSimilarityResult;

      // @ts-expect-error a not-scored result has no score key at all
      notScored.score;
      // @ts-expect-error a scored result has no not-scored reason
      scored.reason;
      // @ts-expect-error the score is unreachable until the union is narrowed
      result.score;
      if (result.status === "scored") {
        const narrowed: number = result.score;
        void narrowed;
      }

      // The five v1 dimensions are the whole comparable surface.
      const allowed: readonly TasteSimilarityDimension[] = [
        "cuisine_preference",
        "flavor_avoidance",
        "spice_preference",
        "favorite_restaurant",
        "favorite_menu_item"
      ];
      void allowed;

      // @ts-expect-error meal pattern is not a taste similarity dimension
      const mealPattern: TasteSimilarityDimension = "meal_pattern";
      // @ts-expect-error dining context is not a taste similarity dimension
      const diningContext: TasteSimilarityDimension = "dining_context";
      // @ts-expect-error social logistics is not a taste similarity dimension
      const socialLogistics: TasteSimilarityDimension = "social_logistics";
      // @ts-expect-error nutrition goals are not a taste similarity dimension
      const goal: TasteSimilarityDimension = "nutrition_goal";
      // @ts-expect-error dietary restrictions are not a taste similarity dimension
      const restriction: TasteSimilarityDimension = "dietary_restriction";
      // @ts-expect-error meal history is not a taste similarity dimension
      const meals: TasteSimilarityDimension = "meal_occurrence";
      // @ts-expect-error ratings are not a taste similarity dimension
      const ratings: TasteSimilarityDimension = "rating";
      // @ts-expect-error proximity is not a taste similarity dimension
      const proximity: TasteSimilarityDimension = "distance";
      // @ts-expect-error a numeric confidence is not a not-scored reason
      const reason: TasteSimilarityNotScoredReason = "low_confidence";
      // @ts-expect-error social compatibility has no reason code in v1
      const socialReason: TasteSimilarityReasonCode = "shared_social_logistics";
      void [mealPattern, diningContext, socialLogistics, goal, restriction, meals, ratings, proximity, reason, socialReason];
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

  // ---- lifecycle and manifest authority ---------------------------------------------------------
  check("branch remains main", branch === "main", { branch });
  check("TS-3 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("candidate or frozen commit has the exact 12-path TS-3 manifest", same(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("freeze lifecycle has at most one exact authority commit", freezeCandidates.length <= 1, { freezeCandidates });
  check("candidate staged diff is empty or frozen successor has no hidden TS-3 staged bytes", freezeCommit
    ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
    : git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("manifest contains no wildcard authority", manifest.every((entry) => !/[?*\[\]{}]/.test(entry)));
  check("package change adds only the three TS-3 validation commands", packageOnlyAddsValidationScripts(freezeCommit));
  check("manifest contains no Mobile, Supabase, migration, RPC, Edge Function, UI, Social or GPS path",
    !manifest.some((entry) => /^(apps\/|supabase\/|lib\/)|migration|rpc|edge-function|components|social|gps/i.test(entry)));
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
    "supabase/migrations/20260810020000_social_participation_authority.sql",
    "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql"
  ]);
  const predecessorDrift = git(["diff", "--name-only", baseline, "--", ...frozenPredecessorPaths]).stdout
    .split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean)
    .filter((entry) => !SR1A_SUCCESSOR_PATHS.includes(entry) && !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry));
  check("the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1 &&
      new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length &&
      SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry)) &&
      !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));
  check("the SR-1A successor allowance is enumerated and cannot reach a migration or a deployable Edge Function",
    SR1A_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/")) &&
      !SR1A_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry) || entry.endsWith(".sql")) &&
      new Set(SR1A_SUCCESSOR_PATHS).size === SR1A_SUCCESSOR_PATHS.length);
  check("no TS-1, TS-2 or TS-2D frozen source is modified by this round", predecessorDrift.length === 0, { predecessorDrift });
  check("predecessor amendments touch validation harnesses only, never a predecessor implementation path",
    manifest.filter((entry) => !entry.startsWith(domainRoot) && entry !== "package.json" && !entry.startsWith("scripts/taste-similarity-ts3-"))
      .every((entry) => /^scripts\/[a-z0-9-]+-(guard|smoke|mutations)\.mjs$/.test(entry)));

  const policy = read(`${similarityRoot}/policy.ts`);
  const reasonCodes = read(`${similarityRoot}/reasonCodes.ts`);
  const types = read(`${similarityRoot}/types.ts`);
  const comparator = read(`${similarityRoot}/comparator.ts`);
  const similarityIndex = read(`${similarityRoot}/index.ts`);
  const domainIndex = read(`${domainRoot}/index.ts`);
  const implementation = [policy, reasonCodes, types, comparator, similarityIndex].join("\n");
  const executable = implementation.split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  // Import statements here are multi-line, so the dependency assertions are made over the resolved
  // module SPECIFIERS rather than over lines that happen to begin with `import`. Read from executable
  // source only, so an English `from "..."` inside a prose comment is not mistaken for a dependency.
  const moduleSpecifiers = [...executable.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  // ---- versioning authority ---------------------------------------------------------------------
  // TS-3B-R1 successor amendment. The invariant is that the ACTIVE policy version is an explicitly
  // pinned member of the taste-similarity version line and that the superseded version stays
  // recorded — not that the line is frozen at v1 forever. R1 added two behavioural dimensions, so
  // the same snapshot pair can score differently and the version MUST advance; pinning v1 here would
  // have made the mandatory bump fail the guard that exists to keep versioning honest. Two lifecycle
  // states are accepted and nothing else, and the successor is held to a strictly stronger bar: it
  // must also carry an ordered history whose first entry is the original v1.
  check("policy version is an explicitly pinned member of the taste-similarity version line", (() => {
    const original = /TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1" as const;/.test(policy);
    if (original) return true;
    return /TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1\.\d+" as const;/.test(policy)
      && /TASTE_SIMILARITY_POLICY_VERSION_HISTORY = \[\s*\n\s*"taste-similarity-v1",/.test(policy);
  })());
  check("policy version is stamped on every result shape", /policyVersion: typeof TASTE_SIMILARITY_POLICY_VERSION/.test(types)
    && (comparator.match(/policyVersion: TASTE_SIMILARITY_POLICY_VERSION/g) ?? []).length === 2);
  check("supported snapshot schema is derived from the frozen TS-2 constant, never re-declared",
    /TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION/.test(policy)
    && !/"taste-profile-snapshot-v\d+"/.test(implementation));
  check("an unsupported snapshot schema fails closed rather than scoring",
    /schemaVersion !== TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION/.test(comparator)
    && /return notScored\("unsupported_snapshot_schema"/.test(comparator));

  // ---- result contract discrimination -----------------------------------------------------------
  check("result is a discriminated union of scored and not_scored", /status: "scored"/.test(types) && /status: "not_scored"/.test(types)
    && /TasteSimilarityResult = ScoredTasteSimilarityResult \| NotScoredTasteSimilarityResult/.test(types));
  check("score is declared only on the scored variant", (types.match(/^\s*score: number;/gm) ?? []).length === 1
    && /ScoredTasteSimilarityResult = TasteSimilarityResultBase & \{\s*\n\s*status: "scored";\s*\n\s*score: number;/.test(types));
  check("score is never declared optional-and-undefined", !/score\?\s*:/.test(types) && !/score:\s*number\s*\|\s*(?:null|undefined)/.test(types));
  const notScoredBody = /function notScored\([\s\S]*?\n\}/.exec(comparator)?.[0] ?? "";
  check("the not_scored constructor emits no score key", notScoredBody.length > 0 && !/\bscore:/.test(notScoredBody));
  check("not_scored reasons are a closed set of three", ["no_comparable_evidence", "insufficient_evidence", "unsupported_snapshot_schema"]
    .every((reason) => types.includes(`"${reason}"`)));
  check("scored and not_scored both carry the sparse-evidence inputs", /confidenceInputs: TasteSimilarityConfidenceInputs;/.test(types));
  check("no numeric confidence is produced by this round", !/confidenceScore|tasteConfidence|profileConfidence|matchConfidence/.test(implementation));

  // ---- 0..1 contract and deterministic rounding -------------------------------------------------
  check("canonical range is 0..1", /TASTE_SIMILARITY_SCORE_MIN = 0;/.test(policy) && /TASTE_SIMILARITY_SCORE_MAX = 1;/.test(policy));
  check("rounding is deterministic and fixed-precision", /TASTE_SIMILARITY_SCORE_PRECISION = \d+;/.test(policy)
    && /Math\.round\(value \* factor\) \/ factor/.test(policy));
  check("an out-of-range or non-finite score throws rather than being clamped silently",
    /Number\.isFinite\(value\)/.test(policy) && (policy.match(/throw new RangeError/g) ?? []).length === 2
    && !/Math\.min\(|Math\.max\(/.test(policy));
  check("every scored path routes through the single rounding authority",
    (comparator.match(/roundTasteSimilarityScore\(/g) ?? []).length === 1 && /const score = roundTasteSimilarityScore\(/.test(comparator));
  check("no 0..100 or percentage scale exists", !/\*\s*100|percent|Percentage/i.test(implementation));

  // ---- included dimensions ----------------------------------------------------------------------
  check("cuisine preference is a comparable dimension", /"cuisine_preference"/.test(types) && /preference\.facet === "cuisine"/.test(comparator));
  check("flavor avoidance is structurally separate from positive overlaps",
    /sharedAvoidances: readonly TasteSimilarityDimension\[\]/.test(types)
    && /sharedAvoidances\.push\("flavor_avoidance"\)/.test(comparator)
    && !/overlaps\.push\("flavor_avoidance"\)/.test(comparator));
  check("spice is compared by exact equality only, with no ordinal scale",
    /leftFacts\.spice !== rightFacts\.spice/.test(comparator)
    && !/spiceLevel|spiceRank|spiceScale|SPICE_ORDER|indexOf\(.*spice/i.test(implementation));
  check("a differing spice value is unknown rather than a conflict or a zero",
    /leftFacts\.spice !== rightFacts\.spice\s*\)\s*\{\s*\n\s*unknowns\.push\("spice_preference"\)/.test(comparator));
  check("favorites are matched by canonical ids only, never by display name",
    /target\.restaurantId/.test(comparator) && /target\.menuItemId/.test(comparator)
    && !/displayName|restaurantName|menuItemName|\.name\b/.test(implementation));
  check("favorite menu items are keyed by the canonical restaurant and item pair",
    /favoriteMenuItemIds\.push\(`\$\{target\.restaurantId\}::\$\{target\.menuItemId\}`\)/.test(comparator));

  // ---- excluded evidence, structurally ----------------------------------------------------------
  check("the comparator reads only the food_taste preference scope", /preference\.scope !== "food_taste"/.test(comparator)
    && !/scope === "meal_pattern"|scope === "dining_context"|scope === "social_logistics"/.test(comparator));
  check("meal_pattern preferences are excluded", !/meal_pattern/.test(executable));
  check("dining_context preferences are excluded", !/dining_context/.test(executable));
  check("social_logistics preferences are excluded", !/social_logistics/.test(executable));
  check("nutrition goals are excluded", !/snapshot\.goals|GoalEvidence|daily_calories_target|nutrition_goal/.test(executable));
  check("dietary restrictions are excluded", !/snapshot\.restrictions|RestrictionEvidence|restrictionType|enforcement/.test(executable));
  // TS-3B-R1 successor amendment. TS-3A/B excluded meal history outright, which was correct for a
  // round that shipped only explicit and user-action evidence. R1 admits REPEATED observed
  // consumption as a deliberately weaker fallback. What must not come back is everything TS-3A/B was
  // actually protecting against: a single meal creating affinity, and the per-record meal attributes
  // — timestamp, consumed ratio, meal type — reaching the score. Those stay banned here, and the
  // repetition boundary itself must be a named policy constant rather than a literal in the scorer.
  check("meal evidence contributes only through the named repetition boundary", (() => {
    const excluded = !/meal_occurrence|MealOccurrence|occurredAt|consumedRatio|mealType/.test(executable);
    if (excluded) return true;
    return /MIN_REPEATED_MEAL_OCCURRENCES/.test(policy)
      && /evidenceIds\.size >= MIN_REPEATED_MEAL_OCCURRENCES/.test(comparator)
      && !/occurredAt|consumedRatio|mealType/.test(executable);
  })());
  check("ratings are excluded", !/ratingValue|RatingEvidence|behaviorKind === "rating"|dislikeReasons/.test(executable));
  // TS-3B-R1 successor amendment. The favorite branch is still the only path that reads a favorite,
  // and the only other behaviour kind the scorer may read is a durable observed meal occurrence.
  // Every other behaviour kind must still be skipped explicitly.
  check("only favorite and observed meal-occurrence behavior is read", (() => {
    const original = /behavior\.behaviorKind !== "favorite"/.test(comparator);
    if (original) return true;
    return /behavior\.behaviorKind === "favorite"/.test(comparator)
      && /behavior\.behaviorKind !== "meal_occurrence"\) continue;/.test(comparator)
      && /behavior\.interpretation !== "observed"\) continue;/.test(comparator)
      && /behavior\.evidence\.confidenceBasis !== "observed_consumption"\) continue;/.test(comparator);
  })());
  // Scoped to executable source: the policy file legitimately names the excluded concept in prose to
  // record WHY it is excluded, and a comment explaining an exclusion must not read as a use of it.
  check("sourceConfidence never influences the score", !/sourceConfidence/.test(executable));
  check("GPS, distance and proximity are excluded", !/gps|geolocation|latitude|longitude|distanceKm|proximity|nearby/i.test(implementation));
  check("premium status is excluded", !/isPremium|premium/i.test(implementation));
  check("verified status is excluded", !/isVerified|verifiedBadge|\bverified\b/i.test(implementation));
  check("activity and engagement volume are excluded", !/activityScore|engagement|popularity|trending/i.test(implementation));
  check("social compatibility and availability are excluded", !/socialCompatibility|nearby_status|availability_window|payment_preference/i.test(implementation));

  // ---- purity and isolation ---------------------------------------------------------------------
  check("legacy mixed scorer is not imported", !/mealBuddyRanking|meal-buddy-card|socialMatchingPolicy|rankScore/.test(implementation));
  check("no additive bonus-point weighting is present", !/\+=\s*\d{2,}|score \+= |bonus|POINTS_/i.test(implementation));
  check("no magic per-source or per-dimension weight table exists",
    !/WEIGHTS?\s*[:=]|weight\s*[:=]\s*\d|\* 0\.\d/.test(executable));
  check("score composition is the unweighted mean over comparable dimensions",
    /outcomes\.reduce\(\(sum, outcome\) => sum \+ outcome\.agreement, 0\)/.test(comparator)
    && /total \/ outcomes\.length/.test(comparator));
  check("set agreement is a parameter-free Jaccard index", /intersectionSize \/ unionSize/.test(comparator));
  check("unknown dimensions leave both the numerator and the denominator", /if \(left === null \|\| right === null\) return null;/.test(comparator)
    && /comparableDimensions = outcomes\.map\(/.test(comparator));
  check("conflicts are never fabricated in v1", /conflicts: EMPTY_DIMENSIONS/.test(comparator)
    && !/conflicts\.push\(/.test(comparator));
  check("symmetry is structural via canonical pair ordering", /orderSnapshotPair\(snapshotA, snapshotB\)/.test(comparator)
    && /compareCodeUnits\(first\.subjectUserId, second\.subjectUserId\)/.test(comparator));
  check("ordering is locale-independent", /compareCodeUnits/.test(comparator) && !/localeCompare|Intl\./.test(implementation));
  check("the comparator is pure: no clock, randomness or ambient state", !/Date\.now|new Date\(|Math\.random|process\.env|globalThis/.test(implementation));
  check("no database, network or Supabase dependency", !/supabase|createClient|fetch\(|axios|XMLHttpRequest|https?:\/\//i.test(executable));
  check("no Mobile, React, Expo or UI dependency", !moduleSpecifiers.some((entry) => /react|expo|components|i18n|fixture|mock\//i.test(entry)));
  check("no Social, Restaurant runtime or GPS import", !moduleSpecifiers.some((entry) => /social|restaurantRuntime|features\/restaurants|gps|geolocation/i.test(entry)));
  check("similarity imports only frozen TS-1/TS-2 domain types and its own siblings",
    moduleSpecifiers.length > 0
    && moduleSpecifiers.every((entry) => ["../preference", "../behavior", "../snapshot", "./policy", "./reasonCodes", "./types", "./comparator"].includes(entry)),
    { moduleSpecifiers });

  // ---- reason codes -----------------------------------------------------------------------------
  check("reason codes are a closed declared enum", /TASTE_SIMILARITY_REASON_CODES = \[/.test(reasonCodes)
    && /\] as const;/.test(reasonCodes));
  check("reason code order is the fixed declaration rank", /REASON_CODE_RANK/.test(reasonCodes)
    && /\.sort\(/.test(reasonCodes) && !/localeCompare/.test(reasonCodes));
  check("reason codes carry no raw evidence value", !/rawValue|preference\.value|displayName/.test(reasonCodes));

  // ---- barrel exposure --------------------------------------------------------------------------
  check("similarity barrel exports the four TS-3 modules",
    ["./policy", "./reasonCodes", "./types", "./comparator"].every((entry) => similarityIndex.includes(`export * from "${entry}";`)));
  check("taste-similarity barrel additively exposes similarity after snapshot",
    domainIndex.includes('export * from "./snapshot";') && domainIndex.includes('export * from "./similarity";'));
  check("shared domain barrel still exposes the isolated namespace",
    read("packages/shared/src/domain/index.ts").includes('export * as TasteSimilarityDomain from "./taste-similarity";'));

  // ---- compiler proof ---------------------------------------------------------------------------
  const probeDiagnostics = compileContractProbe();
  check("contract type probe compiles with every negative expectation consumed", probeDiagnostics.length === 0, { diagnostics: probeDiagnostics });

  // ---- guard self-integrity ---------------------------------------------------------------------
  const guardSource = read("scripts/taste-similarity-ts3-guard.mjs");
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  const headBypass = ["rev-parse", " --verify HEAD"].join("");
  check("guard has no unconditional success exit", !guardSource.includes(unconditionalSuccessExit));
  check("guard has no HEAD bypass", !guardSource.includes(headBypass));
  check("guard has no unconditional PASS assertion", !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource));
  check("guard exit status is derived from the failure list", /failures\.length === 0/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-3A + TS-3B Versioned Taste Similarity Comparator Guard",
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

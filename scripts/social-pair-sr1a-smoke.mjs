#!/usr/bin/env node
// SR-1A contract smoke — internal server pair comparison primitive and frozen-domain runtime reuse.
//
// Loads the GENERATED runtime artifact exactly as a server runtime would (a plain ESM import with no
// specifier resolution), and loads the canonical frozen source separately, so every claim about the
// artifact is checked against the authority it derives from rather than against a literal.
//
// Fully local: no network, no database, no Supabase, no credential, no deployment.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const ARTIFACT = "supabase/functions/_shared/taste-foundation-runtime/tasteFoundation.generated.mjs";
const SERVER_ROOT = "supabase/functions/_shared/social-pair";

// ---- load the generated artifact the way a server runtime would ---------------------------------
const artifactText = fs.readFileSync(path.join(root, ARTIFACT), "utf8");
const runtime = await import(pathToFileURL(path.join(root, ARTIFACT)).href);

// ---- load the canonical frozen source independently ---------------------------------------------
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
function loadCanonical(entry) {
  const cache = new Map();
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require_(specifier);
      const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
      if (!resolved) throw new Error(`unresolved ${specifier}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, entry));
}
const canonical = loadCanonical("packages/shared/src/domain/taste-similarity/index.ts");
const canonicalMappers = loadCanonical("apps/mobile/features/consumer-taste-profile/foundationMappers.ts");

// ---- load the SR-1A server modules ---------------------------------------------------------------
function loadServerModule(relative) {
  const cache = new Map();
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    if (absolute.endsWith(".mjs")) return runtime;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require_(specifier);
      const target = path.resolve(path.dirname(absolute), specifier);
      return load(fs.existsSync(target) ? target : resolveTsFile(target.replace(/\.ts$/, "")) ?? target);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, relative));
}
const repositoryModule = loadServerModule(`${SERVER_ROOT}/serverTasteFoundationRepository.ts`);
const pairModule = loadServerModule(`${SERVER_ROOT}/serverPairComparison.ts`);
const { ServerTasteFoundationRepository, SERVER_PRIVATE_SOURCES, SERVER_NUTRITION_GOAL_COLUMNS } = repositoryModule;
const { composeServerSnapshotForUser, compareComposedServerPair } = pairModule;

// ============ 1-8. runtime reuse ==================================================================
{
  const executable = artifactText.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  expect((executable.match(/^\s*import[\s{*'"]/gm) ?? []).length === 0, "1 the generated artifact contains ZERO import statements — no specifier resolution surface remains");
  expect(!/\b(process|Buffer|__dirname|__filename)\b/.test(executable), "2 the artifact references no Node-only global");
  expect(!/from\s+["']/.test(executable), "2a the artifact has no module specifier of any kind");
  expect(typeof runtime.compareTasteProfiles === "function" && typeof runtime.calculateEvidenceConfidence === "function"
    && typeof runtime.assessColdStart === "function" && typeof runtime.adaptSharedTasteComparison === "function",
    "3 all four frozen pipeline stages load from the artifact");
  expect(typeof runtime.mapTasteProfileRow === "function" && typeof runtime.mapNutritionGoalRows === "function"
    && typeof runtime.mapDietaryRestrictionRows === "function", "4 the frozen TS-2 row mappers load from the artifact");
  expect(runtime.TASTE_SIMILARITY_POLICY_VERSION === canonical.TASTE_SIMILARITY_POLICY_VERSION
    && runtime.SHARED_TASTE_ADAPTER_POLICY_VERSION === canonical.SHARED_TASTE_ADAPTER_POLICY_VERSION
    && runtime.COLD_START_POLICY_VERSION === canonical.COLD_START_POLICY_VERSION
    && runtime.EVIDENCE_CONFIDENCE_POLICY_VERSION === canonical.EVIDENCE_CONFIDENCE_POLICY_VERSION,
    "5 every policy version in the artifact equals the canonical frozen value");

  const regenerate = spawnSync(process.execPath, ["scripts/build-taste-foundation-runtime.mjs", "--check"],
    { cwd: root, encoding: "utf8", windowsHide: true });
  expect(regenerate.status === 0, "6 regenerating from canonical source reproduces the artifact byte-for-byte", regenerate.stdout.trim());

  const provenance = JSON.parse(fs.readFileSync(path.join(root, "supabase/functions/_shared/taste-foundation-runtime/provenance.generated.json"), "utf8"));
  expect(provenance.sources.length > 0 && provenance.sources.every((entry) => fs.existsSync(path.join(root, entry.path))),
    "7 every recorded provenance source exists", provenance.sources.length);
  expect(provenance.sources.some((entry) => entry.path.startsWith("packages/shared/src/domain/taste-similarity/")),
    "7a the frozen taste domain is recorded in provenance");
  expect(typeof provenance.artifactSha256 === "string" && provenance.artifactSha256.length === 64, "8 the artifact digest is recorded");
}

// ============ 9-14. server repository =============================================================
const recordedQueries = [];
function fixtureRowSource(rowsBySourceAndUser) {
  return {
    async select(query) {
      recordedQueries.push(query);
      const rows = rowsBySourceAndUser[query.ownerUserId]?.[query.source] ?? [];
      return rows.length === 0 ? { status: "empty", rows: [] } : { status: "available", rows };
    }
  };
}

const WINDOW = { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, favoritesLimit: 25 };
const AS_OF = { generatedAt: "2026-08-08T12:00:00.000Z", window: WINDOW };

const profileRow = (userId, overrides = {}) => ({
  id: `tp-${userId}`, user_id: userId,
  preferred_cuisine_tags: ["japanese"], preferred_meal_types: ["lunch"], disliked_tastes: ["coriander"],
  spice_preference: "medium", dining_style: "casual", payment_preference: "split_bill",
  created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", ...overrides
});
const goalRow = (userId, label) => ({
  id: `goal-${userId}`, user_id: userId, goal_label: label,
  starts_on: "2026-07-01", ends_on: null, is_active: true,
  created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z"
});
const restrictionRow = (userId, label, severity = "preference") => ({
  id: `restr-${userId}-${label}`, user_id: userId, restriction_type: "avoidance", label, severity,
  visibility: "private", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z"
});
const favoriteRestaurantRow = (userId, restaurantId) => ({
  id: `fr-${userId}-${restaurantId}`, user_id: userId, restaurant_id: restaurantId,
  created_at: "2026-08-01T00:00:00.000Z", removed_at: null
});
const mealRecordRow = (userId, index, mealType, occurredAt) => ({
  id: `mr-${userId}-${index}`, user_id: userId, meal_type: mealType, occurred_at: occurredAt, deleted_at: null
});
const mealItemRow = (userId, index, restaurantId, menuItemId, occurredAt) => ({
  id: `mri-${userId}-${index}`, user_id: userId, meal_record_id: `mr-${userId}-${index}`,
  restaurant_id: restaurantId, branch_id: null, menu_item_id: menuItemId,
  occurred_at: occurredAt, consumed_ratio: 1
});

// The two users are deliberately DIFFERENT on every dimension the frozen stages read. A fixture where
// both sides are identical hides whole classes of defect: self-comparison, side-swapping and
// side-specific parameter drift all look correct when A and B are the same person.
const fixture = {
  "user-a": {
    taste_profiles: [profileRow("user-a")],
    nutrition_goals: [goalRow("user-a", "fat_loss")],
    dietary_restrictions: [restrictionRow("user-a", "coriander")],
    favorite_restaurants: [favoriteRestaurantRow("user-a", "rest-1")],
    meal_records: [
      mealRecordRow("user-a", 1, "lunch", "2026-07-10T04:00:00.000Z"),
      mealRecordRow("user-a", 2, "lunch", "2026-07-20T04:00:00.000Z")
    ],
    meal_record_items: [
      mealItemRow("user-a", 1, "rest-1", "menu-1", "2026-07-10T04:00:00.000Z"),
      mealItemRow("user-a", 2, "rest-1", "menu-1", "2026-07-20T04:00:00.000Z")
    ]
  },
  "user-b": {
    taste_profiles: [profileRow("user-b", {
      preferred_cuisine_tags: ["italian", "japanese"], preferred_meal_types: ["dinner"],
      disliked_tastes: ["olive"], spice_preference: "mild", dining_style: "fine_dining",
      payment_preference: "treat_alternately"
    })],
    nutrition_goals: [goalRow("user-b", "muscle_gain")],
    dietary_restrictions: [restrictionRow("user-b", "shellfish", "medical")],
    favorite_restaurants: [favoriteRestaurantRow("user-b", "rest-2")],
    meal_records: [mealRecordRow("user-b", 1, "dinner", "2026-07-15T11:00:00.000Z")],
    meal_record_items: [mealItemRow("user-b", 1, "rest-2", "menu-9", "2026-07-15T11:00:00.000Z")]
  }
};

{
  recordedQueries.length = 0;
  const repository = new ServerTasteFoundationRepository(fixtureRowSource(fixture));
  await repository.readForUser("user-a", WINDOW);
  expect(recordedQueries.length === 7, "9 the reader issues exactly seven private source queries", recordedQueries.length);
  expect(recordedQueries.every((query) => query.ownerColumn === "user_id" && query.ownerUserId === "user-a"),
    "10 EVERY query carries an explicit user_id owner predicate bound to the target user");
  expect(recordedQueries.every((query) => Array.isArray(query.columns) && query.columns.length > 0 && !query.columns.includes("*")),
    "11 no query uses a wildcard column list");
  expect(recordedQueries.every((query) => SERVER_PRIVATE_SOURCES.includes(query.source)),
    "12 every queried source is in the fixed allow-list", [...new Set(recordedQueries.map((q) => q.source))]);
  expect(!recordedQueries.some((query) => /rating/i.test(query.source)), "13 ratings are never queried");
  const macros = ["daily_calories_target", "protein_target_g", "carbohydrates_target_g", "fat_target_g", "fiber_target_g"];
  expect(!recordedQueries.some((query) => query.columns.some((column) => macros.includes(column))),
    "14 no nutrition macro target column is ever selected");
  expect(!SERVER_NUTRITION_GOAL_COLUMNS.some((column) => macros.includes(column)), "14a the goal column constant excludes macros", SERVER_NUTRITION_GOAL_COLUMNS);

  let rejected = false;
  try { await repository.readForUser("", WINDOW); } catch { rejected = true; }
  expect(rejected, "14b an empty target user id is rejected rather than silently unscoped");
}

// ============ 15-22. composition and the pair primitive ===========================================
{
  const repository = new ServerTasteFoundationRepository(fixtureRowSource(fixture));
  const actor = await composeServerSnapshotForUser(repository, "user-a", AS_OF);
  const candidate = await composeServerSnapshotForUser(repository, "user-b", AS_OF);

  expect(actor.snapshot.generatedAt === candidate.snapshot.generatedAt && actor.snapshot.generatedAt === AS_OF.generatedAt,
    "15 both sides share ONE injected as-of instant", actor.snapshot.generatedAt);
  expect(JSON.stringify(actor.snapshot.evidenceWindow.meals.requestedStartDate) === JSON.stringify(candidate.snapshot.evidenceWindow.meals.requestedStartDate)
    && actor.snapshot.evidenceWindow.meals.requestedEndDate === candidate.snapshot.evidenceWindow.meals.requestedEndDate
    && actor.snapshot.evidenceWindow.meals.requestedLimit === candidate.snapshot.evidenceWindow.meals.requestedLimit
    && actor.snapshot.evidenceWindow.favorites.requestedLimit === candidate.snapshot.evidenceWindow.favorites.requestedLimit,
    "16 both sides share identical evidence-window parameters");
  expect(actor.snapshot.sourceStates.ratings.status === "disabled" && actor.snapshot.sourceStates.ratings.reason === "source_disabled",
    "17 the ratings source uses the canonical disabled state", actor.snapshot.sourceStates.ratings);
  expect(actor.snapshot.schemaVersion === canonical.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION,
    "17a the composed snapshot carries the frozen schema version");

  const result = compareComposedServerPair(actor, candidate);
  expect(result.status === "adapted", "18 the primitive produces an adapted internal result", result.status);
  expect(result.taste.similarity.status === "scored", "18a the frozen taste stage ran", result.taste.similarity);
  expect(result.versions.sharedAdapterPolicyVersion === "shared-taste-adapter-v1"
    && result.versions.tastePolicyVersion === "taste-similarity-v1.1"
    && result.versions.coldStartPolicyVersion === "cold-start-policy-v1"
    && result.versions.evidenceConfidencePolicyVersion === "evidence-confidence-v1",
    "19 all frozen policy versions are stamped by the frozen pipeline", result.versions);

  // Differential proof: the artifact-driven pipeline equals the canonical-source pipeline exactly.
  const canonicalComparison = canonical.compareTasteProfiles(actor.snapshot, candidate.snapshot);
  const canonicalConfidence = canonical.calculateEvidenceConfidence(canonicalComparison);
  const canonicalColdStart = canonical.assessColdStart(canonicalComparison, canonicalConfidence);
  const canonicalResult = canonical.adaptSharedTasteComparison(canonicalComparison, canonicalConfidence, canonicalColdStart);
  expect(JSON.stringify(result) === JSON.stringify(canonicalResult),
    "20 the generated runtime produces a BYTE-IDENTICAL result to the canonical frozen source");
  expect(JSON.stringify(runtime.mapTasteProfileRow(profileRow("user-a"), "user-a"))
    === JSON.stringify(canonicalMappers.mapTasteProfileRow(profileRow("user-a"), "user-a")),
    "20a the artifact's row mappers are byte-identical to the canonical frozen mappers");
  let ownerRejected = false;
  try { runtime.mapTasteProfileRow(profileRow("user-a"), "user-b"); } catch { ownerRejected = true; }
  expect(ownerRejected, "20b the frozen owner assertion still fires inside the artifact — a row whose owner differs from the requested subject is rejected");

  const repeat = compareComposedServerPair(
    await composeServerSnapshotForUser(new ServerTasteFoundationRepository(fixtureRowSource(fixture)), "user-a", AS_OF),
    await composeServerSnapshotForUser(new ServerTasteFoundationRepository(fixtureRowSource(fixture)), "user-b", AS_OF)
  );
  expect(JSON.stringify(repeat) === JSON.stringify(result), "21 repeated composition and comparison is deterministic");

  const failingSource = {
    async select(query) {
      if (query.source === "taste_profiles") return { status: "failed", failureCode: "source_read_failed" };
      const rows = fixture[query.ownerUserId]?.[query.source] ?? [];
      return rows.length === 0 ? { status: "empty", rows: [] } : { status: "available", rows };
    }
  };
  const degraded = await composeServerSnapshotForUser(new ServerTasteFoundationRepository(failingSource), "user-a", AS_OF);
  expect(degraded.snapshot.sourceStates.taste_profile.status === "failed",
    "22 a failed read stays FAILED and is never flattened into empty", degraded.snapshot.sourceStates.taste_profile);
}

// ============ 23-31. privacy and ingress boundary =================================================
{
  const serverFiles = fs.readdirSync(path.join(root, SERVER_ROOT)).map((file) => `${SERVER_ROOT}/${file}`);
  const serverSource = serverFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  // Documentation legitimately NAMES the columns it excludes — that is the point of the exclusion
  // note. The prohibition is on referencing them in executable code, so this view drops comments.
  const serverExecutable = serverSource.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

  expect(!/new Response\(|Request\b|addEventListener|Deno\.serve|serve\(/.test(serverSource),
    "23 no HTTP request or response type exists for pair comparison");
  expect(!/JSON\.stringify/.test(serverSource), "24 no serialization path exists in the primitive");
  const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  expect(!/\[functions\.social-pair-comparison\]/i.test(config),
    "25 the SR-1A pair primitive is not registered as a deployable Edge Function");
  expect(!fs.existsSync(path.join(root, "supabase/functions/social-pair-comparison")),
    "25a no deployable Social function directory exists");
  expect(!/SERVICE_ROLE|sb_secret|ADMIN_KEY|createClient|Deno\.env|process\.env/.test(serverSource),
    "26 no privileged credential, client construction or environment read exists");
  expect(!/console\.(log|info|warn|error)/.test(serverSource), "27 no logging path exists in the primitive");
  expect(!/nutrition_snapshot|display_name_snapshot|user_entered_name|ai_detected_name|normalized_name|portion_snapshot|confidence_score/.test(serverExecutable),
    "28 no private nutrition, name or recognition column is referenced by executable code");
  const macroTokens = /daily_calories_target|protein_target_g|carbohydrates_target_g|fat_target_g|fiber_target_g/g;
  const macroMentions = serverExecutable.match(macroTokens) ?? [];
  const macroNulls = serverExecutable.match(/(daily_calories_target|protein_target_g|carbohydrates_target_g|fat_target_g|fiber_target_g):\s*null/g) ?? [];
  expect(macroMentions.length === 5 && macroNulls.length === 5,
    "28a every macro target token in executable code is an explicit `: null` declaration, never a selected column",
    { macroMentions: macroMentions.length, macroNulls: macroNulls.length });

  const mobileReferences = spawnSync("git", ["grep", "-l", "social-pair", "--", "apps/"], { cwd: root, encoding: "utf8", windowsHide: true });
  expect(mobileReferences.stdout.trim() === "", "29 no Mobile file references the server primitive", mobileReferences.stdout.trim());

  const repository = new ServerTasteFoundationRepository(fixtureRowSource(fixture));
  const actor = await composeServerSnapshotForUser(repository, "user-a", AS_OF);
  const candidate = await composeServerSnapshotForUser(repository, "user-b", AS_OF);
  const result = compareComposedServerPair(actor, candidate);
  const serialized = JSON.stringify(result);
  expect(!/user-a|user-b/.test(serialized), "30 the internal result carries no subject user id");
  expect(!/japanese|coriander|medium|casual|split_bill|fat_loss|rest-1/.test(serialized),
    "30a the internal result carries no raw evidence value");
  expect(!("snapshot" in result) && !("comparison" in result) && !("confidence" in result) && !("coldStart" in result),
    "31 the primitive returns no raw snapshot and embeds no upstream bundle", Object.keys(result));
}

// ============ 32-35. minimization is behaviourally inert, and the pair is genuinely asymmetric ====
{
  const repository = new ServerTasteFoundationRepository(fixtureRowSource(fixture));
  const actor = await composeServerSnapshotForUser(repository, "user-a", AS_OF);
  const candidate = await composeServerSnapshotForUser(repository, "user-b", AS_OF);
  const minimized = compareComposedServerPair(actor, candidate);

  expect(JSON.stringify(actor.snapshot) !== JSON.stringify(candidate.snapshot),
    "32 the two fixture users are materially different, so self-comparison cannot masquerade as success");
  expect(minimized.taste.similarity.status === "scored" && minimized.taste.similarity.score < 1,
    "32a the taste stage scores the pair below a degenerate 1.0", minimized.taste.similarity);

  // Would reading the five macro targets have changed anything? Rebuild each side with macro-bearing
  // goal rows through the CANONICAL frozen mapper and run the same pipeline. If the adapted results
  // match, the data-minimization decision provably costs no output fidelity.
  const withMacros = (composed, userId) => {
    const goalRows = (fixture[userId].nutrition_goals ?? []).map((row) => ({
      ...row, daily_calories_target: 2100, protein_target_g: 140,
      carbohydrates_target_g: 210, fat_target_g: 60, fiber_target_g: 30
    }));
    const goals = canonicalMappers.mapNutritionGoalRows(goalRows, userId, AS_OF.generatedAt.slice(0, 10));
    return canonical.composeTasteProfileSnapshot({
      subjectUserId: composed.snapshot.subjectUserId,
      preferences: composed.snapshot.preferences,
      goals,
      restrictions: composed.snapshot.restrictions,
      behavior: composed.snapshot.behavior,
      sourceStates: {
        ...composed.snapshot.sourceStates,
        nutrition_goals: goals.length === 0
          ? { status: "empty", evidenceCount: 0 }
          : { status: "available", evidenceCount: goals.length }
      },
      generatedAt: composed.snapshot.generatedAt,
      evidenceWindow: composed.snapshot.evidenceWindow
    });
  };
  const macroActor = withMacros(actor, "user-a");
  const macroCandidate = withMacros(candidate, "user-b");
  expect(macroActor.confidenceMetadata.evidenceCounts.goals > actor.snapshot.confidenceMetadata.evidenceCounts.goals,
    "33 the macro-bearing control snapshot really does carry more goal evidence",
    { withMacros: macroActor.confidenceMetadata.evidenceCounts.goals, minimized: actor.snapshot.confidenceMetadata.evidenceCounts.goals });

  const macroComparison = canonical.compareTasteProfiles(macroActor, macroCandidate);
  const macroConfidence = canonical.calculateEvidenceConfidence(macroComparison);
  const macroResult = canonical.adaptSharedTasteComparison(
    macroComparison, macroConfidence, canonical.assessColdStart(macroComparison, macroConfidence)
  );
  expect(JSON.stringify(macroResult) === JSON.stringify(minimized),
    "34 excluding the five macro targets changes NOTHING in the adapted result — minimization is provably inert");

  // The frozen goal stage reads only the coarse label, so a label change must move the goal outcome
  // while macro values must not. This distinguishes "macros are ignored" from "goals are ignored".
  const sameGoalFixture = { ...fixture, "user-b": { ...fixture["user-b"], nutrition_goals: [goalRow("user-b", "fat_loss")] } };
  const sameGoalCandidate = await composeServerSnapshotForUser(
    new ServerTasteFoundationRepository(fixtureRowSource(sameGoalFixture)), "user-b", AS_OF
  );
  const sameGoalResult = compareComposedServerPair(actor, sameGoalCandidate);
  expect(JSON.stringify(sameGoalResult.goal) !== JSON.stringify(minimized.goal),
    "35 the coarse goal label still drives the goal outcome — goals are minimized, not disabled",
    { differingLabels: minimized.goal, sameLabel: sameGoalResult.goal });
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "social-pair-sr1a",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

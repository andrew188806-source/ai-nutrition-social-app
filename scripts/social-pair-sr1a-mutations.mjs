#!/usr/bin/env node
// SR-1A mutation proof — INTERNAL SERVER PAIR COMPARISON PRIMITIVE.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the SR-1A guard, the
// SR-1A smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
//
// Kills must be real: a mutation that only crashes the harness (unloadable module, syntax error) is
// reported as `harness_crash` and does NOT count as a kill.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const serverRoot = path.join(root, "supabase/functions/_shared/social-pair");
const REPOSITORY = path.join(serverRoot, "serverTasteFoundationRepository.ts");
const PAIR = path.join(serverRoot, "serverPairComparison.ts");
const ARTIFACT = path.join(root, "supabase/functions/_shared/taste-foundation-runtime/tasteFoundation.generated.mjs");

// ---- module loading ------------------------------------------------------------------------------
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};

// The generated artifact is re-read from disk on every load so a mutation to it is actually observed.
async function loadServer() {
  const runtime = await import(`${new URL(`file:///${ARTIFACT.replaceAll("\\", "/")}`).href}?v=${Date.now()}${Math.random()}`);
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
  return { ...load(REPOSITORY), ...load(PAIR) };
}

// ---- fixtures ------------------------------------------------------------------------------------
const WINDOW = { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, favoritesLimit: 25 };
const AS_OF = { generatedAt: "2026-08-08T12:00:00.000Z", window: WINDOW };

const profileRow = (userId, overrides = {}) => ({
  id: `tp-${userId}`, user_id: userId,
  preferred_cuisine_tags: ["japanese"], preferred_meal_types: ["lunch"], disliked_tastes: ["coriander"],
  spice_preference: "medium", dining_style: "casual", payment_preference: "split_bill",
  created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", ...overrides
});
const goalRow = (userId, label) => ({
  id: `goal-${userId}`, user_id: userId, goal_label: label, starts_on: "2026-07-01", ends_on: null,
  is_active: true, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z"
});
const restrictionRow = (userId, label, severity) => ({
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

// The two users differ on every dimension the frozen stages read, so side-swapping and
// side-specific parameter drift cannot hide behind an identical fixture.
const fixture = {
  "user-a": {
    taste_profiles: [profileRow("user-a")],
    nutrition_goals: [goalRow("user-a", "fat_loss")],
    dietary_restrictions: [restrictionRow("user-a", "coriander", "preference")],
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

function makeRowSource(recorded) {
  return {
    async select(query) {
      recorded.push(query);
      const rows = fixture[query.ownerUserId]?.[query.source] ?? [];
      return rows.length === 0 ? { status: "empty", rows: [] } : { status: "available", rows };
    }
  };
}

// ---- harness -------------------------------------------------------------------------------------
function runSuite(script) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
}

// Every replacement is accumulated into a separate map so that multiple edits to the SAME file all
// survive: re-reading the pristine file each iteration would silently keep only the last one.
async function withMutatedDisk(targets, run) {
  const originals = new Map(targets.map(({ file: target }) => [target, fs.readFileSync(target, "utf8")]));
  try {
    const mutated = new Map(originals);
    for (const { file: target, from, to } of targets) {
      const source = mutated.get(target);
      if (!source.includes(from)) return { applied: false, reason: `anchor not found in ${path.basename(target)}: ${from.slice(0, 80)}` };
      mutated.set(target, source.replaceAll(from, to));
    }
    for (const [target, source] of mutated) fs.writeFileSync(target, source, "utf8");
    return { applied: true, value: await run() };
  } finally {
    for (const [target, original] of originals) fs.writeFileSync(target, original, "utf8");
  }
}

const results = [];

async function mutation(id, name, targets, detector) {
  const outcome = await withMutatedDisk(targets, async () => {
    let guardFailed = false;
    let smokeFailed = false;
    let probeFailed = false;
    let crashed = false;
    try {
      guardFailed = !runSuite("scripts/social-pair-sr1a-guard.mjs");
      smokeFailed = !runSuite("scripts/social-pair-sr1a-smoke.mjs");
      if (detector) probeFailed = await detector(await loadServer());
    } catch (error) {
      crashed = true;
      probeFailed = false;
      void error;
    }
    return { guardFailed, smokeFailed, probeFailed, crashed };
  });

  if (!outcome.applied) {
    results.push({ id, name, killed: false, status: "anchor_missing", detail: outcome.reason });
    return;
  }
  const { guardFailed, smokeFailed, probeFailed, crashed } = outcome.value;
  const killed = guardFailed || smokeFailed || probeFailed;
  results.push({
    id, name, killed,
    status: killed ? "killed" : crashed ? "harness_crash" : "survived",
    killedBy: [guardFailed && "guard", smokeFailed && "smoke", probeFailed && "probe"].filter(Boolean)
  });
}

const composePair = async (server) => {
  const recorded = [];
  const repository = new server.ServerTasteFoundationRepository(makeRowSource(recorded));
  const actor = await server.composeServerSnapshotForUser(repository, "user-a", AS_OF);
  const candidate = await server.composeServerSnapshotForUser(repository, "user-b", AS_OF);
  return { recorded, actor, candidate, result: server.compareComposedServerPair(actor, candidate) };
};

// ================================================================================================
// 1-4. owner scoping and data minimization
await mutation(1, "one private read bypasses the owner-scoping builder and loses its target predicate",
  [{
    file: REPOSITORY,
    from: 'tasteProfiles: await this.rowSource.select(owned("taste_profiles", SERVER_TASTE_PROFILE_COLUMNS)),',
    to: 'tasteProfiles: await this.rowSource.select({ source: "taste_profiles", columns: SERVER_TASTE_PROFILE_COLUMNS, ownerColumn: "user_id", ownerUserId: "" }),'
  }],
  async (server) => {
    const recorded = [];
    await new server.ServerTasteFoundationRepository(makeRowSource(recorded)).readForUser("user-a", WINDOW);
    return recorded.some((query) => query.ownerUserId !== "user-a");
  });

await mutation(2, "an explicit column list is replaced with a wildcard",
  [{
    file: REPOSITORY,
    from: 'export const SERVER_TASTE_PROFILE_COLUMNS = [\n  "id", "user_id", "preferred_cuisine_tags", "preferred_meal_types", "disliked_tastes",\n  "spice_preference", "dining_style", "payment_preference", "created_at", "updated_at"\n] as const;',
    to: 'export const SERVER_TASTE_PROFILE_COLUMNS = ["*"] as const;'
  }],
  async (server) => {
    const recorded = [];
    await new server.ServerTasteFoundationRepository(makeRowSource(recorded)).readForUser("user-a", WINDOW);
    return recorded.some((query) => query.columns.includes("*"));
  });

await mutation(3, "a nutrition macro target column is added to the goal read",
  [{
    file: REPOSITORY,
    from: '"id", "user_id", "goal_label", "starts_on", "ends_on", "is_active", "created_at", "updated_at"',
    to: '"id", "user_id", "goal_label", "starts_on", "ends_on", "is_active", "created_at", "updated_at",\n  "daily_calories_target", "protein_target_g", "carbohydrates_target_g", "fat_target_g", "fiber_target_g"'
  }],
  async (server) => {
    const recorded = [];
    await new server.ServerTasteFoundationRepository(makeRowSource(recorded)).readForUser("user-a", WINDOW);
    return recorded.some((query) => query.columns.includes("daily_calories_target"));
  });

await mutation(4, "a ratings source is read",
  [{
    file: REPOSITORY,
    from: '  "favorite_menu_items"\n] as const;',
    to: '  "favorite_menu_items",\n  "restaurant_ratings"\n] as const;'
  }, {
    file: REPOSITORY,
    from: 'favoriteMenuItems: await this.rowSource.select(owned("favorite_menu_items", SERVER_FAVORITE_MENU_ITEM_COLUMNS, {',
    to: 'ratings: await this.rowSource.select(owned("restaurant_ratings", SERVER_FAVORITE_MENU_ITEM_COLUMNS)),\n      favoriteMenuItems: await this.rowSource.select(owned("favorite_menu_items", SERVER_FAVORITE_MENU_ITEM_COLUMNS, {'
  }],
  async (server) => {
    const recorded = [];
    await new server.ServerTasteFoundationRepository(makeRowSource(recorded)).readForUser("user-a", WINDOW);
    return recorded.some((query) => /rating/i.test(query.source));
  });

// ================================================================================================
// 5-6. pair symmetry
await mutation(5, "the candidate is composed against a different evidence window than the actor",
  [{
    file: PAIR,
    from: "        requestedLimit: asOf.window.requestedLimit,",
    to: "        requestedLimit: Math.min(asOf.window.requestedLimit, rowsOf(reads.mealRecordItems).length + 1),"
  }],
  async (server) => {
    const { actor, candidate } = await composePair(server);
    return JSON.stringify(actor.snapshot.evidenceWindow.meals.requestedLimit)
      !== JSON.stringify(candidate.snapshot.evidenceWindow.meals.requestedLimit);
  });

await mutation(6, "each side stamps its own as-of instant instead of sharing the injected one",
  [{
    file: PAIR,
    from: "  return composeServerSnapshot(targetUserId, reads, asOf);",
    to: "  return composeServerSnapshot(targetUserId, reads, { ...asOf, generatedAt: new Date().toISOString() });"
  }],
  async (server) => {
    const { actor } = await composePair(server);
    return actor.snapshot.generatedAt !== AS_OF.generatedAt;
  });

// ================================================================================================
// 7-8. the result stops being internal
await mutation(7, "the primitive returns the raw snapshots alongside the adapted result",
  [{
    file: PAIR,
    from: "  return adaptSharedTasteComparison(comparison, confidence, coldStart);",
    to: "  return { ...(adaptSharedTasteComparison(comparison, confidence, coldStart) as object), actorSnapshot: actor.snapshot, candidateSnapshot: alreadyAuthorizedCandidate.snapshot };"
  }],
  async (server) => {
    const { result } = await composePair(server);
    return "actorSnapshot" in result || /user-a|japanese|coriander/.test(JSON.stringify(result));
  });

await mutation(8, "a serialized public response is created for the internal result",
  [{
    file: PAIR,
    from: "export function compareComposedServerPair(",
    to: "export function serializePairComparisonResponse(result: unknown): string {\n  return JSON.stringify(result);\n}\n\nexport function compareComposedServerPair("
  }],
  async (server) => typeof server.serializePairComparisonResponse === "function");

// ================================================================================================
// 9-10. duplicated authority and severed provenance
await mutation(9, "similarity logic is duplicated locally instead of delegated to the frozen stage",
  [{
    file: PAIR,
    from: "  const comparison = compareTasteProfiles(actor.snapshot, alreadyAuthorizedCandidate.snapshot);",
    to: "  const localJaccard = (left: readonly string[], right: readonly string[]): number => {\n"
      + "    const leftSet = new Set(left);\n    const rightSet = new Set(right);\n"
      + "    const intersection = [...leftSet].filter((entry) => rightSet.has(entry)).length;\n"
      + "    const union = new Set([...leftSet, ...rightSet]).size;\n"
      + "    return union === 0 ? 0 : intersection / union;\n  };\n  void localJaccard;\n"
      + "  const comparison = compareTasteProfiles(actor.snapshot, alreadyAuthorizedCandidate.snapshot);"
  }],
  null);

await mutation(10, "the generated runtime drifts from the frozen source it claims to derive from",
  [{ file: ARTIFACT, from: 'taste-similarity-v1.1', to: 'taste-similarity-v9.9' }],
  async (server) => {
    const { result } = await composePair(server);
    return result.versions.tastePolicyVersion !== "taste-similarity-v1.1";
  });

// ================================================================================================
// 11-12. frozen semantics the primitive must preserve
await mutation(11, "a failed read is flattened into an empty read",
  [{
    file: PAIR,
    from: '  if (outcome.status === "failed") return { status: "failed" as const, evidenceCount: 0, failureCode: "source_read_failed" as const };',
    to: '  if (outcome.status === "failed") return { status: "empty" as const, evidenceCount: 0 };'
  }],
  async (server) => {
    const failingSource = {
      async select(query) {
        if (query.source === "taste_profiles") return { status: "failed", failureCode: "source_read_failed" };
        const rows = fixture[query.ownerUserId]?.[query.source] ?? [];
        return rows.length === 0 ? { status: "empty", rows: [] } : { status: "available", rows };
      }
    };
    const composed = await server.composeServerSnapshotForUser(
      new server.ServerTasteFoundationRepository(failingSource), "user-a", AS_OF
    );
    return composed.snapshot.sourceStates.taste_profile.status !== "failed";
  });

await mutation(12, "the actor is compared against itself instead of the candidate",
  [{
    file: PAIR,
    from: "  const comparison = compareTasteProfiles(actor.snapshot, alreadyAuthorizedCandidate.snapshot);",
    to: "  const comparison = compareTasteProfiles(actor.snapshot, actor.snapshot);"
  }],
  async (server) => {
    const { result } = await composePair(server);
    return result.taste.similarity.status === "scored" && result.taste.similarity.score === 1;
  });

// ================================================================================================
const survivors = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "social-pair-sr1a-mutations",
  status: survivors.length ? "failed" : "passed",
  totalMutations: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(survivors.length ? 1 : 0);

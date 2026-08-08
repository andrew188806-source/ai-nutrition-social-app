import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-profile-ts2-smoke-"));
const outRoot = path.join(tempRoot, "out");
const entry = path.join(root, "apps/mobile/features/consumer-taste-profile/index.ts");
const checks = [];

function expect(condition, name, details = "contract assertion failed") {
  if (!condition) throw new Error(`${name}: ${details}`);
  checks.push({ name, pass: true });
  console.log(`PASS ${name}`);
}

const okSession = (userId) => ({ ok: true, value: { user: { userId, provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-01-01T00:00:00Z" }, provider: "mock", issuedAt: "2026-08-08T00:00:00Z" } });
const emptyFavorite = () => ({ status: "empty", records: [], nextCursor: null, source: "mock" });
const emptyRating = () => ({ status: "available", records: [], source: "mock" });
const deferredFoundation = () => ({
  source: "injected-test",
  readCurrentUserTasteProfile: async () => ({ status: "deferred", reason: "acl_activation_pending" }),
  readCurrentUserNutritionGoals: async () => ({ status: "deferred", reason: "acl_activation_pending" }),
  readCurrentUserDietaryRestrictions: async () => ({ status: "deferred", reason: "acl_activation_pending" })
});
const request = { mealWindow: { startDate: "2026-08-01", endDate: "2026-08-08", limit: 2 }, favoritePageSize: 2 };
const clock = { now: () => "2026-08-08T12:00:00.000Z" };

function dependencies(overrides = {}) {
  return {
    authPort: { getCurrentSession: async () => okSession("user-a") },
    foundationRepository: deferredFoundation(),
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) },
    favoriteService: { listCurrentUserFavorites: async () => emptyFavorite() },
    ratingService: { listCurrentUserRatings: async () => emptyRating() },
    clock,
    ...overrides
  };
}

const tasteRow = {
  id: "taste-1", user_id: "user-a", preferred_cuisine_tags: [" Taiwanese ", "Cafe\u0301"], preferred_meal_types: ["lunch"],
  disliked_tastes: ["bitter"], spice_preference: "future_spice", dining_style: "casual", payment_preference: "split",
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z"
};
const activeGoal = {
  id: "goal-active", user_id: "user-a", goal_label: "high protein", daily_calories_target: 2100,
  protein_target_g: 130, carbohydrates_target_g: 220, fat_target_g: 70, fiber_target_g: 30,
  starts_on: "2026-08-01", ends_on: "2026-08-31", is_active: true,
  created_at: "2026-07-30T00:00:00Z", updated_at: "2026-08-01T00:00:00Z"
};
const restrictionRow = {
  id: "restriction-1", user_id: "user-a", restriction_type: "dietary", label: "shellfish", severity: "preference", visibility: "private",
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z"
};
const mealRecord = {
  mealRecordId: "meal-1", mealType: "lunch", occurredAt: "2026-08-07T04:00:00Z", mealDate: "2026-08-07", timezone: "Asia/Taipei", source: "manual",
  createdAt: "2026-08-07T04:00:00Z", updatedAt: "2026-08-07T04:00:00Z", items: [{
    mealRecordItemId: "meal-item-1", restaurantId: "rest-1", branchId: "branch-1", menuItemId: "item-1", displayName: "Meal",
    nutrition: {}, nutritionSource: "manual", nutritionSchemaVersion: "v1", occurredAt: "2026-08-07T04:00:00Z", timezone: "Asia/Taipei",
    confidenceScore: 0.74, consumedRatio: 0.5, correctionStatus: "none", createdAt: "2026-08-07T04:00:00Z", updatedAt: "2026-08-07T04:00:00Z"
  }]
};
const favorite = { favoriteId: "favorite-1", target: { kind: "restaurant", restaurantId: "rest-1" }, collectionLabel: null, sortOrder: null, createdAt: "2026-08-06T00:00:00Z", active: true };
const rating = { ratingId: "rating-1", ratingValue: 2.75, visibility: "private", isCurrent: true, tasteFeeling: "savory", portionFeeling: null, priceFeeling: null, repurchaseIntent: null, ratedAt: "2026-08-05T00:00:00Z", updatedAt: "2026-08-05T00:00:00Z", target: { kind: "restaurant", restaurantId: "rest-1" } };

try {
  const program = ts.createProgram([entry], {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true, esModuleInterop: true, skipLibCheck: true,
    outDir: outRoot, rootDir: root
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  expect(diagnostics.length === 0, "TS-2 production modules compile", diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  const requireFromTemp = createRequire(path.join(outRoot, "apps/mobile/features/consumer-taste-profile/index.js"));
  const domain = requireFromTemp("./index.js");

  const preparedCalls = [];
  const prepared = new domain.PreparedSupabaseConsumerTasteFoundationRepository({ from: (table) => { preparedCalls.push(table); throw new Error("must not read"); } });
  expect((await prepared.readCurrentUserTasteProfile()).status === "deferred", "prepared foundation taste read is explicitly deferred");
  expect((await prepared.readCurrentUserNutritionGoals()).status === "deferred", "prepared foundation goal read is explicitly deferred");
  expect((await prepared.readCurrentUserDietaryRestrictions()).status === "deferred", "prepared foundation restriction read is explicitly deferred");
  expect(preparedCalls.length === 0, "prepared adapter performs no live foundation SELECT");
  const flags = domain.getConsumerTasteProfileRuntimeFlags({ TASTE_PROFILE_FOUNDATION_SOURCE: "supabase-live" });
  expect(flags.liveFoundationReadsEnabled === false && flags.foundationActivation === "deferred", "environment cannot activate deferred foundation reads");

  const emptyService = new domain.ConsumerTasteProfileService(dependencies());
  emptyService.setActor("user-a", 1);
  const empty = await emptyService.readCurrentUserSnapshot(request);
  expect(empty.status === "available", "authenticated empty/deferred sources still return a valid snapshot");
  expect(empty.status === "available" && empty.snapshot.subjectUserId === "user-a", "snapshot preserves authenticated subject identity");
  expect(empty.status === "available" && [empty.snapshot.preferences, empty.snapshot.goals, empty.snapshot.restrictions, empty.snapshot.behavior].every(Array.isArray), "all four evidence arrays always exist");
  expect(empty.status === "available" && empty.snapshot.behavior.length === 0, "empty behavioral reads remain empty evidence");
  expect(empty.status === "available" && empty.snapshot.sourceStates.taste_profile.status === "deferred", "ACL-unavailable foundation is deferred rather than empty");
  expect(empty.status === "available" && empty.snapshot.sourceStates.meals.status === "empty", "true empty meals are distinct from deferred foundation");
  expect(empty.status === "available" && empty.snapshot.evidenceWindow.historyScope === "bounded", "snapshot never claims lifetime history");
  expect(empty.status === "available" && empty.snapshot.evidenceWindow.meals.returnedCount === 0 && empty.snapshot.evidenceWindow.meals.actualEarliestAt === null, "zero meal rows have zero-count null range");

  const unauthenticated = new domain.ConsumerTasteProfileService(dependencies({ authPort: { getCurrentSession: async () => ({ ok: true, value: null }) } }));
  unauthenticated.setActor("user-a", 1);
  expect((await unauthenticated.readCurrentUserSnapshot(request)).status === "unauthenticated", "unauthenticated read fails the whole composition");

  const foundationEvidence = domain.mapTasteProfileRow(tasteRow, "user-a");
  expect(foundationEvidence.some((entry) => entry.facet === "cuisine" && entry.value === "Café"), "explicit cuisines use frozen TS-1 normalization");
  expect(foundationEvidence.some((entry) => entry.facet === "flavor" && entry.polarity === "negative"), "disliked taste remains a negative preference rather than restriction");
  expect(foundationEvidence.some((entry) => entry.facet === "spice" && entry.value === "future_spice"), "unknown categorical preference value is preserved");
  expect(JSON.stringify(foundationEvidence).includes("favorite_") === false, "denormalized profile favorites are never imported");

  const inactive = { ...activeGoal, id: "inactive", is_active: false };
  const future = { ...activeGoal, id: "future", starts_on: "2026-08-09" };
  const expired = { ...activeGoal, id: "expired", starts_on: "2026-01-01", ends_on: "2026-08-07" };
  const goals = domain.mapNutritionGoalRows([future, activeGoal, inactive, expired], "user-a", "2026-08-08");
  expect(goals.length === 6 && goals.every((entry) => entry.evidence.evidenceId.includes("goal-active")), "only active date-valid goal is included");
  expect(goals.some((entry) => entry.facet === "daily_calories_target" && entry.value === 2100), "goal scalar and kcal unit are preserved");
  expect(goals.some((entry) => entry.facet === "protein_target_g" && entry.value === 130), "macro scalar and gram unit are preserved");
  expect(goals.every((entry) => !("polarity" in entry)), "goals never become preferences");

  const soft = domain.mapDietaryRestrictionRows([restrictionRow], "user-a")[0];
  const unknownRestriction = domain.mapDietaryRestrictionRows([{ ...restrictionRow, id: "restriction-2", severity: "future_severity" }], "user-a")[0];
  expect(soft.enforcement === "soft", "preference restriction severity maps to frozen soft enforcement");
  expect(unknownRestriction.enforcement === "unclassified", "unknown restriction severity stays unclassified");
  expect(!("polarity" in soft) && soft.category === "restriction", "restriction never converts into a like/dislike preference");
  expect(JSON.stringify(soft).includes("notes") === false, "private note fields cannot enter restriction evidence");

  const mealEvidence = domain.mapMealRecordsToTasteEvidence([mealRecord]);
  expect(mealEvidence.length === 1 && mealEvidence[0].behaviorKind === "meal_occurrence", "meal-only mapping creates observed meal occurrence");
  expect(mealEvidence[0].evidence.target.menuItemId === "item-1" && mealEvidence[0].consumedRatio === 0.5, "meal mapping preserves canonical IDs and consumed ratio");
  expect(mealEvidence[0].evidence.sourceConfidence === 0.74 && !("tasteConfidence" in mealEvidence[0]), "meal source confidence is not taste confidence");
  const targetlessMeal = domain.mapMealRecordsToTasteEvidence([{ ...mealRecord, items: [{ ...mealRecord.items[0], mealRecordItemId: "meal-item-2", restaurantId: null, branchId: null, menuItemId: null }] }]);
  expect(targetlessMeal[0].evidence.target === null, "meal without canonical IDs stays targetless");
  const favoriteEvidence = domain.mapFavoriteRecordsToTasteEvidence([favorite]);
  expect(favoriteEvidence.length === 1 && favoriteEvidence[0].behaviorKind === "favorite", "favorite-only mapping uses active Favorites authority");
  const ratingEvidence = domain.mapRatingRecordsToTasteEvidence([rating]);
  expect(ratingEvidence.length === 1 && ratingEvidence[0].ratingValue === 2.75, "rating-only mapping preserves raw scalar");
  expect(ratingEvidence[0].interpretation === "scalar_evaluation_unclassified", "rating mapping introduces no polarity threshold");

  const fullFoundation = {
    source: "injected-test",
    readCurrentUserTasteProfile: async () => ({ status: "available", rows: [tasteRow] }),
    readCurrentUserNutritionGoals: async () => ({ status: "available", rows: [activeGoal] }),
    readCurrentUserDietaryRestrictions: async () => ({ status: "available", rows: [restrictionRow] })
  };
  const mixedDeps = dependencies({
    foundationRepository: fullFoundation,
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [mealRecord, { ...mealRecord, mealRecordId: "meal-2", items: [] }] }) },
    favoriteService: { listCurrentUserFavorites: async ({ entityType }) => entityType === "restaurant" ? { status: "available", records: [favorite], nextCursor: "next", source: "mock" } : emptyFavorite() },
    ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [rating], source: "mock" }) }
  });
  const mixedService = new domain.ConsumerTasteProfileService(mixedDeps);
  mixedService.setActor("user-a", 1);
  const mixed = await mixedService.readCurrentUserSnapshot(request);
  expect(mixed.status === "available" && mixed.snapshot.preferences.length > 0 && mixed.snapshot.goals.length > 0 && mixed.snapshot.restrictions.length > 0 && mixed.snapshot.behavior.length === 3, "mixed foundation and behavioral evidence compose together");
  expect(mixed.status === "available" && mixed.snapshot.evidenceWindow.meals.requestedStartDate === "2026-08-01" && mixed.snapshot.evidenceWindow.meals.requestedEndDate === "2026-08-08", "meal requested range is preserved");
  expect(mixed.status === "available" && mixed.snapshot.evidenceWindow.meals.actualEarliestAt === "2026-08-07T04:00:00Z" && mixed.snapshot.evidenceWindow.meals.actualLatestAt === "2026-08-07T04:00:00Z", "meal returned evidence range is explicit");
  expect(mixed.status === "available" && mixed.snapshot.evidenceWindow.meals.truncation === "possibly_truncated", "meal record limit reached reports possible truncation");
  expect(mixed.status === "available" && mixed.snapshot.evidenceWindow.favorites.truncation === "known_truncated", "Favorites cursor reports known truncation");
  expect(mixed.status === "available" && mixed.snapshot.confidenceMetadata.evidenceCounts.total > 0 && !("profileConfidence" in mixed.snapshot.confidenceMetadata), "confidence metadata is coverage-only and nonnumeric");

  const ratingsFailureService = new domain.ConsumerTasteProfileService(dependencies({
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [mealRecord] }) },
    ratingService: { listCurrentUserRatings: async () => ({ status: "read_failed", source: "mock", error: {} }) }
  }));
  ratingsFailureService.setActor("user-a", 1);
  const ratingsFailure = await ratingsFailureService.readCurrentUserSnapshot(request);
  expect(ratingsFailure.status === "available" && ratingsFailure.snapshot.sourceStates.ratings.status === "failed", "Ratings failure is distinct from empty");
  expect(ratingsFailure.status === "available" && ratingsFailure.snapshot.behavior.some((entry) => entry.behaviorKind === "meal_occurrence"), "Ratings failure does not erase successful meal evidence");

  const favoriteFailureGoalService = new domain.ConsumerTasteProfileService(dependencies({
    foundationRepository: { ...deferredFoundation(), readCurrentUserNutritionGoals: async () => ({ status: "available", rows: [activeGoal] }) },
    favoriteService: { listCurrentUserFavorites: async () => ({ status: "read_failed", source: "mock", error: {} }) }
  }));
  favoriteFailureGoalService.setActor("user-a", 1);
  const favoriteFailureGoal = await favoriteFailureGoalService.readCurrentUserSnapshot(request);
  expect(favoriteFailureGoal.status === "available" && favoriteFailureGoal.snapshot.sourceStates.favorites.status === "failed" && favoriteFailureGoal.snapshot.goals.length === 6, "Favorites failure does not erase successful goals");

  const disabledFoundationService = new domain.ConsumerTasteProfileService(dependencies({
    foundationRepository: {
      source: "injected-test",
      readCurrentUserTasteProfile: async () => ({ status: "disabled", reason: "source_disabled" }),
      readCurrentUserNutritionGoals: async () => ({ status: "failed", failureCode: "source_read_failed" }),
      readCurrentUserDietaryRestrictions: async () => ({ status: "empty", rows: [] })
    },
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [mealRecord] }) }
  }));
  disabledFoundationService.setActor("user-a", 1);
  const disabledFoundation = await disabledFoundationService.readCurrentUserSnapshot(request);
  expect(disabledFoundation.status === "available" && disabledFoundation.snapshot.sourceStates.taste_profile.status === "disabled", "disabled foundation stays distinct from empty");
  expect(disabledFoundation.status === "available" && disabledFoundation.snapshot.sourceStates.nutrition_goals.status === "failed", "failed foundation stays distinct from empty");
  expect(disabledFoundation.status === "available" && disabledFoundation.snapshot.sourceStates.dietary_restrictions.status === "empty", "true empty foundation remains empty");
  expect(disabledFoundation.status === "available" && disabledFoundation.snapshot.behavior.length === 1, "foundation unavailable still permits behavioral evidence");

  const deterministicFirst = await mixedService.readCurrentUserSnapshot(request);
  const deterministicSecond = await mixedService.readCurrentUserSnapshot(request);
  expect(JSON.stringify(deterministicFirst) === JSON.stringify(deterministicSecond), "same inputs and deterministic clock produce exact equivalent snapshots");
  expect(deterministicFirst.status === "available" && deterministicFirst.snapshot.preferences.map((entry) => entry.evidence.evidenceId).join("|") === [...deterministicFirst.snapshot.preferences].map((entry) => entry.evidence.evidenceId).sort().join("|"), "snapshot evidence uses deterministic code-unit order");

  let release;
  let currentUser = "user-a";
  let firstTasteRead = true;
  const pendingTaste = new Promise((resolve) => { release = resolve; });
  const raceFoundation = {
    ...deferredFoundation(),
    readCurrentUserTasteProfile: async () => {
      if (!firstTasteRead) return { status: "deferred", reason: "acl_activation_pending" };
      firstTasteRead = false;
      return pendingTaste;
    }
  };
  const raceService = new domain.ConsumerTasteProfileService(dependencies({ authPort: { getCurrentSession: async () => okSession(currentUser) }, foundationRepository: raceFoundation }));
  raceService.setActor("user-a", 1);
  const userARead = raceService.readCurrentUserSnapshot(request);
  await new Promise((resolve) => setImmediate(resolve));
  currentUser = "user-b";
  raceService.setActor("user-b", 2);
  release({ status: "deferred", reason: "acl_activation_pending" });
  expect((await userARead).status === "stale", "User A result is discarded after actor switches to User B");
  const userBRead = await raceService.readCurrentUserSnapshot(request);
  expect(userBRead.status === "available" && userBRead.snapshot.subjectUserId === "user-b", "User B snapshot is accepted under the new generation");

  console.log(JSON.stringify({
    status: "passed", phase: "TS-2A + TS-2B + TS-2C Canonical Taste Profile Smoke",
    totalChecks: checks.length, checks, networkUsed: false, databaseUsed: false, credentialsUsed: false,
    productionTouched: false, liveFoundationSelects: 0
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", phase: "TS-2A + TS-2B + TS-2C Canonical Taste Profile Smoke", reason: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

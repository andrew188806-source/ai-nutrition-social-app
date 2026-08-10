// SR-1A — server-side snapshot composition and the internal pair comparison primitive.
//
// SCOPE. This module composes canonical `TasteProfileSnapshot`s from server-read rows and runs the
// frozen TS-3E → TS-6 pipeline over a pair. It is INTERNAL. It has no HTTP surface, no request or
// response DTO, no serialization path, and no client projection. Its output is the server-internal
// `SharedTasteAdapterResult`, which SR-1 classified as server-safe but NOT cross-user client-safe.
//
// AUTHORIZATION IS NOT PERFORMED HERE. Whether the caller may compare against the candidate is
// SR-1B's Candidate Authorization authority, which does not exist yet. The parameter is named
// `alreadyAuthorizedTargetUserId` so no future reader can mistake this module for a gate.
//
// EVERY RULE COMES FROM FROZEN AUTHORITY. Preference, goal and restriction evidence is built by the
// frozen TS-2 row mappers; behavioural evidence is built by the frozen `normalizeBehavioralEvidence`;
// the snapshot is assembled by the frozen composer; and the comparison runs the frozen stages
// unchanged. Nothing in this file re-implements a scorer or a normalizer.
//
// WHY BEHAVIOURAL EVIDENCE IS SHAPED HERE RATHER THAN BY TS-2's behaviorMappers. Those mappers take
// Mobile DOMAIN types: `ConsumerMealRecordItem` requires a full `nutrition` snapshot, display names
// and portion data. Reusing them server-side would force reading — or fabricating — private nutrition
// data that no frozen stage consumes, defeating data minimization. So the row-to-evidence shaping for
// meals and favorites is expressed against DATABASE ROWS here, while the semantic authority stays
// exactly where it was: `normalizeBehavioralEvidence` validates and canonicalizes every record.
import {
  adaptSharedTasteComparison,
  assessColdStart,
  calculateEvidenceConfidence,
  compareTasteProfiles,
  composeTasteProfileSnapshot,
  mapDietaryRestrictionRows,
  mapNutritionGoalRows,
  mapTasteProfileRow,
  normalizeBehavioralEvidence
} from "../taste-foundation-runtime/tasteFoundation.generated.mjs";
import type {
  ServerMealHistoryWindow,
  ServerPrivateReadOutcome,
  ServerTasteFoundationReads,
  ServerTasteFoundationRepository
} from "./serverTasteFoundationRepository.ts";

// One instant governs the whole pair. TS-3D derives goal validity from `snapshot.generatedAt`, so two
// snapshots built at different instants could evaluate the two users' goals against different dates —
// an asymmetry that would silently favour whichever side was composed first.
export type ServerPairAsOf = {
  readonly generatedAt: string;
  readonly window: ServerMealHistoryWindow;
};

export type ServerComposedSnapshot = {
  readonly subjectUserId: string;
  readonly snapshot: unknown;
};

const rowsOf = (outcome: ServerPrivateReadOutcome<Record<string, unknown>>): readonly Record<string, unknown>[] =>
  outcome.status === "available" ? outcome.rows : [];

// Mirrors the frozen source-state contract exactly: a read that FAILED is never flattened into
// `empty`, because "we could not tell" and "there is genuinely nothing" drive different frozen
// outcomes all the way up through TS-4 and TS-5.
function sourceState(outcome: ServerPrivateReadOutcome<Record<string, unknown>>, evidenceCount: number) {
  if (outcome.status === "failed") return { status: "failed" as const, evidenceCount: 0, failureCode: "source_read_failed" as const };
  if (evidenceCount === 0) return { status: "empty" as const, evidenceCount: 0 };
  return { status: "available" as const, evidenceCount };
}

const truncation = (returnedCount: number, requestedLimit: number) =>
  returnedCount >= requestedLimit ? ("possibly_truncated" as const) : ("not_truncated" as const);

function mealTarget(item: Record<string, unknown>) {
  const restaurantId = item.restaurant_id;
  const menuItemId = item.menu_item_id;
  if (typeof restaurantId === "string" && typeof menuItemId === "string") {
    return { kind: "menu_item" as const, restaurantId, menuItemId };
  }
  if (typeof restaurantId === "string") return { kind: "restaurant" as const, restaurantId };
  return null;
}

// The frozen goal mapper iterates a fixed list of five macro target fields and rejects any value that
// is neither `null` nor a finite number. A row assembled from the minimized column set has those
// fields ABSENT, which the frozen validator correctly refuses.
//
// The resolution is to declare what is actually true: the server holds no macro value for this user,
// so each macro field is supplied as an explicit `null`. The frozen mapper then skips every macro
// facet (`if (value === null) continue;`) and emits only the coarse goal label — exactly the evidence
// TS-3D consumes. No macro column is selected, no macro value is read, and no frozen line is edited.
const MACRO_TARGETS_NOT_READ = {
  daily_calories_target: null,
  protein_target_g: null,
  carbohydrates_target_g: null,
  fat_target_g: null,
  fiber_target_g: null
} as const;

function buildBehavioralEvidence(reads: ServerTasteFoundationReads): readonly unknown[] {
  const evidence: unknown[] = [];

  const mealTypeByRecordId = new Map<string, unknown>();
  for (const record of rowsOf(reads.mealRecords)) {
    if (record.deleted_at != null) continue;
    if (typeof record.id === "string") mealTypeByRecordId.set(record.id, record.meal_type);
  }

  for (const item of rowsOf(reads.mealRecordItems)) {
    const recordId = item.meal_record_id;
    if (typeof recordId !== "string" || !mealTypeByRecordId.has(recordId)) continue;
    const target = mealTarget(item);
    if (target === null) continue;
    evidence.push(normalizeBehavioralEvidence({
      category: "behavior",
      behaviorKind: "meal_occurrence",
      interpretation: "observed",
      mealType: mealTypeByRecordId.get(recordId),
      occurredAt: item.occurred_at,
      consumedRatio: item.consumed_ratio,
      evidence: {
        evidenceId: `meal-record-item:${item.id}`,
        origin: "meal_record",
        sourceRecordKind: "meal_record_item",
        recordedAt: item.occurred_at,
        confidenceBasis: "observed_consumption",
        decayEligibility: "source_policy",
        target
      }
    }));
  }

  for (const favorite of rowsOf(reads.favoriteRestaurants)) {
    if (favorite.removed_at != null) continue;
    evidence.push(normalizeBehavioralEvidence({
      category: "behavior",
      behaviorKind: "favorite",
      favoriteKind: "restaurant",
      interpretation: "positive_user_action",
      evidence: {
        evidenceId: `favorite:${favorite.id}`,
        origin: "favorite",
        sourceRecordKind: "favorite_restaurant",
        recordedAt: favorite.created_at,
        confidenceBasis: "user_action",
        decayEligibility: "not_eligible",
        target: { kind: "restaurant", restaurantId: favorite.restaurant_id }
      }
    }));
  }

  for (const favorite of rowsOf(reads.favoriteMenuItems)) {
    if (favorite.removed_at != null) continue;
    evidence.push(normalizeBehavioralEvidence({
      category: "behavior",
      behaviorKind: "favorite",
      favoriteKind: "menu_item",
      interpretation: "positive_user_action",
      evidence: {
        evidenceId: `favorite:${favorite.id}`,
        origin: "favorite",
        sourceRecordKind: "favorite_menu_item",
        recordedAt: favorite.created_at,
        confidenceBasis: "user_action",
        decayEligibility: "not_eligible",
        target: { kind: "menu_item", restaurantId: favorite.restaurant_id, menuItemId: favorite.menu_item_id }
      }
    }));
  }

  return evidence;
}

// Composes one canonical snapshot. Deterministic: every input is a row set plus the injected as-of
// instant, and nothing here reads a clock.
export function composeServerSnapshot(
  targetUserId: string,
  reads: ServerTasteFoundationReads,
  asOf: ServerPairAsOf
): ServerComposedSnapshot {
  const asOfDate = asOf.generatedAt.slice(0, 10);

  const preferences = rowsOf(reads.tasteProfiles).flatMap((row) => mapTasteProfileRow(row, targetUserId));
  const goals = mapNutritionGoalRows(
    // Macro nulls are applied LAST so they win. Even if a future transport were to over-select, the
    // macro value is discarded here rather than reaching the frozen mapper — fail closed, not fail open.
    rowsOf(reads.nutritionGoals).map((row) => ({ ...row, ...MACRO_TARGETS_NOT_READ })),
    targetUserId,
    asOfDate
  );
  const restrictions = mapDietaryRestrictionRows(rowsOf(reads.dietaryRestrictions), targetUserId);
  const behavior = buildBehavioralEvidence(reads);

  const mealEvidenceCount = behavior.filter((entry) => (entry as { behaviorKind: string }).behaviorKind === "meal_occurrence").length;
  const favoriteEvidenceCount = behavior.filter((entry) => (entry as { behaviorKind: string }).behaviorKind === "favorite").length;
  const favoriteRowCount = rowsOf(reads.favoriteRestaurants).length + rowsOf(reads.favoriteMenuItems).length;
  const favoritesOutcome: ServerPrivateReadOutcome<Record<string, unknown>> =
    reads.favoriteRestaurants.status === "failed" || reads.favoriteMenuItems.status === "failed"
      ? { status: "failed", failureCode: "source_read_failed" }
      : { status: "available", rows: [] };
  const mealsOutcome: ServerPrivateReadOutcome<Record<string, unknown>> =
    reads.mealRecords.status === "failed" || reads.mealRecordItems.status === "failed"
      ? { status: "failed", failureCode: "source_read_failed" }
      : { status: "available", rows: [] };

  const snapshot = composeTasteProfileSnapshot({
    subjectUserId: targetUserId,
    preferences,
    goals,
    restrictions,
    behavior,
    sourceStates: {
      taste_profile: sourceState(reads.tasteProfiles, preferences.length),
      nutrition_goals: sourceState(reads.nutritionGoals, goals.length),
      dietary_restrictions: sourceState(reads.dietaryRestrictions, restrictions.length),
      meals: sourceState(mealsOutcome, mealEvidenceCount),
      favorites: sourceState(favoritesOutcome, favoriteEvidenceCount),
      // RATINGS ARE NEVER QUERIED. No frozen stage consumes them: TS-3A/B excludes them structurally,
      // TS-4 bans the token outright, and TS-5 proves ratings truncation is inert. Reporting `empty`
      // would be a false claim of knowledge, so the honest contract-valid state is `disabled` with the
      // canonical `source_disabled` reason — and because ratings appear in no relevant-source set and
      // no signal family, this state cannot influence any frozen output.
      ratings: { status: "disabled" as const, evidenceCount: 0, reason: "source_disabled" as const }
    },
    generatedAt: asOf.generatedAt,
    evidenceWindow: {
      historyScope: "bounded",
      meals: {
        requestedStartDate: asOf.window.requestedStartDate,
        requestedEndDate: asOf.window.requestedEndDate,
        requestedLimit: asOf.window.requestedLimit,
        actualEarliestAt: null,
        actualLatestAt: null,
        returnedCount: 0,
        truncation: truncation(rowsOf(reads.mealRecordItems).length, asOf.window.requestedLimit)
      },
      favorites: {
        requestedLimit: asOf.window.favoritesLimit,
        actualEarliestAt: null,
        actualLatestAt: null,
        returnedCount: 0,
        truncation: truncation(favoriteRowCount, asOf.window.favoritesLimit)
      },
      ratings: {
        requestedLimit: null,
        actualEarliestAt: null,
        actualLatestAt: null,
        returnedCount: 0,
        truncation: "not_truncated"
      }
    }
  });

  return { subjectUserId: targetUserId, snapshot };
}

// Loads and composes one side. A batch orchestrator (SR-1C) composes the actor ONCE with this and
// then reuses the result across candidates — which is why the comparison primitive below takes
// PRE-COMPOSED snapshots rather than user ids.
export async function composeServerSnapshotForUser(
  repository: ServerTasteFoundationRepository,
  targetUserId: string,
  asOf: ServerPairAsOf
): Promise<ServerComposedSnapshot> {
  const reads = await repository.readForUser(targetUserId, asOf.window);
  return composeServerSnapshot(targetUserId, reads, asOf);
}

// The internal pair primitive.
//
// It accepts two PRE-COMPOSED snapshots so the actor's snapshot is composed once per request rather
// than once per candidate, and it runs the four frozen stages unchanged. The result is
// server-internal and must not be returned, serialized, persisted or cached.
export function compareComposedServerPair(
  actor: ServerComposedSnapshot,
  alreadyAuthorizedCandidate: ServerComposedSnapshot
): unknown {
  const comparison = compareTasteProfiles(actor.snapshot, alreadyAuthorizedCandidate.snapshot);
  const confidence = calculateEvidenceConfidence(comparison);
  const coldStart = assessColdStart(comparison, confidence);
  return adaptSharedTasteComparison(comparison, confidence, coldStart);
}

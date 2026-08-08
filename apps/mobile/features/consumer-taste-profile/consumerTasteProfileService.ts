import {
  composeTasteProfileSnapshot,
  type BehavioralEvidence,
  type GoalEvidence,
  type PreferenceEvidence,
  type RestrictionEvidence,
  type TasteProfileSourceState,
  type TasteProfileSourceStates
} from "../../../../packages/shared/src/domain/taste-similarity";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerFavoriteService } from "../consumer-favorites/consumerFavoriteService";
import type { ConsumerFavoriteListResult } from "../consumer-favorites/types";
import type { ConsumerMealRecordsService } from "../consumer-meals/consumerMealRecordsService";
import type { ConsumerMealRecord } from "../consumer-meals/types";
import type { ConsumerRatingService } from "../consumer-ratings/consumerRatingService";
import type { ConsumerRatingListResult } from "../consumer-ratings/types";
import { mapFavoriteRecordsToTasteEvidence, mapMealRecordsToTasteEvidence, mapRatingRecordsToTasteEvidence } from "./behaviorMappers";
import { mapDietaryRestrictionRows, mapNutritionGoalRows, mapTasteProfileRow } from "./foundationMappers";
import type { ConsumerTasteFoundationRepository } from "./ports";
import type {
  ConsumerDietaryRestrictionRow,
  ConsumerNutritionGoalRow,
  ConsumerTasteFoundationReadResult,
  ConsumerTasteProfileClock,
  ConsumerTasteProfileReadRequest,
  ConsumerTasteProfileReadResult,
  ConsumerTasteProfileRow
} from "./types";

export type ConsumerTasteProfileServiceOptions = {
  authPort: Pick<ConsumerAuthPort, "getCurrentSession">;
  foundationRepository: ConsumerTasteFoundationRepository;
  mealRecordsService: Pick<ConsumerMealRecordsService, "listCurrentUserMealRecords">;
  favoriteService: Pick<ConsumerFavoriteService, "listCurrentUserFavorites">;
  ratingService: Pick<ConsumerRatingService, "listCurrentUserRatings">;
  clock: ConsumerTasteProfileClock;
};

type FoundationEvidence = {
  preferences: readonly PreferenceEvidence[];
  goals: readonly GoalEvidence[];
  restrictions: readonly RestrictionEvidence[];
};

type Settled<T> = { ok: true; value: T } | { ok: false };

export class ConsumerTasteProfileService {
  private actorKey: string | null = null;
  private actorGeneration = 0;

  constructor(private readonly options: ConsumerTasteProfileServiceOptions) {}

  setActor(actorKey: string | null, actorGeneration: number): void {
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
  }

  async readCurrentUserSnapshot(request: ConsumerTasteProfileReadRequest): Promise<ConsumerTasteProfileReadResult> {
    if (!validRequest(request)) return { status: "failed", failureCode: "invalid_request" };
    const actorKey = this.actorKey;
    const actorGeneration = this.actorGeneration;
    if (!actorKey) return { status: "unauthenticated" };

    const initialSession = await this.readSession();
    if (initialSession.status === "unauthenticated") return { status: "unauthenticated" };
    if (initialSession.status === "failed") return { status: "failed", failureCode: "authentication_failed" };
    if (initialSession.userId !== actorKey || !this.isCurrentActor(actorKey, actorGeneration)) return { status: "stale" };

    const generatedAt = this.options.clock.now();
    const asOfDate = generatedAt.slice(0, 10);
    const [tasteProfileResult, nutritionGoalsResult, dietaryRestrictionsResult, mealsResult, restaurantFavorites, menuItemFavorites, ratingsResult] =
      await Promise.all([
        settle(this.options.foundationRepository.readCurrentUserTasteProfile()),
        settle(this.options.foundationRepository.readCurrentUserNutritionGoals()),
        settle(this.options.foundationRepository.readCurrentUserDietaryRestrictions()),
        settle(this.options.mealRecordsService.listCurrentUserMealRecords(request.mealWindow)),
        settle(this.options.favoriteService.listCurrentUserFavorites({ entityType: "restaurant", pageSize: request.favoritePageSize })),
        settle(this.options.favoriteService.listCurrentUserFavorites({ entityType: "menu_item", pageSize: request.favoritePageSize })),
        settle(this.options.ratingService.listCurrentUserRatings())
      ]);

    if (!this.isCurrentActor(actorKey, actorGeneration)) return { status: "stale" };
    const finalSession = await this.readSession();
    if (!this.isCurrentActor(actorKey, actorGeneration)) return { status: "stale" };
    if (finalSession.status === "failed") return { status: "failed", failureCode: "authentication_failed" };
    if (finalSession.status === "unauthenticated") return { status: "stale" };
    if (finalSession.userId !== actorKey) return { status: "stale" };

    const foundation: FoundationEvidence = { preferences: [], goals: [], restrictions: [] };
    const sourceStates = {} as TasteProfileSourceStates;
    const tasteMapped = mapFoundation(tasteProfileResult, (rows) => rows.length === 0 ? [] : mapTasteProfileRow(singleRow(rows), actorKey));
    foundation.preferences = tasteMapped.evidence;
    sourceStates.taste_profile = tasteMapped.state;
    const goalsMapped = mapFoundation(nutritionGoalsResult, (rows) => mapNutritionGoalRows(rows, actorKey, asOfDate));
    foundation.goals = goalsMapped.evidence;
    sourceStates.nutrition_goals = goalsMapped.state;
    const restrictionsMapped = mapFoundation(dietaryRestrictionsResult, (rows) => mapDietaryRestrictionRows(rows, actorKey));
    foundation.restrictions = restrictionsMapped.evidence;
    sourceStates.dietary_restrictions = restrictionsMapped.state;

    const mealsMapped = mapMeals(mealsResult);
    sourceStates.meals = mealsMapped.state;
    const favoritesMapped = mapFavorites(restaurantFavorites, menuItemFavorites);
    sourceStates.favorites = favoritesMapped.state;
    const ratingsMapped = mapRatings(ratingsResult);
    sourceStates.ratings = ratingsMapped.state;
    const behavior: readonly BehavioralEvidence[] = [
      ...mealsMapped.evidence,
      ...favoritesMapped.evidence,
      ...ratingsMapped.evidence
    ];

    try {
      return {
        status: "available",
        snapshot: composeTasteProfileSnapshot({
          subjectUserId: actorKey,
          preferences: foundation.preferences,
          goals: foundation.goals,
          restrictions: foundation.restrictions,
          behavior,
          sourceStates,
          generatedAt,
          evidenceWindow: {
            historyScope: "bounded",
            meals: {
              requestedStartDate: request.mealWindow.startDate,
              requestedEndDate: request.mealWindow.endDate,
              requestedLimit: request.mealWindow.limit,
              ...coverage(mealsMapped.evidence),
              truncation: mealsMapped.rawRecordCount >= request.mealWindow.limit ? "possibly_truncated" : "not_truncated"
            },
            favorites: {
              requestedLimit: request.favoritePageSize * 2,
              ...coverage(favoritesMapped.evidence),
              truncation: favoritesMapped.hasNextPage ? "known_truncated" : "not_truncated"
            },
            ratings: {
              requestedLimit: null,
              ...coverage(ratingsMapped.evidence),
              truncation: "not_truncated"
            }
          }
        })
      };
    } catch {
      return { status: "failed", failureCode: "invalid_request" };
    }
  }

  private isCurrentActor(actorKey: string, actorGeneration: number): boolean {
    return this.actorKey === actorKey && this.actorGeneration === actorGeneration;
  }

  private async readSession(): Promise<
    | { status: "available"; userId: string }
    | { status: "unauthenticated" }
    | { status: "failed" }
  > {
    try {
      const result = await this.options.authPort.getCurrentSession();
      if (!result.ok) return { status: "failed" };
      if (!result.value) return { status: "unauthenticated" };
      return { status: "available", userId: result.value.user.userId };
    } catch {
      return { status: "failed" };
    }
  }
}

function mapFoundation<TRow, TEvidence>(
  result: Settled<ConsumerTasteFoundationReadResult<TRow>>,
  mapper: (rows: readonly TRow[]) => readonly TEvidence[]
): { evidence: readonly TEvidence[]; state: TasteProfileSourceState } {
  if (!result.ok) return failedMapping();
  if (result.value.status === "available" || result.value.status === "empty") {
    try {
      const evidence = mapper(result.value.rows);
      return { evidence, state: countState(evidence.length) };
    } catch {
      return failedMapping();
    }
  }
  return { evidence: [], state: stateFromUnavailable(result.value) };
}

function mapMeals(result: Settled<Awaited<ReturnType<ConsumerMealRecordsService["listCurrentUserMealRecords"]>>>) {
  if (!result.ok || !result.value.ok) return { evidence: [] as readonly BehavioralEvidence[], state: failedState(), rawRecordCount: 0 };
  try {
    return {
      evidence: mapMealRecordsToTasteEvidence(result.value.value),
      state: countState(result.value.value.flatMap((record) => record.items).length),
      rawRecordCount: result.value.value.length
    };
  } catch {
    return { evidence: [] as readonly BehavioralEvidence[], state: failedMapping().state, rawRecordCount: 0 };
  }
}

function mapFavorites(restaurant: Settled<ConsumerFavoriteListResult>, menuItem: Settled<ConsumerFavoriteListResult>) {
  const results = [restaurant, menuItem];
  const records = results.flatMap((result) => result.ok && (result.value.status === "available" || result.value.status === "empty")
    ? result.value.records
    : []);
  try {
    const evidence = mapFavoriteRecordsToTasteEvidence(records);
    const failed = results.some((result) => !result.ok || result.value.status === "read_failed");
    const unauthenticated = results.some((result) => result.ok && result.value.status === "unauthenticated");
    const disabled = results.some((result) => result.ok && result.value.status === "disabled");
    const state: TasteProfileSourceState = failed
      ? failedState(evidence.length)
      : unauthenticated
        ? failedState(evidence.length)
        : disabled
          ? (evidence.length ? failedState(evidence.length) : { status: "disabled", evidenceCount: 0, reason: "source_disabled" })
          : countState(evidence.length);
    return {
      evidence,
      state,
      hasNextPage: results.some((result) => result.ok && (result.value.status === "available" || result.value.status === "empty") && result.value.nextCursor !== null)
    };
  } catch {
    return { evidence: [] as readonly BehavioralEvidence[], state: failedMapping().state, hasNextPage: false };
  }
}

function mapRatings(result: Settled<ConsumerRatingListResult>) {
  if (!result.ok) return { evidence: [] as readonly BehavioralEvidence[], state: failedState() };
  if (result.value.status === "disabled") return { evidence: [] as readonly BehavioralEvidence[], state: { status: "disabled", evidenceCount: 0, reason: "source_disabled" } as const };
  if (result.value.status === "unauthenticated") return { evidence: [] as readonly BehavioralEvidence[], state: { status: "unauthenticated", evidenceCount: 0, reason: "authentication_required" } as const };
  if (result.value.status === "read_failed") return { evidence: [] as readonly BehavioralEvidence[], state: failedState() };
  try {
    const evidence = mapRatingRecordsToTasteEvidence(result.value.records);
    return { evidence, state: countState(evidence.length) };
  } catch {
    return { evidence: [] as readonly BehavioralEvidence[], state: failedMapping().state };
  }
}

function stateFromUnavailable(result: Exclude<ConsumerTasteFoundationReadResult<unknown>, { status: "available" | "empty" }>): TasteProfileSourceState {
  if (result.status === "disabled") return { status: "disabled", evidenceCount: 0, reason: "source_disabled" };
  if (result.status === "unauthenticated") return { status: "unauthenticated", evidenceCount: 0, reason: "authentication_required" };
  if (result.status === "deferred") return { status: "deferred", evidenceCount: 0, reason: "acl_activation_pending" };
  return failedState();
}

function countState(count: number): TasteProfileSourceState {
  return count === 0 ? { status: "empty", evidenceCount: 0 } : { status: "available", evidenceCount: count };
}

function failedState(evidenceCount = 0): TasteProfileSourceState {
  return { status: "failed", evidenceCount, failureCode: "source_read_failed" };
}

function failedMapping<TEvidence>(): { evidence: readonly TEvidence[]; state: TasteProfileSourceState } {
  return { evidence: [], state: { status: "failed", evidenceCount: 0, failureCode: "source_mapping_failed" } };
}

function coverage(evidence: readonly BehavioralEvidence[]) {
  const timestamps = evidence.map((entry) => entry.evidence.recordedAt ?? entry.evidence.updatedAt).filter((value): value is string => Boolean(value));
  timestamps.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return {
    actualEarliestAt: timestamps[0] ?? null,
    actualLatestAt: timestamps[timestamps.length - 1] ?? null,
    returnedCount: evidence.length
  };
}

function singleRow(rows: readonly ConsumerTasteProfileRow[]): ConsumerTasteProfileRow {
  if (rows.length !== 1) throw new Error("Taste profile source returned more than one current-user row.");
  return rows[0];
}

function validRequest(request: ConsumerTasteProfileReadRequest): boolean {
  const { startDate, endDate, limit } = request.mealWindow;
  return validDate(startDate) && validDate(endDate) && startDate <= endDate && Number.isInteger(limit) && limit >= 1 && limit <= 100
    && Number.isInteger(request.favoritePageSize) && request.favoritePageSize >= 1 && request.favoritePageSize <= 50;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

import type { PreferenceEvidence } from "../preference";
import type { BehavioralEvidence } from "../behavior";
import type { TasteProfileSnapshot } from "../snapshot";
import {
  MIN_REPEATED_MEAL_OCCURRENCES,
  TASTE_SIMILARITY_POLICY_VERSION,
  TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
  roundTasteSimilarityScore
} from "./policy";
import { orderTasteSimilarityReasonCodes, type TasteSimilarityReasonCode } from "./reasonCodes";
import type {
  TasteSimilarityConfidenceInputs,
  TasteSimilarityDimension,
  TasteSimilarityDimensionOutcome,
  TasteSimilarityNotScoredReason,
  TasteSimilarityResult
} from "./types";

// TS-3B — the pure user-to-user FOOD-TASTE comparator.
//
// Pure by construction: no clock, no randomness, no network, no database, no React, no Supabase, no
// locale-sensitive comparison. Given the same two snapshots and this policy version it returns
// byte-identical output, in either argument order.
//
// SCORE COMPOSITION, and why it is mathematically neutral.
//
// Every comparable dimension contributes an agreement value in 0..1 and the result is their
// UNWEIGHTED ARITHMETIC MEAN. That is the only composition available without inventing authority:
// TS-1 ranks evidence qualitatively (user_explicit > user_action > observed_consumption) but
// assigns no magnitudes, so any unequal weighting would be a number this repository has never
// agreed. The mean is symmetric, bounded by the bounds of its inputs, and invariant to dimension
// ordering. Weighting is a TS-4+ decision and would require a new policy version.
//
// Set agreement uses the Jaccard index |A∩B| / |A∪B|. It is a standard, parameter-free set
// similarity: no tuning constant, no threshold, no asymmetry. Two users who each listed cuisines
// and share none score 0 on that dimension — a real measurement, not a conflict.
//
// The dividing line this file keeps: MISSING evidence is `unknown` and leaves the denominator
// entirely; PRESENT evidence that fails to overlap is a measured 0. Conflating the two is the
// single most damaging thing a similarity scorer can do, so the two paths never meet.
//
// TS-3B-R1 — REPEATED OBSERVED CONSUMPTION as a weaker behavioural fallback.
//
// `consumed once != liked`. A single meal occurrence proves a person ate somewhere, not that they
// enjoyed it, so one occurrence never creates taste affinity. Repeated consumption of the SAME
// canonical target inside the bounded snapshot is a genuine, if weaker, behavioural signal.
//
// Two rules keep it honest:
//
//   1. FALLBACK, NEVER ADDITIVE. Per identity family — restaurants, then menu items — the repeated
//      dimension activates only when the corresponding FAVORITE dimension is not comparable. A pair
//      who both marked favorites and both ate repeatedly casts one vote for that behavioural family,
//      not two. Evidence priority is enforced by this suppression rule, never by a numeric weight:
//      TS-1 ranks `user_action` above `observed_consumption` qualitatively and assigns no magnitudes.
//
//   2. BINARY, NEVER GRADED. Crossing MIN_REPEATED_MEAL_OCCURRENCES is all there is. Visit counts,
//      recency, timestamps, `sourceConfidence` and consumed ratio never reach the score. R1
//      implements no decay of any kind — the bounded snapshot is the only temporal boundary.
//
// A dimension whose family has no meal evidence at all on either side does not appear in the result
// at all, so a snapshot pair without meals scores exactly as it did under `taste-similarity-v1`.

const EMPTY_DIMENSIONS: readonly TasteSimilarityDimension[] = Object.freeze([]);

export function compareTasteSimilarity(
  snapshotA: TasteProfileSnapshot,
  snapshotB: TasteProfileSnapshot
): TasteSimilarityResult {
  // Symmetry is structural, not incidental: the pair is canonically ordered before anything reads
  // it, so both argument orders execute the identical computation over the identical operands.
  const [left, right] = orderSnapshotPair(snapshotA, snapshotB);

  if (
    snapshotA.schemaVersion !== TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||
    snapshotB.schemaVersion !== TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION
  ) {
    return notScored("unsupported_snapshot_schema", emptyConfidenceInputs(), []);
  }

  const leftFacts = collectTasteFacts(left);
  const rightFacts = collectTasteFacts(right);

  const outcomes: TasteSimilarityDimensionOutcome[] = [];
  const overlaps: TasteSimilarityDimension[] = [];
  const sharedAvoidances: TasteSimilarityDimension[] = [];
  const unknowns: TasteSimilarityDimension[] = [];
  const reasonCodes = new Set<TasteSimilarityReasonCode>();

  // --- cuisine: the only positive-polarity preference TS-1 defines -------------------------------
  const cuisine = compareSets(leftFacts.cuisines, rightFacts.cuisines);
  if (cuisine === null) {
    unknowns.push("cuisine_preference");
  } else {
    outcomes.push({ dimension: "cuisine_preference", agreement: cuisine.agreement });
    if (cuisine.intersectionSize > 0) {
      overlaps.push("cuisine_preference");
      reasonCodes.add("shared_cuisine_preference");
    }
  }

  // --- flavor: the only negative-polarity preference TS-1 defines --------------------------------
  // A shared dislike is genuine taste agreement, but it is recorded as an AVOIDANCE, never as an
  // overlap. One user's dislike against the other's silence is `unknown`, never a conflict: TS-1
  // has no positive flavor authority to contradict, so a conflict here would be invented.
  const flavor = compareSets(leftFacts.dislikedFlavors, rightFacts.dislikedFlavors);
  if (flavor === null) {
    unknowns.push("flavor_avoidance");
  } else {
    outcomes.push({ dimension: "flavor_avoidance", agreement: flavor.agreement });
    if (flavor.intersectionSize > 0) {
      sharedAvoidances.push("flavor_avoidance");
      reasonCodes.add("shared_flavor_avoidance");
    }
  }

  // --- spice: exact normalized string equality only ----------------------------------------------
  // TS-1 gives spice `neutral | unclassified` polarity and a bare string with no ordering, so there
  // is no mild < medium < spicy scale to compare against. Equal values are an observed overlap;
  // DIFFERENT values are `unknown`, not a conflict and not a zero — scoring them 0 would assert a
  // maximal dissimilarity the contract cannot support. Consequence, stated plainly: in v1 spice can
  // only ever raise a score or be excluded. Ordinal spice comparison is deferred.
  if (leftFacts.spice === null || rightFacts.spice === null || leftFacts.spice !== rightFacts.spice) {
    unknowns.push("spice_preference");
  } else {
    outcomes.push({ dimension: "spice_preference", agreement: 1 });
    overlaps.push("spice_preference");
    reasonCodes.add("shared_spice_preference");
  }

  // --- favorites: canonical ids only -------------------------------------------------------------
  // Identity comes from the canonical target reference carried by the evidence envelope. Display
  // names are never read, so two different restaurants sharing a name can never look like a match.
  const favoriteRestaurants = compareSets(leftFacts.favoriteRestaurantIds, rightFacts.favoriteRestaurantIds);
  if (favoriteRestaurants === null) {
    unknowns.push("favorite_restaurant");
  } else {
    outcomes.push({ dimension: "favorite_restaurant", agreement: favoriteRestaurants.agreement });
    if (favoriteRestaurants.intersectionSize > 0) {
      overlaps.push("favorite_restaurant");
      reasonCodes.add("shared_favorite_restaurant");
    }
  }

  const favoriteMenuItems = compareSets(leftFacts.favoriteMenuItemIds, rightFacts.favoriteMenuItemIds);
  if (favoriteMenuItems === null) {
    unknowns.push("favorite_menu_item");
  } else {
    outcomes.push({ dimension: "favorite_menu_item", agreement: favoriteMenuItems.agreement });
    if (favoriteMenuItems.intersectionSize > 0) {
      overlaps.push("favorite_menu_item");
      reasonCodes.add("shared_favorite_menu_item");
    }
  }

  // --- repeated observed consumption: restaurant family ------------------------------------------
  // Fallback only. `favoriteRestaurants !== null` means both users supplied canonical favorite
  // restaurants, so that stronger dimension already speaks for this behavioural family and the
  // weaker one is suppressed rather than added alongside it.
  const restaurantFamilyHasMeals = leftFacts.observedMealRestaurants || rightFacts.observedMealRestaurants;
  const restaurantSuppressedByFavorites = favoriteRestaurants !== null && restaurantFamilyHasMeals;
  let repeatedRestaurantContribution = 0;
  if (favoriteRestaurants === null && restaurantFamilyHasMeals) {
    const repeatedRestaurants = compareSets(leftFacts.repeatedRestaurantIds, rightFacts.repeatedRestaurantIds);
    if (repeatedRestaurants === null) {
      unknowns.push("repeated_meal_restaurant");
    } else {
      outcomes.push({ dimension: "repeated_meal_restaurant", agreement: repeatedRestaurants.agreement });
      repeatedRestaurantContribution =
        (leftFacts.repeatedRestaurantIds?.length ?? 0) + (rightFacts.repeatedRestaurantIds?.length ?? 0);
      if (repeatedRestaurants.intersectionSize > 0) {
        overlaps.push("repeated_meal_restaurant");
        reasonCodes.add("shared_repeated_restaurant_consumption");
      }
    }
  }

  // --- repeated observed consumption: menu item family -------------------------------------------
  const menuItemFamilyHasMeals = leftFacts.observedMealMenuItems || rightFacts.observedMealMenuItems;
  const menuItemSuppressedByFavorites = favoriteMenuItems !== null && menuItemFamilyHasMeals;
  let repeatedMenuItemContribution = 0;
  if (favoriteMenuItems === null && menuItemFamilyHasMeals) {
    const repeatedMenuItems = compareSets(leftFacts.repeatedMenuItemIds, rightFacts.repeatedMenuItemIds);
    if (repeatedMenuItems === null) {
      unknowns.push("repeated_meal_menu_item");
    } else {
      outcomes.push({ dimension: "repeated_meal_menu_item", agreement: repeatedMenuItems.agreement });
      repeatedMenuItemContribution =
        (leftFacts.repeatedMenuItemIds?.length ?? 0) + (rightFacts.repeatedMenuItemIds?.length ?? 0);
      if (repeatedMenuItems.intersectionSize > 0) {
        overlaps.push("repeated_meal_menu_item");
        reasonCodes.add("shared_repeated_menu_item_consumption");
      }
    }
  }

  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);
  const confidenceInputs = buildConfidenceInputs(left, right, leftFacts, rightFacts, comparableDimensions.length, unknowns.length, {
    repeatedBehavioralContribution: repeatedRestaurantContribution + repeatedMenuItemContribution,
    restaurantSuppressedByFavorites,
    menuItemSuppressedByFavorites
  });

  if (comparableDimensions.length === 0) {
    // Distinguish "neither side has any v1 evidence" from "one side has none". Both are unscorable,
    // but they are different product situations and a caller may treat them differently.
    const reason: TasteSimilarityNotScoredReason =
      leftFacts.evidenceCount === 0 && rightFacts.evidenceCount === 0
        ? "no_comparable_evidence"
        : "insufficient_evidence";
    return notScored(reason, confidenceInputs, unknowns);
  }

  // Unweighted mean over COMPARABLE dimensions only. Unknown dimensions never entered `outcomes`,
  // so they contribute to neither the numerator nor the denominator.
  const total = outcomes.reduce((sum, outcome) => sum + outcome.agreement, 0);
  const score = roundTasteSimilarityScore(total / outcomes.length);

  if (confidenceInputs.comparableDimensionCount <= 1 || confidenceInputs.evidenceCount <= 2) {
    reasonCodes.add("limited_evidence");
  }

  return {
    policyVersion: TASTE_SIMILARITY_POLICY_VERSION,
    snapshotSchemaVersion: TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
    status: "scored",
    score,
    comparableDimensions: freezeDimensions(comparableDimensions),
    overlaps: freezeDimensions(overlaps),
    sharedAvoidances: freezeDimensions(sharedAvoidances),
    unknowns: freezeDimensions(unknowns),
    conflicts: EMPTY_DIMENSIONS,
    confidenceInputs,
    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes)
  };
}

function notScored(
  reason: TasteSimilarityNotScoredReason,
  confidenceInputs: TasteSimilarityConfidenceInputs,
  unknowns: readonly TasteSimilarityDimension[]
): TasteSimilarityResult {
  return {
    policyVersion: TASTE_SIMILARITY_POLICY_VERSION,
    snapshotSchemaVersion: TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
    status: "not_scored",
    reason,
    comparableDimensions: EMPTY_DIMENSIONS,
    overlaps: EMPTY_DIMENSIONS,
    sharedAvoidances: EMPTY_DIMENSIONS,
    unknowns: freezeDimensions([...unknowns]),
    conflicts: EMPTY_DIMENSIONS,
    confidenceInputs,
    explanationReasonCodes: orderTasteSimilarityReasonCodes(["limited_evidence"])
  };
}

type TasteFacts = {
  cuisines: readonly string[] | null;
  dislikedFlavors: readonly string[] | null;
  spice: string | null;
  favoriteRestaurantIds: readonly string[] | null;
  favoriteMenuItemIds: readonly string[] | null;
  repeatedRestaurantIds: readonly string[] | null;
  repeatedMenuItemIds: readonly string[] | null;
  observedMealRestaurants: boolean;
  observedMealMenuItems: boolean;
  evidenceCount: number;
  explicitEvidenceCount: number;
  behavioralEvidenceCount: number;
  hasTasteProfileSource: boolean;
  hasFavoritesSource: boolean;
  hasMealsSource: boolean;
  favoritesTruncated: boolean;
  mealsTruncated: boolean;
};

// Reads ONLY the v1 food-taste surface. meal_pattern / dining_context / social_logistics
// preferences, goals, restrictions, meal occurrences and ratings are never touched here, which is
// what makes their exclusion structural rather than a downstream filter.
function collectTasteFacts(snapshot: TasteProfileSnapshot): TasteFacts {
  const cuisines: string[] = [];
  const dislikedFlavors: string[] = [];
  const favoriteRestaurantIds: string[] = [];
  const favoriteMenuItemIds: string[] = [];
  let spice: string | null = null;
  let explicitEvidenceCount = 0;
  let behavioralEvidenceCount = 0;

  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {
    if (preference.scope !== "food_taste") continue;
    if (preference.facet === "cuisine") {
      cuisines.push(preference.value);
      explicitEvidenceCount += 1;
    } else if (preference.facet === "flavor") {
      dislikedFlavors.push(preference.value);
      explicitEvidenceCount += 1;
    } else if (preference.facet === "spice") {
      // Snapshot preferences are deduplicated and sorted by evidenceId upstream; a taste profile row
      // is unique per user, so at most one spice value can exist. Taking the first keeps the read
      // deterministic even if that ever changes.
      if (spice === null) {
        spice = preference.value;
        explicitEvidenceCount += 1;
      }
    }
  }

  // Distinct meal-occurrence evidence ids per canonical target. Keyed by evidence id because that is
  // the frozen dedup authority (`normalizeTasteEvidenceList` collapses identical records by id and
  // rejects conflicting ones), so a record repeated under the SAME id can never fake repetition.
  const restaurantOccurrenceIds = new Map<string, Set<string>>();
  const menuItemOccurrenceIds = new Map<string, Set<string>>();

  for (const behavior of snapshot.behavior as readonly BehavioralEvidence[]) {
    if (behavior.behaviorKind === "favorite") {
      const target = behavior.evidence.target;
      if (behavior.favoriteKind === "restaurant" && target.kind === "restaurant") {
        favoriteRestaurantIds.push(target.restaurantId);
        behavioralEvidenceCount += 1;
      } else if (behavior.favoriteKind === "menu_item" && target.kind === "menu_item") {
        // Menu items are addressed by the canonical restaurant + menu item pair, never by name.
        favoriteMenuItemIds.push(`${target.restaurantId}::${target.menuItemId}`);
        behavioralEvidenceCount += 1;
      }
      continue;
    }

    // TS-3B-R1. Only durable, observed meal consumption is eligible. `interpretation` and the
    // meal-record origin are already pinned by the frozen normalizer; `confidenceBasis` is not, so it
    // is checked here — a meal record carrying any other basis is not observed consumption and is
    // not counted. Ratings, corrections, planned meals, searches and recommendation feedback are
    // never `meal_occurrence` behavior and therefore cannot reach this branch at all.
    if (behavior.behaviorKind !== "meal_occurrence") continue;
    if (behavior.interpretation !== "observed") continue;
    if (behavior.evidence.confidenceBasis !== "observed_consumption") continue;
    const target = behavior.evidence.target;
    if (target === null) continue;
    // `consumedRatio` is deliberately not read: the frozen contract normalizes it to 0..1 and
    // attaches no meaning to any particular value, so any threshold here would be an invented
    // product rule. A durable meal occurrence is the unit of evidence.
    //
    // A `branch` target is skipped outright. R1 introduces no branch dimension, and treating a
    // branch reference as a restaurant visit would be an inference this round never authorized.
    if (target.kind === "restaurant") {
      addOccurrence(restaurantOccurrenceIds, target.restaurantId, behavior.evidence.evidenceId);
    } else if (target.kind === "menu_item") {
      addOccurrence(menuItemOccurrenceIds, `${target.restaurantId}::${target.menuItemId}`, behavior.evidence.evidenceId);
    }
  }

  const repeatedRestaurantIds = selectRepeatedTargets(restaurantOccurrenceIds);
  const repeatedMenuItemIds = selectRepeatedTargets(menuItemOccurrenceIds);

  const favoritesState = snapshot.sourceStates.favorites.status;
  const tasteProfileState = snapshot.sourceStates.taste_profile.status;
  const mealsState = snapshot.sourceStates.meals.status;

  return {
    cuisines: cuisines.length ? sortUnique(cuisines) : null,
    dislikedFlavors: dislikedFlavors.length ? sortUnique(dislikedFlavors) : null,
    spice,
    favoriteRestaurantIds: favoriteRestaurantIds.length ? sortUnique(favoriteRestaurantIds) : null,
    favoriteMenuItemIds: favoriteMenuItemIds.length ? sortUnique(favoriteMenuItemIds) : null,
    repeatedRestaurantIds: repeatedRestaurantIds.length ? repeatedRestaurantIds : null,
    repeatedMenuItemIds: repeatedMenuItemIds.length ? repeatedMenuItemIds : null,
    // "Any eligible meal evidence was observed for this identity family", which is what decides
    // whether the fallback dimension exists at all. A family with no meal evidence on either side is
    // omitted from the result entirely, preserving pre-R1 output byte for byte.
    observedMealRestaurants: restaurantOccurrenceIds.size > 0,
    observedMealMenuItems: menuItemOccurrenceIds.size > 0,
    evidenceCount: explicitEvidenceCount + behavioralEvidenceCount,
    explicitEvidenceCount,
    behavioralEvidenceCount,
    hasTasteProfileSource: tasteProfileState === "available" || tasteProfileState === "empty",
    hasFavoritesSource: favoritesState === "available" || favoritesState === "empty",
    hasMealsSource: mealsState === "available" || mealsState === "empty",
    favoritesTruncated: snapshot.evidenceWindow.favorites.truncation !== "not_truncated",
    // Truncation is REPORTED, never acted on. A short window can only under-report repetition, so it
    // must not be converted into a negative assertion about the pair.
    mealsTruncated: snapshot.evidenceWindow.meals.truncation !== "not_truncated"
  };
}

function addOccurrence(index: Map<string, Set<string>>, targetKey: string, evidenceId: string): void {
  const existing = index.get(targetKey);
  if (existing) {
    existing.add(evidenceId);
    return;
  }
  index.set(targetKey, new Set([evidenceId]));
}

// Binary qualification: a target either crossed the repetition boundary or it did not. How far past
// it a target went is deliberately discarded here, which is what makes an occurrence multiplier
// impossible to add downstream without changing this function.
function selectRepeatedTargets(index: Map<string, Set<string>>): readonly string[] {
  const qualifying: string[] = [];
  for (const [targetKey, evidenceIds] of index) {
    if (evidenceIds.size >= MIN_REPEATED_MEAL_OCCURRENCES) qualifying.push(targetKey);
  }
  return sortUnique(qualifying);
}

// Returns null when the dimension is NOT comparable — i.e. at least one side contributed no
// evidence. A returned agreement of 0 means both sides had evidence and shared none.
function compareSets(
  left: readonly string[] | null,
  right: readonly string[] | null
): { agreement: number; intersectionSize: number } | null {
  if (left === null || right === null) return null;
  const rightSet = new Set(right);
  let intersectionSize = 0;
  for (const value of left) {
    if (rightSet.has(value)) intersectionSize += 1;
  }
  const unionSize = new Set([...left, ...right]).size;
  if (unionSize === 0) return null;
  return { agreement: intersectionSize / unionSize, intersectionSize };
}

function buildConfidenceInputs(
  left: TasteProfileSnapshot,
  right: TasteProfileSnapshot,
  leftFacts: TasteFacts,
  rightFacts: TasteFacts,
  comparableDimensionCount: number,
  unknownDimensionCount: number,
  repeated: {
    repeatedBehavioralContribution: number;
    restaurantSuppressedByFavorites: boolean;
    menuItemSuppressedByFavorites: boolean;
  }
): TasteSimilarityConfidenceInputs {
  void left;
  void right;
  // Only repetition that actually entered a comparable dimension counts as behavioural evidence.
  // Suppressed fallback evidence did not contribute to the score and must not inflate the count that
  // decides whether the pair is flagged as thinly evidenced.
  const behavioralEvidenceCount =
    leftFacts.behavioralEvidenceCount + rightFacts.behavioralEvidenceCount + repeated.repeatedBehavioralContribution;
  return {
    comparableDimensionCount,
    unknownDimensionCount,
    evidenceCount:
      leftFacts.evidenceCount + rightFacts.evidenceCount + repeated.repeatedBehavioralContribution,
    explicitEvidenceCount: leftFacts.explicitEvidenceCount + rightFacts.explicitEvidenceCount,
    behavioralEvidenceCount,
    sourceAvailability: {
      tasteProfileAvailableForBoth: leftFacts.hasTasteProfileSource && rightFacts.hasTasteProfileSource,
      favoritesAvailableForBoth: leftFacts.hasFavoritesSource && rightFacts.hasFavoritesSource,
      mealsAvailableForBoth: leftFacts.hasMealsSource && rightFacts.hasMealsSource
    },
    truncation: {
      favoritesTruncatedForEither: leftFacts.favoritesTruncated || rightFacts.favoritesTruncated,
      mealsTruncatedForEither: leftFacts.mealsTruncated || rightFacts.mealsTruncated
    },
    repeatedMealEvidence: {
      qualifyingRestaurantTargets:
        (leftFacts.repeatedRestaurantIds?.length ?? 0) + (rightFacts.repeatedRestaurantIds?.length ?? 0),
      qualifyingMenuItemTargets:
        (leftFacts.repeatedMenuItemIds?.length ?? 0) + (rightFacts.repeatedMenuItemIds?.length ?? 0),
      restaurantSuppressedByFavorites: repeated.restaurantSuppressedByFavorites,
      menuItemSuppressedByFavorites: repeated.menuItemSuppressedByFavorites
    }
  };
}

function emptyConfidenceInputs(): TasteSimilarityConfidenceInputs {
  return {
    comparableDimensionCount: 0,
    unknownDimensionCount: 0,
    evidenceCount: 0,
    explicitEvidenceCount: 0,
    behavioralEvidenceCount: 0,
    sourceAvailability: { tasteProfileAvailableForBoth: false, favoritesAvailableForBoth: false, mealsAvailableForBoth: false },
    truncation: { favoritesTruncatedForEither: false, mealsTruncatedForEither: false },
    repeatedMealEvidence: {
      qualifyingRestaurantTargets: 0,
      qualifyingMenuItemTargets: 0,
      restaurantSuppressedByFavorites: false,
      menuItemSuppressedByFavorites: false
    }
  };
}

// Canonical pair ordering. `subjectUserId` is an opaque normalized id, compared by code unit so the
// result never depends on host locale.
function orderSnapshotPair(
  first: TasteProfileSnapshot,
  second: TasteProfileSnapshot
): readonly [TasteProfileSnapshot, TasteProfileSnapshot] {
  return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];
}

function sortUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}

function freezeDimensions(values: TasteSimilarityDimension[]): readonly TasteSimilarityDimension[] {
  return Object.freeze([...values]);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

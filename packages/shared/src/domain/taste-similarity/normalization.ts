import type {
  BehavioralEvidence,
  BehavioralEvidenceInput,
  FavoriteEvidence,
  MealOccurrenceEvidence,
  RatingEvidence,
  TasteEvidenceMealType
} from "./behavior";
import type {
  CanonicalTasteTargetReference,
  CanonicalTasteTargetReferenceInput,
  KnownOrUnknownValue,
  TasteEvidenceEnvelope,
  TasteEvidenceEnvelopeInput,
  TasteEvidenceOrigin,
  TasteEvidencePrivacyClassification,
  TasteEvidenceSourceRecordKind
} from "./evidence";
import { TasteEvidenceNormalizationError } from "./evidence";
import type { GoalEvidence, GoalEvidenceInput, GoalValidity } from "./goal";
import type { PreferenceEvidence, PreferenceEvidenceInput } from "./preference";
import type {
  KnownRestrictionVisibility,
  RestrictionEvidence,
  RestrictionEvidenceInput,
  RestrictionVisibility
} from "./restriction";

const mealTypes = new Set<TasteEvidenceMealType>(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const restrictionVisibilities = new Set<KnownRestrictionVisibility>(["private", "friends", "public"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type TasteEvidence = PreferenceEvidence | BehavioralEvidence | GoalEvidence | RestrictionEvidence;
export type TasteEvidenceInput = PreferenceEvidenceInput | BehavioralEvidenceInput | GoalEvidenceInput | RestrictionEvidenceInput;

export function normalizeUnicodeText(value: string): string {
  if (typeof value !== "string") throw new TasteEvidenceNormalizationError("Text evidence must be a string.");
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new TasteEvidenceNormalizationError("Text evidence must not be empty.");
  return normalized;
}

export function normalizeOpaqueCanonicalId(value: string): string {
  if (typeof value !== "string") throw new TasteEvidenceNormalizationError("Canonical identifiers must be strings.");
  const normalized = value.trim();
  if (!normalized) throw new TasteEvidenceNormalizationError("Canonical identifiers must not be empty.");
  return normalized;
}

export function normalizeCanonicalTarget(input: CanonicalTasteTargetReferenceInput): CanonicalTasteTargetReference {
  if (!input || typeof input !== "object") throw new TasteEvidenceNormalizationError("Canonical target is required.");
  if (input.kind === "restaurant") {
    return { kind: "restaurant", restaurantId: normalizeOpaqueCanonicalId(input.restaurantId) };
  }
  if (input.kind === "branch") {
    return {
      kind: "branch",
      restaurantId: normalizeOpaqueCanonicalId(input.restaurantId),
      branchId: normalizeOpaqueCanonicalId(input.branchId)
    };
  }
  if (input.kind === "menu_item") {
    const branchId = input.branchId == null ? undefined : normalizeOpaqueCanonicalId(input.branchId);
    return {
      kind: "menu_item",
      restaurantId: normalizeOpaqueCanonicalId(input.restaurantId),
      ...(branchId ? { branchId } : {}),
      menuItemId: normalizeOpaqueCanonicalId(input.menuItemId)
    };
  }
  throw new TasteEvidenceNormalizationError("Canonical target kind is unsupported.");
}

export function normalizeStringSet(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) throw new TasteEvidenceNormalizationError("Evidence values must be an array.");
  return [...new Set(values.map(normalizeUnicodeText))].sort(compareCodeUnits);
}

export function normalizePreferenceEvidence(input: PreferenceEvidenceInput | PreferenceEvidence): PreferenceEvidence {
  assertPreferenceShape(input);
  return {
    category: "preference",
    scope: input.scope,
    facet: input.facet,
    value: normalizeUnicodeText(input.value),
    polarity: input.polarity,
    evidence: normalizeEnvelope(input.evidence, "internal", false) as PreferenceEvidence["evidence"]
  } as PreferenceEvidence;
}

export function normalizeBehavioralEvidence(input: BehavioralEvidenceInput | BehavioralEvidence): BehavioralEvidence {
  if (input.category !== "behavior") throw new TasteEvidenceNormalizationError("Behavior normalizer requires behavior evidence.");
  if (input.behaviorKind === "meal_occurrence") return normalizeMealOccurrence(input);
  if (input.behaviorKind === "favorite") return normalizeFavorite(input);
  if (input.behaviorKind === "rating") return normalizeRating(input);
  throw new TasteEvidenceNormalizationError("Behavior evidence kind is unsupported.");
}

export function normalizeGoalEvidence(input: GoalEvidenceInput | GoalEvidence): GoalEvidence {
  if (input.category !== "goal") throw new TasteEvidenceNormalizationError("Goal normalizer requires goal evidence.");
  if (input.evidence.origin !== "nutrition_goal" || input.evidence.sourceRecordKind !== "nutrition_goal") {
    throw new TasteEvidenceNormalizationError("Goal evidence must use canonical nutrition-goal authority.");
  }
  const validity = normalizeGoalValidity(input.validity);
  if (input.facet === "goal_label") {
    return {
      category: "goal",
      facet: "goal_label",
      value: normalizeUnicodeText(input.value),
      validity,
      evidence: normalizeEnvelope(input.evidence, "internal", false) as GoalEvidence["evidence"]
    };
  }
  const value = normalizeNumber(input.value, 0, Number.POSITIVE_INFINITY, "Goal target");
  const expectedUnit = input.facet === "daily_calories_target" ? "kcal" : "g";
  if (input.unit !== expectedUnit) throw new TasteEvidenceNormalizationError(`Goal target ${input.facet} must use ${expectedUnit}.`);
  return {
    category: "goal",
    facet: input.facet,
    value,
    unit: expectedUnit,
    validity,
    evidence: normalizeEnvelope(input.evidence, "sensitive_internal", false) as GoalEvidence["evidence"]
  };
}

export function normalizeRestrictionEvidence(input: RestrictionEvidenceInput | RestrictionEvidence): RestrictionEvidence {
  if (input.category !== "restriction") throw new TasteEvidenceNormalizationError("Restriction normalizer requires restriction evidence.");
  if (input.evidence.origin !== "dietary_restriction" || input.evidence.sourceRecordKind !== "dietary_restriction") {
    throw new TasteEvidenceNormalizationError("Restriction evidence must use canonical dietary-restriction authority.");
  }
  const rawSeverity = normalizeUnicodeText(input.rawSeverity);
  return {
    category: "restriction",
    restrictionType: normalizeUnicodeText(input.restrictionType),
    label: normalizeUnicodeText(input.label),
    rawSeverity,
    enforcement: rawSeverity === "preference" ? "soft" : "unclassified",
    visibility: normalizeKnownOrUnknown(input.visibility, restrictionVisibilities),
    evidence: normalizeEnvelope(input.evidence, "sensitive_internal", false) as RestrictionEvidence["evidence"]
  };
}

export function normalizeTasteEvidence(input: TasteEvidenceInput | TasteEvidence): TasteEvidence {
  if (input.category === "preference") return normalizePreferenceEvidence(input);
  if (input.category === "behavior") return normalizeBehavioralEvidence(input);
  if (input.category === "goal") return normalizeGoalEvidence(input);
  if (input.category === "restriction") return normalizeRestrictionEvidence(input);
  throw new TasteEvidenceNormalizationError("Taste evidence category is unsupported.");
}

export function normalizeTasteEvidenceList(inputs: readonly (TasteEvidenceInput | TasteEvidence)[]): readonly TasteEvidence[] {
  const byEvidenceId = new Map<string, TasteEvidence>();
  for (const input of inputs) {
    const normalized = normalizeTasteEvidence(input);
    const existing = byEvidenceId.get(normalized.evidence.evidenceId);
    if (existing && stableSerialize(existing) !== stableSerialize(normalized)) {
      throw new TasteEvidenceNormalizationError(`Conflicting evidence shares ID ${normalized.evidence.evidenceId}.`);
    }
    byEvidenceId.set(normalized.evidence.evidenceId, normalized);
  }
  return [...byEvidenceId.values()].sort((left, right) => compareCodeUnits(left.evidence.evidenceId, right.evidence.evidenceId));
}

function normalizeMealOccurrence(input: Extract<BehavioralEvidenceInput | BehavioralEvidence, { behaviorKind: "meal_occurrence" }>): MealOccurrenceEvidence {
  if (input.interpretation !== "observed") throw new TasteEvidenceNormalizationError("Meal occurrence must remain observed behavior.");
  if (input.evidence.origin !== "meal_record" || input.evidence.sourceRecordKind !== "meal_record_item") {
    throw new TasteEvidenceNormalizationError("Meal occurrence must use canonical meal-record authority.");
  }
  const occurredAt = normalizeTimestamp(input.occurredAt, "Meal occurrence time");
  const evidence = normalizeEnvelope(input.evidence, "internal", true);
  if (evidence.recordedAt && evidence.recordedAt !== occurredAt) {
    throw new TasteEvidenceNormalizationError("Meal occurrence and evidence timestamps must agree when both are present.");
  }
  return {
    category: "behavior",
    behaviorKind: "meal_occurrence",
    interpretation: "observed",
    mealType: normalizeKnownOrUnknown(input.mealType, mealTypes),
    occurredAt,
    consumedRatio: normalizeNumber(input.consumedRatio, 0, 1, "Consumed ratio"),
    evidence
  };
}

function normalizeFavorite(input: Extract<BehavioralEvidenceInput | BehavioralEvidence, { behaviorKind: "favorite" }>): FavoriteEvidence {
  if (input.interpretation !== "positive_user_action") throw new TasteEvidenceNormalizationError("Favorite must remain a positive user action.");
  if (input.evidence.origin !== "favorite") {
    throw new TasteEvidenceNormalizationError("Favorite evidence must use canonical Favorites authority.");
  }
  const evidence = normalizeEnvelope(input.evidence, "internal", true);
  if (!evidence.target || evidence.target.kind !== input.favoriteKind) {
    throw new TasteEvidenceNormalizationError("Favorite kind must match its canonical target.");
  }
  if (input.favoriteKind === "restaurant" && input.evidence.sourceRecordKind !== "favorite_restaurant") {
    throw new TasteEvidenceNormalizationError("Restaurant favorite must use canonical restaurant Favorites authority.");
  }
  if (input.favoriteKind === "menu_item" && input.evidence.sourceRecordKind !== "favorite_menu_item") {
    throw new TasteEvidenceNormalizationError("Menu-item favorite must use canonical menu-item Favorites authority.");
  }
  return { ...input, category: "behavior", behaviorKind: "favorite", interpretation: "positive_user_action", evidence } as FavoriteEvidence;
}

function normalizeRating(input: Extract<BehavioralEvidenceInput | BehavioralEvidence, { behaviorKind: "rating" }>): RatingEvidence {
  if (input.interpretation !== "scalar_evaluation_unclassified") {
    throw new TasteEvidenceNormalizationError("Rating thresholds are not part of TS-1.");
  }
  if (input.evidence.origin !== "rating") {
    throw new TasteEvidenceNormalizationError("Rating evidence must use canonical Ratings authority.");
  }
  const evidence = normalizeEnvelope(input.evidence, "sensitive_internal", true);
  const expectedTarget = input.ratingKind === "restaurant" ? "restaurant" : "menu_item";
  const expectedRecord = input.ratingKind === "restaurant" ? "restaurant_rating" : "menu_item_rating";
  if (!evidence.target || evidence.target.kind !== expectedTarget || evidence.sourceRecordKind !== expectedRecord) {
    throw new TasteEvidenceNormalizationError("Rating kind must match its canonical target and Ratings authority.");
  }
  const feedbackInput = input.feedback ?? {};
  return {
    category: "behavior",
    behaviorKind: "rating",
    ratingKind: input.ratingKind,
    interpretation: "scalar_evaluation_unclassified",
    ratingValue: normalizeNumber(input.ratingValue, 0, 5, "Rating"),
    feedback: {
      ...optionalNormalizedField("taste", feedbackInput.taste),
      ...optionalNormalizedField("portion", feedbackInput.portion),
      ...optionalNormalizedField("price", feedbackInput.price),
      ...optionalNormalizedField("repurchase", feedbackInput.repurchase),
      dislikeReasons: normalizeStringSet(feedbackInput.dislikeReasons ?? [])
    },
    evidence: evidence as RatingEvidence["evidence"]
  };
}

function normalizeEnvelope<TOrigin extends TasteEvidenceOrigin, TRecordKind extends TasteEvidenceSourceRecordKind>(
  input: TasteEvidenceEnvelopeInput<TOrigin, TRecordKind> | TasteEvidenceEnvelope<TOrigin, TRecordKind>,
  privacyClassification: TasteEvidencePrivacyClassification,
  allowTarget: boolean
): TasteEvidenceEnvelope<TOrigin, TRecordKind> {
  const target = input.target == null ? null : normalizeCanonicalTarget(input.target);
  if (!allowTarget && target) throw new TasteEvidenceNormalizationError("This evidence category cannot carry a canonical entity target.");
  const sourceConfidence = input.sourceConfidence == null
    ? undefined
    : normalizeNumber(input.sourceConfidence, 0, 1, "Source confidence");
  return {
    evidenceId: normalizeOpaqueCanonicalId(input.evidenceId),
    origin: input.origin,
    sourceRecordKind: input.sourceRecordKind,
    ...optionalTimestampField("recordedAt", input.recordedAt),
    ...optionalTimestampField("updatedAt", input.updatedAt),
    confidenceBasis: input.confidenceBasis,
    ...(sourceConfidence == null ? {} : { sourceConfidence }),
    decayEligibility: input.decayEligibility,
    privacyClassification,
    target
  };
}

function assertPreferenceShape(input: PreferenceEvidenceInput | PreferenceEvidence): void {
  if (input.category !== "preference") throw new TasteEvidenceNormalizationError("Preference normalizer requires preference evidence.");
  const key = `${input.scope}:${input.facet}:${input.polarity}`;
  const allowed = new Set([
    "food_taste:cuisine:positive",
    "food_taste:flavor:negative",
    "food_taste:spice:neutral",
    "food_taste:spice:unclassified",
    "meal_pattern:meal_type:positive",
    "meal_pattern:meal_type:unclassified",
    "dining_context:dining_style:neutral",
    "dining_context:dining_style:unclassified",
    "social_logistics:payment_preference:neutral",
    "social_logistics:payment_preference:unclassified"
  ]);
  if (!allowed.has(key)) throw new TasteEvidenceNormalizationError("Preference scope, facet, and polarity are inconsistent.");
  if (input.evidence.origin !== "explicit_profile" || input.evidence.sourceRecordKind !== "taste_profile") {
    throw new TasteEvidenceNormalizationError("Preference evidence must use the canonical taste profile authority.");
  }
}

function normalizeKnownOrUnknown<TKnown extends string>(
  input: string | KnownOrUnknownValue<TKnown>,
  knownValues: ReadonlySet<TKnown>
): KnownOrUnknownValue<TKnown> {
  const rawValue = typeof input === "string"
    ? normalizeUnicodeText(input)
    : input.classification === "known"
      ? normalizeUnicodeText(input.value)
      : normalizeUnicodeText(input.rawValue);
  return knownValues.has(rawValue as TKnown)
    ? { classification: "known", value: rawValue as TKnown }
    : { classification: "unknown", rawValue };
}

function normalizeGoalValidity(validity: GoalValidity): GoalValidity {
  const startsOn = normalizeDate(validity.startsOn, "Goal start date");
  const endsOn = validity.endsOn == null ? undefined : normalizeDate(validity.endsOn, "Goal end date");
  if (endsOn && endsOn < startsOn) throw new TasteEvidenceNormalizationError("Goal end date must not precede its start date.");
  if (typeof validity.isActive !== "boolean") throw new TasteEvidenceNormalizationError("Goal active state must be boolean.");
  return { startsOn, ...(endsOn ? { endsOn } : {}), isActive: validity.isActive };
}

function normalizeDate(value: string, label: string): string {
  const normalized = normalizeUnicodeText(value);
  if (!datePattern.test(normalized)) throw new TasteEvidenceNormalizationError(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new TasteEvidenceNormalizationError(`${label} is invalid.`);
  }
  return normalized;
}

function normalizeTimestamp(value: string, label: string): string {
  const normalized = normalizeUnicodeText(value);
  if (Number.isNaN(Date.parse(normalized))) throw new TasteEvidenceNormalizationError(`${label} is invalid.`);
  return normalized;
}

function normalizeNumber(value: number, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TasteEvidenceNormalizationError(`${label} is outside its canonical range.`);
  }
  return value;
}

function optionalTimestampField<TKey extends "recordedAt" | "updatedAt">(
  key: TKey,
  value: string | undefined
): Partial<Record<TKey, string>> {
  return value == null ? {} : { [key]: normalizeTimestamp(value, key) } as Record<TKey, string>;
}

function optionalNormalizedField<TKey extends "taste" | "portion" | "price" | "repurchase">(
  key: TKey,
  value: string | null | undefined
): Partial<Record<TKey, string>> {
  return value == null ? {} : { [key]: normalizeUnicodeText(value) } as Record<TKey, string>;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

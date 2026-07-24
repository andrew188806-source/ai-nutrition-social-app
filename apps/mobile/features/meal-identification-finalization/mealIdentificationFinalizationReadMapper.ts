import type {
  MealOccurrenceTimestamp,
  MealRecordTiming,
  MealSourceContext
} from "../meal-identification";

export type MealIdentificationFinalizationTemporalRow = Readonly<{
  contract_version: string;
  source_context: string;
  meal_source_context?: string | null;
  record_timing?: string | null;
  occurred_at?: string | null;
  meal_record_occurred_at: string;
}>;

export type MealIdentificationFinalizationTemporalContext = Readonly<{
  mealSource: MealSourceContext;
  recordTiming: MealRecordTiming;
  occurredAt: MealOccurrenceTimestamp;
  legacySourceContext: string;
}>;

export function mapMealIdentificationFinalizationTemporalContext(
  row: MealIdentificationFinalizationTemporalRow
): MealIdentificationFinalizationTemporalContext {
  const mealSource =
    parseMealSource(row.meal_source_context) ??
    (row.source_context === "post_hoc" ? "unknown" : parseMealSource(row.source_context));
  if (!mealSource) {
    throw new Error("Meal identification finalization meal source is invalid.");
  }

  const recordTiming =
    parseRecordTiming(row.record_timing) ??
    (row.source_context === "post_hoc" ? "post_hoc" : "current");
  const occurredAt = parseTimestamp(row.occurred_at) ?? parseTimestamp(row.meal_record_occurred_at);
  if (!occurredAt) {
    throw new Error("Meal identification finalization actual meal time is invalid.");
  }

  return Object.freeze({
    mealSource,
    recordTiming,
    occurredAt,
    legacySourceContext: row.source_context
  });
}

function parseMealSource(value: unknown): MealSourceContext | null {
  if (
    value === "dine_in" ||
    value === "takeout" ||
    value === "delivery" ||
    value === "self_cooked" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function parseRecordTiming(value: unknown): MealRecordTiming | null {
  return value === "current" || value === "post_hoc" ? value : null;
}

function parseTimestamp(value: unknown): MealOccurrenceTimestamp | null {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}

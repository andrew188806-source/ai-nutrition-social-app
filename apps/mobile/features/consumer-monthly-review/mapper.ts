import {
  MONTHLY_REVIEW_CALCULATION_VERSION,
  MONTHLY_REVIEW_NUTRIENTS,
  type MonthlyNutritionReview,
  type MonthlyReviewMonth,
  type MonthlyReviewNutrient
} from "./types";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function ordinal(monthKey: string): number | null {
  const match = MONTH.exec(monthKey);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function nutrient(value: unknown, itemCount: number, recordedDays: number): MonthlyReviewNutrient | null {
  if (!object(value) || !count(value.validItems) || !count(value.missingItems) || !count(value.invalidItems)) return null;
  if (value.validItems + value.missingItems + value.invalidItems !== itemCount) return null;
  // No usable value => total and average must be null (unknown). A zero would claim "nothing eaten" for data that is missing.
  if (value.validItems === 0) {
    if (value.total !== null || value.averagePerRecordedDay !== null) return null;
    return { total: null, averagePerRecordedDay: null, validItems: 0, missingItems: value.missingItems, invalidItems: value.invalidItems };
  }
  if (!amount(value.total)) return null;
  const average = value.averagePerRecordedDay;
  if (recordedDays === 0 ? average !== null : !amount(average) || Math.abs(average - Math.round((value.total / recordedDays) * 100) / 100) > 0.02) return null;
  return { total: value.total, averagePerRecordedDay: average as number | null, validItems: value.validItems, missingItems: value.missingItems, invalidItems: value.invalidItems };
}

function month(value: unknown): MonthlyReviewMonth | null {
  if (!object(value) || typeof value.monthKey !== "string" || ordinal(value.monthKey) === null || typeof value.inProgress !== "boolean") return null;
  if (value.hasRecords === false) return { monthKey: value.monthKey, inProgress: value.inProgress, hasRecords: false };
  if (value.hasRecords !== true || !count(value.revision) || value.revision < 1 || typeof value.computedAt !== "string" || !INSTANT.test(value.computedAt)) return null;
  if (!count(value.recordedDays) || !count(value.mealCount) || !count(value.itemCount) || value.recordedDays > 31 || value.recordedDays > value.mealCount) return null;
  if (value.mealCount > 0 && value.recordedDays === 0) return null;
  if (value.averageDenominator !== "recorded_days" || !object(value.nutrients)) return null;
  const nutrients = {} as Record<(typeof MONTHLY_REVIEW_NUTRIENTS)[number], MonthlyReviewNutrient>;
  for (const key of MONTHLY_REVIEW_NUTRIENTS) {
    const parsed = nutrient(value.nutrients[key], value.itemCount, value.recordedDays);
    if (!parsed) return null;
    nutrients[key] = parsed;
  }
  return {
    monthKey: value.monthKey, inProgress: value.inProgress, hasRecords: true, revision: value.revision, computedAt: value.computedAt,
    recordedDays: value.recordedDays, mealCount: value.mealCount, itemCount: value.itemCount, nutrients
  };
}

/** Strict: anything unexpected (including any score or grade value) is rejected instead of being shown as a result. */
export function parseMonthlyNutritionReview(value: unknown): MonthlyNutritionReview | null {
  if (!object(value) || value.status !== "ok" || value.calculationVersion !== MONTHLY_REVIEW_CALCULATION_VERSION) return null;
  if (!("score" in value) || value.score !== null || "grade" in value) return null;
  if (typeof value.currentMonth !== "string" || ordinal(value.currentMonth) === null) return null;
  const zone = value.reportTimezone;
  if (!object(zone) || typeof zone.timezone !== "string" || zone.timezone.length === 0 || !count(zone.bindingVersion) || zone.bindingVersion < 1) return null;
  const window = value.window;
  if (!object(window) || window.scope !== "latest_six_months_interface" || window.entitlementWiring !== "not_implemented") return null;
  if (!Array.isArray(value.months) || value.months.length !== 6) return null;
  const end = ordinal(value.currentMonth)!;
  const months: MonthlyReviewMonth[] = [];
  for (let index = 0; index < 6; index += 1) {
    const parsed = month(value.months[index]);
    if (!parsed || ordinal(parsed.monthKey) !== end - 5 + index || parsed.inProgress !== (index === 5)) return null;
    months.push(parsed);
  }
  return {
    calculationVersion: MONTHLY_REVIEW_CALCULATION_VERSION,
    currentMonth: value.currentMonth,
    reportTimezone: { timezone: zone.timezone, bindingVersion: zone.bindingVersion },
    scope: "latest_six_months_interface",
    entitlementWiring: "not_implemented",
    months
  };
}

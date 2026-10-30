// R1-A monthly nutrition review v1 (Owner Q6 phase 1). Owner-private nutrition summary only: no score, grade or health judgement.
export const MONTHLY_REVIEW_CALCULATION_VERSION = "consumer-monthly-review-v1";
export const MONTHLY_REVIEW_NUTRIENTS = ["calories", "protein", "carbohydrates", "fat", "fiber"] as const;
export type MonthlyReviewNutrientKey = (typeof MONTHLY_REVIEW_NUTRIENTS)[number];

export type MonthlyReviewNutrient = {
  /** null when no item of the month has a usable value: unknown, never zero. */
  total: number | null;
  /** total / recordedDays; days without any record are never counted as zero-intake days. null when total is null. */
  averagePerRecordedDay: number | null;
  validItems: number;
  /** Items whose value is absent: excluded, never treated as zero, always disclosed. */
  missingItems: number;
  /** Items whose stored value is not a non-negative number: excluded and disclosed. */
  invalidItems: number;
};

export type MonthlyReviewMonth =
  | { monthKey: string; inProgress: boolean; hasRecords: false }
  | {
      monthKey: string;
      inProgress: boolean;
      hasRecords: true;
      revision: number;
      computedAt: string;
      recordedDays: number;
      mealCount: number;
      itemCount: number;
      nutrients: Record<MonthlyReviewNutrientKey, MonthlyReviewNutrient>;
    };

export type MonthlyNutritionReview = {
  calculationVersion: typeof MONTHLY_REVIEW_CALCULATION_VERSION;
  currentMonth: string;
  reportTimezone: { timezone: string; bindingVersion: number };
  /** The six months are the scope of this interface only, not a Free/Paid retention or display rule. */
  scope: "latest_six_months_interface";
  /** Free/Paid retention, permanent monthly grants and hiding after downgrade are not wired by this package. */
  entitlementWiring: "not_implemented";
  /** Oldest first, exactly six consecutive months ending at currentMonth. */
  months: MonthlyReviewMonth[];
};

export type MonthlyNutritionReviewResult =
  | { status: "ready"; review: MonthlyNutritionReview }
  | { status: "signInRequired" }
  | { status: "coreDenied" }
  | { status: "unavailable"; reason: "transport" | "malformed" | "server" | "configuration" };

export type MonthlyReviewRuntime =
  | { mode: "disabled" }
  | { mode: "live"; service: { getCurrentUserMonthlyReview(): Promise<MonthlyNutritionReviewResult> } }
  | { mode: "misconfigured"; issues: string[] };

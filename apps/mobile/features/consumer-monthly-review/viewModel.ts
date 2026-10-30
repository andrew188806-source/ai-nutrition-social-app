import { monthlyReviewCopy as copy } from "./copy";
import { MONTHLY_REVIEW_NUTRIENTS, type MonthlyNutritionReviewResult } from "./types";

export type MonthlyReviewMonthView = { monthKey: string; badge: string | null; lines: string[]; disclosures: string[] };
export type MonthlyReviewView =
  | { kind: "message"; message: string; retry: boolean }
  | { kind: "review"; months: MonthlyReviewMonthView[]; notes: string[] };

function format(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** Pure presentation. Newest month first. Every average is shown next to the recorded-day count it was divided by. */
export function toMonthlyReviewView(result: MonthlyNutritionReviewResult | null): MonthlyReviewView {
  if (result === null) return { kind: "message", message: copy.loading, retry: false };
  if (result.status === "signInRequired") return { kind: "message", message: copy.signInRequired, retry: false };
  if (result.status === "coreDenied") return { kind: "message", message: copy.coreDenied, retry: false };
  if (result.status === "unavailable") return { kind: "message", message: copy.unavailable, retry: true };
  const months = [...result.review.months].reverse().map((month): MonthlyReviewMonthView => {
    const badge = month.inProgress ? copy.inProgress : null;
    // A stored month whose records were all removed later keeps its row (and revision) but has nothing to summarise.
    if (!month.hasRecords || month.mealCount === 0) return { monthKey: month.monthKey, badge, lines: [copy.noRecords], disclosures: [] };
    const lines = [copy.recorded(month.recordedDays, month.mealCount)];
    const disclosures: string[] = [];
    for (const key of MONTHLY_REVIEW_NUTRIENTS) {
      const value = month.nutrients[key];
      const label = copy.nutrientLabel[key];
      lines.push(value.total === null
        ? copy.nutrientUnknown(label)
        : copy.nutrientLine(label, format(value.total), value.averagePerRecordedDay === null ? null : format(value.averagePerRecordedDay), copy.nutrientUnit[key], month.recordedDays));
      if (value.missingItems > 0 || value.invalidItems > 0) disclosures.push(copy.disclosure(label, value.missingItems, value.invalidItems));
    }
    return { monthKey: month.monthKey, badge, lines, disclosures };
  });
  return { kind: "review", months, notes: [copy.averageNote, copy.timezoneNote(result.review.reportTimezone.timezone), copy.scopeNote] };
}

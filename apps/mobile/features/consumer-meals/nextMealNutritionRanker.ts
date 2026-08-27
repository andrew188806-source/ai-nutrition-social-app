import type { ConsumerNutritionGoalRow } from "../consumer-taste-profile/types";
import { resolveNutritionRankingPolicy } from "./nutritionRankingPolicy";
import {
  CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS,
  type ConsumerNextMealCandidate,
  type ConsumerNextMealNutritionDimension,
  type ConsumerNextMealNutritionRankingInput,
  type ConsumerNextMealNutritionValues,
  type ConsumerNextMealRankingSummary,
  type NutritionRankingPolicy
} from "./types";

const SCORE_PRECISION = 1_000_000_000_000;

export type ConsumerNextMealNutritionRankResult = Readonly<{
  candidates: readonly ConsumerNextMealCandidate[];
  ranking: ConsumerNextMealRankingSummary;
}>;

/**
 * Resolves the single canonical goal row that is active for the requested local date.
 * The database permits null scalar targets and guarantees at most one is_active row per user.
 * A missing, ambiguous, invalid, zero or negative target is not converted to a fabricated value.
 */
export function resolveActiveDailyNutritionGoals(
  rows: readonly ConsumerNutritionGoalRow[],
  date: string
): ConsumerNextMealNutritionValues | null {
  if (!isDateKey(date)) return null;
  const currentRows = rows.filter((row) =>
    row.is_active === true
    && isDateKey(row.starts_on)
    && row.starts_on <= date
    && (row.ends_on === null || (isDateKey(row.ends_on) && row.ends_on >= date))
  );
  if (currentRows.length !== 1) return null;

  const row = currentRows[0];
  const goals: ConsumerNextMealNutritionValues = {};
  assignPositive(goals, "calories", row.daily_calories_target);
  assignPositive(goals, "protein", row.protein_target_g);
  assignPositive(goals, "carbohydrates", row.carbohydrates_target_g);
  assignPositive(goals, "fat", row.fat_target_g);
  assignPositive(goals, "fiber", row.fiber_target_g);
  return Object.keys(goals).length > 0 ? Object.freeze(goals) : null;
}

/**
 * Applies the ACTIVE nutrition ranking policy. Per dimension the score is the remaining deficit the
 * candidate closes, minus only the new overage it creates, each normalized by that dimension's own
 * daily goal and combined by the policy's weights. Missing dimensions are omitted from that
 * candidate's weighted average rather than counted as zero. No score, weight or raw goal value
 * leaves this pure contract — only the applied policy's identity does.
 *
 * The formula lives here; WHICH dimensions and HOW MUCH each counts live in the policy, so this
 * function is never the place a future weighting decision has to be edited.
 */
export function rankNextMealCandidatesByNutrition(
  candidates: readonly ConsumerNextMealCandidate[],
  input: ConsumerNextMealNutritionRankingInput | null,
  policyCandidate?: NutritionRankingPolicy
): ConsumerNextMealNutritionRankResult {
  const policy = resolveNutritionRankingPolicy(policyCandidate);
  const scored = candidates.map((candidate) => scoreCandidate(candidate, input, policy));
  const usableNutritionDimensions = CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS.filter((dimension) =>
    scored.some((entry) => entry.usableDimensions.includes(dimension))
  );
  const gapAware = input !== null && usableNutritionDimensions.length > 0;

  const ordered = [...scored].sort((left, right) =>
    (gapAware ? right.score - left.score : 0)
    || left.candidate.candidateId.localeCompare(right.candidate.candidateId)
  );

  return Object.freeze({
    candidates: Object.freeze(ordered.map((entry, index) => {
      const candidateUsesNutrition = gapAware && entry.usableDimensions.length > 0;
      return Object.freeze({
        ...entry.candidate,
        reason: Object.freeze({
          reasonBasis: candidateUsesNutrition ? "nutrition_gap" as const : "neutral_nutrition_fallback" as const,
          reasonSummary: candidateUsesNutrition
            ? index === 0
              ? "依今日剩餘營養缺口排序最合適的選項。"
              : "依今日剩餘營養缺口排序的替代選項。"
            : "目前缺少可用的目標或餐點營養維度，使用穩定中性排序。"
        }),
        rankOrdinal: index
      });
    })),
    ranking: Object.freeze({
      rankingMode: gapAware ? "nutrition_gap" as const : "neutral_fallback" as const,
      nutritionGoalsApplied: gapAware,
      todayIntakeApplied: gapAware,
      usableNutritionDimensions: Object.freeze(usableNutritionDimensions),
      appliedPolicyId: policy.policyId,
      appliedPolicyVersion: policy.policyVersion
    })
  });
}

function scoreCandidate(
  candidate: ConsumerNextMealCandidate,
  input: ConsumerNextMealNutritionRankingInput | null,
  policy: NutritionRankingPolicy
): Readonly<{
  candidate: ConsumerNextMealCandidate;
  score: number;
  usableDimensions: readonly ConsumerNextMealNutritionDimension[];
}> {
  if (!input) return Object.freeze({ candidate, score: 0, usableDimensions: Object.freeze([]) });

  let weightedTotal = 0;
  let weightTotal = 0;
  const usableDimensions: ConsumerNextMealNutritionDimension[] = [];
  // Only the dimensions the ACTIVE POLICY enables are considered. A dimension the policy omits is
  // not ranked on at all, which is how a future policy narrows or widens the formula without a
  // code change here.
  for (const entry of policy.dimensions) {
    const dimension = entry.dimension;
    const goal = positive(input.dailyGoals[dimension]);
    const consumed = nonNegative(input.consumedTotals[dimension]);
    const candidateValue = nonNegative(candidate.nutrition[dimension]);
    if (goal === null || consumed === null || candidateValue === null) continue;

    const remainingGap = Math.max(goal - consumed, 0);
    const improvement = Math.min(candidateValue, remainingGap) / goal;
    const existingOverage = Math.max(consumed - goal, 0);
    const resultingOverage = Math.max(consumed + candidateValue - goal, 0);
    const addedOveragePenalty = ((resultingOverage - existingOverage) / goal) * entry.overagePenaltyWeight;
    weightedTotal += (improvement - addedOveragePenalty) * entry.weight;
    weightTotal += entry.weight;
    usableDimensions.push(dimension);
  }

  const rawScore = weightTotal > 0 ? weightedTotal / weightTotal : 0;
  const score = Math.round(rawScore * SCORE_PRECISION) / SCORE_PRECISION;
  return Object.freeze({
    candidate,
    score: Number.isFinite(score) ? score : 0,
    usableDimensions: Object.freeze(usableDimensions)
  });
}

function assignPositive(
  target: ConsumerNextMealNutritionValues,
  dimension: ConsumerNextMealNutritionDimension,
  value: number | null
) {
  const normalized = positive(value);
  if (normalized !== null) target[dimension] = normalized;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

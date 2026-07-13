import {
  ConsumerAuthError,
  ConsumerDailySummaryNotFoundError
} from "../../consumer-auth/errors";
import { err } from "../../consumer-auth/types";
import { calculateDailyNutritionSummary } from "../dailyNutritionSummaryCalculator";
import { MockConsumerMealRecordsRepository } from "./mockConsumerMealRecordsRepository";
import type {
  ConsumerDailyNutritionSummaryReadInput,
  ConsumerDailyNutritionSummaryRepository
} from "../types";

export class MockConsumerDailyNutritionSummaryRepository implements ConsumerDailyNutritionSummaryRepository {
  readonly source = "mock" as const;

  async getCurrentUserDailyNutritionSummary(input: ConsumerDailyNutritionSummaryReadInput) {
    try {
      const mealRepository = new MockConsumerMealRecordsRepository();
      const records = await mealRepository.listCurrentUserMealRecords({
        startDate: input.summaryDate,
        endDate: input.summaryDate,
        limit: 100
      });
      if (!records.ok) return err(records.error);
      if (records.value.length === 0) return err(new ConsumerDailySummaryNotFoundError());
      return calculateDailyNutritionSummary({
        summaryDate: input.summaryDate,
        timezone: input.timezone,
        calculatedAt: "2026-07-13T00:00:00.000Z",
        mealRecords: records.value
      });
    } catch (error) {
      if (error instanceof ConsumerAuthError) return err(error);
      return err(new ConsumerDailySummaryNotFoundError("Mock daily nutrition summary could not be calculated."));
    }
  }
}

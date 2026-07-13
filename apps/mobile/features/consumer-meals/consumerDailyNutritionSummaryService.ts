import { ConsumerDailySummaryInvalidDateError } from "../consumer-auth/errors";
import { err } from "../consumer-auth/types";
import type {
  ConsumerDailyNutritionSummaryReadInput,
  ConsumerDailyNutritionSummaryRepository
} from "./types";

export type ConsumerDailyNutritionSummaryServiceOptions = {
  repository: ConsumerDailyNutritionSummaryRepository;
};

export class ConsumerDailyNutritionSummaryService {
  constructor(private readonly options: ConsumerDailyNutritionSummaryServiceOptions) {}

  getCurrentUserDailyNutritionSummary(input: ConsumerDailyNutritionSummaryReadInput) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.summaryDate)) {
      return Promise.resolve(err(new ConsumerDailySummaryInvalidDateError()));
    }
    return this.options.repository.getCurrentUserDailyNutritionSummary(input);
  }
}

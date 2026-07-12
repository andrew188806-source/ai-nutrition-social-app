import { ConsumerMealRecordMappingFailedError } from "../../consumer-auth/errors";
import { err, ok } from "../../consumer-auth/types";
import { getMealRecords } from "../../analysis/analysisMealRecordStore";
import { mapSavedMealRecordToConsumerMealRecord } from "../mockMealMappers";
import { resolveMealReadRange } from "../readRange";
import type { ConsumerMealReadInput, ConsumerMealRecordsRepository } from "../types";

export class MockConsumerMealRecordsRepository implements ConsumerMealRecordsRepository {
  readonly source = "mock" as const;

  async listCurrentUserMealRecords(input: ConsumerMealReadInput = {}) {
    try {
      const range = resolveMealReadRange(input);
      const records = getMealRecords()
        .map(mapSavedMealRecordToConsumerMealRecord)
        .filter((record) => record.mealDate >= range.startDate && record.mealDate <= range.endDate)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, range.limit);
      return ok(records);
    } catch (error) {
      if (error instanceof ConsumerMealRecordMappingFailedError) return err(error);
      if (error instanceof Error && "code" in error) return err(error as never);
      return err(new ConsumerMealRecordMappingFailedError("Mock meal records could not be mapped."));
    }
  }
}

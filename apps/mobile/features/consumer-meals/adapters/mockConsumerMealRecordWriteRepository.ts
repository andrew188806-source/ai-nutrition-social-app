import {
  ConsumerAuthError,
  ConsumerMealWriteAuthenticationRequiredError,
  ConsumerMealWriteMappingFailedError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err, ok } from "../../consumer-auth/types";
import { buildConsumerMealRecordFromValidatedInput } from "../mealWriteMappers";
import type {
  ConsumerCreateMealRecordInput,
  ConsumerMealRecord,
  ConsumerMealRecordWriteRepository
} from "../types";
import { validateCreateMealRecordInput } from "../writeValidation";

export type MockConsumerMealRecordWriteRepositoryOptions = {
  authPort: ConsumerAuthPort;
  now?: () => string;
};

export class MockConsumerMealRecordWriteRepository implements ConsumerMealRecordWriteRepository {
  readonly source = "mock" as const;
  private sequence = 0;
  private readonly createdRecords: ConsumerMealRecord[] = [];

  constructor(private readonly options: MockConsumerMealRecordWriteRepositoryOptions) {}

  async createCurrentUserMealRecord(input: ConsumerCreateMealRecordInput) {
    try {
      const session = await this.options.authPort.getCurrentSession();
      if (!session.ok) return err(session.error);
      if (!session.value) return err(new ConsumerMealWriteAuthenticationRequiredError());
      const validated = validateCreateMealRecordInput(input);
      this.sequence += 1;
      const idSuffix = String(this.sequence).padStart(4, "0");
      const now = this.options.now?.() ?? new Date().toISOString();
      const record = buildConsumerMealRecordFromValidatedInput(validated, {
        mealRecordId: `mock-meal-write-${idSuffix}`,
        itemIdForIndex: (index) => `mock-meal-write-${idSuffix}-item-${String(index + 1).padStart(2, "0")}`,
        now
      });
      this.createdRecords.push(record);
      return ok(record);
    } catch (error) {
      if (error instanceof ConsumerAuthError) return err(error);
      return err(new ConsumerMealWriteMappingFailedError("Mock meal write could not create a canonical record."));
    }
  }

  listCreatedMealRecordsForTest() {
    return [...this.createdRecords];
  }
}

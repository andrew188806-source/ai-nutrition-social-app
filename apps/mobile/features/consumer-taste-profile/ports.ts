import type {
  ConsumerDietaryRestrictionRow,
  ConsumerNutritionGoalRow,
  ConsumerTasteFoundationReadResult,
  ConsumerTasteFoundationSource,
  ConsumerTasteProfileRow
} from "./types";

export interface ConsumerTasteFoundationRepository {
  readonly source: ConsumerTasteFoundationSource;
  readCurrentUserTasteProfile(): Promise<ConsumerTasteFoundationReadResult<ConsumerTasteProfileRow>>;
  readCurrentUserNutritionGoals(): Promise<ConsumerTasteFoundationReadResult<ConsumerNutritionGoalRow>>;
  readCurrentUserDietaryRestrictions(): Promise<ConsumerTasteFoundationReadResult<ConsumerDietaryRestrictionRow>>;
}

export interface PreparedConsumerTasteFoundationClientLike {
  from(table: string): unknown;
}

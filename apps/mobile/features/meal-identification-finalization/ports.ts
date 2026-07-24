import type {
  ConsumerMealIdentificationFinalizationResult,
  ConsumerMealIdentificationFinalizationSource,
  FinalizeCurrentUserMealIdentificationInput
} from "./types";

export interface ConsumerMealIdentificationFinalizationRepository {
  readonly source: ConsumerMealIdentificationFinalizationSource;
  finalizeCurrentUserMealIdentification(
    input: FinalizeCurrentUserMealIdentificationInput
  ): Promise<ConsumerMealIdentificationFinalizationResult>;
}

import type {
  ConsumerMealCorrectionReadInput,
  ConsumerMealCorrectionReadResult,
  ConsumerMealCorrectionRepository,
  ConsumerMealCorrectionSource
} from "../types";

export class DisabledConsumerMealCorrectionRepository implements ConsumerMealCorrectionRepository {
  readonly source: ConsumerMealCorrectionSource = "disabled";

  async getCurrentUserMealCorrectionOverview(_input: ConsumerMealCorrectionReadInput): Promise<ConsumerMealCorrectionReadResult> {
    return { status: "disabled", correctionReadSource: this.source };
  }
}

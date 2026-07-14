import type { ConsumerMealCorrectionReadInput, ConsumerMealCorrectionReadResult, ConsumerMealCorrectionRepository } from "./types";

export type ConsumerMealCorrectionServiceOptions = {
  repository: ConsumerMealCorrectionRepository;
};

export class ConsumerMealCorrectionService {
  constructor(private readonly options: ConsumerMealCorrectionServiceOptions) {}

  getCurrentUserMealCorrectionOverview(input: ConsumerMealCorrectionReadInput): Promise<ConsumerMealCorrectionReadResult> {
    return this.options.repository.getCurrentUserMealCorrectionOverview(input);
  }
}

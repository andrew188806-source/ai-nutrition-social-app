import type { ConsumerMealReadInput, ConsumerMealRecordsRepository } from "./types";

export type ConsumerMealRecordsServiceOptions = {
  repository: ConsumerMealRecordsRepository;
};

export class ConsumerMealRecordsService {
  constructor(private readonly options: ConsumerMealRecordsServiceOptions) {}

  listCurrentUserMealRecords(input: ConsumerMealReadInput = {}) {
    return this.options.repository.listCurrentUserMealRecords(input);
  }
}

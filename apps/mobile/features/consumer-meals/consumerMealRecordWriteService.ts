import type {
  ConsumerCreateMealRecordInput,
  ConsumerMealRecordWriteRepository
} from "./types";

export type ConsumerMealRecordWriteServiceOptions = {
  repository: ConsumerMealRecordWriteRepository;
};

export class ConsumerMealRecordWriteService {
  constructor(private readonly options: ConsumerMealRecordWriteServiceOptions) {}

  createCurrentUserMealRecord(input: ConsumerCreateMealRecordInput) {
    return this.options.repository.createCurrentUserMealRecord(input);
  }
}

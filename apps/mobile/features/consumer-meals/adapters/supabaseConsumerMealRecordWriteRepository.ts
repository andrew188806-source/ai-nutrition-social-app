import {
  ConsumerMealWriteAtomicityNotSupportedError,
  ConsumerMealWriteAuthenticationRequiredError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err } from "../../consumer-auth/types";
import type {
  ConsumerCreateMealRecordInput,
  ConsumerMealRecordWriteRepository
} from "../types";
import { validateCreateMealRecordInput } from "../writeValidation";

export type SupabaseConsumerMealRecordWriteRepositoryOptions = {
  authPort: ConsumerAuthPort;
};

export class SupabaseConsumerMealRecordWriteRepository implements ConsumerMealRecordWriteRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseConsumerMealRecordWriteRepositoryOptions) {}

  async createCurrentUserMealRecord(input: ConsumerCreateMealRecordInput) {
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok) return err(session.error);
    if (!session.value) return err(new ConsumerMealWriteAuthenticationRequiredError());
    validateCreateMealRecordInput(input);
    return err(new ConsumerMealWriteAtomicityNotSupportedError());
  }
}

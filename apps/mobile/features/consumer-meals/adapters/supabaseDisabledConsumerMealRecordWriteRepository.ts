import { ConsumerMealWriteDisabledError } from "../../consumer-auth/errors";
import { err } from "../../consumer-auth/types";
import type {
  ConsumerCreateMealRecordInput,
  ConsumerMealRecordWriteRepository
} from "../types";

export class SupabaseDisabledConsumerMealRecordWriteRepository implements ConsumerMealRecordWriteRepository {
  readonly source = "supabase-disabled" as const;

  async createCurrentUserMealRecord(_input: ConsumerCreateMealRecordInput) {
    return err(new ConsumerMealWriteDisabledError());
  }
}

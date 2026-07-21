import { ConsumerMealWriteDisabledError } from "../../consumer-auth/errors";
import { err } from "../../consumer-auth/types";
import type { ConsumerPlannedMealV2Repository } from "../types";

export class SupabaseDisabledConsumerPlannedMealV2Repository implements ConsumerPlannedMealV2Repository {
  readonly source = "disabled" as const;
  async create(_input: Parameters<ConsumerPlannedMealV2Repository["create"]>[0]) { return err(new ConsumerMealWriteDisabledError()); }
  async update(_input: Parameters<ConsumerPlannedMealV2Repository["update"]>[0]) { return err(new ConsumerMealWriteDisabledError()); }
  async cancel(_input: Parameters<ConsumerPlannedMealV2Repository["cancel"]>[0]) { return err(new ConsumerMealWriteDisabledError()); }
  async convert(_input: Parameters<ConsumerPlannedMealV2Repository["convert"]>[0]) { return err(new ConsumerMealWriteDisabledError()); }
}

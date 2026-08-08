import type { ConsumerTasteFoundationRepository, PreparedConsumerTasteFoundationClientLike } from "../ports";
import type { ConsumerTasteFoundationReadResult } from "../types";

const deferred = (): ConsumerTasteFoundationReadResult<never> => ({
  status: "deferred",
  reason: "acl_activation_pending"
});

export class PreparedSupabaseConsumerTasteFoundationRepository implements ConsumerTasteFoundationRepository {
  readonly source = "supabase-prepared" as const;

  constructor(private readonly existingClient?: PreparedConsumerTasteFoundationClientLike) {}

  async readCurrentUserTasteProfile() {
    void this.existingClient;
    return deferred();
  }

  async readCurrentUserNutritionGoals() {
    void this.existingClient;
    return deferred();
  }

  async readCurrentUserDietaryRestrictions() {
    void this.existingClient;
    return deferred();
  }
}

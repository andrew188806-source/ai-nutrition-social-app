import { ConsumerAuthOperationNotEnabledError, ConsumerProfileWriteNotEnabledError } from "../errors";
import type { ConsumerProfileRepository } from "../ports";
import type { ConsumerProfileBootstrapInput, ConsumerProfileUpdateInput } from "../types";
import { err, ok } from "../types";

export class SupabaseDisabledConsumerProfileRepository implements ConsumerProfileRepository {
  readonly source = "supabase-disabled" as const;

  async getProfile(_userId: string) {
    return ok(null);
  }

  async getPrivateProfile(_userId: string) {
    return ok(null);
  }

  async bootstrapProfile(_input: ConsumerProfileBootstrapInput) {
    return err(new ConsumerProfileWriteNotEnabledError("Consumer profile bootstrap writes are disabled in Consumer Phase 1A."));
  }

  async updateProfile(_userId: string, _input: ConsumerProfileUpdateInput) {
    return err(new ConsumerProfileWriteNotEnabledError("Consumer profile writes are disabled in Consumer Phase 1A."));
  }

  async markOnboardingComplete(_userId: string) {
    return err(new ConsumerProfileWriteNotEnabledError("Consumer profile writes are disabled in Consumer Phase 1A."));
  }

  async getAccountLifecycleStatus(_userId: string) {
    return err(new ConsumerAuthOperationNotEnabledError("Consumer profile reads are disabled until a Supabase profile transport exists."));
  }
}
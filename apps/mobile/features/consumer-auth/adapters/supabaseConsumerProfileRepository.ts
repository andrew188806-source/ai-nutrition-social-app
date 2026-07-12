import {
  ConsumerProfileConfigurationInvalidError,
  ConsumerProfileMappingFailedError,
  ConsumerProfileNotFoundError,
  ConsumerProfileSessionExpiredError,
  ConsumerProfileSessionMissingError,
  ConsumerProfileSourceUnavailableError,
  ConsumerProfileTransportFailedError,
  ConsumerProfileUnauthorizedError,
  ConsumerProfileWriteNotEnabledError,
  ConsumerSessionExpiredError
} from "../errors";
import type { ConsumerAuthPort, ConsumerProfileRepository } from "../ports";
import type { ConsumerProfileBootstrapInput, ConsumerProfileUpdateInput } from "../types";
import { err, ok } from "../types";
import { mapSupabaseProfileRowToConsumerProfile } from "../supabaseProfileMappers";
import {
  SUPABASE_CONSUMER_PROFILE_SELECT_COLUMNS,
  SUPABASE_CONSUMER_PROFILE_TABLE,
  type SupabaseConsumerProfileClientLike,
  type SupabasePostgrestErrorLike
} from "../supabaseProfileContracts";

export type SupabaseConsumerProfileRepositoryOptions = {
  authPort: ConsumerAuthPort;
  profileClient: SupabaseConsumerProfileClientLike;
  readEnabled: boolean;
};

export class SupabaseConsumerProfileRepository implements ConsumerProfileRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseConsumerProfileRepositoryOptions) {}

  async getCurrentProfile() {
    if (!this.options.readEnabled) return err(new ConsumerProfileSourceUnavailableError("Consumer live profile reads are disabled by feature flag."));
    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok) {
      if (sessionResult.error instanceof ConsumerSessionExpiredError || sessionResult.error.code === "session_expired") {
        return err(new ConsumerProfileSessionExpiredError());
      }
      return err(new ConsumerProfileUnauthorizedError("Current auth session could not be verified for profile read."));
    }
    const session = sessionResult.value;
    if (!session) return err(new ConsumerProfileSessionMissingError());
    const userId = session.user.userId;

    try {
      const response = await this.options.profileClient
        .from(SUPABASE_CONSUMER_PROFILE_TABLE)
        .select(SUPABASE_CONSUMER_PROFILE_SELECT_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      if (response.error) return err(mapProfileTransportError(response.error));
      if (!response.data) return err(new ConsumerProfileNotFoundError("Authenticated consumer profile was not found."));
      return ok(mapSupabaseProfileRowToConsumerProfile(response.data, userId));
    } catch (error) {
      if (error instanceof ConsumerProfileMappingFailedError) return err(error);
      return err(new ConsumerProfileTransportFailedError("Consumer live profile transport threw before a row could be mapped."));
    }
  }

  async getProfile(_userId: string) {
    return err(new ConsumerProfileSourceUnavailableError("Live profile reads must use getCurrentProfile() and the authenticated session user."));
  }

  async getPrivateProfile(_userId: string) {
    return err(new ConsumerProfileSourceUnavailableError("Private profile live reads are outside Consumer Phase 1D."));
  }

  async bootstrapProfile(_input: ConsumerProfileBootstrapInput) {
    return err(new ConsumerProfileWriteNotEnabledError("Consumer profile bootstrap writes are disabled in Consumer Phase 1D."));
  }

  async updateProfile(_userId: string, _input: ConsumerProfileUpdateInput) {
    return err(new ConsumerProfileWriteNotEnabledError("Consumer profile writes are disabled in Consumer Phase 1D."));
  }

  async markOnboardingComplete(_userId: string) {
    return err(new ConsumerProfileWriteNotEnabledError("Consumer profile writes are disabled in Consumer Phase 1D."));
  }

  async getAccountLifecycleStatus(_userId: string) {
    const profileResult = await this.getCurrentProfile();
    if (!profileResult.ok) return err(profileResult.error);
    return ok(profileResult.value.lifecycleStatus);
  }
}

function mapProfileTransportError(error: SupabasePostgrestErrorLike) {
  if (error.status === 401 || error.status === 403) return new ConsumerProfileUnauthorizedError();
  if (error.status === 404 || error.code === "PGRST116") return new ConsumerProfileNotFoundError("Authenticated consumer profile was not found.");
  if (error.message?.toLowerCase().includes("configuration")) return new ConsumerProfileConfigurationInvalidError("Consumer live profile configuration is invalid.");
  return new ConsumerProfileTransportFailedError("Consumer live profile read failed.");
}

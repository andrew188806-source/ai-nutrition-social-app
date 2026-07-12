import { ConsumerAccountDisabledError, ConsumerAuthenticationRequiredError, ConsumerProfileMappingError, ConsumerProfileWriteNotEnabledError } from "./errors";
import type { ConsumerAuthPort, ConsumerProfileRepository } from "./ports";
import type { ConsumerAuthResult, ConsumerProfileBootstrapInput, ConsumerProfileBootstrapResult } from "./types";
import { err } from "./types";
import { isClosedLifecycle } from "./adapters/mockConsumerProfileRepository";

export type ConsumerProfileBootstrapServiceOptions = {
  authPort: ConsumerAuthPort;
  profileRepository: ConsumerProfileRepository;
  allowMockBootstrap: boolean;
  allowSupabaseWrites: boolean;
};

export class ConsumerProfileBootstrapService {
  private readonly authPort: ConsumerAuthPort;
  private readonly profileRepository: ConsumerProfileRepository;
  private readonly allowMockBootstrap: boolean;
  private readonly allowSupabaseWrites: boolean;

  constructor(options: ConsumerProfileBootstrapServiceOptions) {
    this.authPort = options.authPort;
    this.profileRepository = options.profileRepository;
    this.allowMockBootstrap = options.allowMockBootstrap;
    this.allowSupabaseWrites = options.allowSupabaseWrites;
  }

  async ensureProfile(input: Omit<ConsumerProfileBootstrapInput, "userId"> & { userId?: string } = {}): Promise<ConsumerAuthResult<ConsumerProfileBootstrapResult>> {
    const sessionResult = await this.authPort.getCurrentSession();
    if (!sessionResult.ok) return err(sessionResult.error);
    const session = sessionResult.value;
    if (!session) return err(new ConsumerAuthenticationRequiredError());

    const userId = input.userId ?? session.user.userId;
    if (userId !== session.user.userId) {
      return err(new ConsumerProfileMappingError("Profile bootstrap userId must match the authenticated session."));
    }

    const statusResult = await this.profileRepository.getAccountLifecycleStatus(userId);
    if (statusResult.ok && isClosedLifecycle(statusResult.value)) {
      return err(new ConsumerAccountDisabledError(`Consumer account lifecycle status is ${statusResult.value}.`));
    }

    const profileResult = await this.profileRepository.getProfile(userId);
    if (!profileResult.ok) return err(profileResult.error);
    if (profileResult.value) return { ok: true, value: { profile: profileResult.value, created: false, requestId: input.requestId } };

    if (this.profileRepository.source === "mock" && this.allowMockBootstrap) {
      return this.profileRepository.bootstrapProfile({
        userId,
        displayName: input.displayName,
        locale: input.locale,
        timezone: input.timezone,
        requestId: input.requestId
      });
    }

    if (!this.allowSupabaseWrites) {
      return err(new ConsumerProfileWriteNotEnabledError());
    }

    return this.profileRepository.bootstrapProfile({
      userId,
      displayName: input.displayName,
      locale: input.locale,
      timezone: input.timezone,
      requestId: input.requestId
    });
  }
}
import {
  ConsumerAccountDisabledError,
  ConsumerProfileMappingError,
  ConsumerProfileNotFoundError,
  ConsumerProfileSessionExpiredError,
  ConsumerProfileSessionMissingError,
  ConsumerSessionExpiredError
} from "./errors";
import type { ConsumerAuthPort, ConsumerProfileRepository } from "./ports";
import type { ConsumerAuthResult, ConsumerProfile } from "./types";
import { err } from "./types";
import { isClosedLifecycle } from "./adapters/mockConsumerProfileRepository";

type CurrentProfileRepository = ConsumerProfileRepository & {
  getCurrentProfile?: () => Promise<ConsumerAuthResult<ConsumerProfile>>;
};

export type ConsumerProfileServiceOptions = {
  authPort: ConsumerAuthPort;
  profileRepository: CurrentProfileRepository;
};

export class ConsumerProfileService {
  constructor(private readonly options: ConsumerProfileServiceOptions) {}

  async getCurrentProfile(): Promise<ConsumerAuthResult<ConsumerProfile>> {
    if (this.options.profileRepository.getCurrentProfile) {
      const current = await this.options.profileRepository.getCurrentProfile();
      return this.validateProfileState(current);
    }

    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok) {
      if (session.error instanceof ConsumerSessionExpiredError || session.error.code === "session_expired") return err(new ConsumerProfileSessionExpiredError());
      return err(session.error);
    }
    if (!session.value) return err(new ConsumerProfileSessionMissingError());
    const profile = await this.options.profileRepository.getProfile(session.value.user.userId);
    if (!profile.ok) return profile;
    if (!profile.value) return err(new ConsumerProfileNotFoundError());
    return this.validateProfileState({ ok: true, value: profile.value });
  }

  private validateProfileState(result: ConsumerAuthResult<ConsumerProfile>): ConsumerAuthResult<ConsumerProfile> {
    if (!result.ok) return result;
    if (isClosedLifecycle(result.value.lifecycleStatus)) return err(new ConsumerAccountDisabledError());
    if (!result.value.profileId || !result.value.userId) return err(new ConsumerProfileMappingError("Current profile is missing canonical identity."));
    return result;
  }
}

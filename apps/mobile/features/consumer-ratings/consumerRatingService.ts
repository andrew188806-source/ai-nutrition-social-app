import type { ConsumerAuthPort } from "../consumer-auth/ports";
import {
  ConsumerRatingAuthenticationFailedError,
  ConsumerRatingAuthenticationRequiredError,
  ConsumerRatingReadFailedError,
  ConsumerRatingWriteFailedError,
  type ConsumerRatingRuntimeError
} from "./errors";
import type { ConsumerRatingReadRepository, ConsumerRatingWriteRepository } from "./ports";
import type {
  ConsumerCreateOrReplaceRatingInput,
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRestaurantRatingRecord,
  ConsumerMenuItemRatingLookup,
  ConsumerRatingListResult,
  ConsumerRatingReadResult,
  ConsumerRatingWriteResult,
  ConsumerRestaurantRatingLookup
} from "./types";
import {
  validateCreateOrReplaceRatingInput,
  validateMenuItemRatingLookup,
  validateRestaurantRatingLookup
} from "./validation";

export type ConsumerRatingServiceOptions = {
  authPort: ConsumerAuthPort;
  readRepository: ConsumerRatingReadRepository;
  writeRepository: ConsumerRatingWriteRepository;
};

export class ConsumerRatingService {
  constructor(private readonly options: ConsumerRatingServiceOptions) {}

  async getCurrentUserRestaurantRating(
    lookup: ConsumerRestaurantRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentRestaurantRatingRecord>> {
    const validation = validateRestaurantRatingLookup(lookup);
    if (!validation.ok) return { status: "invalid_input", source: this.options.readRepository.readSource, error: validation.error };
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.readRepository.readSource, error: authError };
    try {
      return await this.options.readRepository.getCurrentUserRestaurantRating(lookup);
    } catch {
      return { status: "read_failed", source: this.options.readRepository.readSource, error: new ConsumerRatingReadFailedError() };
    }
  }

  async getCurrentUserMenuItemRating(
    lookup: ConsumerMenuItemRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentMenuItemRatingRecord>> {
    const validation = validateMenuItemRatingLookup(lookup);
    if (!validation.ok) return { status: "invalid_input", source: this.options.readRepository.readSource, error: validation.error };
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.readRepository.readSource, error: authError };
    try {
      return await this.options.readRepository.getCurrentUserMenuItemRating(lookup);
    } catch {
      return { status: "read_failed", source: this.options.readRepository.readSource, error: new ConsumerRatingReadFailedError() };
    }
  }

  async listCurrentUserRatings(): Promise<ConsumerRatingListResult> {
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.readRepository.readSource, error: authError };
    try {
      return await this.options.readRepository.listCurrentUserRatings();
    } catch {
      return { status: "read_failed", source: this.options.readRepository.readSource, error: new ConsumerRatingReadFailedError() };
    }
  }

  async createOrReplaceCurrentUserRating(input: ConsumerCreateOrReplaceRatingInput): Promise<ConsumerRatingWriteResult> {
    const validation = validateCreateOrReplaceRatingInput(input);
    if (!validation.ok) return { status: "invalid_input", source: this.options.writeRepository.writeSource, error: validation.error };
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.writeRepository.writeSource, error: authError };
    try {
      return await this.options.writeRepository.createOrReplaceCurrentUserRating(input);
    } catch {
      return { status: "write_failed", source: this.options.writeRepository.writeSource, error: new ConsumerRatingWriteFailedError() };
    }
  }

  private async getAuthenticationError(): Promise<ConsumerRatingRuntimeError | null> {
    try {
      const result = await this.options.authPort.getCurrentSession();
      if (!result.ok) return new ConsumerRatingAuthenticationFailedError();
      return result.value ? null : new ConsumerRatingAuthenticationRequiredError();
    } catch {
      return new ConsumerRatingAuthenticationFailedError();
    }
  }
}

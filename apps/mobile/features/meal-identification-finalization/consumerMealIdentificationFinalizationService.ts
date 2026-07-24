import type { ConsumerAuthPort } from "../consumer-auth/ports";
import {
  ConsumerMealIdentificationFinalizationAuthenticationFailedError,
  ConsumerMealIdentificationFinalizationAuthenticationRequiredError,
  ConsumerMealIdentificationFinalizationInvalidInputError,
  ConsumerMealIdentificationFinalizationTransportFailedError,
  type ConsumerMealIdentificationFinalizationRuntimeError
} from "./errors";
import type { ConsumerMealIdentificationFinalizationRepository } from "./ports";
import type {
  ConsumerMealIdentificationFinalizationResult,
  ConsumerMealIdentificationFinalizationSource,
  FinalizeCurrentUserMealIdentificationInput
} from "./types";
import { validateFinalizeCurrentUserMealIdentificationInput } from "./validation";

export type ConsumerMealIdentificationFinalizationServiceOptions = {
  authPort: ConsumerAuthPort;
  repository: ConsumerMealIdentificationFinalizationRepository;
};

export class ConsumerMealIdentificationFinalizationService {
  constructor(private readonly options: ConsumerMealIdentificationFinalizationServiceOptions) {}

  get source(): ConsumerMealIdentificationFinalizationSource {
    return this.options.repository.source;
  }

  async finalizeCurrentUserMealIdentification(
    input: FinalizeCurrentUserMealIdentificationInput
  ): Promise<ConsumerMealIdentificationFinalizationResult> {
    const src = this.options.repository.source;
    if (src === "disabled") {
      return this.options.repository.finalizeCurrentUserMealIdentification(input);
    }

    const validation = validateFinalizeCurrentUserMealIdentificationInput(input);
    if (!validation.ok) {
      return {
        ok: false,
        error: new ConsumerMealIdentificationFinalizationInvalidInputError(validation.error.message),
        source: src
      };
    }

    const authError = await this.getAuthError();
    if (authError) return { ok: false, error: authError, source: src };

    try {
      // Single call into the repository — the repository itself makes exactly one RPC
      // call, so this service never issues a second write path.
      return await this.options.repository.finalizeCurrentUserMealIdentification(validation.value);
    } catch {
      return { ok: false, error: new ConsumerMealIdentificationFinalizationTransportFailedError(), source: src };
    }
  }

  private async getAuthError(): Promise<ConsumerMealIdentificationFinalizationRuntimeError | null> {
    try {
      const result = await this.options.authPort.getCurrentSession();
      if (!result.ok) return new ConsumerMealIdentificationFinalizationAuthenticationFailedError();
      return result.value ? null : new ConsumerMealIdentificationFinalizationAuthenticationRequiredError();
    } catch {
      return new ConsumerMealIdentificationFinalizationAuthenticationFailedError();
    }
  }
}

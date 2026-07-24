import { ConsumerMealIdentificationFinalizationDisabledError } from "../errors";
import type { ConsumerMealIdentificationFinalizationRepository } from "../ports";
import type { FinalizeCurrentUserMealIdentificationInput } from "../types";

export class DisabledConsumerMealIdentificationFinalizationRepository
  implements ConsumerMealIdentificationFinalizationRepository
{
  readonly source = "disabled" as const;

  async finalizeCurrentUserMealIdentification(_input: FinalizeCurrentUserMealIdentificationInput) {
    return {
      ok: false as const,
      error: new ConsumerMealIdentificationFinalizationDisabledError(),
      source: this.source
    };
  }
}

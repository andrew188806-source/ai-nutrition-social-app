import {
  ConsumerMealIdentificationFinalizationResponseMalformedError,
  ConsumerMealIdentificationFinalizationRuntimeError,
  ConsumerMealIdentificationFinalizationTransportFailedError
} from "../errors";
import type { ConsumerMealIdentificationFinalizationRepository } from "../ports";
import {
  SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION,
  type SupabaseConsumerMealIdentificationFinalizationClientLike,
  type SupabaseFinalizeMealIdentificationRpcResponseLike
} from "../supabaseMealIdentificationFinalizationContracts";
import {
  buildFinalizeMealIdentificationRpcArgs,
  mapFinalizeMealIdentificationRpcResponse,
  mapMealIdentificationFinalizationRpcError
} from "../mealIdentificationFinalizationMappers";
import type { FinalizeCurrentUserMealIdentificationInput } from "../types";

const SOURCE = "supabase" as const;

export class SupabaseConsumerMealIdentificationFinalizationRepository
  implements ConsumerMealIdentificationFinalizationRepository
{
  readonly source = SOURCE;

  constructor(private readonly client: SupabaseConsumerMealIdentificationFinalizationClientLike) {}

  async finalizeCurrentUserMealIdentification(input: FinalizeCurrentUserMealIdentificationInput) {
    let response: SupabaseFinalizeMealIdentificationRpcResponseLike;
    try {
      // Single canonical RPC call site — no direct table writes, no second write path.
      response = await this.client.rpc(
        SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION,
        buildFinalizeMealIdentificationRpcArgs(input)
      );
    } catch {
      return {
        ok: false as const,
        error: new ConsumerMealIdentificationFinalizationTransportFailedError(),
        source: SOURCE
      };
    }
    if (response.error) {
      return {
        ok: false as const,
        error: mapMealIdentificationFinalizationRpcError(response.error, response.status ?? undefined),
        source: SOURCE
      };
    }
    try {
      const value = mapFinalizeMealIdentificationRpcResponse(response.data);
      return { ok: true as const, value, source: SOURCE };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof ConsumerMealIdentificationFinalizationRuntimeError
            ? error
            : new ConsumerMealIdentificationFinalizationResponseMalformedError(),
        source: SOURCE
      };
    }
  }
}

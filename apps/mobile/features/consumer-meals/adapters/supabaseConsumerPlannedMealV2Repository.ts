import {
  ConsumerAuthError,
  ConsumerMealWriteAuthenticationRequiredError,
  ConsumerMealWriteDisabledError,
  ConsumerMealWriteMappingFailedError,
  ConsumerMealWriteTransportFailedError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err, ok, type ConsumerAuthResult } from "../../consumer-auth/types";
import {
  SUPABASE_CANCEL_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION,
  SUPABASE_CONVERT_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION,
  SUPABASE_CREATE_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION,
  SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION,
  type SupabaseConsumerMealClientLike,
  type SupabaseMealPostgrestErrorLike
} from "../supabaseMealContracts";
import { mapConvertPlannedMealV2Result, mapPlannedMealV2Result, toSupabasePlannedMealV2Patch } from "../plannedMealV2Mappers";
import type {
  ConsumerCancelPlannedMealV2Input,
  ConsumerConvertPlannedMealV2Input,
  ConsumerCreatePlannedMealV2Input,
  ConsumerPlannedMealV2Repository,
  ConsumerUpdatePlannedMealV2Input
} from "../types";

export type SupabaseConsumerPlannedMealV2RepositoryOptions = { authPort: ConsumerAuthPort; mealClient: SupabaseConsumerMealClientLike; writeEnabled: boolean };

export class SupabaseConsumerPlannedMealV2Repository implements ConsumerPlannedMealV2Repository {
  readonly source = "supabase" as const;
  constructor(private readonly options: SupabaseConsumerPlannedMealV2RepositoryOptions) {}
  async create(input: ConsumerCreatePlannedMealV2Input) {
    return this.withActor(async (actorId) => {
      const response = await this.options.mealClient.rpc(SUPABASE_CREATE_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION, {
        p_create_client_request_id: input.createRequestId, p_planned_for: input.plannedFor,
        p_planned_timezone: input.plannedTimezone, p_meal_type: input.mealType,
        p_display_name_snapshot: input.title, p_planned_local_time: input.plannedLocalTime,
        p_meal_category: input.mealCategory, p_restaurant_name_snapshot: input.restaurantNameSnapshot,
        p_note: input.note, p_restaurant_id: input.restaurantId, p_branch_id: input.branchId,
        p_menu_item_id: input.menuItemId, p_planned_nutrition_snapshot: input.nutritionSnapshot
      });
      if (response.error) return err(mapRpcError(response.error));
      if (!response.data) return err(new ConsumerMealWriteMappingFailedError("Planned meal create returned no canonical row."));
      return ok(mapPlannedMealV2Result(response.data, actorId));
    });
  }
  async update(input: ConsumerUpdatePlannedMealV2Input) {
    return this.withActor(async (actorId) => {
      const response = await this.options.mealClient.rpc(SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION, {
        p_planned_meal_id: input.plannedMealId, p_expected_updated_at: input.expectedUpdatedAt, p_patch: toSupabasePlannedMealV2Patch(input.patch)
      });
      if (response.error) return err(mapRpcError(response.error));
      if (!response.data) return err(new ConsumerMealWriteMappingFailedError("Planned meal update returned no canonical row."));
      return ok(mapPlannedMealV2Result(response.data, actorId));
    });
  }
  async cancel(input: ConsumerCancelPlannedMealV2Input) {
    return this.withActor(async (actorId) => {
      const response = await this.options.mealClient.rpc(SUPABASE_CANCEL_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION, { p_planned_meal_id: input.plannedMealId, p_expected_updated_at: input.expectedUpdatedAt });
      if (response.error) return err(mapRpcError(response.error));
      if (!response.data) return err(new ConsumerMealWriteMappingFailedError("Planned meal cancel returned no canonical row."));
      return ok(mapPlannedMealV2Result(response.data, actorId));
    });
  }
  async convert(input: ConsumerConvertPlannedMealV2Input) {
    return this.withActor(async () => {
      const response = await this.options.mealClient.rpc(SUPABASE_CONVERT_AUTHENTICATED_PLANNED_MEAL_V2_FUNCTION, {
        p_planned_meal_id: input.plannedMealId, p_conversion_idempotency_key: input.conversionRequestId,
        p_expected_updated_at: input.expectedUpdatedAt, p_confirmation_timestamp: input.confirmationTimestamp,
        p_actor_timezone: input.actorTimezone
      });
      if (response.error) return err(mapRpcError(response.error));
      if (!response.data) return err(new ConsumerMealWriteMappingFailedError("Planned meal conversion returned no canonical result."));
      return ok(mapConvertPlannedMealV2Result(response.data));
    });
  }
  private async withActor<T>(operation: (actorId: string) => Promise<ConsumerAuthResult<T>>): Promise<ConsumerAuthResult<T>> {
    if (!this.options.writeEnabled) return err(new ConsumerMealWriteDisabledError());
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) return err(new ConsumerMealWriteAuthenticationRequiredError());
    try { return await operation(session.value.user.userId); }
    catch (error) {
      if (error instanceof ConsumerAuthError) return err(error);
      return err(new ConsumerMealWriteTransportFailedError("Planned meal V2 transport result is uncertain."));
    }
  }
}

function mapRpcError(error: SupabaseMealPostgrestErrorLike): ConsumerAuthError {
  const message = (error.message ?? "").toUpperCase();
  if (error.status === 401 || error.status === 403 || message.includes("AUTHENTICATION_REQUIRED")) return new ConsumerMealWriteAuthenticationRequiredError();
  if (message.includes("IDEMPOTENCY") || message.includes("ALREADY_CONVERTED")) return new ConsumerAuthError("meal_write_function_rejected", "The planned meal operation conflicts with a completed request.");
  if (message.includes("VERSION_CONFLICT")) return new ConsumerAuthError("meal_write_function_rejected", "The planned meal changed before this operation completed.");
  if (error.code === "22023" || error.code === "23514" || message.includes("INVALID") || message.includes("REQUIRED") || message.includes("NOT_PLANNED")) return new ConsumerAuthError("meal_write_invalid_input", "The planned meal operation was rejected.");
  return new ConsumerMealWriteTransportFailedError("Planned meal V2 transport result is uncertain.");
}

import {
  ConsumerMealWriteAuthenticationRequiredError,
  ConsumerMealWriteAuthorizationFailedError,
  ConsumerMealWriteFunctionRejectedError,
  ConsumerMealWriteMappingFailedError,
  ConsumerMealWritePhaseNotEnabledError,
  ConsumerMealWriteTransportFailedError,
  ConsumerSessionExpiredError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err, ok } from "../../consumer-auth/types";
import {
  SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION,
  SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_V2_FUNCTION,
  type SupabaseConsumerMealClientLike,
  type SupabaseCreateMealRecordRpcArgs,
  type SupabaseMealPostgrestErrorLike
} from "../supabaseMealContracts";
import { mapSupabaseMealRecordRowToConsumerMealRecord } from "../supabaseMealMappers";
import type {
  ConsumerCreateMealRecordInput,
  ConsumerMealRecordWriteRepository
} from "../types";
import { validateCreateMealRecordInput, type ValidatedCreateMealRecordInput } from "../writeValidation";

export type SupabaseConsumerMealRecordWriteRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealClient: SupabaseConsumerMealClientLike;
  writeEnabled: boolean;
};

export class SupabaseConsumerMealRecordWriteRepository implements ConsumerMealRecordWriteRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseConsumerMealRecordWriteRepositoryOptions) {}

  async createCurrentUserMealRecord(input: ConsumerCreateMealRecordInput) {
    if (!this.options.writeEnabled) return err(new ConsumerMealWritePhaseNotEnabledError());
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok) {
      if (session.error instanceof ConsumerSessionExpiredError || session.error.code === "session_expired") {
        return err(new ConsumerMealWriteAuthenticationRequiredError("Consumer meal write requires a current authenticated session."));
      }
      return err(new ConsumerMealWriteAuthorizationFailedError());
    }
    if (!session.value) return err(new ConsumerMealWriteAuthenticationRequiredError());
    const validated = validateCreateMealRecordInput(input);
    try {
      const response = validated.idempotencyKey
        ? await this.options.mealClient.rpc(SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_V2_FUNCTION, {
            ...buildCreateMealRecordRpcArgs(validated),
            p_client_request_id: validated.idempotencyKey
          })
        : await this.options.mealClient.rpc(
            SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION,
            buildCreateMealRecordRpcArgs(validated)
          );
      if (response.error) return err(mapMealWriteRpcError(response.error));
      if (!response.data) return err(new ConsumerMealWriteMappingFailedError("Consumer meal write returned no canonical record."));
      return ok(mapSupabaseMealRecordRowToConsumerMealRecord(response.data, session.value.user.userId));
    } catch (error) {
      if (error instanceof Error && ("code" in error) && (error.code === "meal_record_mapping_failed" || error.code === "meal_item_mapping_failed")) {
        return err(new ConsumerMealWriteMappingFailedError());
      }
      if (error instanceof ConsumerMealWriteMappingFailedError) return err(error);
      return err(new ConsumerMealWriteTransportFailedError("Consumer live meal write transport failed before canonical mapping."));
    }
  }
}

function buildCreateMealRecordRpcArgs(input: ValidatedCreateMealRecordInput): SupabaseCreateMealRecordRpcArgs {
  return {
    p_meal_type: input.mealType,
    p_occurred_at: input.occurredAt,
    p_meal_date: input.mealDate,
    p_timezone: input.timezone,
    p_title: input.title,
    p_note: input.note,
    p_source: input.source,
    p_items: input.items.map((item) => ({
      restaurantId: item.restaurantId,
      branchId: item.branchId,
      menuId: item.menuId,
      menuItemId: item.menuItemId,
      displayName: item.displayName,
      userEnteredName: item.userEnteredName,
      aiDetectedName: item.aiDetectedName,
      normalizedName: item.normalizedName,
      portion: item.portion,
      nutrition: item.nutrition,
      nutritionSource: item.nutritionSource,
      sourceEntityVersion: item.sourceEntityVersion,
      confidenceScore: item.confidenceScore,
      consumedRatio: item.consumedRatio
    }))
  };
}

function mapMealWriteRpcError(error: SupabaseMealPostgrestErrorLike) {
  const message = error.message?.toUpperCase() ?? "";
  if (error.status === 401 || error.status === 403 || message.includes("AUTHENTICATION_REQUIRED")) {
    return new ConsumerMealWriteAuthorizationFailedError();
  }
  if (error.code === "22023" || error.code === "23514" || message.includes("INVALID") || message.includes("REQUIRED") || message.includes("TOO_MANY") || message.includes("FORBIDDEN")) {
    return new ConsumerMealWriteFunctionRejectedError();
  }
  if (message.includes("IDEMPOTENCY_KEY_CONFLICT")) {
    return new ConsumerMealWriteFunctionRejectedError("Consumer meal write idempotency key conflicts with another payload.");
  }
  return new ConsumerMealWriteTransportFailedError();
}

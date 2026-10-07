import {
  ConsumerMealWriteActorBindingMismatchError,
  ConsumerMealWriteAuthenticationRequiredError,
  ConsumerMealWriteAuthorizationFailedError,
  ConsumerMealWriteEligibilityRequiredError,
  ConsumerMealWriteFunctionRejectedError,
  ConsumerMealWriteMappingFailedError,
  ConsumerMealWritePhaseNotEnabledError,
  ConsumerMealWriteServerRejectedError,
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
      // The SDK reports HTTP status at the TOP LEVEL of the response (error carries only the JSON body).
      if (response.error) return err(mapMealWriteRpcError(response.error, response.status ?? undefined));
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

export type MealWriteErrorDiagnostics = { sqlstate: string | null; httpStatus: number | null };

const TRUSTED_SERVER_ERROR_CODE = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;

// Classification of a structured PostgREST answer. Only trusted, server-authored signals decide:
//   * ACTOR_BINDING (guard)            -> not sent
//   * CONSUMER_CORE_ELIGIBILITY_REQUIRED -> consent/eligibility (never "log in again")
//   * AUTHENTICATION_REQUIRED / 28000 / PGRST301-303 / HTTP 401 -> real authentication failure
//   * everything else with a well-formed code was rolled back by the server and is NOT a login problem.
// An answer without a well-formed code (network failure, gateway text/HTML, unreadable) is a transport failure = unknown.
function mapMealWriteRpcError(error: SupabaseMealPostgrestErrorLike, status?: number) {
  const mapped = classifyMealWriteRpcError(error, status);
  const code = typeof error.code === "string" && /^[0-9A-Za-z]{5}$/.test(error.code) ? error.code : null;
  return Object.assign(mapped, { sqlstate: code, httpStatus: status ?? error.status ?? null } satisfies MealWriteErrorDiagnostics);
}

function classifyMealWriteRpcError(error: SupabaseMealPostgrestErrorLike, status?: number) {
  const message = error.message?.toUpperCase() ?? "";
  const code = typeof error.code === "string" ? error.code : "";
  const effectiveStatus = status ?? error.status ?? undefined;
  if (code === "TKACT0") return new ConsumerMealWriteActorBindingMismatchError();
  // Only an answer carrying a well-formed server error code (SQLSTATE or PGRSTnnn) is server-authored. A missing,
  // empty or malformed code (gateway/proxy text, HTML, unreadable body) proves nothing about the write, whatever its
  // text or HTTP status says: transport failure = unknown, never "not written".
  if (!TRUSTED_SERVER_ERROR_CODE.test(code)) return new ConsumerMealWriteTransportFailedError();
  if (message.includes("CONSUMER_CORE_ELIGIBILITY_REQUIRED")) return new ConsumerMealWriteEligibilityRequiredError();
  if (effectiveStatus === 401 || code === "28000" || /^PGRST30[123]$/.test(code) || message.includes("AUTHENTICATION_REQUIRED")) {
    return new ConsumerMealWriteAuthenticationRequiredError("Consumer meal write requires a current authenticated session.");
  }
  if (code === "23505" || message.includes("IDEMPOTENCY_KEY_CONFLICT")) {
    return new ConsumerMealWriteFunctionRejectedError("Consumer meal write idempotency key conflicts with another payload.");
  }
  if (code === "22023" || message.includes("INVALID") || message.includes("REQUIRED") || message.includes("TOO_MANY") || message.includes("FORBIDDEN")) {
    return new ConsumerMealWriteFunctionRejectedError();
  }
  if (code.length > 0) return new ConsumerMealWriteServerRejectedError();
  return new ConsumerMealWriteTransportFailedError();
}

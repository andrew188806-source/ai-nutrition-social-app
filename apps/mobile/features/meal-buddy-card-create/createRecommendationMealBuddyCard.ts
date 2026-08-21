import { MEAL_BUDDY_CARD_CREATE_FUNCTION_NAME } from "./supabaseContracts";
import { getMealBuddyCardCreateRuntimeDependencies } from "./runtimeBinding";
import type {
  CreatedMealBuddyCard,
  RecommendationMealBuddyCardCreateRequest,
  RecommendationMealBuddyCardCreateResult
} from "./types";

const SAFE_SERVER_ERRORS = new Set(["authentication_required", "invalid_request", "card_quota_exceeded"]);

function safeErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

function parseCard(body: unknown): CreatedMealBuddyCard | null {
  if (!body || typeof body !== "object") return null;
  const card = (body as Record<string, unknown>).card;
  if (!card || typeof card !== "object") return null;
  const value = card as Record<string, unknown>;
  if (typeof value.sourceCardRef !== "string" || value.sourceCardRef.length === 0) return null;
  if (value.restaurantId !== null && typeof value.restaurantId !== "string") return null;
  if (value.foodContextTagKey !== null && typeof value.foodContextTagKey !== "string") return null;
  return Object.freeze({
    sourceCardRef: value.sourceCardRef,
    restaurantId: value.restaurantId as string | null,
    foodContextTagKey: value.foodContextTagKey as string | null
  });
}

export async function createRecommendationMealBuddyCard(
  request: RecommendationMealBuddyCardCreateRequest
): Promise<RecommendationMealBuddyCardCreateResult> {
  const dependencies = getMealBuddyCardCreateRuntimeDependencies();
  if (!dependencies) return { ok: false, errorCode: "configuration_error" };
  const session = await dependencies.authPort.getCurrentSession();
  if (!session.ok || !session.value) return { ok: false, errorCode: "authentication_required" };

  let result;
  try {
    result = await dependencies.client.functions.invoke(MEAL_BUDDY_CARD_CREATE_FUNCTION_NAME, { body: request });
  } catch {
    return { ok: false, errorCode: "network_error" };
  }
  if (result.error) {
    if (result.error.name === "FunctionsFetchError" || result.error.name === "FunctionsRelayError") {
      return { ok: false, errorCode: "network_error" };
    }
    if (result.error.name === "FunctionsHttpError" && result.error.context) {
      try {
        const code = safeErrorCode(await result.error.context.json());
        if (code && SAFE_SERVER_ERRORS.has(code)) {
          return { ok: false, errorCode: code as "authentication_required" | "invalid_request" | "card_quota_exceeded" };
        }
      } catch {
        // Raw server errors never reach product UI.
      }
    }
    return { ok: false, errorCode: "invalid_server_response" };
  }
  const card = parseCard(result.data);
  return card ? { ok: true, card } : { ok: false, errorCode: "invalid_server_response" };
}

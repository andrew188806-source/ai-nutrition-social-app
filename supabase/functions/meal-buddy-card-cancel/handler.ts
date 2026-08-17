import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  buildMealBuddyCardError,
  carriesAuthorityInput,
  composeMealBuddyCardCancel,
  loadMealBuddyCardConfig,
  readJsonBody,
  validateMealBuddyCardCancelRequest,
  type MealBuddyCardConfigOutcome,
  type MealBuddyCardEntitlementRowSource
} from "../_shared/meal-buddy-card-api/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";

export type MealBuddyCardCancelDependencies = Readonly<{
  loadConfig: () => MealBuddyCardConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultMealBuddyCardCancelDependencies(): MealBuddyCardCancelDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyCardConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processMealBuddyCardCancelRequest(
  request: Request,
  dependencies: MealBuddyCardCancelDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildMealBuddyCardError("invalid_request");
  if (carriesAuthorityInput(request)) return buildMealBuddyCardError("invalid_request");

  const body = await readJsonBody(request);
  if (!body.ok) return buildMealBuddyCardError("invalid_request");
  const validation = validateMealBuddyCardCancelRequest(body.value);
  if (!validation.ok) return buildMealBuddyCardError("invalid_request");

  const config = dependencies.loadConfig();
  if (!config.ok) return buildMealBuddyCardError("server_unavailable");

  const authentication = await dependencies.authenticateCaller(
    request,
    config.value.supabaseUrl,
    config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildMealBuddyCardError("authentication_required");

  const requestInstant = new Date();
  const transport = dependencies.createTransport();
  try {
    const outcome = await composeMealBuddyCardCancel({
      transport,
      entitlementRowSource: authentication.value.userScopedClient as unknown as MealBuddyCardEntitlementRowSource,
      cardRefKey: config.value.cardRefKey,
      actorUserId: authentication.value.userId,
      requestInstant
    }, validation.value.sourceCardRef);

    // A foreign card, a card that never existed, a candidate-purpose reference and a tampered
    // reference all collapse to one indistinguishable invalid_request, so no opaque reference can
    // be used to probe whether a card exists or who owns it.
    if (!outcome.ok) return buildMealBuddyCardError("invalid_request");

    return new Response(JSON.stringify(outcome.value), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildMealBuddyCardError("server_unavailable");
  } finally {
    await transport.close();
  }
}

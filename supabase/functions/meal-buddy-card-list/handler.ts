import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  buildMealBuddyCardError,
  carriesAuthorityInput,
  composeMealBuddyCardList,
  isEmptyObject,
  loadMealBuddyCardConfig,
  readJsonBody,
  type MealBuddyCardConfigOutcome,
  type MealBuddyCardEntitlementRowSource
} from "../_shared/meal-buddy-card-api/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";

export type MealBuddyCardListDependencies = Readonly<{
  loadConfig: () => MealBuddyCardConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultMealBuddyCardListDependencies(): MealBuddyCardListDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyCardConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processMealBuddyCardListRequest(
  request: Request,
  dependencies: MealBuddyCardListDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildMealBuddyCardError("invalid_request");
  if (carriesAuthorityInput(request)) return buildMealBuddyCardError("invalid_request");

  // An empty body is the whole contract: the actor is the verified caller and there is no filter,
  // page, limit or owner a caller could express.
  const body = await readJsonBody(request);
  if (!body.ok || !isEmptyObject(body.value)) return buildMealBuddyCardError("invalid_request");

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
    const response = await composeMealBuddyCardList({
      transport,
      entitlementRowSource: authentication.value.userScopedClient as unknown as MealBuddyCardEntitlementRowSource,
      cardRefKey: config.value.cardRefKey,
      actorUserId: authentication.value.userId,
      requestInstant
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildMealBuddyCardError("server_unavailable");
  } finally {
    await transport.close();
  }
}

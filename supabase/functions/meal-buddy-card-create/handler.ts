import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  buildMealBuddyCardError,
  carriesAuthorityInput,
  composeMealBuddyCardCreate,
  loadMealBuddyCardConfig,
  readJsonBody,
  validateMealBuddyCardCreateRequest,
  type MealBuddyCardConfigOutcome,
  type MealBuddyCardEntitlementRowSource
} from "../_shared/meal-buddy-card-api/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";

export type MealBuddyCardCreateDependencies = Readonly<{
  loadConfig: () => MealBuddyCardConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultMealBuddyCardCreateDependencies(): MealBuddyCardCreateDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyCardConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processMealBuddyCardCreateRequest(
  request: Request,
  dependencies: MealBuddyCardCreateDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildMealBuddyCardError("invalid_request");
  if (carriesAuthorityInput(request)) return buildMealBuddyCardError("invalid_request");

  const body = await readJsonBody(request);
  if (!body.ok) return buildMealBuddyCardError("invalid_request");

  const config = dependencies.loadConfig();
  if (!config.ok) return buildMealBuddyCardError("server_unavailable");

  const authentication = await dependencies.authenticateCaller(
    request,
    config.value.supabaseUrl,
    config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildMealBuddyCardError("authentication_required");

  // Exactly one request instant governs "is this dining date in the past", the entitlement window
  // and the source-reference timestamp. No caller-supplied clock exists.
  const requestInstant = new Date();
  const validation = validateMealBuddyCardCreateRequest(body.value, requestInstant);
  if (!validation.ok) return buildMealBuddyCardError("invalid_request");

  const transport = dependencies.createTransport();
  try {
    const outcome = await composeMealBuddyCardCreate({
      transport,
      entitlementRowSource: authentication.value.userScopedClient as unknown as MealBuddyCardEntitlementRowSource,
      cardRefKey: config.value.cardRefKey,
      actorUserId: authentication.value.userId,
      requestInstant
    }, validation.value);

    // A legitimate request that simply exceeds the frozen cap is a closed product outcome, not a
    // failure: it names no table, no count and no billing fact.
    if (!outcome.ok) return buildMealBuddyCardError("card_quota_exceeded");

    return new Response(JSON.stringify(outcome.value), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    // A dependency or invariant failure is a 503. It is never converted into a silent success.
    return buildMealBuddyCardError("server_unavailable");
  } finally {
    await transport.close();
  }
}

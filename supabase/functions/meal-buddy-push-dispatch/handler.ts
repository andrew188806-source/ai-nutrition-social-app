import {
  createExpoPushProvider,
  ExecutorMealBuddyPushRepository,
  MealBuddyPushDispatchService
} from "../_shared/meal-buddy-push-api/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import {
  loadMealBuddyPushDispatchConfig,
  secretMatches,
  MEAL_BUDDY_PUSH_DISPATCH_LIMIT,
  type MealBuddyPushDispatchConfigOutcome
} from "./config.ts";

export type MealBuddyPushDispatchDependencies = Readonly<{
  loadConfig: () => MealBuddyPushDispatchConfigOutcome;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultMealBuddyPushDispatchDependencies(): MealBuddyPushDispatchDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyPushDispatchConfig,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

function error(code: "unauthorized" | "server_unavailable"): Response {
  const status = code === "unauthorized" ? 401 : 503;
  return new Response(JSON.stringify({ error: { code, message: "The push dispatcher is unavailable." } }), {
    status, headers: { "content-type": "application/json" }
  });
}

export async function processMealBuddyPushDispatchRequest(
  request: Request,
  dependencies: MealBuddyPushDispatchDependencies
): Promise<Response> {
  if (request.method !== "POST") return error("unauthorized");
  const config = dependencies.loadConfig();
  if (!config.ok) return error("server_unavailable");
  if (!secretMatches(config.value.dispatchSecret, request.headers.get("x-meal-buddy-push-dispatch"))) {
    return error("unauthorized");
  }

  const transport = dependencies.createTransport();
  try {
    const service = new MealBuddyPushDispatchService(
      new ExecutorMealBuddyPushRepository(transport),
      createExpoPushProvider(config.value.expoAccessToken)
    );
    // A provider outage surfaces here as failed counts, never as a change to relationship, message
    // or chat state — those transactions committed long before this ran.
    const response = await service.dispatch(MEAL_BUDDY_PUSH_DISPATCH_LIMIT);
    return new Response(JSON.stringify(response), {
      status: 200, headers: { "content-type": "application/json" }
    });
  } catch {
    return error("server_unavailable");
  } finally {
    await transport.close();
  }
}

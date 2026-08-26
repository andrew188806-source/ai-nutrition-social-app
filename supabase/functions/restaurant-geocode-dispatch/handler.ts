import {
  ExecutorRestaurantGeocodeRepository,
  RestaurantGeocodeDispatchService,
  createMockRestaurantGeocodeProvider
} from "../_shared/restaurant-geocoding/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import {
  loadRestaurantGeocodeDispatchConfig,
  secretMatches,
  RESTAURANT_GEOCODE_DISPATCH_LIMIT,
  type RestaurantGeocodeDispatchConfigOutcome
} from "./config.ts";

export type RestaurantGeocodeDispatchDependencies = Readonly<{
  loadConfig: () => RestaurantGeocodeDispatchConfigOutcome;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultRestaurantGeocodeDispatchDependencies(): RestaurantGeocodeDispatchDependencies {
  return Object.freeze({
    loadConfig: loadRestaurantGeocodeDispatchConfig,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

function error(code: "unauthorized" | "server_unavailable"): Response {
  const status = code === "unauthorized" ? 401 : 503;
  return new Response(JSON.stringify({ error: { code, message: "The geocode dispatcher is unavailable." } }), {
    status, headers: { "content-type": "application/json" }
  });
}

// GEO-1C-P0 operational dispatcher.
//
// It resolves coordinates OUT OF BAND. No recommendation request and no Social request reaches this
// code path, which is what keeps the promise that consumers never geocode: there is simply no
// consumer-facing route into it.
export async function processRestaurantGeocodeDispatchRequest(
  request: Request,
  dependencies: RestaurantGeocodeDispatchDependencies
): Promise<Response> {
  if (request.method !== "POST") return error("unauthorized");
  const config = dependencies.loadConfig();
  if (!config.ok) return error("server_unavailable");
  if (!secretMatches(config.value.dispatchSecret, request.headers.get("x-restaurant-geocode-dispatch"))) {
    return error("unauthorized");
  }

  const transport = dependencies.createTransport();
  try {
    const service = new RestaurantGeocodeDispatchService(
      new ExecutorRestaurantGeocodeRepository(transport),
      createMockRestaurantGeocodeProvider()
    );
    const summary = await service.dispatch(RESTAURANT_GEOCODE_DISPATCH_LIMIT, config.value.maxAttempts);
    return new Response(JSON.stringify(summary), {
      status: 200, headers: { "content-type": "application/json" }
    });
  } catch {
    return error("server_unavailable");
  } finally {
    await transport.close();
  }
}

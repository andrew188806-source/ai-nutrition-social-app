import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  carriesMealBuddyPushAuthorityInput,
  ExecutorMealBuddyPushRepository,
  MealBuddyPushDeviceService,
  parseMealBuddyPushDeviceRequest
} from "../_shared/meal-buddy-push-api/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import { loadMealBuddyPushDeviceConfig, type MealBuddyPushDeviceConfigOutcome } from "./config.ts";
import { buildMealBuddyPushDeviceError } from "./errors.ts";

export type MealBuddyPushDeviceDependencies = Readonly<{
  loadConfig: () => MealBuddyPushDeviceConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultMealBuddyPushDeviceDependencies(): MealBuddyPushDeviceDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyPushDeviceConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processMealBuddyPushDeviceRequest(
  request: Request,
  dependencies: MealBuddyPushDeviceDependencies
): Promise<Response> {
  if (request.method !== "POST" || carriesMealBuddyPushAuthorityInput(request)) {
    return buildMealBuddyPushDeviceError("invalid_request");
  }
  const parsed = await parseMealBuddyPushDeviceRequest(request);
  if (!parsed.ok) return buildMealBuddyPushDeviceError("invalid_request");
  const config = dependencies.loadConfig();
  if (!config.ok) return buildMealBuddyPushDeviceError("server_unavailable");
  const authentication = await dependencies.authenticateCaller(
    request, config.value.supabaseUrl, config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildMealBuddyPushDeviceError("authentication_required");

  const transport = dependencies.createTransport();
  try {
    const service = new MealBuddyPushDeviceService(new ExecutorMealBuddyPushRepository(transport));
    // The verified subject is the ONLY owner this can ever write, so no body field can retarget it.
    const response = await service.execute(authentication.value.userId, parsed.value);
    return new Response(JSON.stringify(response), {
      status: 200, headers: { "content-type": "application/json" }
    });
  } catch {
    return buildMealBuddyPushDeviceError("server_unavailable");
  } finally {
    await transport.close();
  }
}

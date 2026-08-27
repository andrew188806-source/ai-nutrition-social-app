import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import { ExecutorGeoRepository } from "../_shared/geo-api/index.ts";
import {
  composeNextMealGeoCandidates,
  parseNextMealGeoRequest,
  SupabaseNextMealGeoCandidateRowSource
} from "../_shared/next-meal-geo-api/index.ts";
import type { NextMealGeoUserScopedClient } from "../_shared/next-meal-geo-api/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import { loadNextMealGeoConfig, type NextMealGeoConfigOutcome } from "./config.ts";
import { buildNextMealGeoError } from "./errors.ts";

export type NextMealGeoDependencies = Readonly<{
  loadConfig: () => NextMealGeoConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultNextMealGeoDependencies(): NextMealGeoDependencies {
  return Object.freeze({
    loadConfig: loadNextMealGeoConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processNextMealGeoRequest(request: Request, dependencies: NextMealGeoDependencies) {
  if (request.method !== "POST") return buildNextMealGeoError("invalid_request");
  const parsed = await parseNextMealGeoRequest(request);
  if (!parsed.ok) return buildNextMealGeoError("invalid_request");
  const config = dependencies.loadConfig();
  if (!config.ok) return buildNextMealGeoError("server_unavailable");
  const authentication = await dependencies.authenticateCaller(
    request, config.value.supabaseUrl, config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildNextMealGeoError("authentication_required");

  const transport = dependencies.createTransport();
  try {
    const response = await composeNextMealGeoCandidates({
      request: parsed.value,
      geoRepository: new ExecutorGeoRepository(transport),
      candidateSource: new SupabaseNextMealGeoCandidateRowSource(
        authentication.value.userScopedClient as unknown as NextMealGeoUserScopedClient
      )
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildNextMealGeoError("server_unavailable");
  } finally {
    await transport.close();
  }
}

import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import { carriesMealBuddyChatAuthorityInput, ExecutorMealBuddyChatRepository, MealBuddyChatService, parseMealBuddyChatRequest } from "../_shared/meal-buddy-chat-api/index.ts";
import { createMealBuddyChatRefCipher } from "../_shared/meal-buddy-chat-ref/index.ts";
import { createMealBuddyRelationshipRefCipher } from "../_shared/meal-buddy-relationship-ref/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import { loadMealBuddyChatConfig, type MealBuddyChatConfigOutcome } from "./config.ts";
import { buildMealBuddyChatError } from "./errors.ts";
export type MealBuddyChatDependencies = Readonly<{ loadConfig: () => MealBuddyChatConfigOutcome; authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>; createTransport: () => SocialRuntimeExecutorTransport; now?: () => Date }>;
export function createDefaultMealBuddyChatDependencies(): MealBuddyChatDependencies { return Object.freeze({ loadConfig: loadMealBuddyChatConfig, authenticateCaller, createTransport: createDenoSocialRuntimeExecutorTransport }); }
function unavailable(error: unknown): boolean { const message = error instanceof Error ? error.message : ""; return /ref_contract_violated|chat_(unavailable|message_invalid)|CHAT_(IDEMPOTENCY_KEY_CONFLICT|CURSOR_INVALID)/.test(message); }
export async function processMealBuddyChatRequest(request: Request, dependencies: MealBuddyChatDependencies): Promise<Response> {
  if (request.method !== "POST" || carriesMealBuddyChatAuthorityInput(request)) return buildMealBuddyChatError("invalid_request");
  const parsed = await parseMealBuddyChatRequest(request); if (!parsed.ok) return buildMealBuddyChatError("invalid_request");
  const config = dependencies.loadConfig(); if (!config.ok) return buildMealBuddyChatError("server_unavailable");
  const authentication = await dependencies.authenticateCaller(request, config.value.supabaseUrl, config.value.supabaseAnonKey); if (!authentication.ok) return buildMealBuddyChatError("authentication_required");
  const transport = dependencies.createTransport();
  try {
    const service = new MealBuddyChatService(new ExecutorMealBuddyChatRepository(transport), createMealBuddyRelationshipRefCipher(config.value.relationshipRefKey), createMealBuddyChatRefCipher(config.value.chatRefKey));
    const response = await service.execute(authentication.value.userId, parsed.value, dependencies.now?.() ?? new Date());
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) { return buildMealBuddyChatError(unavailable(error) ? "invalid_request" : "server_unavailable"); }
  finally { await transport.close(); }
}

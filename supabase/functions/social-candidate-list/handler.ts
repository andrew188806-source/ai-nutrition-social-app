import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  composeSocialCandidateList,
  type SocialCandidateEntitlementRowSource
} from "../_shared/social-candidate-api/index.ts";
import { createSocialCandidateRefCipher } from "../_shared/social-candidate-ref/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import { loadSocialCandidateListConfig, type SocialCandidateListConfigOutcome } from "./config.ts";
import { buildSocialCandidateListError } from "./errors.ts";

export type SocialCandidateListDependencies = Readonly<{
  loadConfig: () => SocialCandidateListConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultSocialCandidateListDependencies(): SocialCandidateListDependencies {
  return Object.freeze({
    loadConfig: loadSocialCandidateListConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

// Any header capable of naming an actor, a candidate, a limit, a tier or a window. The caller
// carries no business authority whatsoever: identity comes only from the verified token, and every
// policy input is server-derived.
const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id",
  "x-user-id",
  "x-viewer-user-id",
  "x-requesting-user-id",
  "x-candidate-user-id",
  "x-candidate-user-ids",
  "x-candidates",
  "x-candidate-ref",
  "x-target-user-id",
  "x-target-user-ids",
  "x-meal-limit",
  "x-favorites-limit",
  "x-limit",
  "x-cap",
  "x-page",
  "x-page-size",
  "x-cursor",
  "x-offset",
  "x-entitlement",
  "x-entitlement-class",
  "x-premium",
  "x-tier",
  "x-plan-code",
  "x-ranking",
  "x-ranking-weights",
  "x-score-threshold",
  "x-now",
  "x-clock",
  "x-start-date",
  "x-end-date"
] as const);

// A truly empty body is the contract. `{}` is tolerated only because the frozen predecessor ingress
// tolerates it; anything carrying meaning is rejected.
async function hasValidEmptyRequestContract(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 0) return false;
  if (AUTHORITY_HEADERS.some((name) => request.headers.has(name))) return false;
  const raw = await request.text();
  if (raw.trim() === "") return true;
  try {
    const body: unknown = JSON.parse(raw);
    return typeof body === "object" && body !== null && !Array.isArray(body)
      && Object.keys(body as Record<string, unknown>).length === 0;
  } catch {
    return false;
  }
}

export async function processSocialCandidateListRequest(
  request: Request,
  dependencies: SocialCandidateListDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildSocialCandidateListError("invalid_request");
  if (!(await hasValidEmptyRequestContract(request))) {
    return buildSocialCandidateListError("invalid_request");
  }
  const config = dependencies.loadConfig();
  if (!config.ok) return buildSocialCandidateListError("server_unavailable");

  const authentication = await dependencies.authenticateCaller(
    request,
    config.value.supabaseUrl,
    config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildSocialCandidateListError("authentication_required");

  // Exactly one request instant governs the Taste as-of window, entitlement resolution and both
  // candidate-reference timestamps. No caller-supplied clock exists.
  const requestInstant = new Date();
  const transport = dependencies.createTransport();
  try {
    const response = await composeSocialCandidateList({
      transport,
      entitlementRowSource: authentication.value.userScopedClient as unknown as SocialCandidateEntitlementRowSource,
      cipher: createSocialCandidateRefCipher(config.value.candidateRefKey),
      actorUserId: authentication.value.userId,
      requestInstant
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    // A dependency or invariant failure is a 503. It is never converted into an empty success.
    return buildSocialCandidateListError("server_unavailable");
  } finally {
    await transport.close();
  }
}

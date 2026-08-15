import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  createCanonicalSocialTasteProvider,
  SOCIAL_TASTE_MAXIMUM_CANDIDATES,
  type CanonicalSocialTasteProvider
} from "./tasteProvider.ts";
import { loadSocialCandidateTasteConfig, type SocialCandidateTasteConfigOutcome } from "./config.ts";
import { buildSocialCandidateTasteError } from "./errors.ts";

export type SocialCandidateTasteDependencies = Readonly<{
  loadConfig: () => SocialCandidateTasteConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTasteProvider: () => CanonicalSocialTasteProvider;
}>;

export function createDefaultSocialCandidateTasteDependencies(): SocialCandidateTasteDependencies {
  return Object.freeze({
    loadConfig: loadSocialCandidateTasteConfig,
    authenticateCaller,
    createTasteProvider: createCanonicalSocialTasteProvider
  });
}

const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id",
  "x-user-id",
  "x-viewer-user-id",
  "x-requesting-user-id",
  "x-candidate-user-id",
  "x-candidate-user-ids",
  "x-candidates",
  "x-target-user-id",
  "x-target-user-ids",
  "x-meal-limit",
  "x-favorites-limit",
  "x-limit",
  "x-start-date",
  "x-end-date"
] as const);

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

export async function processSocialCandidateTasteRequest(
  request: Request,
  dependencies: SocialCandidateTasteDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildSocialCandidateTasteError("invalid_request");
  if (!(await hasValidEmptyRequestContract(request))) {
    return buildSocialCandidateTasteError("invalid_request");
  }
  const config = dependencies.loadConfig();
  if (!config.ok) return buildSocialCandidateTasteError("server_unavailable");
  const authentication = await dependencies.authenticateCaller(
    request,
    config.value.supabaseUrl,
    config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildSocialCandidateTasteError("authentication_required");

  const provider = dependencies.createTasteProvider();
  try {
    const diagnostics = await provider.evaluateCanonicalCandidates(authentication.value.userId);
    if (
      !Number.isInteger(diagnostics.authorizedCandidateCount) ||
      diagnostics.authorizedCandidateCount < 0 ||
      diagnostics.authorizedCandidateCount > SOCIAL_TASTE_MAXIMUM_CANDIDATES ||
      !Number.isInteger(diagnostics.adaptedCount) ||
      diagnostics.adaptedCount < 0 ||
      !Number.isInteger(diagnostics.unsupportedCount) ||
      diagnostics.unsupportedCount < 0 ||
      diagnostics.authorizedCandidateCount !== diagnostics.adaptedCount + diagnostics.unsupportedCount
    ) {
      return buildSocialCandidateTasteError("server_unavailable");
    }
    return new Response(JSON.stringify({
      authorized_candidate_count: diagnostics.authorizedCandidateCount,
      adapted_count: diagnostics.adaptedCount,
      unsupported_count: diagnostics.unsupportedCount
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildSocialCandidateTasteError("server_unavailable");
  } finally {
    await provider.close();
  }
}

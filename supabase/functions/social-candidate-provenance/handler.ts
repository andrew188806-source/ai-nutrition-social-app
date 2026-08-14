import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  createCanonicalSocialCandidateProvider,
  SOCIAL_CANDIDATE_POOL_HARD_MAXIMUM,
  type CanonicalSocialCandidateProvider
} from "./candidateProvider.ts";
import { loadSocialCandidateProvenanceConfig, type SocialCandidateProvenanceConfigOutcome } from "./config.ts";
import { buildSocialCandidateProvenanceError } from "./errors.ts";

export type SocialCandidateProvenanceDependencies = Readonly<{
  loadConfig: () => SocialCandidateProvenanceConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createCandidateProvider: () => CanonicalSocialCandidateProvider;
}>;

export function createDefaultSocialCandidateProvenanceDependencies(): SocialCandidateProvenanceDependencies {
  return Object.freeze({
    loadConfig: loadSocialCandidateProvenanceConfig,
    authenticateCaller,
    createCandidateProvider: createCanonicalSocialCandidateProvider
  });
}

const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id",
  "x-user-id",
  "x-viewer-user-id",
  "x-requesting-user-id",
  "x-candidate-user-ids",
  "x-candidates",
  "x-target-user-id",
  "x-target-user-ids",
  "x-limit"
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

export async function processSocialCandidateProvenanceRequest(
  request: Request,
  dependencies: SocialCandidateProvenanceDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildSocialCandidateProvenanceError("invalid_request");
  if (!(await hasValidEmptyRequestContract(request))) {
    return buildSocialCandidateProvenanceError("invalid_request");
  }

  const config = dependencies.loadConfig();
  if (!config.ok) return buildSocialCandidateProvenanceError("server_unavailable");

  const authentication = await dependencies.authenticateCaller(
    request,
    config.value.supabaseUrl,
    config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildSocialCandidateProvenanceError("authentication_required");

  const provider = dependencies.createCandidateProvider();
  try {
    const candidates = await provider.getCanonicalSocialCandidates(authentication.value.userId);
    const candidateCount = candidates.length;
    if (!Number.isInteger(candidateCount) || candidateCount < 0 || candidateCount > SOCIAL_CANDIDATE_POOL_HARD_MAXIMUM) {
      return buildSocialCandidateProvenanceError("server_unavailable");
    }
    return new Response(JSON.stringify({ candidate_count: candidateCount }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildSocialCandidateProvenanceError("server_unavailable");
  } finally {
    await provider.close();
  }
}

import { validateSocialCandidateApiResponseV1 } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { SocialCandidateRepository } from "../ports";
import { errCandidates, okCandidates, SocialCandidateClientError } from "../types";
import {
  SOCIAL_CANDIDATE_LIST_FUNCTION_NAME,
  type SupabaseFunctionsInvokeErrorLike,
  type SupabaseSocialCandidateClientLike
} from "../supabaseSocialCandidateContracts";

export type SupabaseSocialCandidateRepositoryOptions = {
  authPort: ConsumerAuthPort;
  candidateClient: SupabaseSocialCandidateClientLike;
};

// The frozen SR-2D error vocabulary. Anything outside it collapses to internal_error rather than
// reaching a user, so a raw body, SQL fragment, role name or stack can never surface.
const KNOWN_SERVER_ERROR_CODES = new Set(["authentication_required", "invalid_request", "server_unavailable"]);

function extractSafeErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const errorField = (body as Record<string, unknown>).error;
  if (typeof errorField !== "object" || errorField === null) return null;
  const code = (errorField as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

async function mapInvokeErrorToClientError(error: SupabaseFunctionsInvokeErrorLike): Promise<SocialCandidateClientError> {
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") {
    return new SocialCandidateClientError("network_error", "Could not reach the Social candidate service.");
  }
  if (error.name === "FunctionsHttpError" && error.context) {
    try {
      const code = extractSafeErrorCode(await error.context.json());
      if (code && KNOWN_SERVER_ERROR_CODES.has(code)) {
        return new SocialCandidateClientError(
          code as "authentication_required" | "invalid_request" | "server_unavailable",
          "The Social candidate service returned an error."
        );
      }
    } catch {
      // Fall through to internal_error — never surface a raw parse failure.
    }
  }
  return new SocialCandidateClientError("internal_error", "The Social candidate service returned an unexpected error.");
}

// Reuses the caller's already-authenticated Supabase client. This adapter never builds a second
// (admin/service-role) client, never accepts a caller-supplied actor, and never attaches an
// Authorization header itself — JWT propagation is handled entirely by the Supabase SDK.
export class SupabaseSocialCandidateRepository implements SocialCandidateRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseSocialCandidateRepositoryOptions) {}

  async listSocialCandidates() {
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errCandidates(new SocialCandidateClientError("authentication_required", "Social candidates require an authenticated session."));
    }

    let invokeResult;
    try {
      // No body, no options: the server derives the actor and owns every policy input.
      invokeResult = await this.options.candidateClient.functions.invoke(SOCIAL_CANDIDATE_LIST_FUNCTION_NAME);
    } catch {
      return errCandidates(new SocialCandidateClientError("network_error", "Could not reach the Social candidate service."));
    }

    if (invokeResult.error) {
      return errCandidates(await mapInvokeErrorToClientError(invokeResult.error));
    }

    // Never cast the raw response. Only the shared validator's own output is trusted, so an HTTP
    // success carrying an unexpected field — a leaked identifier, score or entitlement flag — is
    // reported as invalid_server_response rather than silently rendered.
    const validation = validateSocialCandidateApiResponseV1(invokeResult.data);
    if (!validation.ok) {
      return errCandidates(new SocialCandidateClientError("invalid_server_response", "The Social candidate response failed local validation."));
    }
    return okCandidates(validation.value);
  }
}

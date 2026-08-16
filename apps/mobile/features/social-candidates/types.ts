import type { SocialCandidateApiResponse, SocialCandidateDto } from "@haocu/shared";

// SR-2E: the Mobile-facing result of one social-candidate-list read.
//
// There is deliberately no client input type at all. The Edge contract accepts no actor, candidate,
// limit, tier, entitlement, clock or ranking option, so a request payload type would only create a
// place for one of those to appear later.
export type SocialCandidateListResult = SocialCandidateApiResponse;
export type SocialCandidate = SocialCandidateDto;

// The closed client vocabulary. `authentication_required`, `invalid_request` and
// `server_unavailable` mirror the frozen Edge error codes; `network_error` covers a request that
// never reached the Function; `invalid_server_response` covers an HTTP success whose body failed
// the shared validator; `internal_error` is the catch-all a raw server message collapses into.
export type SocialCandidateClientErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "server_unavailable"
  | "network_error"
  | "invalid_server_response"
  | "internal_error"
  | "social_candidates_disabled";

export class SocialCandidateClientError extends Error {
  readonly code: SocialCandidateClientErrorCode;

  constructor(code: SocialCandidateClientErrorCode, message: string) {
    super(message);
    this.name = "SocialCandidateClientError";
    this.code = code;
  }
}

export type SocialCandidateOutcome =
  | { ok: true; value: SocialCandidateListResult }
  | { ok: false; error: SocialCandidateClientError };

export function okCandidates(value: SocialCandidateListResult): SocialCandidateOutcome {
  return { ok: true, value };
}

export function errCandidates(error: SocialCandidateClientError): SocialCandidateOutcome {
  return { ok: false, error };
}

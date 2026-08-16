export type SocialCandidateListErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "server_unavailable";

const STATUS: Record<SocialCandidateListErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};

// Deliberately opaque. A dependency failure, a missing candidate-reference key and an internal
// invariant violation are one indistinguishable message: no SQL, executor role, table name,
// candidate identifier or invariant detail may reach the client.
const MESSAGE: Record<SocialCandidateListErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The request is invalid.",
  server_unavailable: "The Social service is temporarily unavailable."
};

export function buildSocialCandidateListError(code: SocialCandidateListErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code],
    headers: { "content-type": "application/json" }
  });
}

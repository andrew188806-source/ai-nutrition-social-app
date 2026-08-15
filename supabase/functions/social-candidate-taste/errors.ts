export type SocialCandidateTasteErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "server_unavailable";

const STATUS: Record<SocialCandidateTasteErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};

const MESSAGE: Record<SocialCandidateTasteErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The request is invalid.",
  server_unavailable: "The Social service is temporarily unavailable."
};

export function buildSocialCandidateTasteError(code: SocialCandidateTasteErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code],
    headers: { "content-type": "application/json" }
  });
}

import {
  SOCIAL_CANDIDATE_API_POLICY_VERSION,
  SOCIAL_CANDIDATE_FIELDS,
  SOCIAL_CANDIDATE_RESPONSE_FIELDS,
  type SocialCandidateApiResponse,
  type SocialCandidateDto
} from "./types";

// SR-2E: the single runtime authority validating a social-candidate-list response before any client
// trusts it. A response that passes HTTP-level success but fails this check is never rendered.
//
// Validation is exact rather than permissive: an unexpected key is a rejection, not a field to
// ignore. That is what makes a future server-side field addition — a leaked identifier, score or
// entitlement flag — fail loudly at the client boundary instead of flowing silently into the UI.
export type SocialCandidateValidationOutcome =
  | { ok: true; value: SocialCandidateApiResponse }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validateCandidate(value: unknown, index: number): SocialCandidateDto | string {
  if (!isRecord(value)) return `candidates[${index}] is not an object`;
  if (!exactKeys(value, SOCIAL_CANDIDATE_FIELDS)) {
    return `candidates[${index}] does not carry exactly the five public fields`;
  }
  if (typeof value.candidateRef !== "string" || value.candidateRef.length === 0) {
    return `candidates[${index}].candidateRef is not a non-empty string`;
  }
  if (typeof value.displayName !== "string" || value.displayName.length === 0) {
    return `candidates[${index}].displayName is not a non-empty string`;
  }
  if (typeof value.mascotAvatarKey !== "string" || value.mascotAvatarKey.length === 0) {
    return `candidates[${index}].mascotAvatarKey is not a non-empty string`;
  }
  // A missing public bio is a real, expected state and stays null; it is never coerced to "".
  if (value.publicBio !== null && typeof value.publicBio !== "string") {
    return `candidates[${index}].publicBio is neither a string nor null`;
  }
  if (typeof value.willingToChat !== "boolean") {
    return `candidates[${index}].willingToChat is not a boolean`;
  }
  return Object.freeze({
    candidateRef: value.candidateRef,
    displayName: value.displayName,
    mascotAvatarKey: value.mascotAvatarKey,
    publicBio: value.publicBio,
    willingToChat: value.willingToChat
  });
}

export function validateSocialCandidateApiResponseV1(value: unknown): SocialCandidateValidationOutcome {
  if (!isRecord(value)) return { ok: false, reason: "response is not an object" };
  if (!exactKeys(value, SOCIAL_CANDIDATE_RESPONSE_FIELDS)) {
    return { ok: false, reason: "response does not carry exactly policyVersion and candidates" };
  }
  if (value.policyVersion !== SOCIAL_CANDIDATE_API_POLICY_VERSION) {
    return { ok: false, reason: "unexpected policyVersion" };
  }
  if (!Array.isArray(value.candidates)) return { ok: false, reason: "candidates is not an array" };

  const candidates: SocialCandidateDto[] = [];
  for (let index = 0; index < value.candidates.length; index += 1) {
    const candidate = validateCandidate(value.candidates[index], index);
    if (typeof candidate === "string") return { ok: false, reason: candidate };
    candidates.push(candidate);
  }
  // An empty list is a valid, successful response, never a failure.
  return {
    ok: true,
    value: Object.freeze({
      policyVersion: SOCIAL_CANDIDATE_API_POLICY_VERSION,
      candidates: Object.freeze(candidates)
    })
  };
}

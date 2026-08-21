import { SOCIAL_CANDIDATE_REF_PREFIX } from "../social-candidate-ref/policy.ts";

const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id", "x-user-id", "x-owner-user-id", "x-viewer-user-id",
  "x-candidate-user-id", "x-candidate-card-ref", "x-profile-id", "x-target-user-id",
  "x-entitlement", "x-entitlement-class", "x-premium", "x-tier", "x-plan-code",
  "x-ranking", "x-score", "x-similarity", "x-context-state", "x-context-score",
  "x-food-context-tag-key", "x-now", "x-clock"
] as const);

const MAXIMUM_CANDIDATE_REF_LENGTH = 512;
const REJECTED = Object.freeze({ ok: false, errorCode: "invalid_request" as const });

export type MealBuddyCandidateProfileRequest = Readonly<{ candidateRef: string }>;
export type MealBuddyCandidateProfileRequestOutcome =
  | { ok: true; value: MealBuddyCandidateProfileRequest }
  | typeof REJECTED;

export function carriesCandidateProfileAuthorityInput(request: Request): boolean {
  const url = new URL(request.url);
  return [...url.searchParams.keys()].length !== 0 || AUTHORITY_HEADERS.some((name) => request.headers.has(name));
}

// The opaque actor-bound person reference is the complete request contract. Display names, list
// positions, card refs, user/profile ids, tiers and disclosure switches are not expressible.
export async function parseMealBuddyCandidateProfileRequest(
  request: Request
): Promise<MealBuddyCandidateProfileRequestOutcome> {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return REJECTED;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return REJECTED;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !("candidateRef" in record)) return REJECTED;
  const candidateRef = record.candidateRef;
  if (
    typeof candidateRef !== "string" || candidateRef.length === 0 ||
    candidateRef.length > MAXIMUM_CANDIDATE_REF_LENGTH ||
    !candidateRef.startsWith(SOCIAL_CANDIDATE_REF_PREFIX)
  ) return REJECTED;
  return { ok: true, value: Object.freeze({ candidateRef }) };
}

// SR-2G-D request authority.
//
// The entire V1 client contract is one opaque, actor-bound, source-purpose card reference:
//
//     { "sourceCardRef": "mbc1..." }
//
// Nothing else is expressible. The actor comes only from the verified token, eligibility only from
// the frozen SR-2G-C pool, ranking only from SR-2A, the visible count only from SR-2B, and the
// interests only from the candidate owner's current profile. A caller therefore has no way to name a
// person, a card, a date, a meal period, a restaurant, a page, a limit, a tier or a clock.
import {
  MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS,
  MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY
} from "./policy.ts";
import { MEAL_BUDDY_CARD_REF_PREFIX } from "../meal-buddy-card-ref/policy.ts";

// Any header capable of naming an actor, an owner, a candidate, a card, a tier, a cap or a clock.
// Rejected rather than ignored: silently ignoring a header would let a client believe it had
// influenced identity, eligibility, ranking or exposure.
const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id",
  "x-user-id",
  "x-owner-user-id",
  "x-viewer-user-id",
  "x-requesting-user-id",
  "x-candidate-user-id",
  "x-candidate-user-ids",
  "x-candidates",
  "x-candidate-ref",
  "x-candidate-card-ref",
  "x-target-user-id",
  "x-target-user-ids",
  "x-card-id",
  "x-source-card-id",
  "x-source-card-ref",
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
  "x-interests",
  "x-now",
  "x-clock",
  "x-dining-date",
  "x-meal-period",
  "x-restaurant-id"
] as const);

// A reference is opaque, so its only defensible client-side shape check is the version marker the
// frozen SR-2G-A primitive mints. Everything that actually matters — actor binding, purpose binding,
// tampering and expiry — is decided by authenticated decryption, never by inspecting the string.
const MAXIMUM_SOURCE_CARD_REF_LENGTH = 512;

export type MealBuddyCandidateRequest = Readonly<{ sourceCardRef: string }>;

export type MealBuddyCandidateRequestOutcome =
  | { ok: true; value: MealBuddyCandidateRequest }
  | { ok: false; errorCode: "invalid_request" };

const REJECTED: MealBuddyCandidateRequestOutcome = Object.freeze({ ok: false, errorCode: "invalid_request" });

export function carriesMealBuddyCandidateAuthorityInput(request: Request): boolean {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 0) return true;
  return AUTHORITY_HEADERS.some((name) => request.headers.has(name));
}

// The body must be an object carrying exactly one key. An extra key is a rejected request even when
// its value would have been discarded: an accepted-and-ignored `limit` is indistinguishable, from
// the client's side, from an honoured one.
export async function parseMealBuddyCandidateRequest(
  request: Request
): Promise<MealBuddyCandidateRequestOutcome> {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return REJECTED;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return REJECTED;

  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY) return REJECTED;
  // Redundant with the exact-key check above, and kept deliberately: it names the specific
  // business-control keys that must never become expressible, so widening the contract by accident
  // fails a test rather than shipping.
  if (MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS.some((key) => key in (body as Record<string, unknown>))) {
    return REJECTED;
  }

  const sourceCardRef = (body as Record<string, unknown>)[MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY];
  if (
    typeof sourceCardRef !== "string" ||
    sourceCardRef.length === 0 ||
    sourceCardRef.length > MAXIMUM_SOURCE_CARD_REF_LENGTH ||
    !sourceCardRef.startsWith(MEAL_BUDDY_CARD_REF_PREFIX)
  ) {
    return REJECTED;
  }
  return { ok: true, value: Object.freeze({ sourceCardRef }) };
}

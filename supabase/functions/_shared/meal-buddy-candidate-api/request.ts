// SR-2G-D request authority.
//
// The V1 source identity remains one opaque actor-bound card reference. GEO-1D permits only one
// optional foreground point; the actor comes from the verified token and the caller still cannot
// name a candidate, branch, radius, ranking, exposure, entitlement or clock.
import {
  MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS,
  MEAL_BUDDY_CANDIDATE_API_GEO_REQUEST_KEY,
  MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY
} from "./policy.ts";
import { MEAL_BUDDY_CARD_REF_PREFIX } from "../meal-buddy-card-ref/policy.ts";
import { parseGeoPoint, type GeoPoint } from "../geo-api/index.ts";

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
  "x-restaurant-id",
  "x-branch-id",
  "x-latitude",
  "x-longitude",
  "x-geo-radius-meters"
] as const);

// A reference is opaque, so its only defensible client-side shape check is the version marker the
// frozen SR-2G-A primitive mints. Everything that actually matters — actor binding, purpose binding,
// tampering and expiry — is decided by authenticated decryption, never by inspecting the string.
const MAXIMUM_SOURCE_CARD_REF_LENGTH = 512;

export type MealBuddyCandidateRequest = Readonly<{
  sourceCardRef: string;
  geoOrigin: GeoPoint | null;
}>;

export type MealBuddyCandidateRequestOutcome =
  | { ok: true; value: MealBuddyCandidateRequest }
  | { ok: false; errorCode: "invalid_request" };

const REJECTED: MealBuddyCandidateRequestOutcome = Object.freeze({ ok: false, errorCode: "invalid_request" });

export function carriesMealBuddyCandidateAuthorityInput(request: Request): boolean {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 0) return true;
  return AUTHORITY_HEADERS.some((name) => request.headers.has(name));
}

// The body carries the frozen source reference and, only when foreground location is available,
// one exact `{ latitude, longitude }` Geo object. Every extra key is rejected rather than ignored.
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

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  const keySet = new Set(keys);
  const exactNonGeo = keys.length === 1 && keySet.has(MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY);
  const exactGeo = keys.length === 2 && keySet.has(MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY)
    && keySet.has(MEAL_BUDDY_CANDIDATE_API_GEO_REQUEST_KEY);
  if (!exactNonGeo && !exactGeo) return REJECTED;
  if (MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS.some((key) => key in record)) return REJECTED;

  const sourceCardRef = record[MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY];
  if (
    typeof sourceCardRef !== "string" ||
    sourceCardRef.length === 0 ||
    sourceCardRef.length > MAXIMUM_SOURCE_CARD_REF_LENGTH ||
    !sourceCardRef.startsWith(MEAL_BUDDY_CARD_REF_PREFIX)
  ) {
    return REJECTED;
  }

  let geoOrigin: GeoPoint | null = null;
  if (exactGeo) {
    const geo = record[MEAL_BUDDY_CANDIDATE_API_GEO_REQUEST_KEY];
    if (typeof geo !== "object" || geo === null || Array.isArray(geo)) return REJECTED;
    const geoRecord = geo as Record<string, unknown>;
    const geoKeys = Object.keys(geoRecord);
    if (geoKeys.length !== 2 || !geoKeys.includes("latitude") || !geoKeys.includes("longitude")) {
      return REJECTED;
    }
    const parsed = parseGeoPoint(geoRecord.latitude, geoRecord.longitude);
    if (!parsed.ok) return REJECTED;
    geoOrigin = parsed.value;
  }
  return { ok: true, value: Object.freeze({ sourceCardRef, geoOrigin }) };
}

import { MEAL_BUDDY_RELATIONSHIP_REF_PREFIX } from "../meal-buddy-relationship-ref/policy.ts";
import { SOCIAL_CANDIDATE_REF_PREFIX } from "../social-candidate-ref/policy.ts";
import type { MealBuddyRelationshipRequest } from "./types.ts";

const MAX_REF_LENGTH = 512;
const AUTHORITY_HEADERS = Object.freeze([
  "x-actor-user-id", "x-user-id", "x-target-user-id", "x-candidate-user-id", "x-relation-id",
  "x-pair-key", "x-block-state", "x-participation-state", "x-ranking", "x-entitlement", "x-tier"
] as const);
const REJECTED = Object.freeze({ ok: false, errorCode: "invalid_request" as const });

export type MealBuddyRelationshipRequestOutcome =
  | { ok: true; value: MealBuddyRelationshipRequest }
  | typeof REJECTED;

export function carriesMealBuddyRelationshipAuthorityInput(request: Request): boolean {
  const url = new URL(request.url);
  return url.search !== "" || AUTHORITY_HEADERS.some((key) => request.headers.has(key));
}

function validRef(value: unknown, prefix: string): value is string {
  return typeof value === "string" && value.length > prefix.length && value.length <= MAX_REF_LENGTH
    && value.startsWith(prefix);
}

export async function parseMealBuddyRelationshipRequest(request: Request): Promise<MealBuddyRelationshipRequestOutcome> {
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return REJECTED; }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return REJECTED;
  const record = body as Record<string, unknown>;
  const operation = record.operation;
  if (operation === "list") {
    return Object.keys(record).length === 1
      ? { ok: true, value: Object.freeze({ operation }) }
      : REJECTED;
  }
  if (operation === "send" || operation === "read") {
    return Object.keys(record).sort().join(",") === "candidateRef,operation"
      && validRef(record.candidateRef, SOCIAL_CANDIDATE_REF_PREFIX)
      ? { ok: true, value: Object.freeze({ operation, candidateRef: record.candidateRef }) }
      : REJECTED;
  }
  if (operation === "accept" || operation === "decline" || operation === "cancel" || operation === "unfriend") {
    return Object.keys(record).sort().join(",") === "operation,relationshipRef"
      && validRef(record.relationshipRef, MEAL_BUDDY_RELATIONSHIP_REF_PREFIX)
      ? { ok: true, value: Object.freeze({ operation, relationshipRef: record.relationshipRef }) }
      : REJECTED;
  }
  return REJECTED;
}

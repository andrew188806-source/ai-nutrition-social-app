import type { MealBuddyRelationshipRefCipher } from "../meal-buddy-relationship-ref/crypto.ts";
import type { SocialCandidateRefCipher } from "../social-candidate-ref/types.ts";
import type { MealBuddyRelationshipRepository } from "./repository.ts";
import {
  MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION,
  type InternalMealBuddyRelationshipRow,
  type MealBuddyRelationshipRequest,
  type MealBuddyRelationshipResponse
} from "./types.ts";

export class MealBuddyRelationshipService {
  constructor(
    private readonly repository: MealBuddyRelationshipRepository,
    private readonly candidateCipher: SocialCandidateRefCipher,
    private readonly relationshipCipher: MealBuddyRelationshipRefCipher
  ) {}

  async execute(actorUserId: string, request: MealBuddyRelationshipRequest, now: Date): Promise<MealBuddyRelationshipResponse> {
    let rows: readonly InternalMealBuddyRelationshipRow[];
    if (request.operation === "send" || request.operation === "read") {
      const claims = await this.candidateCipher.open(actorUserId, request.candidateRef, now);
      rows = request.operation === "send"
        ? await this.repository.send(actorUserId, claims.candidateUserId)
        : await this.repository.read(actorUserId, claims.candidateUserId);
    } else if (request.operation === "accept" || request.operation === "decline" || request.operation === "cancel") {
      const claims = await this.relationshipCipher.open(actorUserId, request.relationshipRef, now);
      rows = await this.repository.resolve(actorUserId, claims.relationId, request.operation);
      if (rows.length !== 1) throw new Error("meal_buddy_relationship_action_unavailable");
    } else {
      rows = await this.repository.list(actorUserId);
    }
    if (request.operation === "send" && rows.length !== 1) throw new Error("meal_buddy_relationship_cardinality_invalid");
    if (request.operation !== "list" && rows.length > 1) throw new Error("meal_buddy_relationship_cardinality_invalid");
    const relationships = [];
    for (const row of rows) {
      relationships.push(Object.freeze({
        relationshipRef: await this.relationshipCipher.seal(actorUserId, row.relation_id, now),
        state: row.relative_state,
        counterpart: row.counterpart
      }));
    }
    return Object.freeze({
      policyVersion: MEAL_BUDDY_RELATIONSHIP_POLICY_VERSION,
      relationships: Object.freeze(relationships)
    });
  }
}

import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type {
  InternalMealBuddyRelationshipCounterpartRow,
  InternalMealBuddyRelationshipDatabaseRow,
  InternalMealBuddyRelationshipRow,
  MealBuddyRelationshipState
} from "./types.ts";

const SEND = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.send_meal_buddy_invite($1::uuid, $2::uuid)
`;
const READ = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.read_meal_buddy_relationship($1::uuid, $2::uuid)
`;
const LIST = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.list_meal_buddy_relationships($1::uuid)
`;
const RESOLVE = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.resolve_meal_buddy_relationship($1::uuid, $2::uuid, $3::text)
`;
const PROJECT_COUNTERPARTS = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipCounterpartRow>`
  select exposure_ordinal, display_name, mascot_avatar_key
  from social_internal.project_exposed_social_profiles($1::uuid, $2::uuid[])
`;

const PROFILE_BATCH_SIZE = 10;

export interface MealBuddyRelationshipRepository {
  send(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  read(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  list(actorUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  resolve(actorUserId: string, relationId: string, action: "accept" | "decline" | "cancel"):
    Promise<readonly InternalMealBuddyRelationshipRow[]>;
}

export class ExecutorMealBuddyRelationshipRepository implements MealBuddyRelationshipRepository {
  constructor(private readonly transport: SocialRuntimeExecutorTransport) {}
  send(actor: string, target: string) { return this.query(actor, SEND, [actor, target]); }
  read(actor: string, target: string) { return this.query(actor, READ, [actor, target]); }
  list(actor: string) { return this.query(actor, LIST, [actor]); }
  resolve(actor: string, relation: string, action: "accept" | "decline" | "cancel") {
    return this.query(actor, RESOLVE, [actor, relation, action]);
  }
  private async query(
    actorUserId: string,
    statement: SocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>,
    parameters: readonly unknown[]
  ): Promise<readonly InternalMealBuddyRelationshipRow[]> {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(statement, parameters);
      const relationships = rows.map(parseRelationshipRow);
      if (relationships.length === 0) return Object.freeze([]);

      const counterpartIds = relationships.map((row) => row.counterpart_user_id);
      if (new Set(counterpartIds.map((value) => value.toLowerCase())).size !== counterpartIds.length) {
        throw new Error("meal_buddy_relationship_counterpart_duplicate");
      }
      const counterparts = new Map<string, Readonly<{ displayName: string; mascotAvatarKey: string }>>();
      for (let offset = 0; offset < counterpartIds.length; offset += PROFILE_BATCH_SIZE) {
        const batch = counterpartIds.slice(offset, offset + PROFILE_BATCH_SIZE);
        const profileRows = await transaction.query(PROJECT_COUNTERPARTS, [actorUserId, batch]);
        const parsed = parseCounterpartBatch(profileRows, batch.length);
        for (let index = 0; index < batch.length; index += 1) {
          counterparts.set(batch[index], parsed[index]);
        }
      }
      return Object.freeze(relationships.map((row) => {
        const counterpart = counterparts.get(row.counterpart_user_id);
        if (!counterpart) throw new Error("meal_buddy_relationship_counterpart_unavailable");
        return Object.freeze({ ...row, counterpart });
      }));
    });
  }
}

function parseRelationshipRow(
  value: InternalMealBuddyRelationshipDatabaseRow
): InternalMealBuddyRelationshipDatabaseRow {
  if (!value || typeof value.relation_id !== "string" || !value.relation_id
    || typeof value.counterpart_user_id !== "string" || !value.counterpart_user_id
    || !isState(value.relative_state)) throw new Error("meal_buddy_relationship_row_invalid");
  return Object.freeze({ ...value });
}

function parseCounterpartBatch(
  rows: readonly InternalMealBuddyRelationshipCounterpartRow[],
  expectedCount: number
): readonly Readonly<{ displayName: string; mascotAvatarKey: string }>[] {
  if (rows.length !== expectedCount) throw new Error("meal_buddy_relationship_counterpart_unavailable");
  const byOrdinal = new Map<number, Readonly<{ displayName: string; mascotAvatarKey: string }>>();
  for (const row of rows) {
    if (!row || !Number.isInteger(row.exposure_ordinal) || row.exposure_ordinal < 0
      || row.exposure_ordinal >= expectedCount || byOrdinal.has(row.exposure_ordinal)
      || typeof row.display_name !== "string" || row.display_name.length === 0
      || typeof row.mascot_avatar_key !== "string" || row.mascot_avatar_key.length === 0) {
      throw new Error("meal_buddy_relationship_counterpart_invalid");
    }
    byOrdinal.set(row.exposure_ordinal, Object.freeze({
      displayName: row.display_name,
      mascotAvatarKey: row.mascot_avatar_key
    }));
  }
  return Object.freeze(Array.from({ length: expectedCount }, (_, index) => {
    const counterpart = byOrdinal.get(index);
    if (!counterpart) throw new Error("meal_buddy_relationship_counterpart_unavailable");
    return counterpart;
  }));
}
function isState(value: unknown): value is MealBuddyRelationshipState {
  return value === "none" || value === "outgoing_pending" || value === "incoming_pending" || value === "accepted";
}

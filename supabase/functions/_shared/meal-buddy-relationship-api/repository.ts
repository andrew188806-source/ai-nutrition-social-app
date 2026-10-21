import type {SocialRuntimeReadPort} from '../social-runtime-transport/readPort.ts';
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorStatement
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type {
  InternalMealBuddyRelationshipCounterpartRow,
  InternalMealBuddyRelationshipDatabaseRow,
  InternalMealBuddyRelationshipRow,
  MealBuddyRelationshipState
} from "./types.ts";

const BIND_ACTOR = defineSocialRuntimeExecutorStatement<{ actor_context: string }>`
  select pg_catalog.set_config('request.jwt.claim.sub', $1::text, true) as actor_context
`;
const SEND_PHONE_SEARCH = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.send_phone_search_invite($1::uuid, $2::uuid)
`;
const SEND = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.send_meal_buddy_invite($1::uuid, $2::uuid)
`;
const LEGACY_REPLAY = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
 select relation_id::text,counterpart_user_id::text,relative_state from stranger_internal.legacy_replay($1::uuid,$2::uuid)
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
// SR-2K-B. Ending an accepted pair is its own canonical authority, not a fourth `resolve` action:
// resolve owns the PENDING lifecycle and refuses anything else, while this owns the ACCEPTED one.
const UNFRIEND = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.end_meal_buddy_relationship($1::uuid, $2::uuid)
`;
const PROJECT_COUNTERPARTS = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipCounterpartRow>`
  select exposure_ordinal, display_name, mascot_avatar_key, anonymous
  from stranger_internal.project_counterparts($1::uuid, $2::uuid[])
`;

const PROFILE_BATCH_SIZE = 10;

export interface MealBuddyRelationshipRepository {
  send(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  legacyReplay?(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  sendPhoneSearch(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  read(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  list(actorUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  resolve(actorUserId: string, relationId: string, action: "accept" | "decline" | "cancel"):
    Promise<readonly InternalMealBuddyRelationshipRow[]>;
  unfriend(actorUserId: string, relationId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
}

export class ExecutorMealBuddyRelationshipRepository implements MealBuddyRelationshipRepository {
  constructor(private readonly transport: SocialRuntimeReadPort) {}
  legacyReplay(actor:string,target:string){return this.query(actor,LEGACY_REPLAY,[actor,target],true);}
  send(actor: string, target: string) { return this.query(actor, SEND, [actor, target]); }
  sendPhoneSearch(actor: string, target: string) { return this.query(actor, SEND_PHONE_SEARCH, [actor, target], true); }
  read(actor: string, target: string) { return this.query(actor, READ, [actor, target]); }
  list(actor: string) { return this.query(actor, LIST, [actor]); }
  resolve(actor: string, relation: string, action: "accept" | "decline" | "cancel") {
    return this.query(actor, RESOLVE, [actor, relation, action]);
  }
  unfriend(actor: string, relation: string) { return this.query(actor, UNFRIEND, [actor, relation]); }
  private async query(
    actorUserId: string,
    statement: SocialRuntimeExecutorStatement<InternalMealBuddyRelationshipDatabaseRow>,
    parameters: readonly unknown[],
    bindActor = false
  ): Promise<readonly InternalMealBuddyRelationshipRow[]> {
    return await this.transport.withTransaction(async (transaction) => {
      await transaction.query(BIND_ACTOR, [actorUserId]);
      const rows = await transaction.query(statement, parameters);
      const relationships = rows.map(parseRelationshipRow);
      if (relationships.length === 0) return Object.freeze([]);

      const counterpartIds = relationships.map((row) => row.counterpart_user_id);
      if (new Set(counterpartIds.map((value) => value.toLowerCase())).size !== counterpartIds.length) {
        throw new Error("meal_buddy_relationship_counterpart_duplicate");
      }
      const counterparts = new Map<string, Readonly<{ displayName: string; mascotAvatarKey: string; anonymous: boolean }>>();
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
        return Object.freeze({ ...row, strangerPending: counterpart.anonymous, counterpart: {displayName:counterpart.displayName,mascotAvatarKey:counterpart.mascotAvatarKey} });
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
): readonly Readonly<{ displayName: string; mascotAvatarKey: string; anonymous: boolean }>[] {
  if (rows.length !== expectedCount) throw new Error("meal_buddy_relationship_counterpart_unavailable");
  const byOrdinal = new Map<number, Readonly<{ displayName: string; mascotAvatarKey: string; anonymous: boolean }>>();
  for (const row of rows) {
    if (!row || !Number.isInteger(row.exposure_ordinal) || row.exposure_ordinal < 0
      || row.exposure_ordinal >= expectedCount || byOrdinal.has(row.exposure_ordinal)
      || typeof row.anonymous !== "boolean"
      || typeof row.display_name !== "string" || row.display_name.length === 0
      || typeof row.mascot_avatar_key !== "string" || row.mascot_avatar_key.length === 0) {
      throw new Error("meal_buddy_relationship_counterpart_invalid");
    }
    byOrdinal.set(row.exposure_ordinal, Object.freeze({
      anonymous: row.anonymous,
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

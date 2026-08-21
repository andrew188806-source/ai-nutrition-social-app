import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type {
  InternalMealBuddyRelationshipRow,
  MealBuddyRelationshipState
} from "./types.ts";

const SEND = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.send_meal_buddy_invite($1::uuid, $2::uuid)
`;
const READ = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.read_meal_buddy_relationship($1::uuid, $2::uuid)
`;
const LIST = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.list_meal_buddy_relationships($1::uuid)
`;
const RESOLVE = defineSocialRuntimeExecutorStatement<InternalMealBuddyRelationshipRow>`
  select relation_id::text, counterpart_user_id::text, relative_state
  from social_internal.resolve_meal_buddy_relationship($1::uuid, $2::uuid, $3::text)
`;

export interface MealBuddyRelationshipRepository {
  send(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  read(actorUserId: string, targetUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  list(actorUserId: string): Promise<readonly InternalMealBuddyRelationshipRow[]>;
  resolve(actorUserId: string, relationId: string, action: "accept" | "decline" | "cancel"):
    Promise<readonly InternalMealBuddyRelationshipRow[]>;
}

export class ExecutorMealBuddyRelationshipRepository implements MealBuddyRelationshipRepository {
  constructor(private readonly transport: SocialRuntimeExecutorTransport) {}
  send(actor: string, target: string) { return this.query(SEND, [actor, target]); }
  read(actor: string, target: string) { return this.query(READ, [actor, target]); }
  list(actor: string) { return this.query(LIST, [actor]); }
  resolve(actor: string, relation: string, action: "accept" | "decline" | "cancel") {
    return this.query(RESOLVE, [actor, relation, action]);
  }
  private async query(
    statement: typeof SEND,
    parameters: readonly unknown[]
  ): Promise<readonly InternalMealBuddyRelationshipRow[]> {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(statement, parameters);
      return Object.freeze(rows.map(parseRow));
    });
  }
}

function parseRow(value: InternalMealBuddyRelationshipRow): InternalMealBuddyRelationshipRow {
  if (!value || typeof value.relation_id !== "string" || !value.relation_id
    || typeof value.counterpart_user_id !== "string" || !value.counterpart_user_id
    || !isState(value.relative_state)) throw new Error("meal_buddy_relationship_row_invalid");
  return Object.freeze({ ...value });
}
function isState(value: unknown): value is MealBuddyRelationshipState {
  return value === "none" || value === "outgoing_pending" || value === "incoming_pending" || value === "accepted";
}

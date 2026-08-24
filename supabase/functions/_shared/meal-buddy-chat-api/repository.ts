import { defineSocialRuntimeExecutorStatement, type SocialRuntimeExecutorTransaction, type SocialRuntimeExecutorTransport } from "../social-runtime-transport/executorTransactionTransport.ts";
import type { InternalChatChannelRow, InternalChatConversation, InternalChatConversationRow, InternalChatMessage, InternalChatMessageRow, InternalChatProfileRow, MealBuddyChatCounterpart } from "./types.ts";

const OPEN = defineSocialRuntimeExecutorStatement<InternalChatConversationRow>`select conversation_id::text, counterpart_user_id::text from social_internal.open_meal_buddy_chat($1::uuid, $2::uuid)`;
const READ = defineSocialRuntimeExecutorStatement<InternalChatConversationRow>`select conversation_id::text, counterpart_user_id::text from social_internal.read_meal_buddy_chat($1::uuid, $2::uuid)`;
const LIST = defineSocialRuntimeExecutorStatement<InternalChatMessageRow>`select message_ref_id::text, counterpart_user_id::text, sender_is_actor, body, created_at::text from social_internal.list_meal_buddy_chat_messages($1::uuid, $2::uuid, $3::uuid, $4::integer)`;
const SEND = defineSocialRuntimeExecutorStatement<InternalChatMessageRow>`select message_ref_id::text, counterpart_user_id::text, sender_is_actor, body, created_at::text from social_internal.send_meal_buddy_chat_message($1::uuid, $2::uuid, $3::uuid, $4::text)`;
const PROFILE = defineSocialRuntimeExecutorStatement<InternalChatProfileRow>`select exposure_ordinal, display_name, mascot_avatar_key from social_internal.project_exposed_social_profiles($1::uuid, $2::uuid[])`;
// SR-2K-B. Issued inside the SAME transaction that just authorized the conversation, so a topic can
// never be handed to a caller the chat gate refused.
const CHANNEL = defineSocialRuntimeExecutorStatement<InternalChatChannelRow>`select topic::text from social_internal.authorize_meal_buddy_chat_channel($1::uuid, $2::uuid)`;

export interface MealBuddyChatRepository {
  open(actorUserId: string, relationshipId: string): Promise<Readonly<{ conversation: InternalChatConversation; realtimeTopic: string | null }>>;
  list(actorUserId: string, conversationId: string, beforeMessageRefId: string | null, limit: number): Promise<Readonly<{ conversation: InternalChatConversation; messages: readonly InternalChatMessage[] }>>;
  send(actorUserId: string, conversationId: string, clientMessageId: string, body: string): Promise<Readonly<{ conversation: InternalChatConversation; message: InternalChatMessage }>>;
}
export class ExecutorMealBuddyChatRepository implements MealBuddyChatRepository {
  constructor(private readonly transport: SocialRuntimeExecutorTransport) {}
  async open(actor: string, relationship: string) {
    return this.transport.withTransaction(async (tx) => {
      const conversation = await this.conversation(actor, await tx.query(OPEN, [actor, relationship]), tx);
      const channel = await tx.query(CHANNEL, [actor, conversation.conversationId]);
      // A missing topic is not a chat failure: the conversation is still fully usable through the
      // canonical API, it simply has no realtime supplement this time.
      const topic = channel.length === 1 && typeof channel[0]?.topic === "string" && channel[0].topic
        ? channel[0].topic : null;
      return Object.freeze({ conversation, realtimeTopic: topic });
    });
  }
  async list(actor: string, conversationId: string, before: string | null, limit: number) {
    return this.transport.withTransaction(async (tx) => { const conversation = await this.conversation(actor, await tx.query(READ, [actor, conversationId]), tx); const rows = await tx.query(LIST, [actor, conversationId, before, limit]); return Object.freeze({ conversation, messages: Object.freeze(rows.map(parseMessage)) }); });
  }
  async send(actor: string, conversationId: string, clientMessageId: string, body: string) {
    return this.transport.withTransaction(async (tx) => { const rows = await tx.query(SEND, [actor, conversationId, clientMessageId, body]); if (rows.length !== 1) throw new Error("meal_buddy_chat_unavailable"); const conversation = await this.conversation(actor, [{ conversation_id: conversationId, counterpart_user_id: rows[0].counterpart_user_id }], tx); return Object.freeze({ conversation, message: parseMessage(rows[0]) }); });
  }
  private async conversation(actor: string, rows: readonly InternalChatConversationRow[], tx: SocialRuntimeExecutorTransaction): Promise<InternalChatConversation> {
    if (rows.length !== 1 || !rows[0]?.conversation_id || !rows[0]?.counterpart_user_id) throw new Error("meal_buddy_chat_unavailable");
    const profiles = await tx.query(PROFILE, [actor, [rows[0].counterpart_user_id]]);
    if (profiles.length !== 1 || profiles[0].exposure_ordinal !== 0 || typeof profiles[0].display_name !== "string" || !profiles[0].display_name || typeof profiles[0].mascot_avatar_key !== "string" || !profiles[0].mascot_avatar_key) throw new Error("meal_buddy_chat_counterpart_unavailable");
    const counterpart: MealBuddyChatCounterpart = Object.freeze({ displayName: profiles[0].display_name, mascotAvatarKey: profiles[0].mascot_avatar_key });
    return Object.freeze({ conversationId: rows[0].conversation_id, counterpartUserId: rows[0].counterpart_user_id, counterpart });
  }
}
function parseMessage(row: InternalChatMessageRow): InternalChatMessage {
  const createdAt = new Date(row.created_at);
  if (!row?.message_ref_id || typeof row.sender_is_actor !== "boolean" || typeof row.body !== "string" || !row.body.trim() || row.body.length > 2000 || !Number.isFinite(createdAt.getTime())) throw new Error("meal_buddy_chat_message_invalid");
  return Object.freeze({ messageId: row.message_ref_id, mine: row.sender_is_actor, body: row.body, createdAt: createdAt.toISOString() });
}

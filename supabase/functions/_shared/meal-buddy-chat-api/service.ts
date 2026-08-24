import type { MealBuddyChatRefCipher } from "../meal-buddy-chat-ref/crypto.ts";
import type { MealBuddyRelationshipRefCipher } from "../meal-buddy-relationship-ref/crypto.ts";
import type { MealBuddyChatRepository } from "./repository.ts";
import { MEAL_BUDDY_CHAT_POLICY_VERSION, type InternalChatConversation, type InternalChatMessage, type MealBuddyChatRequest, type MealBuddyChatResponse } from "./types.ts";

export class MealBuddyChatService {
  constructor(private readonly repository: MealBuddyChatRepository, private readonly relationshipCipher: MealBuddyRelationshipRefCipher, private readonly chatCipher: MealBuddyChatRefCipher) {}
  async execute(actor: string, request: MealBuddyChatRequest, now: Date): Promise<MealBuddyChatResponse> {
    if (request.operation === "open") {
      const relationship = await this.relationshipCipher.open(actor, request.relationshipRef, now);
      const opened = await this.repository.open(actor, relationship.relationId);
      return Object.freeze({ policyVersion: MEAL_BUDDY_CHAT_POLICY_VERSION, conversation: await this.publicConversation(actor, opened.conversation, now), realtimeTopic: opened.realtimeTopic });
    }
    const conversationId = await this.chatCipher.openConversation(actor, request.conversationRef, now);
    if (request.operation === "send") {
      const result = await this.repository.send(actor, conversationId, request.clientMessageId, request.body);
      return Object.freeze({ policyVersion: MEAL_BUDDY_CHAT_POLICY_VERSION, conversation: await this.publicConversation(actor, result.conversation, now), message: await this.publicMessage(actor, result.message, now) });
    }
    const beforeId = request.before ? await this.chatCipher.openMessage(actor, request.before) : null;
    const result = await this.repository.list(actor, conversationId, beforeId, request.limit);
    const page = result.messages.slice(0, request.limit); const hasMore = result.messages.length > request.limit;
    const messages = []; for (const message of [...page].reverse()) messages.push(await this.publicMessage(actor, message, now));
    const nextCursor = hasMore && page.length ? await this.chatCipher.sealMessage(actor, page[page.length - 1].messageId) : null;
    return Object.freeze({ policyVersion: MEAL_BUDDY_CHAT_POLICY_VERSION, conversation: await this.publicConversation(actor, result.conversation, now), messages: Object.freeze(messages), nextCursor });
  }
  private async publicConversation(actor: string, value: InternalChatConversation, now: Date) { return Object.freeze({ conversationRef: await this.chatCipher.sealConversation(actor, value.conversationId, now), counterpart: value.counterpart }); }
  private async publicMessage(actor: string, value: InternalChatMessage, _now: Date) { return Object.freeze({ messageRef: await this.chatCipher.sealMessage(actor, value.messageId), mine: value.mine, body: value.body, createdAt: value.createdAt }); }
}

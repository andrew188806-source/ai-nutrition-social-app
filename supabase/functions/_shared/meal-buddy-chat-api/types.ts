export const MEAL_BUDDY_CHAT_POLICY_VERSION = "meal-buddy-chat-v1" as const;
export const MEAL_BUDDY_CHAT_MAX_BODY_LENGTH = 2000 as const;
export const MEAL_BUDDY_CHAT_DEFAULT_PAGE_SIZE = 30 as const;
export const MEAL_BUDDY_CHAT_MAX_PAGE_SIZE = 50 as const;

export type MealBuddyChatRequest =
  | Readonly<{ operation: "open"; relationshipRef: string }>
  | Readonly<{ operation: "list_messages"; conversationRef: string; before: string | null; limit: number }>
  | Readonly<{ operation: "send"; conversationRef: string; clientMessageId: string; body: string }>;
export type MealBuddyChatCounterpart = Readonly<{ displayName: string; mascotAvatarKey: string }>;
export type MealBuddyChatConversation = Readonly<{ conversationRef: string; counterpart: MealBuddyChatCounterpart }>;
export type MealBuddyChatMessage = Readonly<{ messageRef: string; mine: boolean; body: string; createdAt: string }>;
export type MealBuddyChatResponse =
  | Readonly<{ policyVersion: typeof MEAL_BUDDY_CHAT_POLICY_VERSION; conversation: MealBuddyChatConversation }>
  | Readonly<{ policyVersion: typeof MEAL_BUDDY_CHAT_POLICY_VERSION; conversation: MealBuddyChatConversation; messages: readonly MealBuddyChatMessage[]; nextCursor: string | null }>
  | Readonly<{ policyVersion: typeof MEAL_BUDDY_CHAT_POLICY_VERSION; conversation: MealBuddyChatConversation; message: MealBuddyChatMessage }>;

export type InternalChatConversationRow = Readonly<{ conversation_id: string; counterpart_user_id: string }>;
export type InternalChatMessageRow = Readonly<{ message_ref_id: string; counterpart_user_id: string; sender_is_actor: boolean; body: string; created_at: string }>;
export type InternalChatProfileRow = Readonly<{ exposure_ordinal: number; display_name: string; mascot_avatar_key: string }>;
export type InternalChatConversation = Readonly<{ conversationId: string; counterpartUserId: string; counterpart: MealBuddyChatCounterpart }>;
export type InternalChatMessage = Readonly<{ messageId: string; mine: boolean; body: string; createdAt: string }>;

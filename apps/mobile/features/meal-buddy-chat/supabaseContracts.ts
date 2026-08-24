import { MEAL_BUDDY_CHAT_POLICY_VERSION } from "./types";

export const MEAL_BUDDY_CHAT_FUNCTION_NAME = "meal-buddy-chat" as const;

// Exactly the frozen SR-2J-A request shapes. Mobile never sends a sender identifier, a user id, a
// conversation id, a pair key, or any field outside these three closed operations.
export type MealBuddyChatApiRequest =
  | Readonly<{ operation: "open"; relationshipRef: string }>
  | Readonly<{ operation: "list_messages"; conversationRef: string; before: string | null; limit: number }>
  | Readonly<{ operation: "send"; conversationRef: string; clientMessageId: string; body: string }>;

export type MealBuddyChatApiCounterpart = Readonly<{ displayName: string; mascotAvatarKey: string }>;
export type MealBuddyChatApiConversation = Readonly<{
  conversationRef: string;
  counterpart: MealBuddyChatApiCounterpart;
}>;
export type MealBuddyChatApiMessage = Readonly<{
  messageRef: string;
  mine: boolean;
  body: string;
  createdAt: string;
}>;

export type MealBuddyChatOpenResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CHAT_POLICY_VERSION;
  conversation: MealBuddyChatApiConversation;
  realtimeTopic: string | null;
}>;
export type MealBuddyChatListResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CHAT_POLICY_VERSION;
  conversation: MealBuddyChatApiConversation;
  messages: readonly MealBuddyChatApiMessage[];
  nextCursor: string | null;
}>;
export type MealBuddyChatSendResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CHAT_POLICY_VERSION;
  conversation: MealBuddyChatApiConversation;
  message: MealBuddyChatApiMessage;
}>;

export type SupabaseMealBuddyChatInvokeError = Readonly<{
  context?: { json(): Promise<unknown> };
}>;

export type SupabaseMealBuddyChatClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_CHAT_FUNCTION_NAME,
      options: Readonly<{ body: MealBuddyChatApiRequest }>
    ): Promise<Readonly<{ data: T | null; error: SupabaseMealBuddyChatInvokeError | null }>>;
  };
};

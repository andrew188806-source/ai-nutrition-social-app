// SR-2J-B Mobile chat activation. Every identity that crosses the public boundary stays an opaque
// server-issued reference; Mobile never decodes one and never derives authority from possessing one.

export const MEAL_BUDDY_CHAT_POLICY_VERSION = "meal-buddy-chat-v1" as const;
export const MEAL_BUDDY_CHAT_MAX_BODY_LENGTH = 2000 as const;
export const MEAL_BUDDY_CHAT_PAGE_SIZE = 30 as const;

// Distinct brands keep the four opaque references from being interchanged by accident: a
// relationship ref can never be passed where a conversation ref is required, and so on.
declare const relationshipRefBrand: unique symbol;
declare const conversationRefBrand: unique symbol;
declare const messageRefBrand: unique symbol;
declare const cursorBrand: unique symbol;
export type MealBuddyChatRelationshipRef = string & { readonly [relationshipRefBrand]: true };
export type MealBuddyChatConversationRef = string & { readonly [conversationRefBrand]: true };
export type MealBuddyChatMessageRef = string & { readonly [messageRefBrand]: true };
export type MealBuddyChatCursor = string & { readonly [cursorBrand]: true };

export const MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX = "mbr1." as const;
export const MEAL_BUDDY_CHAT_CONVERSATION_REF_PREFIX = "mbchat1." as const;
export const MEAL_BUDDY_CHAT_MESSAGE_REF_PREFIX = "mbmsg1." as const;

export function isMealBuddyChatRelationshipRef(value: unknown): value is MealBuddyChatRelationshipRef {
  return isRef(value, MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX);
}
export function isMealBuddyChatConversationRef(value: unknown): value is MealBuddyChatConversationRef {
  return isRef(value, MEAL_BUDDY_CHAT_CONVERSATION_REF_PREFIX);
}
export function isMealBuddyChatMessageRef(value: unknown): value is MealBuddyChatMessageRef {
  return isRef(value, MEAL_BUDDY_CHAT_MESSAGE_REF_PREFIX);
}
function isRef(value: unknown, prefix: string): boolean {
  return typeof value === "string" && value.length > prefix.length && value.length <= 512 && value.startsWith(prefix);
}

export type MealBuddyChatErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "network_error"
  | "server_unavailable"
  | "invalid_server_response"
  | "operation_not_enabled";

export type MealBuddyChatCounterpart = Readonly<{ displayName: string; mascotAvatarKey: string }>;
export type MealBuddyChatMessage = Readonly<{
  messageRef: MealBuddyChatMessageRef;
  mine: boolean;
  body: string;
  createdAt: string;
}>;
export type MealBuddyChatConversation = Readonly<{
  conversationRef: MealBuddyChatConversationRef;
  counterpart: MealBuddyChatCounterpart;
}>;

export type MealBuddyChatOpenSnapshot = Readonly<{ conversation: MealBuddyChatConversation }>;
export type MealBuddyChatPageSnapshot = Readonly<{
  conversation: MealBuddyChatConversation;
  messages: readonly MealBuddyChatMessage[];
  nextCursor: MealBuddyChatCursor | null;
}>;
export type MealBuddyChatSendSnapshot = Readonly<{
  conversation: MealBuddyChatConversation;
  message: MealBuddyChatMessage;
}>;

export type MealBuddyChatOutcome<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; errorCode: MealBuddyChatErrorCode }>;

export interface MealBuddyChatRepository {
  readonly source: "disabled" | "supabase-live";
  open(relationshipRef: string): Promise<MealBuddyChatOutcome<MealBuddyChatOpenSnapshot>>;
  listMessages(
    conversationRef: string,
    before: string | null,
    limit: number
  ): Promise<MealBuddyChatOutcome<MealBuddyChatPageSnapshot>>;
  send(
    conversationRef: string,
    clientMessageId: string,
    body: string
  ): Promise<MealBuddyChatOutcome<MealBuddyChatSendSnapshot>>;
}

// One logical user message owns one idempotency key for its whole lifetime, including every
// uncertain-transport retry. A new key is allocated only when the user starts a NEW logical send.
export type MealBuddyChatPendingSend = Readonly<{
  clientMessageId: string;
  body: string;
  phase: "sending" | "retryable";
}>;

export type MealBuddyChatOlderPhase = "idle" | "loading" | "exhausted" | "failed";

export type MealBuddyChatState =
  | Readonly<{ phase: "signed_out"; errorCode: null }>
  | Readonly<{ phase: "opening"; errorCode: null }>
  | Readonly<{ phase: "open_failed"; errorCode: MealBuddyChatErrorCode }>
  // Authorization/safety failure after history was already visible. History is cleared, not kept:
  // possessing previously loaded messages must never act as ongoing authorization.
  | Readonly<{ phase: "unavailable"; errorCode: MealBuddyChatErrorCode }>
  | Readonly<{
      phase: "ready";
      counterpart: MealBuddyChatCounterpart;
      messages: readonly MealBuddyChatMessage[];
      olderPhase: MealBuddyChatOlderPhase;
      refreshing: boolean;
      pendingSend: MealBuddyChatPendingSend | null;
      draftRejected: boolean;
      errorCode: MealBuddyChatErrorCode | null;
    }>;

export function isSubmittableMealBuddyChatBody(value: string): boolean {
  return value.trim().length > 0 && value.length <= MEAL_BUDDY_CHAT_MAX_BODY_LENGTH;
}

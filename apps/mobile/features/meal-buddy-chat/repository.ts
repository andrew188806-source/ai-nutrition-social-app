import type { ConsumerAuthPort } from "../consumer-auth";
import {
  MEAL_BUDDY_CHAT_FUNCTION_NAME,
  type MealBuddyChatApiRequest,
  type MealBuddyChatListResponse,
  type MealBuddyChatOpenResponse,
  type MealBuddyChatSendResponse,
  type SupabaseMealBuddyChatClientLike,
  type SupabaseMealBuddyChatInvokeError
} from "./supabaseContracts";
import {
  MEAL_BUDDY_CHAT_MAX_BODY_LENGTH,
  MEAL_BUDDY_CHAT_MESSAGE_REF_PREFIX,
  MEAL_BUDDY_CHAT_POLICY_VERSION,
  isMealBuddyChatConversationRef,
  isMealBuddyChatMessageRef,
  isMealBuddyChatRelationshipRef,
  type MealBuddyChatConversation,
  type MealBuddyChatCursor,
  type MealBuddyChatErrorCode,
  type MealBuddyChatMessage,
  type MealBuddyChatOpenSnapshot,
  type MealBuddyChatOutcome,
  type MealBuddyChatPageSnapshot,
  type MealBuddyChatRepository,
  type MealBuddyChatSendSnapshot
} from "./types";

const KNOWN_SERVER_ERRORS = new Set<MealBuddyChatErrorCode>([
  "authentication_required",
  "invalid_request",
  "server_unavailable"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SupabaseMealBuddyChatRepository implements MealBuddyChatRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseMealBuddyChatClientLike
  ) {}

  open(relationshipRef: string) {
    if (!isMealBuddyChatRelationshipRef(relationshipRef)) return rejected<MealBuddyChatOpenSnapshot>();
    return this.invoke<MealBuddyChatOpenResponse, MealBuddyChatOpenSnapshot>(
      { operation: "open", relationshipRef },
      parseOpen
    );
  }

  listMessages(conversationRef: string, before: string | null, limit: number) {
    if (!isMealBuddyChatConversationRef(conversationRef)) return rejected<MealBuddyChatPageSnapshot>();
    if (before !== null && !isMealBuddyChatMessageRef(before)) return rejected<MealBuddyChatPageSnapshot>();
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return rejected<MealBuddyChatPageSnapshot>();
    return this.invoke<MealBuddyChatListResponse, MealBuddyChatPageSnapshot>(
      { operation: "list_messages", conversationRef, before, limit },
      parseList
    );
  }

  send(conversationRef: string, clientMessageId: string, body: string) {
    if (!isMealBuddyChatConversationRef(conversationRef)) return rejected<MealBuddyChatSendSnapshot>();
    if (typeof clientMessageId !== "string" || !UUID.test(clientMessageId)) return rejected<MealBuddyChatSendSnapshot>();
    if (typeof body !== "string" || body.trim().length === 0 || body.length > MEAL_BUDDY_CHAT_MAX_BODY_LENGTH) {
      return rejected<MealBuddyChatSendSnapshot>();
    }
    return this.invoke<MealBuddyChatSendResponse, MealBuddyChatSendSnapshot>(
      { operation: "send", conversationRef, clientMessageId, body },
      parseSend
    );
  }

  private async invoke<TResponse, TValue>(
    request: MealBuddyChatApiRequest,
    parse: (value: unknown) => TValue | null
  ): Promise<MealBuddyChatOutcome<TValue>> {
    const session = await this.authPort.getCurrentSession();
    if (!session.ok || !session.value) return failure("authentication_required");

    let response;
    try {
      response = await this.client.functions.invoke<TResponse>(MEAL_BUDDY_CHAT_FUNCTION_NAME, { body: request });
    } catch {
      return failure("network_error");
    }
    if (response.error) return failure(await mapInvokeError(response.error));
    const value = parse(response.data);
    return value === null
      ? failure("invalid_server_response")
      : Object.freeze({ ok: true as const, value });
  }
}

export class DisabledMealBuddyChatRepository implements MealBuddyChatRepository {
  readonly source = "disabled" as const;
  open(_relationshipRef: string) { return Promise.resolve(failure<MealBuddyChatOpenSnapshot>("operation_not_enabled")); }
  listMessages(_conversationRef: string, _before: string | null, _limit: number) {
    return Promise.resolve(failure<MealBuddyChatPageSnapshot>("operation_not_enabled"));
  }
  send(_conversationRef: string, _clientMessageId: string, _body: string) {
    return Promise.resolve(failure<MealBuddyChatSendSnapshot>("operation_not_enabled"));
  }
}

function parseConversation(value: unknown): MealBuddyChatConversation | null {
  if (!isRecord(value) || !exactKeys(value, ["conversationRef", "counterpart"])) return null;
  if (!isMealBuddyChatConversationRef(value.conversationRef)) return null;
  const counterpart = value.counterpart;
  if (!isRecord(counterpart) || !exactKeys(counterpart, ["displayName", "mascotAvatarKey"])) return null;
  if (typeof counterpart.displayName !== "string" || counterpart.displayName.length === 0) return null;
  if (typeof counterpart.mascotAvatarKey !== "string" || counterpart.mascotAvatarKey.length === 0) return null;
  return Object.freeze({
    conversationRef: value.conversationRef,
    counterpart: Object.freeze({
      displayName: counterpart.displayName,
      mascotAvatarKey: counterpart.mascotAvatarKey
    })
  });
}

function parseMessage(value: unknown): MealBuddyChatMessage | null {
  if (!isRecord(value) || !exactKeys(value, ["messageRef", "mine", "body", "createdAt"])) return null;
  if (!isMealBuddyChatMessageRef(value.messageRef)) return null;
  if (typeof value.mine !== "boolean") return null;
  if (typeof value.body !== "string" || value.body.trim().length === 0
    || value.body.length > MEAL_BUDDY_CHAT_MAX_BODY_LENGTH) return null;
  if (typeof value.createdAt !== "string" || !Number.isFinite(new Date(value.createdAt).getTime())) return null;
  return Object.freeze({
    messageRef: value.messageRef,
    mine: value.mine,
    body: value.body,
    createdAt: value.createdAt
  });
}

function parseOpen(value: unknown): MealBuddyChatOpenSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ["policyVersion", "conversation"])) return null;
  if (value.policyVersion !== MEAL_BUDDY_CHAT_POLICY_VERSION) return null;
  const conversation = parseConversation(value.conversation);
  return conversation === null ? null : Object.freeze({ conversation });
}

function parseList(value: unknown): MealBuddyChatPageSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ["policyVersion", "conversation", "messages", "nextCursor"])) return null;
  if (value.policyVersion !== MEAL_BUDDY_CHAT_POLICY_VERSION || !Array.isArray(value.messages)) return null;
  const conversation = parseConversation(value.conversation);
  if (conversation === null) return null;
  const refs = new Set<string>();
  const messages: MealBuddyChatMessage[] = [];
  for (const raw of value.messages) {
    const message = parseMessage(raw);
    if (message === null || refs.has(message.messageRef)) return null;
    refs.add(message.messageRef);
    messages.push(message);
  }
  let nextCursor: MealBuddyChatCursor | null;
  if (value.nextCursor === null) nextCursor = null;
  else if (typeof value.nextCursor === "string" && value.nextCursor.startsWith(MEAL_BUDDY_CHAT_MESSAGE_REF_PREFIX)
    && value.nextCursor.length <= 512) nextCursor = value.nextCursor as MealBuddyChatCursor;
  else return null;
  return Object.freeze({ conversation, messages: Object.freeze(messages), nextCursor });
}

function parseSend(value: unknown): MealBuddyChatSendSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ["policyVersion", "conversation", "message"])) return null;
  if (value.policyVersion !== MEAL_BUDDY_CHAT_POLICY_VERSION) return null;
  const conversation = parseConversation(value.conversation);
  const message = parseMessage(value.message);
  if (conversation === null || message === null || !message.mine) return null;
  return Object.freeze({ conversation, message });
}

async function mapInvokeError(error: SupabaseMealBuddyChatInvokeError): Promise<MealBuddyChatErrorCode> {
  try {
    const body = await error.context?.json();
    const errorBody = isRecord(body) && isRecord(body.error) ? body.error : null;
    if (errorBody && typeof errorBody.code === "string"
      && KNOWN_SERVER_ERRORS.has(errorBody.code as MealBuddyChatErrorCode)) {
      return errorBody.code as MealBuddyChatErrorCode;
    }
  } catch {
    // Raw transport detail is deliberately collapsed into the closed vocabulary below.
  }
  return "server_unavailable";
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failure<T>(errorCode: MealBuddyChatErrorCode): MealBuddyChatOutcome<T> {
  return Object.freeze({ ok: false as const, errorCode });
}
function rejected<T>(): Promise<MealBuddyChatOutcome<T>> {
  return Promise.resolve(failure<T>("invalid_request"));
}

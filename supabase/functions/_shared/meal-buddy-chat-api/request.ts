import { MEAL_BUDDY_CHAT_REF_PREFIX, MEAL_BUDDY_MESSAGE_REF_PREFIX } from "../meal-buddy-chat-ref/policy.ts";
import { MEAL_BUDDY_RELATIONSHIP_REF_PREFIX } from "../meal-buddy-relationship-ref/policy.ts";
import { MEAL_BUDDY_CHAT_DEFAULT_PAGE_SIZE, MEAL_BUDDY_CHAT_MAX_BODY_LENGTH, MEAL_BUDDY_CHAT_MAX_PAGE_SIZE, type MealBuddyChatRequest } from "./types.ts";

const MAX_REF_LENGTH = 512; const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTHORITY_HEADERS = ["x-actor-user-id", "x-user-id", "x-target-user-id", "x-conversation-id", "x-relationship-id", "x-sender-user-id", "x-pair-key", "x-block-state"] as const;
const REJECTED = Object.freeze({ ok: false, errorCode: "invalid_request" as const });
export type MealBuddyChatRequestOutcome = { ok: true; value: MealBuddyChatRequest } | typeof REJECTED;
export function carriesMealBuddyChatAuthorityInput(request: Request): boolean { const url = new URL(request.url); return url.search !== "" || AUTHORITY_HEADERS.some((key) => request.headers.has(key)); }
function ref(value: unknown, prefix: string): value is string { return typeof value === "string" && value.length > prefix.length && value.length <= MAX_REF_LENGTH && value.startsWith(prefix); }
function exact(record: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(record).sort().join(",") === [...keys].sort().join(","); }
export async function parseMealBuddyChatRequest(request: Request): Promise<MealBuddyChatRequestOutcome> {
  let body: unknown; try { body = JSON.parse(await request.text()); } catch { return REJECTED; }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return REJECTED;
  const value = body as Record<string, unknown>;
  if (value.operation === "open" && exact(value, ["operation", "relationshipRef"]) && ref(value.relationshipRef, MEAL_BUDDY_RELATIONSHIP_REF_PREFIX)) return { ok: true, value: Object.freeze({ operation: "open", relationshipRef: value.relationshipRef }) };
  if (value.operation === "send" && exact(value, ["operation", "conversationRef", "clientMessageId", "body"]) && ref(value.conversationRef, MEAL_BUDDY_CHAT_REF_PREFIX) && typeof value.clientMessageId === "string" && UUID.test(value.clientMessageId) && typeof value.body === "string" && value.body.trim().length > 0 && value.body.length <= MEAL_BUDDY_CHAT_MAX_BODY_LENGTH) return { ok: true, value: Object.freeze({ operation: "send", conversationRef: value.conversationRef, clientMessageId: value.clientMessageId, body: value.body }) };
  if (value.operation === "list_messages" && Object.keys(value).every((key) => ["operation", "conversationRef", "before", "limit"].includes(key)) && Object.keys(value).includes("conversationRef") && ref(value.conversationRef, MEAL_BUDDY_CHAT_REF_PREFIX)) {
    let before: string | null;
    if (value.before === undefined || value.before === null) before = null;
    else if (ref(value.before, MEAL_BUDDY_MESSAGE_REF_PREFIX)) before = value.before;
    else return REJECTED;
    const limit = value.limit === undefined ? MEAL_BUDDY_CHAT_DEFAULT_PAGE_SIZE : value.limit;
    if (Number.isInteger(limit) && (limit as number) >= 1 && (limit as number) <= MEAL_BUDDY_CHAT_MAX_PAGE_SIZE) return { ok: true, value: Object.freeze({ operation: "list_messages", conversationRef: value.conversationRef, before, limit: limit as number }) };
  }
  return REJECTED;
}

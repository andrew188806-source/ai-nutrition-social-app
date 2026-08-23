import {
  MEAL_BUDDY_CHAT_REF_ERROR,
  MEAL_BUDDY_CHAT_REF_IV_BYTES,
  MEAL_BUDDY_CHAT_REF_KEY_BYTES,
  MEAL_BUDDY_CHAT_REF_PREFIX,
  MEAL_BUDDY_CHAT_REF_TTL_MS,
  MEAL_BUDDY_CHAT_REF_VERSION,
  MEAL_BUDDY_MESSAGE_REF_PREFIX,
  MEAL_BUDDY_MESSAGE_REF_VERSION,
  chatRefViolation
} from "./policy.ts";

type RefKind = "conversation" | "message";
type RefClaims = Readonly<{ version: string; id: string; issuedAtMs: number; expiresAtMs: number }>;
export type MealBuddyChatRefCipher = Readonly<{
  sealConversation(actorUserId: string, conversationId: string, issuedAt: Date): Promise<string>;
  openConversation(actorUserId: string, token: string, now: Date): Promise<string>;
  sealMessage(actorUserId: string, publicMessageId: string): Promise<string>;
  openMessage(actorUserId: string, token: string): Promise<string>;
}>;

const encoder = new TextEncoder(); const decoder = new TextDecoder();
function bytes(value: Uint8Array): ArrayBuffer { const copy = new ArrayBuffer(value.byteLength); new Uint8Array(copy).set(value); return copy; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) return chatRefViolation(); return value; }
function instant(value: Date): number { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return chatRefViolation(); return value.getTime(); }
function encode64(value: Uint8Array): string { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decode64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return chatRefViolation();
  let binary: string;
  try { binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + ((4 - value.length % 4) % 4), "=")); }
  catch { return chatRefViolation(); }
  const result = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index); return result;
}
function spec(kind: RefKind) {
  return kind === "conversation"
    ? { version: MEAL_BUDDY_CHAT_REF_VERSION, prefix: MEAL_BUDDY_CHAT_REF_PREFIX }
    : { version: MEAL_BUDDY_MESSAGE_REF_VERSION, prefix: MEAL_BUDDY_MESSAGE_REF_PREFIX };
}
function aad(kind: RefKind, actor: string): ArrayBuffer { return bytes(encoder.encode(`${spec(kind).version}|${actor}`)); }

export function decodeMealBuddyChatRefKey(encoded: string): Uint8Array {
  if (typeof encoded !== "string" || !encoded.trim()) return chatRefViolation();
  const normalized = encoded.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return chatRefViolation();
  let binary: string; try { binary = atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=")); } catch { return chatRefViolation(); }
  if (binary.length !== MEAL_BUDDY_CHAT_REF_KEY_BYTES) return chatRefViolation();
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createMealBuddyChatRefCipher(key: Uint8Array, options: Readonly<{ randomIv?: (length: number) => Uint8Array }> = {}): MealBuddyChatRefCipher {
  if (!(key instanceof Uint8Array) || key.byteLength !== MEAL_BUDDY_CHAT_REF_KEY_BYTES) return chatRefViolation();
  const imported = crypto.subtle.importKey("raw", bytes(key), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const hmacKey = crypto.subtle.importKey("raw", bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const randomIv = options.randomIv ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  async function seal(kind: RefKind, actorValue: string, idValue: string, issuedAt: Date): Promise<string> {
    const actor = required(actorValue); const id = required(idValue); const issuedAtMs = instant(issuedAt); const { version, prefix } = spec(kind);
    const iv = randomIv(MEAL_BUDDY_CHAT_REF_IV_BYTES); if (!(iv instanceof Uint8Array) || iv.byteLength !== MEAL_BUDDY_CHAT_REF_IV_BYTES) return chatRefViolation();
    const claims: RefClaims = { version, id, issuedAtMs, expiresAtMs: issuedAtMs + MEAL_BUDDY_CHAT_REF_TTL_MS };
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: aad(kind, actor) }, await imported, bytes(encoder.encode(JSON.stringify(claims)))));
    const envelope = new Uint8Array(iv.byteLength + ciphertext.byteLength); envelope.set(iv); envelope.set(ciphertext, iv.byteLength);
    const token = `${prefix}${encode64(envelope)}`; if (token.includes(actor) || token.includes(id)) return chatRefViolation(); return token;
  }
  async function open(kind: RefKind, actorValue: string, token: string, now: Date): Promise<string> {
    const actor = required(actorValue); const nowMs = instant(now); const { version, prefix } = spec(kind);
    if (typeof token !== "string" || !token.startsWith(prefix)) return chatRefViolation();
    const envelope = decode64(token.slice(prefix.length)); if (envelope.byteLength <= MEAL_BUDDY_CHAT_REF_IV_BYTES) return chatRefViolation();
    let plaintext: ArrayBuffer;
    try { plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.slice(0, MEAL_BUDDY_CHAT_REF_IV_BYTES)), additionalData: aad(kind, actor) }, await imported, bytes(envelope.slice(MEAL_BUDDY_CHAT_REF_IV_BYTES))); }
    catch { return chatRefViolation(); }
    let parsed: unknown; try { parsed = JSON.parse(decoder.decode(plaintext)); } catch { return chatRefViolation(); }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return chatRefViolation();
    const claims = parsed as Record<string, unknown>;
    if (claims.version !== version || typeof claims.id !== "string" || !claims.id || !Number.isInteger(claims.issuedAtMs) || !Number.isInteger(claims.expiresAtMs) || claims.expiresAtMs !== (claims.issuedAtMs as number) + MEAL_BUDDY_CHAT_REF_TTL_MS || nowMs >= (claims.expiresAtMs as number)) return chatRefViolation();
    return claims.id;
  }
  async function sealStableMessage(actorValue: string, idValue: string): Promise<string> {
    const actor = required(actorValue), id = required(idValue), payload = encode64(encoder.encode(id));
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey, bytes(encoder.encode(`${MEAL_BUDDY_MESSAGE_REF_VERSION}|${actor}|${id}`))));
    return `${MEAL_BUDDY_MESSAGE_REF_PREFIX}${payload}.${encode64(signature)}`;
  }
  async function openStableMessage(actorValue: string, token: string): Promise<string> {
    const actor = required(actorValue);
    if (typeof token !== "string" || !token.startsWith(MEAL_BUDDY_MESSAGE_REF_PREFIX)) return chatRefViolation();
    const parts = token.slice(MEAL_BUDDY_MESSAGE_REF_PREFIX.length).split("."); if (parts.length !== 2) return chatRefViolation();
    const id = decoder.decode(decode64(parts[0])); if (!id) return chatRefViolation();
    const valid = await crypto.subtle.verify("HMAC", await hmacKey, bytes(decode64(parts[1])), bytes(encoder.encode(`${MEAL_BUDDY_MESSAGE_REF_VERSION}|${actor}|${id}`)));
    if (!valid) return chatRefViolation(); return id;
  }
  return Object.freeze({
    sealConversation: (actor, id, issuedAt) => seal("conversation", actor, id, issuedAt),
    openConversation: (actor, token, now) => open("conversation", actor, token, now),
    sealMessage: sealStableMessage,
    openMessage: openStableMessage
  });
}

export { MEAL_BUDDY_CHAT_REF_ERROR };

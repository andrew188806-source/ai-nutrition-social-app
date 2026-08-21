import {
  MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES,
  MEAL_BUDDY_RELATIONSHIP_REF_KEY_BYTES,
  MEAL_BUDDY_RELATIONSHIP_REF_PREFIX,
  MEAL_BUDDY_RELATIONSHIP_REF_TTL_MS,
  MEAL_BUDDY_RELATIONSHIP_REF_VERSION,
  relationshipRefViolation
} from "./policy.ts";

export type MealBuddyRelationshipRefClaims = Readonly<{
  version: typeof MEAL_BUDDY_RELATIONSHIP_REF_VERSION;
  relationId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

export type MealBuddyRelationshipRefCipher = Readonly<{
  seal(actorUserId: string, relationId: string, issuedAt: Date): Promise<string>;
  open(actorUserId: string, token: string, now: Date): Promise<MealBuddyRelationshipRefClaims>;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}
function encode64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return relationshipRefViolation();
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(value.length + ((4 - value.length % 4) % 4), "="));
  } catch {
    return relationshipRefViolation();
  }
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
}

export function decodeMealBuddyRelationshipRefKey(encoded: string): Uint8Array {
  if (typeof encoded !== "string" || !encoded.trim()) return relationshipRefViolation();
  const normalized = encoded.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return relationshipRefViolation();
  let binary: string;
  try {
    binary = atob(normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "="));
  } catch {
    return relationshipRefViolation();
  }
  if (binary.length !== MEAL_BUDDY_RELATIONSHIP_REF_KEY_BYTES) return relationshipRefViolation();
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return relationshipRefViolation();
  return value;
}
function instant(value: Date): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return relationshipRefViolation();
  return value.getTime();
}
function aad(actorUserId: string): ArrayBuffer {
  return bytes(encoder.encode(`${MEAL_BUDDY_RELATIONSHIP_REF_VERSION}|${requiredString(actorUserId)}`));
}

export function createMealBuddyRelationshipRefCipher(
  key: Uint8Array,
  options: Readonly<{ randomIv?: (length: number) => Uint8Array }> = {}
): MealBuddyRelationshipRefCipher {
  if (!(key instanceof Uint8Array) || key.byteLength !== MEAL_BUDDY_RELATIONSHIP_REF_KEY_BYTES) {
    return relationshipRefViolation();
  }
  const imported = crypto.subtle.importKey("raw", bytes(key), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const randomIv = options.randomIv ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  return Object.freeze({
    async seal(actorUserId: string, relationId: string, issuedAt: Date): Promise<string> {
      const actor = requiredString(actorUserId);
      const relation = requiredString(relationId);
      const issuedAtMs = instant(issuedAt);
      const iv = randomIv(MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES) {
        return relationshipRefViolation();
      }
      const claims: MealBuddyRelationshipRefClaims = {
        version: MEAL_BUDDY_RELATIONSHIP_REF_VERSION,
        relationId: relation,
        issuedAtMs,
        expiresAtMs: issuedAtMs + MEAL_BUDDY_RELATIONSHIP_REF_TTL_MS
      };
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: bytes(iv), additionalData: aad(actor) },
        await imported,
        bytes(encoder.encode(JSON.stringify(claims)))
      ));
      const envelope = new Uint8Array(iv.byteLength + ciphertext.byteLength);
      envelope.set(iv); envelope.set(ciphertext, iv.byteLength);
      const token = `${MEAL_BUDDY_RELATIONSHIP_REF_PREFIX}${encode64(envelope)}`;
      if (token.includes(actor) || token.includes(relation)) return relationshipRefViolation();
      return token;
    },
    async open(actorUserId: string, token: string, now: Date): Promise<MealBuddyRelationshipRefClaims> {
      const actor = requiredString(actorUserId);
      const nowMs = instant(now);
      if (typeof token !== "string" || !token.startsWith(MEAL_BUDDY_RELATIONSHIP_REF_PREFIX)) {
        return relationshipRefViolation();
      }
      const envelope = decode64(token.slice(MEAL_BUDDY_RELATIONSHIP_REF_PREFIX.length));
      if (envelope.byteLength <= MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES) return relationshipRefViolation();
      let plaintext: ArrayBuffer;
      try {
        plaintext = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: bytes(envelope.slice(0, MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES)),
            additionalData: aad(actor)
          },
          await imported,
          bytes(envelope.slice(MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES))
        );
      } catch {
        return relationshipRefViolation();
      }
      let parsed: unknown;
      try { parsed = JSON.parse(decoder.decode(plaintext)); } catch { return relationshipRefViolation(); }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return relationshipRefViolation();
      const claims = parsed as Record<string, unknown>;
      if (
        claims.version !== MEAL_BUDDY_RELATIONSHIP_REF_VERSION ||
        typeof claims.relationId !== "string" || !claims.relationId ||
        !Number.isInteger(claims.issuedAtMs) || !Number.isInteger(claims.expiresAtMs) ||
        claims.expiresAtMs !== (claims.issuedAtMs as number) + MEAL_BUDDY_RELATIONSHIP_REF_TTL_MS ||
        nowMs >= (claims.expiresAtMs as number)
      ) return relationshipRefViolation();
      return Object.freeze({
        version: MEAL_BUDDY_RELATIONSHIP_REF_VERSION,
        relationId: claims.relationId,
        issuedAtMs: claims.issuedAtMs as number,
        expiresAtMs: claims.expiresAtMs as number
      });
    }
  });
}

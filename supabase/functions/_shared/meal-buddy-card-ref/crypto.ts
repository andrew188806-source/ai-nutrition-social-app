import {
  MEAL_BUDDY_CARD_REF_ALGORITHM,
  MEAL_BUDDY_CARD_REF_IV_BYTES,
  MEAL_BUDDY_CARD_REF_KEY_BYTES,
  MEAL_BUDDY_CARD_REF_PREFIX,
  MEAL_BUDDY_CARD_REF_PURPOSES,
  MEAL_BUDDY_CARD_REF_TTL_MS,
  MEAL_BUDDY_CARD_REF_VERSION,
  mealBuddyCardRefContractViolation
} from "./policy.ts";
import type {
  MealBuddyCardRefCipher,
  MealBuddyCardRefClaims,
  MealBuddyCardRefOptions,
  MealBuddyCardRefPurpose
} from "./types.ts";

// WebCrypto only. No Deno-specific, Node-specific or npm cryptography, so the identical primitive
// runs unchanged in the Edge runtime and under local validation.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// WebCrypto's BufferSource requires an ArrayBuffer-backed view; a Uint8Array may be backed by a
// SharedArrayBuffer, which the Deno lib types reject. Copying into a fresh ArrayBuffer keeps every
// crypto argument well-typed without a cast, and incidentally detaches it from the caller's buffer.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return mealBuddyCardRefContractViolation();
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Standard base64 with padding, the shape a 32-byte secret is normally distributed in.
export function decodeMealBuddyCardRefKey(encoded: string): Uint8Array {
  if (typeof encoded !== "string" || encoded.trim().length === 0) {
    return mealBuddyCardRefContractViolation();
  }
  const normalized = encoded.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return mealBuddyCardRefContractViolation();
  let binary: string;
  try {
    binary = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
  } catch {
    return mealBuddyCardRefContractViolation();
  }
  // Exactly AES-256. A 16- or 24-byte secret would otherwise be accepted as a weaker cipher.
  if (binary.length !== MEAL_BUDDY_CARD_REF_KEY_BYTES) return mealBuddyCardRefContractViolation();
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Both the actor AND the purpose are bound here rather than trusted from the token body. Because the
// AAD is never transmitted and is recomputed from the verified caller and the expected purpose, a
// reference issued to one actor cannot be opened by another, a source reference cannot be replayed
// as a candidate reference, and neither the actor nor the card ever appears in the client value.
function additionalAuthenticatedData(actorUserId: string, purpose: MealBuddyCardRefPurpose): ArrayBuffer {
  return toArrayBuffer(textEncoder.encode(`${MEAL_BUDDY_CARD_REF_VERSION}|${purpose}|${actorUserId}`));
}

function requireIdentifier(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return mealBuddyCardRefContractViolation();
  }
  return value;
}

function requirePurpose(value: unknown): MealBuddyCardRefPurpose {
  if (typeof value !== "string" || !MEAL_BUDDY_CARD_REF_PURPOSES.includes(value as MealBuddyCardRefPurpose)) {
    return mealBuddyCardRefContractViolation();
  }
  return value as MealBuddyCardRefPurpose;
}

function requireInstant(value: Date): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return mealBuddyCardRefContractViolation();
  }
  return value.getTime();
}

export function createMealBuddyCardRefCipher(
  keyBytes: Uint8Array,
  options: MealBuddyCardRefOptions = {}
): MealBuddyCardRefCipher {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== MEAL_BUDDY_CARD_REF_KEY_BYTES) {
    return mealBuddyCardRefContractViolation();
  }
  const randomIv = options.randomIv ?? ((byteLength: number) => crypto.getRandomValues(new Uint8Array(byteLength)));
  const importedKey = crypto.subtle.importKey(
    "raw",
    // A copy, so a later mutation of the caller's buffer cannot change the live key.
    toArrayBuffer(keyBytes),
    { name: MEAL_BUDDY_CARD_REF_ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  );

  return Object.freeze({
    async seal(
      actorUserId: string,
      purpose: MealBuddyCardRefPurpose,
      cardId: string,
      issuedAt: Date
    ): Promise<string> {
      const actor = requireIdentifier(actorUserId);
      const sealedPurpose = requirePurpose(purpose);
      const card = requireIdentifier(cardId);
      const issuedAtMs = requireInstant(issuedAt);
      const expiresAtMs = issuedAtMs + MEAL_BUDDY_CARD_REF_TTL_MS;

      const iv = randomIv(MEAL_BUDDY_CARD_REF_IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== MEAL_BUDDY_CARD_REF_IV_BYTES) {
        return mealBuddyCardRefContractViolation();
      }
      const claims: MealBuddyCardRefClaims = {
        version: MEAL_BUDDY_CARD_REF_VERSION,
        purpose: sealedPurpose,
        cardId: card,
        issuedAtMs,
        expiresAtMs
      };
      const sealed = new Uint8Array(await crypto.subtle.encrypt(
        {
          name: MEAL_BUDDY_CARD_REF_ALGORITHM,
          iv: toArrayBuffer(iv),
          additionalData: additionalAuthenticatedData(actor, sealedPurpose)
        },
        await importedKey,
        toArrayBuffer(textEncoder.encode(JSON.stringify(claims)))
      ));

      const envelope = new Uint8Array(iv.byteLength + sealed.byteLength);
      envelope.set(iv, 0);
      envelope.set(sealed, iv.byteLength);
      const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${base64UrlEncode(envelope)}`;
      // Last-line structural assertion: neither the card nor the actor may survive into the client
      // value. A raw card UUID in a client-visible reference would make cards enumerable.
      if (token.includes(card) || token.includes(actor)) {
        return mealBuddyCardRefContractViolation();
      }
      return token;
    },

    async open(
      actorUserId: string,
      purpose: MealBuddyCardRefPurpose,
      token: string,
      now: Date
    ): Promise<MealBuddyCardRefClaims> {
      const actor = requireIdentifier(actorUserId);
      const expectedPurpose = requirePurpose(purpose);
      const nowMs = requireInstant(now);
      if (typeof token !== "string" || !token.startsWith(MEAL_BUDDY_CARD_REF_PREFIX)) {
        return mealBuddyCardRefContractViolation();
      }
      const envelope = base64UrlDecode(token.slice(MEAL_BUDDY_CARD_REF_PREFIX.length));
      if (envelope.byteLength <= MEAL_BUDDY_CARD_REF_IV_BYTES) {
        return mealBuddyCardRefContractViolation();
      }
      let plaintext: ArrayBuffer;
      try {
        plaintext = await crypto.subtle.decrypt(
          {
            name: MEAL_BUDDY_CARD_REF_ALGORITHM,
            iv: toArrayBuffer(envelope.slice(0, MEAL_BUDDY_CARD_REF_IV_BYTES)),
            additionalData: additionalAuthenticatedData(actor, expectedPurpose)
          },
          await importedKey,
          toArrayBuffer(envelope.slice(MEAL_BUDDY_CARD_REF_IV_BYTES))
        );
      } catch {
        // A wrong actor, a wrong purpose, a tampered IV, a tampered ciphertext and a tampered tag
        // are all one indistinguishable authentication failure.
        return mealBuddyCardRefContractViolation();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textDecoder.decode(plaintext));
      } catch {
        return mealBuddyCardRefContractViolation();
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return mealBuddyCardRefContractViolation();
      }
      const claims = parsed as Record<string, unknown>;
      if (
        claims.version !== MEAL_BUDDY_CARD_REF_VERSION ||
        // Belt and braces: the purpose is already authenticated through the AAD, and is checked
        // again here so a future AAD change cannot silently drop purpose separation.
        claims.purpose !== expectedPurpose ||
        typeof claims.cardId !== "string" ||
        claims.cardId.length === 0 ||
        !Number.isInteger(claims.issuedAtMs) ||
        !Number.isInteger(claims.expiresAtMs) ||
        (claims.expiresAtMs as number) !== (claims.issuedAtMs as number) + MEAL_BUDDY_CARD_REF_TTL_MS
      ) {
        return mealBuddyCardRefContractViolation();
      }
      // Expiry is enforced, never merely reported.
      if (nowMs >= (claims.expiresAtMs as number)) return mealBuddyCardRefContractViolation();
      return Object.freeze({
        version: MEAL_BUDDY_CARD_REF_VERSION,
        purpose: expectedPurpose,
        cardId: claims.cardId as string,
        issuedAtMs: claims.issuedAtMs as number,
        expiresAtMs: claims.expiresAtMs as number
      });
    }
  });
}

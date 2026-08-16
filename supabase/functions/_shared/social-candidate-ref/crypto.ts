import {
  SOCIAL_CANDIDATE_REF_ALGORITHM,
  SOCIAL_CANDIDATE_REF_IV_BYTES,
  SOCIAL_CANDIDATE_REF_KEY_BYTES,
  SOCIAL_CANDIDATE_REF_PREFIX,
  SOCIAL_CANDIDATE_REF_TTL_MS,
  SOCIAL_CANDIDATE_REF_VERSION,
  socialCandidateRefContractViolation
} from "./policy.ts";
import type {
  SocialCandidateRefCipher,
  SocialCandidateRefClaims,
  SocialCandidateRefOptions
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
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return socialCandidateRefContractViolation();
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Standard base64 with padding, the shape a 32-byte secret is normally distributed in.
export function decodeSocialCandidateRefKey(encoded: string): Uint8Array {
  if (typeof encoded !== "string" || encoded.trim().length === 0) {
    return socialCandidateRefContractViolation();
  }
  const normalized = encoded.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return socialCandidateRefContractViolation();
  let binary: string;
  try {
    binary = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
  } catch {
    return socialCandidateRefContractViolation();
  }
  // Exactly AES-256. A 16- or 24-byte secret would otherwise be accepted as a weaker cipher.
  if (binary.length !== SOCIAL_CANDIDATE_REF_KEY_BYTES) return socialCandidateRefContractViolation();
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// The actor is bound here rather than carried in the token. Because the AAD is never transmitted
// and is recomputed from the verified caller, a reference issued to one actor cannot be opened by
// another, and the actor's identifier never appears in the client-visible value at all.
function additionalAuthenticatedData(actorUserId: string): ArrayBuffer {
  return toArrayBuffer(textEncoder.encode(`${SOCIAL_CANDIDATE_REF_VERSION}|${actorUserId}`));
}

function requireUserId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return socialCandidateRefContractViolation();
  }
  return value;
}

function requireInstant(value: Date): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return socialCandidateRefContractViolation();
  }
  return value.getTime();
}

export function createSocialCandidateRefCipher(
  keyBytes: Uint8Array,
  options: SocialCandidateRefOptions = {}
): SocialCandidateRefCipher {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== SOCIAL_CANDIDATE_REF_KEY_BYTES) {
    return socialCandidateRefContractViolation();
  }
  const randomIv = options.randomIv ?? ((byteLength: number) => crypto.getRandomValues(new Uint8Array(byteLength)));
  const importedKey = crypto.subtle.importKey(
    "raw",
    // A copy, so a later mutation of the caller's buffer cannot change the live key.
    toArrayBuffer(keyBytes),
    { name: SOCIAL_CANDIDATE_REF_ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  );

  return Object.freeze({
    async seal(actorUserId: string, candidateUserId: string, issuedAt: Date): Promise<string> {
      const actor = requireUserId(actorUserId);
      const candidate = requireUserId(candidateUserId);
      const issuedAtMs = requireInstant(issuedAt);
      const expiresAtMs = issuedAtMs + SOCIAL_CANDIDATE_REF_TTL_MS;

      const iv = randomIv(SOCIAL_CANDIDATE_REF_IV_BYTES);
      if (!(iv instanceof Uint8Array) || iv.byteLength !== SOCIAL_CANDIDATE_REF_IV_BYTES) {
        return socialCandidateRefContractViolation();
      }
      const claims: SocialCandidateRefClaims = {
        version: SOCIAL_CANDIDATE_REF_VERSION,
        candidateUserId: candidate,
        issuedAtMs,
        expiresAtMs
      };
      const sealed = new Uint8Array(await crypto.subtle.encrypt(
        { name: SOCIAL_CANDIDATE_REF_ALGORITHM, iv: toArrayBuffer(iv), additionalData: additionalAuthenticatedData(actor) },
        await importedKey,
        toArrayBuffer(textEncoder.encode(JSON.stringify(claims)))
      ));

      const envelope = new Uint8Array(iv.byteLength + sealed.byteLength);
      envelope.set(iv, 0);
      envelope.set(sealed, iv.byteLength);
      const token = `${SOCIAL_CANDIDATE_REF_PREFIX}${base64UrlEncode(envelope)}`;
      // Last-line structural assertion: neither identifier may survive into the client value.
      if (token.includes(candidate) || token.includes(actor)) {
        return socialCandidateRefContractViolation();
      }
      return token;
    },

    async open(actorUserId: string, token: string, now: Date): Promise<SocialCandidateRefClaims> {
      const actor = requireUserId(actorUserId);
      const nowMs = requireInstant(now);
      if (typeof token !== "string" || !token.startsWith(SOCIAL_CANDIDATE_REF_PREFIX)) {
        return socialCandidateRefContractViolation();
      }
      const envelope = base64UrlDecode(token.slice(SOCIAL_CANDIDATE_REF_PREFIX.length));
      if (envelope.byteLength <= SOCIAL_CANDIDATE_REF_IV_BYTES) {
        return socialCandidateRefContractViolation();
      }
      let plaintext: ArrayBuffer;
      try {
        plaintext = await crypto.subtle.decrypt(
          {
            name: SOCIAL_CANDIDATE_REF_ALGORITHM,
            iv: toArrayBuffer(envelope.slice(0, SOCIAL_CANDIDATE_REF_IV_BYTES)),
            additionalData: additionalAuthenticatedData(actor)
          },
          await importedKey,
          toArrayBuffer(envelope.slice(SOCIAL_CANDIDATE_REF_IV_BYTES))
        );
      } catch {
        // A wrong actor, a tampered IV, a tampered ciphertext and a tampered tag are all one
        // indistinguishable authentication failure.
        return socialCandidateRefContractViolation();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textDecoder.decode(plaintext));
      } catch {
        return socialCandidateRefContractViolation();
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return socialCandidateRefContractViolation();
      }
      const claims = parsed as Record<string, unknown>;
      if (
        claims.version !== SOCIAL_CANDIDATE_REF_VERSION ||
        typeof claims.candidateUserId !== "string" ||
        claims.candidateUserId.length === 0 ||
        !Number.isInteger(claims.issuedAtMs) ||
        !Number.isInteger(claims.expiresAtMs) ||
        (claims.expiresAtMs as number) !== (claims.issuedAtMs as number) + SOCIAL_CANDIDATE_REF_TTL_MS
      ) {
        return socialCandidateRefContractViolation();
      }
      // Expiry is enforced, never merely reported.
      if (nowMs >= (claims.expiresAtMs as number)) return socialCandidateRefContractViolation();
      return Object.freeze({
        version: SOCIAL_CANDIDATE_REF_VERSION,
        candidateUserId: claims.candidateUserId as string,
        issuedAtMs: claims.issuedAtMs as number,
        expiresAtMs: claims.expiresAtMs as number
      });
    }
  });
}

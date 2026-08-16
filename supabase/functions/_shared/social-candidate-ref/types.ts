import type { SOCIAL_CANDIDATE_REF_VERSION } from "./policy.ts";

// The claims sealed inside a candidate reference. The actor is deliberately absent from this record
// because it is never written into the token: it is bound as additional authenticated data and
// recomputed from the verified caller when the reference is opened.
export type SocialCandidateRefClaims = Readonly<{
  version: typeof SOCIAL_CANDIDATE_REF_VERSION;
  candidateUserId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

// Deterministic injection points for tests. Production supplies neither, so the real primitive is
// never weakened: the defaults are a CSPRNG IV and the real request instant.
export type SocialCandidateRefOptions = Readonly<{
  randomIv?: (byteLength: number) => Uint8Array;
}>;

export type SocialCandidateRefCipher = Readonly<{
  // Seals one actor-scoped, expiring reference to one already-authorized candidate.
  seal(actorUserId: string, candidateUserId: string, issuedAt: Date): Promise<string>;
  // Verification side. Not used by the SR-2D list API, which only ever seals; it exists so the
  // binding, tamper and expiry properties are provable, and so later action phases have one
  // canonical opener rather than reimplementing the format.
  open(actorUserId: string, token: string, now: Date): Promise<SocialCandidateRefClaims>;
}>;

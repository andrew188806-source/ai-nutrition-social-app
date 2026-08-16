import type {
  MEAL_BUDDY_CARD_REF_PURPOSES,
  MEAL_BUDDY_CARD_REF_VERSION
} from "./policy.ts";

export type MealBuddyCardRefPurpose = (typeof MEAL_BUDDY_CARD_REF_PURPOSES)[number];

// The claims sealed inside a card reference. The actor is deliberately absent from this record
// because it is never written into the token: it is bound as additional authenticated data and
// recomputed from the verified caller when the reference is opened. The purpose IS recorded, and is
// additionally bound into the AAD, so a cross-purpose token fails to decrypt at all.
export type MealBuddyCardRefClaims = Readonly<{
  version: typeof MEAL_BUDDY_CARD_REF_VERSION;
  purpose: MealBuddyCardRefPurpose;
  cardId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

// Deterministic injection points for tests. Production supplies neither, so the real primitive is
// never weakened: the defaults are a CSPRNG IV and the real request instant.
export type MealBuddyCardRefOptions = Readonly<{
  randomIv?: (byteLength: number) => Uint8Array;
}>;

export type MealBuddyCardRefCipher = Readonly<{
  // Seals one actor-scoped, purpose-scoped, expiring reference to one card.
  seal(
    actorUserId: string,
    purpose: MealBuddyCardRefPurpose,
    cardId: string,
    issuedAt: Date
  ): Promise<string>;
  // Verification side. The caller states the purpose it expects; a token minted for the other
  // purpose fails authentication rather than being accepted and inspected.
  open(
    actorUserId: string,
    purpose: MealBuddyCardRefPurpose,
    token: string,
    now: Date
  ): Promise<MealBuddyCardRefClaims>;
}>;

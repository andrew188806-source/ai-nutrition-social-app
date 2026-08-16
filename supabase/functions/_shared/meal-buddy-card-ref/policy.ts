// SR-2G-A Meal Buddy card reference policy. These constants are the whole configurable surface of
// the primitive: there is no caller-tunable algorithm, key length, IV length, purpose or lifetime.

export const MEAL_BUDDY_CARD_REF_VERSION = "mbc1" as const;

// The token is `mbc1.` + base64url(iv || ciphertext||tag). The version marker is covered by the AAD,
// so a forged or downgraded marker fails authentication rather than selecting another format.
export const MEAL_BUDDY_CARD_REF_PREFIX = "mbc1." as const;

export const MEAL_BUDDY_CARD_REF_ALGORITHM = "AES-GCM" as const;

// AES-256: the imported key must decode to exactly 32 bytes. A shorter key silently selects
// AES-128/192 in WebCrypto, so the length is validated rather than inferred.
export const MEAL_BUDDY_CARD_REF_KEY_BYTES = 32 as const;

// 96-bit IV is the GCM-native size; a fresh random IV is drawn for every single seal.
export const MEAL_BUDDY_CARD_REF_IV_BYTES = 12 as const;

// 24 hours.
export const MEAL_BUDDY_CARD_REF_TTL_MS = 86_400_000 as const;

// A dedicated secret, distinct from SOCIAL_CANDIDATE_REF_KEY_V1. Sharing one key across two
// reference families would mean a token minted by either could be opened by the other, collapsing
// the separation this primitive exists to create. Deliberately NOT the anon key, the service role
// key, the JWT signing secret or the database password.
export const MEAL_BUDDY_CARD_REF_KEY_ENV = "MEAL_BUDDY_CARD_REF_KEY_V1" as const;

// A reference names a card in exactly one role. The actor's own source card and a discovered
// candidate card are different authorities, so their references must not be interchangeable: the
// purpose is bound as additional authenticated data, which makes a cross-purpose replay an
// authentication failure rather than a validation error.
export const MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE = "source" as const;
export const MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE = "candidate" as const;
export const MEAL_BUDDY_CARD_REF_PURPOSES = Object.freeze([
  MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE,
  MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE
] as const);

export const MEAL_BUDDY_CARD_REF_CONTRACT_ERROR = "meal_buddy_card_ref_contract_violated" as const;

export function mealBuddyCardRefContractViolation(): never {
  throw new Error(MEAL_BUDDY_CARD_REF_CONTRACT_ERROR);
}

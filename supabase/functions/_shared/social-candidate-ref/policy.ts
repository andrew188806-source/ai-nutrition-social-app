// SR-2D candidate reference policy. These constants are the whole configurable surface of the
// primitive: there is no caller-tunable algorithm, key length, IV length or lifetime.

export const SOCIAL_CANDIDATE_REF_VERSION = "scr1" as const;

// The token is `scr1.` + base64url(iv || ciphertext||tag). The prefix is covered by the AAD, so a
// forged or downgraded version marker fails authentication rather than selecting another format.
export const SOCIAL_CANDIDATE_REF_PREFIX = "scr1." as const;

export const SOCIAL_CANDIDATE_REF_ALGORITHM = "AES-GCM" as const;

// AES-256: the imported key must decode to exactly 32 bytes. A shorter key silently selects
// AES-128/192 in WebCrypto, so the length is validated rather than inferred.
export const SOCIAL_CANDIDATE_REF_KEY_BYTES = 32 as const;

// 96-bit IV is the GCM-native size; a fresh random IV is drawn for every single seal.
export const SOCIAL_CANDIDATE_REF_IV_BYTES = 12 as const;

// 24 hours.
export const SOCIAL_CANDIDATE_REF_TTL_MS = 86_400_000 as const;

// A dedicated secret. Deliberately NOT the anon key, the service role key, the JWT signing secret
// or the database password: a candidate reference must never be forgeable by anything that already
// holds a client-visible or broader-authority credential.
export const SOCIAL_CANDIDATE_REF_KEY_ENV = "SOCIAL_CANDIDATE_REF_KEY_V1" as const;

export const SOCIAL_CANDIDATE_REF_CONTRACT_ERROR = "social_candidate_ref_contract_violated" as const;

export function socialCandidateRefContractViolation(): never {
  throw new Error(SOCIAL_CANDIDATE_REF_CONTRACT_ERROR);
}

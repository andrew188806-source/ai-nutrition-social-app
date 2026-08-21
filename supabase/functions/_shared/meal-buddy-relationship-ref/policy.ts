export const MEAL_BUDDY_RELATIONSHIP_REF_VERSION = "mbr1" as const;
export const MEAL_BUDDY_RELATIONSHIP_REF_PREFIX = "mbr1." as const;
export const MEAL_BUDDY_RELATIONSHIP_REF_KEY_ENV = "MEAL_BUDDY_RELATIONSHIP_REF_KEY_V1" as const;
export const MEAL_BUDDY_RELATIONSHIP_REF_KEY_BYTES = 32 as const;
export const MEAL_BUDDY_RELATIONSHIP_REF_IV_BYTES = 12 as const;
export const MEAL_BUDDY_RELATIONSHIP_REF_TTL_MS = 2_592_000_000 as const;
export const MEAL_BUDDY_RELATIONSHIP_REF_ERROR = "meal_buddy_relationship_ref_contract_violated" as const;

export function relationshipRefViolation(): never {
  throw new Error(MEAL_BUDDY_RELATIONSHIP_REF_ERROR);
}

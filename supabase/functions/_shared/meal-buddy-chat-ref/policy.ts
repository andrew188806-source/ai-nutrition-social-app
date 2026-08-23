export const MEAL_BUDDY_CHAT_REF_VERSION = "mbchat1" as const;
export const MEAL_BUDDY_CHAT_REF_PREFIX = "mbchat1." as const;
export const MEAL_BUDDY_MESSAGE_REF_VERSION = "mbmsg1" as const;
export const MEAL_BUDDY_MESSAGE_REF_PREFIX = "mbmsg1." as const;
export const MEAL_BUDDY_CHAT_REF_KEY_ENV = "MEAL_BUDDY_CHAT_REF_KEY_V1" as const;
export const MEAL_BUDDY_CHAT_REF_KEY_BYTES = 32 as const;
export const MEAL_BUDDY_CHAT_REF_IV_BYTES = 12 as const;
export const MEAL_BUDDY_CHAT_REF_TTL_MS = 2_592_000_000 as const;
export const MEAL_BUDDY_CHAT_REF_ERROR = "meal_buddy_chat_ref_contract_violated" as const;

export function chatRefViolation(): never {
  throw new Error(MEAL_BUDDY_CHAT_REF_ERROR);
}

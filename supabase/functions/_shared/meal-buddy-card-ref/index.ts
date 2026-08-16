// SR-2G-A server-only Meal Buddy card reference primitive. This barrel has no HTTP, database,
// persistence, cache or environment surface: it neither reads the secret nor stores a reference
// anywhere. A card reference is an opaque, actor-bound, purpose-bound, expiring pointer to a card —
// it is never authorization to read, use or act on that card. Possession proves nothing; the round
// that consumes a reference must still re-verify ownership and eligibility server-side.
export * from "./crypto.ts";
export * from "./policy.ts";
export type * from "./types.ts";

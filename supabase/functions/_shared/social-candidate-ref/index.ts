// SR-2D server-only candidate reference primitive. This barrel has no HTTP, database, persistence,
// cache or environment surface: it neither reads the secret nor stores a reference anywhere. A
// candidate reference is an opaque, actor-bound, expiring pointer to an already-authorized
// candidate — it is never authorization to act on that candidate.
export * from "./crypto.ts";
export * from "./policy.ts";
export type * from "./types.ts";

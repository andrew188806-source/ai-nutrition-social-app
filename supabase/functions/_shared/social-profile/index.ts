// SR-2C server-internal public Social profile projection authority. This barrel has no HTTP, Edge,
// persistence, cache, pagination or client identifier surface, and no service_role or admin path.
// Profile facts are read only through the protected projection primitive over the frozen B3
// executor transport, for candidates the frozen SR-2B exposure already authorized.
export * from "./policy.ts";
export * from "./projectPublicProfiles.ts";
export * from "./readProfileFacts.ts";
export type * from "./types.ts";

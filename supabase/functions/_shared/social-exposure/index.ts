// SR-2B server-internal canonical Social exposure authority. This barrel has no HTTP, Edge,
// persistence, cache, pagination or client projection surface, and no service_role, executor or
// B3 transport path. The entitlement resolver reads only the verified actor's own row through the
// authenticated user-scoped boundary; the exposure policy itself is pure.
export * from "./applySocialExposure.ts";
export * from "./policy.ts";
export * from "./resolveEntitlement.ts";
export type * from "./types.ts";

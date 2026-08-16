// SR-2D server-internal Social candidate list composition. This barrel has no HTTP, persistence,
// cache, pagination, analytics or service_role surface, and holds no request-scoped state at module
// scope. It composes the frozen SR-1D source, SR-2A ranking, SR-2B entitlement exposure and SR-2C
// public projection exactly once each, and adds only the opaque actor-scoped candidate reference.
export * from "./composeCandidateList.ts";
export * from "./policy.ts";
export * from "./readCandidateTasteSources.ts";
export * from "./toCandidateDto.ts";
export type * from "./types.ts";

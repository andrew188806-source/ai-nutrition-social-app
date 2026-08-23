// Render-free barrel: only pure data-layer modules are re-exported here so validation harnesses can
// require it from Node. The screen component is imported directly by the route.
export * from "./controller";
export * from "./repository";
export * from "./runtimeBinding";
export * from "./supabaseContracts";
export * from "./types";
export * from "./useMealBuddyChat";

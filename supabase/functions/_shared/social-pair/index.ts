// SR-1A — internal server pair comparison primitive.
//
// This barrel exposes SERVER-INTERNAL modules only. There is deliberately no HTTP handler, no
// request or response DTO, no client projection and no Supabase function registration: SR-1A builds
// the primitive, SR-1B defines Candidate Authorization, and only SR-1C may add an authenticated
// network ingress on top of both.
export * from "./serverTasteFoundationRepository.ts";
export * from "./serverPairComparison.ts";
export * from "./authorizedPairSourcesAdapter.ts";

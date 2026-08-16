import type { SocialCandidateFactoryDependencies } from "./factories";

// App-composition binding for the SR-2E feature.
//
// The frozen ConsumerRuntimeProvider exposes neither the auth port nor a Supabase client, and SR-2E
// is not authorised to widen that provider. This module is the one narrow seam where app startup (or
// a headless Development harness) supplies those dependencies, so the screen itself never constructs
// a client and never reaches into runtime internals.
//
// This is startup configuration, written once before any read and never per request, so it holds no
// request-scoped state: no actor, session, candidate or reference is stored here.
let boundDependencies: SocialCandidateFactoryDependencies = {};

export function bindSocialCandidateRuntimeDependencies(dependencies: SocialCandidateFactoryDependencies): void {
  boundDependencies = dependencies;
}

export function getSocialCandidateRuntimeDependencies(): SocialCandidateFactoryDependencies {
  return boundDependencies;
}

// Unbound is the safe default: the factory then returns the disabled repository, which fails closed
// with a typed error rather than impersonating a successful empty candidate list.
export function clearSocialCandidateRuntimeDependencies(): void {
  boundDependencies = {};
}

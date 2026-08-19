import type { MealBuddyCandidateFactoryDependencies } from "./factories";

// App-composition binding for the SR-2G-E1 feature, mirroring the frozen SR-2E seam.
//
// The frozen ConsumerRuntimeProvider exposes neither the auth port nor a Supabase client, and
// SR-2G-E is not authorised to widen that provider. This module is the one narrow seam where app
// startup (or a headless Development harness) supplies those dependencies, so the screen itself
// never constructs a client and never reaches into runtime internals.
//
// This is startup configuration, written once before any read and never per request, so it holds no
// request-scoped state: no actor, session, candidate, card or reference is stored here.
let boundDependencies: MealBuddyCandidateFactoryDependencies = {};

export function bindMealBuddyCandidateRuntimeDependencies(
  dependencies: MealBuddyCandidateFactoryDependencies
): void {
  boundDependencies = dependencies;
}

export function getMealBuddyCandidateRuntimeDependencies(): MealBuddyCandidateFactoryDependencies {
  return boundDependencies;
}

// Unbound is the safe default: the factory then returns the disabled repositories, which fail closed
// with a typed error rather than impersonating a successful empty candidate list. Sign-out clears
// the binding so no authenticated client survives into a signed-out session.
export function clearMealBuddyCandidateRuntimeDependencies(): void {
  boundDependencies = {};
}

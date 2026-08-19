import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerAuthSourceLike } from "../meal-photo-upload/featureFlags";
import {
  DisabledMealBuddyCandidateRepository,
  DisabledMealBuddySourceCardRepository
} from "./adapters/disabledMealBuddyRepositories";
import { SupabaseMealBuddyCandidateRepository } from "./adapters/supabaseMealBuddyCandidateRepository";
import { SupabaseMealBuddySourceCardRepository } from "./adapters/supabaseMealBuddySourceCardRepository";
import {
  getMealBuddyCandidateRuntimeFlags,
  type MealBuddyCandidateRuntimeFlags
} from "./featureFlags";
import type { SupabaseInterestCatalogClientLike } from "./interestCatalog";
import type { MealBuddyCandidateRepository, MealBuddySourceCardRepository } from "./ports";
import { MealBuddyCandidateService } from "./mealBuddyCandidateService";
import type { SupabaseMealBuddyClientLike } from "./supabaseMealBuddyCandidateContracts";

export type MealBuddyCandidateFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  mealBuddyClient?: SupabaseMealBuddyClientLike;
  // SR-2G-E2 additive slot. The catalog client reads the PUBLIC interest label vocabulary and
  // nothing else; it is declared separately from `mealBuddyClient` so this feature never gains a
  // general-purpose table reader, even though app composition happens to bind one object to both.
  catalogClient?: SupabaseInterestCatalogClientLike;
};

// Any unmet precondition returns the DISABLED repositories, never a demo one. There is no mock
// branch to fall into: in this feature a misconfiguration produces a typed, visible failure rather
// than silently rendering fabricated candidates.
function live(
  flags: MealBuddyCandidateRuntimeFlags,
  dependencies: MealBuddyCandidateFactoryDependencies
): { authPort: ConsumerAuthPort; mealBuddyClient: SupabaseMealBuddyClientLike } | null {
  if (flags.issues.length || flags.candidateSource !== "supabase-live") return null;
  if (!dependencies.authPort || !dependencies.mealBuddyClient) return null;
  return { authPort: dependencies.authPort, mealBuddyClient: dependencies.mealBuddyClient };
}

export function createMealBuddySourceCardRepository(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  dependencies: MealBuddyCandidateFactoryDependencies = {},
  flags: MealBuddyCandidateRuntimeFlags = getMealBuddyCandidateRuntimeFlags(authSource, supabaseAuthEnabled)
): MealBuddySourceCardRepository {
  const resolved = live(flags, dependencies);
  if (!resolved) return new DisabledMealBuddySourceCardRepository();
  return new SupabaseMealBuddySourceCardRepository(resolved);
}

export function createMealBuddyCandidateRepository(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  dependencies: MealBuddyCandidateFactoryDependencies = {},
  flags: MealBuddyCandidateRuntimeFlags = getMealBuddyCandidateRuntimeFlags(authSource, supabaseAuthEnabled)
): MealBuddyCandidateRepository {
  const resolved = live(flags, dependencies);
  if (!resolved) return new DisabledMealBuddyCandidateRepository();
  return new SupabaseMealBuddyCandidateRepository(resolved);
}

export function createMealBuddyCandidateService(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  dependencies: MealBuddyCandidateFactoryDependencies = {},
  flags?: MealBuddyCandidateRuntimeFlags
): MealBuddyCandidateService {
  const resolvedFlags = flags ?? getMealBuddyCandidateRuntimeFlags(authSource, supabaseAuthEnabled);
  return new MealBuddyCandidateService({
    sourceCardRepository: createMealBuddySourceCardRepository(authSource, supabaseAuthEnabled, dependencies, resolvedFlags),
    candidateRepository: createMealBuddyCandidateRepository(authSource, supabaseAuthEnabled, dependencies, resolvedFlags)
  });
}

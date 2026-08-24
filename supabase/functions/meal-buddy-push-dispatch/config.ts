export const MEAL_BUDDY_PUSH_DISPATCH_SECRET_ENV = "MEAL_BUDDY_PUSH_DISPATCH_SECRET" as const;
export const EXPO_ACCESS_TOKEN_ENV = "EXPO_ACCESS_TOKEN" as const;
export const MEAL_BUDDY_PUSH_DISPATCH_LIMIT = 50 as const;

export type MealBuddyPushDispatchConfig = Readonly<{
  dispatchSecret: string;
  expoAccessToken: string | null;
}>;
export type MealBuddyPushDispatchConfigOutcome =
  | { ok: true; value: MealBuddyPushDispatchConfig }
  | { ok: false; errorCode: "server_unavailable" };

function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}

// The dispatcher is operational machinery, not a user endpoint. It authenticates with a shared
// Development/Production secret rather than a user JWT, and it refuses to run at all when that
// secret is absent — an unauthenticated drain of the outbox must never be possible.
export function loadMealBuddyPushDispatchConfig(): MealBuddyPushDispatchConfigOutcome {
  const dispatchSecret = env(MEAL_BUDDY_PUSH_DISPATCH_SECRET_ENV);
  if (!dispatchSecret || dispatchSecret.length < 32) return { ok: false, errorCode: "server_unavailable" };
  return {
    ok: true,
    value: Object.freeze({ dispatchSecret, expoAccessToken: env(EXPO_ACCESS_TOKEN_ENV) })
  };
}

// Constant-time comparison so the secret cannot be recovered by timing the endpoint.
export function secretMatches(expected: string, presented: string | null): boolean {
  if (!presented || presented.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ presented.charCodeAt(index);
  }
  return difference === 0;
}

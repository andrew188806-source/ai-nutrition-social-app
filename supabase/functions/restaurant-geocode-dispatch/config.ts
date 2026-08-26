export const RESTAURANT_GEOCODE_DISPATCH_SECRET_ENV = "RESTAURANT_GEOCODE_DISPATCH_SECRET" as const;
export const RESTAURANT_GEOCODING_PROVIDER_ENV = "RESTAURANT_GEOCODING_PROVIDER" as const;
export const RESTAURANT_GEOCODE_MAX_ATTEMPTS_ENV = "RESTAURANT_GEOCODE_MAX_ATTEMPTS" as const;
export const RESTAURANT_GEOCODE_DISPATCH_LIMIT = 25 as const;
export const RESTAURANT_GEOCODE_DEFAULT_MAX_ATTEMPTS = 3 as const;

// GEO-1C-P0 dispatcher configuration.
//
// The provider is SELECTED, never assumed. Only `mock` is implemented in this round, and an
// unrecognised value refuses to run rather than silently falling back — a geocoder nobody chose is
// exactly the failure mode a provider-neutral design exists to prevent.
export type RestaurantGeocodeProviderName = "disabled" | "mock";

export type RestaurantGeocodeDispatchConfig = Readonly<{
  dispatchSecret: string;
  providerName: Exclude<RestaurantGeocodeProviderName, "disabled">;
  maxAttempts: number;
}>;
export type RestaurantGeocodeDispatchConfigOutcome =
  | { ok: true; value: RestaurantGeocodeDispatchConfig }
  | { ok: false; errorCode: "server_unavailable" };

function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}

// The dispatcher is operational machinery, not a user endpoint. It authenticates with a shared
// secret rather than a user JWT and refuses to run at all when that secret is absent, so an
// unauthenticated drain of the resolution queue is never possible.
export function loadRestaurantGeocodeDispatchConfig(): RestaurantGeocodeDispatchConfigOutcome {
  const dispatchSecret = env(RESTAURANT_GEOCODE_DISPATCH_SECRET_ENV);
  if (!dispatchSecret || dispatchSecret.length < 32) return { ok: false, errorCode: "server_unavailable" };

  const providerRaw = env(RESTAURANT_GEOCODING_PROVIDER_ENV) ?? "disabled";
  if (providerRaw !== "mock") return { ok: false, errorCode: "server_unavailable" };

  const attemptsRaw = Number(env(RESTAURANT_GEOCODE_MAX_ATTEMPTS_ENV));
  const maxAttempts = Number.isInteger(attemptsRaw) && attemptsRaw > 0 && attemptsRaw <= 10
    ? attemptsRaw : RESTAURANT_GEOCODE_DEFAULT_MAX_ATTEMPTS;

  return { ok: true, value: Object.freeze({ dispatchSecret, providerName: "mock", maxAttempts }) };
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

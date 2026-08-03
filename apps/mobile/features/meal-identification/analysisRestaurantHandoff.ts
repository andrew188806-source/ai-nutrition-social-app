// MI-E-C5-R7-C1 — pure Restaurant Catalog -> /meal-photo handoff contract.
//
// This module is the single authority for turning a catalog selection into route params, and for
// turning route params back into an explicit analysis restaurant context. Both directions live here
// so the pair invariant is stated once instead of being duplicated in two React screens, and so the
// companion smoke can EXECUTE the rules rather than pattern-match a screen's source.
//
// Deliberately pure: no React, no Expo Router, no Supabase client, no catalog repository, no
// finalization RPC, no display formatting, no persistent storage. It moves DURABLE IDENTIFIERS
// only — never a restaurant name, branch name, district, menu or serialized catalog object. Naming
// a venue on screen is R7-C2's problem and needs a catalog lookup, not a route parameter.
//
// IDs are treated as opaque non-empty durable identifiers. `restaurants.id` / `restaurant_branches.id`
// are text primary keys, so no UUID shape is assumed here; the frozen R7-B server contract remains
// the final authority on whether a restaurant/branch pair actually exists.

/** The decoded, explicit restaurant context a new capture was started with. */
export type AnalysisRestaurantHandoff = Readonly<{
  restaurantId: string;
  branchId: string | null;
}>;

/** The ONLY route parameter keys this handoff may ever use. */
export const ANALYSIS_RESTAURANT_HANDOFF_PARAM_KEYS = Object.freeze(["restaurantId", "branchId"] as const);

/** What `restaurants.tsx` hands to `router.push({ params })`. Branch key is omitted, never null. */
export type AnalysisRestaurantHandoffParams =
  | Readonly<{ restaurantId: string }>
  | Readonly<{ restaurantId: string; branchId: string }>;

/** Raw Expo Router param shape: a scalar, a repeated key, or absent. */
export type RouteParamValue = string | string[] | undefined;

// A single route value is usable only when it is unambiguous. An empty array carries no value and a
// multi-element array carries more than one candidate — picking one arbitrarily would silently
// attach a meal to a venue the user never chose, so both are refused rather than guessed.
function normalizeRouteParamValue(value: RouteParamValue): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    if (value.length !== 1) return null;
    const [only] = value;
    return typeof only === "string" ? normalizeRouteParamValue(only) : null;
  }
  return null;
}

/**
 * Decode route params into an explicit restaurant context.
 *
 * Returns null whenever no trustworthy restaurant identity is present, which is the generic
 * no-restaurant capture and a completely legal flow. A branch without a restaurant is never
 * addressable, so a branch-only route decodes to null rather than to a branch-only context.
 */
export function decodeAnalysisRestaurantHandoff(
  params: Readonly<{ restaurantId?: RouteParamValue; branchId?: RouteParamValue }> | null | undefined
): AnalysisRestaurantHandoff | null {
  if (!params) return null;
  const restaurantId = normalizeRouteParamValue(params.restaurantId);
  // No restaurant means no context at all — including when a branchId was supplied on its own.
  if (!restaurantId) return null;
  // An unusable branch value degrades to restaurant-only. The restaurant is still unambiguous, so
  // discarding the whole selection would throw away correct information; what is never done is
  // choosing one element of an ambiguous branch value.
  const branchId = normalizeRouteParamValue(params.branchId);
  return Object.freeze({ restaurantId, branchId });
}

/**
 * Encode a catalog selection into route params.
 *
 * `branchIds` is the set of branches the CURRENT catalog restaurant actually has. A selected branch
 * that is not in that set is stale (the catalog moved on, or the selection belonged to a previously
 * opened restaurant) and is dropped, downgrading to restaurant-only rather than handing a branch id
 * that does not belong to this restaurant. The caller must pass the user's real selection: a
 * first-branch fallback is a presentation shortcut, not a choice a person made.
 */
export function encodeAnalysisRestaurantHandoffParams(
  input: Readonly<{
    restaurantId: string | null | undefined;
    selectedBranchId?: string | null;
    branchIds?: readonly (string | null | undefined)[];
  }>
): AnalysisRestaurantHandoffParams | null {
  const restaurantId = normalizeRouteParamValue(input.restaurantId ?? undefined);
  if (!restaurantId) return null;

  const selectedBranchId = normalizeRouteParamValue(input.selectedBranchId ?? undefined);
  if (!selectedBranchId) return Object.freeze({ restaurantId });

  const branchIds = (input.branchIds ?? [])
    .map((entry) => normalizeRouteParamValue(entry ?? undefined))
    .filter((entry): entry is string => entry !== null);
  if (!branchIds.includes(selectedBranchId)) return Object.freeze({ restaurantId });

  return Object.freeze({ restaurantId, branchId: selectedBranchId });
}

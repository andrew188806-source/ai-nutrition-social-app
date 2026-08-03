import type { CatalogRestaurantViewModel } from "./types";

// MI-E-C5-R7-A-R1 canonical restaurant PRESENTATION authority — CATALOG ONLY.
//
// Pure: no React, no store access, no network, no repository of its own. It reuses whatever the
// existing consumer restaurant catalog already resolved (useRestaurantCatalog / RestaurantCatalogService
// / SupabaseRestaurantCatalogRepository over consumer_public_restaurant_catalog_v1).
//
// The R7-A final audit rejected an earlier version that also accepted a `restaurantDisplayName`
// snapshot: when the catalog was not authoritative, ANY caller-supplied string came back as
// `resolved`, and the function had no way to tell a session-owned snapshot from a route parameter,
// an AI candidate field or an arbitrary literal. That bridge is gone. A name now has exactly one
// source — a catalog record looked up by canonical id — and there is no parameter through which a
// caller can inject one.
//
// If an offline snapshot is ever genuinely needed, it must arrive as a provenance-carrying trusted
// type with its own write authority, not as a bare string reopened here.
//
// MI-E-C5-R7-C2a: the lookup now returns the CANONICAL nested CatalogRestaurantViewModel (the same
// model useRestaurantCatalog.findRestaurantById already returns) instead of the flattened
// RestaurantCardViewModel, so a branch is resolved by its own durable id against
// `restaurant.branches` and displays its own `name`. The catalog mapper is unchanged: its flattening
// remains correct for the list/detail card UI, it was simply never a branch-identity authority.

export type RestaurantCatalogLookupStatus = "idle" | "loading" | "success" | "error" | "disabled";

export type RestaurantContextPresentationKind =
  // No restaurant context at all (generic camera/gallery entry, or self-cooked).
  | "none"
  // A restaurant context exists and the catalog is still working on it.
  | "loading"
  // A restaurant context exists but the catalog cannot name it (miss, error, or disabled).
  | "unresolved"
  // The catalog named it.
  | "resolved";

export type RestaurantContextPresentation = Readonly<{
  kind: RestaurantContextPresentationKind;
  restaurantName: string | null;
  branchName: string | null;
}>;

const NONE: RestaurantContextPresentation = Object.freeze({
  kind: "none",
  restaurantName: null,
  branchName: null
});

const LOADING: RestaurantContextPresentation = Object.freeze({
  kind: "loading",
  restaurantName: null,
  branchName: null
});

const UNRESOLVED: RestaurantContextPresentation = Object.freeze({
  kind: "unresolved",
  restaurantName: null,
  branchName: null
});

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Last line of defence: even a catalog row whose name field somehow carries an identifier is
// refused rather than rendered to a person.
export function isDisplayableRestaurantName(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.length) return false;
  return !UUID_SHAPE.test(trimmed);
}

export function resolveRestaurantContextPresentation(
  input: Readonly<{
    restaurantId: string | null;
    branchId?: string | null;
    catalogStatus: RestaurantCatalogLookupStatus;
    findRestaurant: (restaurantId: string) => CatalogRestaurantViewModel | null;
  }>
): RestaurantContextPresentation {
  const restaurantId = typeof input.restaurantId === "string" ? input.restaurantId.trim() : "";
  if (!restaurantId) return NONE;

  // Only a ready catalog can name a restaurant. idle/loading/error/disabled all refuse to resolve,
  // and there is no snapshot to fall back to by construction.
  if (input.catalogStatus === "loading" || input.catalogStatus === "idle") return LOADING;
  if (input.catalogStatus !== "success") return UNRESOLVED;

  const match = input.findRestaurant(restaurantId);
  if (!match || !isDisplayableRestaurantName(match.name)) return UNRESOLVED;

  // MI-E-C5-R7-C2a: resolve the branch against the CANONICAL nested branches, by exact durable id.
  //
  // The previous version compared `match.branchId` and rendered `match.location`, both of which come
  // from the FLATTENED card the catalog mapper builds for list/detail UI. That card collapses a
  // restaurant to its first branch (mapper.ts sets `branchId`/`location` from `branches[0]`), and its
  // `location` field is the branch DISTRICT, not the branch name. So a two-branch restaurant showed
  // the district for its first branch and nothing at all for every other branch.
  //
  // There is no index fallback and no district/address substitute: an unknown or foreign branchId
  // yields null, which is a restaurant-only presentation rather than a wrong venue.
  const branch = input.branchId
    ? match.branches.find((candidate) => candidate.branchId === input.branchId) ?? null
    : null;
  const branchName = branch && isDisplayableRestaurantName(branch.name) ? branch.name : null;

  return Object.freeze({
    kind: "resolved",
    restaurantName: match.name,
    branchName
  });
}

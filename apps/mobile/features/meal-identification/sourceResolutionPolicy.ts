import type {
  MealIdentificationCandidate,
  MealIdentificationTrustedIdentity,
  PersonalUnresolvedMealCandidate,
  PersonalUnresolvedReason
} from "./types";

const NULL_CATALOG_IDENTITY = Object.freeze({
  restaurantId: null,
  branchId: null,
  menuId: null,
  menuCategoryId: null,
  menuItemId: null,
  branchMenuItemId: null
});

export function createPersonalUnresolvedCandidate(input: {
  source: PersonalUnresolvedReason;
  restaurantName?: string;
  mealItemName?: string;
}): PersonalUnresolvedMealCandidate {
  return {
    kind: "personal_unresolved",
    identity: NULL_CATALOG_IDENTITY,
    source: input.source,
    restaurantName: input.restaurantName?.trim() ?? "",
    mealItemName: input.mealItemName?.trim() ?? ""
  };
}

export function toTrustedCanonicalIdentity(
  candidate: MealIdentificationCandidate | null
): MealIdentificationTrustedIdentity | null {
  if (!candidate || candidate.kind !== "catalog_item") return null;
  const { restaurantId, branchId, menuId, menuItemId } = candidate.identity;
  return { restaurantId, branchId, menuId, menuItemId };
}

export function isSameCatalogCandidate(
  left: MealIdentificationCandidate | null,
  right: MealIdentificationCandidate | null
): boolean {
  return (
    left?.kind === "catalog_item" &&
    right?.kind === "catalog_item" &&
    left.identity.branchMenuItemId === right.identity.branchMenuItemId &&
    left.identity.menuItemId === right.identity.menuItemId
  );
}

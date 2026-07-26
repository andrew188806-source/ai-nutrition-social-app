import type { RestaurantCatalogSource } from "../restaurants/catalog";

// MI-E-C1-R1: MealSourceContext's canonical definition now lives in @haocu/shared (packages/
// shared/src/domain/meal-photo-analysis/types.ts), since it must be usable by both Mobile and a
// future server-side Edge Function — a Mobile-only feature folder cannot serve that role. This is
// a type re-export, not a second definition: the value set, names, and runtime behavior are
// completely unchanged, and every existing import of MealSourceContext from this file/module
// keeps working exactly as before.
import type { MealSourceContext } from "@haocu/shared";

export type { MealSourceContext };

export type LegacyMealSourceContext = MealSourceContext | "post_hoc";

export type MealRecordTiming = "current" | "post_hoc";

export type MealOccurrenceTimestamp = string;

export type CatalogMealCandidateIdentity = {
  restaurantId: string;
  branchId: string;
  menuId: string;
  menuCategoryId: string;
  menuItemId: string;
  branchMenuItemId: string;
};

export type PersonalUnresolvedMealIdentity = {
  restaurantId: null;
  branchId: null;
  menuId: null;
  menuCategoryId: null;
  menuItemId: null;
  branchMenuItemId: null;
};

export type MealIdentificationNutritionProvenance =
  | "ai_estimated"
  | "restaurant_confirmed"
  | "platform_reviewed"
  | "missing";

export type CatalogMealIdentificationCandidate = {
  kind: "catalog_item";
  identity: CatalogMealCandidateIdentity;
  source: RestaurantCatalogSource;
  restaurantName: string;
  branchName: string;
  branchContext: string;
  menuName: string;
  menuCategoryName: string;
  mealItemName: string;
  price: number;
  availability: "available" | "limited";
  nutritionProvenance: MealIdentificationNutritionProvenance;
  confidence: number | null;
  matchReason: string;
  tags: readonly string[];
};

export type PersonalUnresolvedReason =
  | "none_of_the_above"
  | "manual"
  | "self_cooked"
  | "catalog_unavailable";

export type PersonalUnresolvedMealCandidate = {
  kind: "personal_unresolved";
  identity: PersonalUnresolvedMealIdentity;
  source: PersonalUnresolvedReason;
  restaurantName: string;
  mealItemName: string;
};

export type MealIdentificationCandidate =
  | CatalogMealIdentificationCandidate
  | PersonalUnresolvedMealCandidate;

export type MealIdentificationCandidateResolution =
  | { status: "loading"; candidates: readonly [] }
  | {
      status: "available";
      candidates: readonly CatalogMealIdentificationCandidate[];
      source: RestaurantCatalogSource;
    }
  | { status: "empty"; candidates: readonly []; source: RestaurantCatalogSource }
  | { status: "unavailable"; candidates: readonly []; message: string }
  | {
      status: "error";
      candidates: readonly [];
      source: RestaurantCatalogSource;
      message: string;
      retryable: boolean;
    };

export type MealIdentificationTrustedIdentity = Pick<
  CatalogMealCandidateIdentity,
  "restaurantId" | "branchId" | "menuId" | "menuItemId"
>;

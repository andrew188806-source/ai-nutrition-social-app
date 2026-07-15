import type {
  BranchMenuItem,
  Menu,
  MenuCategory,
  MenuItem,
  MenuItemAlias,
  MenuItemNutrition,
  Restaurant,
  RestaurantBranch
} from "@haocu/shared/domain/restaurantDomain";
import type {
  RestaurantPublicNutritionSource,
  RestaurantPublicPublishedNutrition
} from "../../repositories/restaurant-public-nutrition-read-repository";
import { SupabaseMappingError } from "./errors";
import type {
  BranchMenuItemRow,
  MenuCategoryRow,
  MenuItemAliasRow,
  MenuItemNutritionRow,
  MenuItemRow,
  MenuRow,
  RestaurantBranchRow,
  RestaurantPublicPublishedNutritionRow,
  RestaurantRow
} from "./rows";

function requireString(value: unknown, entity: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SupabaseMappingError(`Malformed ${entity}.${field}`, entity, field);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberFrom(value: unknown, entity: string, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  throw new SupabaseMappingError(`Malformed numeric ${entity}.${field}`, entity, field);
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function nullableNumber(value: unknown, entity: string, field: string): number | null {
  if (value === null) return null;
  return numberFrom(value, entity, field);
}

function nullableString(value: unknown, entity: string, field: string): string | null {
  if (value === null) return null;
  return requireString(value, entity, field);
}

function mapPublicNutritionSource(value: unknown): RestaurantPublicNutritionSource {
  if (value === "ai_estimated" || value === "restaurant_confirmed" || value === "platform_reviewed") {
    return value;
  }
  throw new SupabaseMappingError(
    `Unsupported public nutrition source: ${String(value)}`,
    "RestaurantPublicPublishedNutrition",
    "nutrition_source_public"
  );
}

function mapRestaurantStatus(status: string | null | undefined): Restaurant["status"] {
  if (!status || status === "active" || status === "published") return "active";
  if (status === "paused") return "paused";
  throw new SupabaseMappingError(`Unsupported restaurant status: ${status}`, "Restaurant", "status");
}

function mapMenuStatus(status: string | null | undefined): Menu["status"] {
  if (!status || status === "published" || status === "active") return "active";
  if (status === "draft" || status === "archived") return status;
  throw new SupabaseMappingError(`Unsupported menu status: ${status}`, "Menu", "status");
}

function mapMenuItemStatus(status: string | null | undefined): MenuItem["status"] {
  if (!status || status === "published" || status === "active") return "active";
  if (status === "draft" || status === "archived") return status;
  throw new SupabaseMappingError(`Unsupported menu item status: ${status}`, "MenuItem", "status");
}

function mapNutritionBadgeStatus(status: string | null | undefined): MenuItem["nutritionBadgeStatus"] {
  if (!status) return "missing";
  if (status === "approved" || status === "ai_estimated" || status === "pending_review" || status === "missing") return status;
  throw new SupabaseMappingError(`Unsupported nutrition badge status: ${status}`, "MenuItem", "nutritionBadgeStatus");
}

function mapAvailability(status: string | null | undefined): BranchMenuItem["availability"] {
  if (!status || status === "available") return "available";
  if (status === "limited" || status === "unavailable") return status;
  throw new SupabaseMappingError(`Unsupported branch item availability: ${status}`, "BranchMenuItem", "availability");
}

function mapBranchSpecificStatus(status: string | null | undefined): BranchMenuItem["branchSpecificStatus"] {
  if (!status || status === "active" || status === "available") return "available";
  if (status === "hidden" || status === "discontinued") return status;
  if (status === "inactive") return "hidden";
  throw new SupabaseMappingError(`Unsupported branch item status: ${status}`, "BranchMenuItem", "branchSpecificStatus");
}

function mapAliasSourceType(value: string | null | undefined): MenuItemAlias["sourceType"] {
  if (!value) return "restaurant";
  if (["restaurant", "user_input", "ai_detected", "admin", "imported", "legacy"].includes(value)) return value as MenuItemAlias["sourceType"];
  throw new SupabaseMappingError(`Unsupported alias source type: ${value}`, "MenuItemAlias", "sourceType");
}

function mapAliasStatus(value: string | null | undefined): MenuItemAlias["status"] {
  if (!value) return "pending";
  if (value === "pending" || value === "approved" || value === "rejected" || value === "merged") return value;
  throw new SupabaseMappingError(`Unsupported alias status: ${value}`, "MenuItemAlias", "status");
}

function mapNutritionSource(value: string | null | undefined): MenuItemNutrition["source"] {
  if (!value) return "pending";
  if (value === "restaurant_verified" || value === "admin_verified" || value === "ai_estimated" || value === "pending") return value;
  throw new SupabaseMappingError(`Unsupported nutrition source: ${value}`, "MenuItemNutrition", "source");
}

function mapVerificationStatus(value: string | null | undefined): MenuItemNutrition["verifiedStatus"] {
  if (!value) return "pending_review";
  if (value === "verified" || value === "ai_estimated" || value === "pending_review" || value === "rejected") return value;
  throw new SupabaseMappingError(`Unsupported verification status: ${value}`, "MenuItemNutrition", "verifiedStatus");
}

export function mapRestaurantRow(row: RestaurantRow): Restaurant {
  return {
    id: requireString(row.id, "Restaurant", "id"),
    name: requireString(row.name, "Restaurant", "name"),
    legalName: row.legal_name || row.name,
    city: row.city || "",
    category: row.category || "",
    tags: arrayOfStrings(row.tags),
    plan: row.plan === "starter" || row.plan === "growth" ? row.plan : "demo",
    status: mapRestaurantStatus(row.status)
  };
}

export function mapRestaurantBranchRow(row: RestaurantBranchRow): RestaurantBranch {
  return {
    id: requireString(row.id, "RestaurantBranch", "id"),
    restaurantId: requireString(row.restaurant_id, "RestaurantBranch", "restaurant_id"),
    name: requireString(row.name, "RestaurantBranch", "name"),
    district: row.district || "",
    address: row.address || "",
    isActive: typeof row.is_active === "boolean" ? row.is_active : row.status !== "inactive"
  };
}

export function mapMenuRow(row: MenuRow): Menu {
  return {
    id: requireString(row.id, "Menu", "id"),
    restaurantId: requireString(row.restaurant_id, "Menu", "restaurant_id"),
    name: requireString(row.name, "Menu", "name"),
    status: mapMenuStatus(row.status)
  };
}

export function mapMenuCategoryRow(row: MenuCategoryRow): MenuCategory {
  return {
    id: requireString(row.id, "MenuCategory", "id"),
    menuId: requireString(row.menu_id, "MenuCategory", "menu_id"),
    name: requireString(row.name, "MenuCategory", "name"),
    sortOrder: optionalNumber(row.sort_order) ?? 0
  };
}

export function mapMenuItemRow(row: MenuItemRow): MenuItem {
  return {
    id: requireString(row.id, "MenuItem", "id"),
    restaurantId: requireString(row.restaurant_id, "MenuItem", "restaurant_id"),
    menuCategoryId: requireString(row.menu_category_id, "MenuItem", "menu_category_id"),
    name: requireString(row.name, "MenuItem", "name"),
    description: row.description || "",
    imageUrl: optionalString(row.image_url),
    tagIds: arrayOfStrings(row.tag_ids),
    allergens: arrayOfStrings(row.allergens),
    status: mapMenuItemStatus(row.status),
    nutritionId: optionalString(row.nutrition_id),
    nutritionBadgeStatus: mapNutritionBadgeStatus(row.nutrition_badge_status),
    badgeEnabled: Boolean(row.badge_enabled)
  };
}

export function mapBranchMenuItemRow(row: BranchMenuItemRow): BranchMenuItem {
  return {
    id: requireString(row.id, "BranchMenuItem", "id"),
    restaurantId: requireString(row.restaurant_id, "BranchMenuItem", "restaurant_id"),
    branchId: requireString(row.branch_id, "BranchMenuItem", "branch_id"),
    menuItemId: requireString(row.menu_item_id, "BranchMenuItem", "menu_item_id"),
    price: numberFrom(row.price, "BranchMenuItem", "price"),
    availability: mapAvailability(row.availability),
    soldOut: Boolean(row.sold_out),
    branchSpecificName: optionalString(row.branch_specific_name),
    branchSpecificDescription: optionalString(row.branch_specific_description),
    branchSpecificStatus: mapBranchSpecificStatus(row.branch_specific_status)
  };
}

export function mapMenuItemAliasRow(row: MenuItemAliasRow): MenuItemAlias {
  return {
    id: requireString(row.id, "MenuItemAlias", "id"),
    menuItemId: requireString(row.menu_item_id, "MenuItemAlias", "menu_item_id"),
    aliasName: requireString(row.alias_name, "MenuItemAlias", "alias_name"),
    normalizedAliasName: requireString(row.normalized_alias_name, "MenuItemAlias", "normalized_alias_name"),
    sourceType: mapAliasSourceType(row.source_type),
    restaurantId: requireString(row.restaurant_id, "MenuItemAlias", "restaurant_id"),
    branchId: optionalString(row.branch_id),
    confidenceScore: optionalNumber(row.confidence_score) ?? 0,
    status: mapAliasStatus(row.status),
    createdAt: requireString(row.created_at, "MenuItemAlias", "created_at"),
    updatedAt: requireString(row.updated_at, "MenuItemAlias", "updated_at")
  };
}

export function mapMenuItemNutritionRow(row: MenuItemNutritionRow): MenuItemNutrition {
  return {
    id: requireString(row.id, "MenuItemNutrition", "id"),
    menuItemId: requireString(row.menu_item_id, "MenuItemNutrition", "menu_item_id"),
    calories: optionalNumber(row.calories),
    protein: optionalNumber(row.protein),
    carbohydrates: optionalNumber(row.carbohydrates),
    fat: optionalNumber(row.fat),
    fiber: optionalNumber(row.fiber),
    sugar: optionalNumber(row.sugar),
    sodium: optionalNumber(row.sodium),
    saturatedFat: optionalNumber(row.saturated_fat),
    servingSize: optionalString(row.serving_size),
    source: mapNutritionSource(row.source),
    confidenceScore: optionalNumber(row.confidence_score) ?? 0,
    verifiedStatus: mapVerificationStatus(row.verified_status),
    updatedAt: requireString(row.updated_at, "MenuItemNutrition", "updated_at")
  };
}

export function mapRestaurantPublicPublishedNutritionRow(
  row: RestaurantPublicPublishedNutritionRow
): RestaurantPublicPublishedNutrition {
  return {
    restaurantId: requireString(row.restaurant_id, "RestaurantPublicPublishedNutrition", "restaurant_id"),
    menuItemId: requireString(row.menu_item_id, "RestaurantPublicPublishedNutrition", "menu_item_id"),
    calories: nullableNumber(row.calories, "RestaurantPublicPublishedNutrition", "calories"),
    protein: nullableNumber(row.protein, "RestaurantPublicPublishedNutrition", "protein"),
    carbohydrates: nullableNumber(row.carbohydrates, "RestaurantPublicPublishedNutrition", "carbohydrates"),
    fat: nullableNumber(row.fat, "RestaurantPublicPublishedNutrition", "fat"),
    fiber: nullableNumber(row.fiber, "RestaurantPublicPublishedNutrition", "fiber"),
    sugar: nullableNumber(row.sugar, "RestaurantPublicPublishedNutrition", "sugar"),
    sodium: nullableNumber(row.sodium, "RestaurantPublicPublishedNutrition", "sodium"),
    saturatedFat: nullableNumber(row.saturated_fat, "RestaurantPublicPublishedNutrition", "saturated_fat"),
    servingSize: nullableString(row.serving_size, "RestaurantPublicPublishedNutrition", "serving_size"),
    nutritionSourcePublic: mapPublicNutritionSource(row.nutrition_source_public),
    nutritionUpdatedAt: requireString(row.nutrition_updated_at, "RestaurantPublicPublishedNutrition", "nutrition_updated_at")
  };
}

export const READONLY_RESOURCES = [
  "restaurants",
  "restaurant_branches",
  "menus",
  "menu_categories",
  "menu_items",
  "branch_menu_items",
  "menu_item_aliases",
  "current_published_menu_item_nutrition",
  "restaurant_exposure_summary",
  "nutrition_badge_performance",
  "menu_item_performance"
] as const;

export type ReadonlyResource = (typeof READONLY_RESOURCES)[number];

export const READONLY_RESOURCE_SET = new Set<string>(READONLY_RESOURCES);

export const READONLY_ORDER_FIELDS: Record<ReadonlyResource, readonly string[]> = {
  restaurants: ["name", "id"],
  restaurant_branches: ["name", "id"],
  menus: ["name", "id"],
  menu_categories: ["sort_order", "name", "id"],
  menu_items: ["name", "id"],
  branch_menu_items: ["id", "branch_id", "menu_item_id"],
  menu_item_aliases: ["id", "alias_name"],
  current_published_menu_item_nutrition: ["menu_item_id", "updated_at"],
  restaurant_exposure_summary: ["restaurant_id", "source"],
  nutrition_badge_performance: ["restaurant_id", "menu_item_id"],
  menu_item_performance: ["restaurant_id", "menu_item_id"]
};

export function assertReadonlyResource(resource: string): asserts resource is ReadonlyResource {
  if (!READONLY_RESOURCE_SET.has(resource)) {
    throw new Error(`Unsupported readonly resource: ${resource}`);
  }
}
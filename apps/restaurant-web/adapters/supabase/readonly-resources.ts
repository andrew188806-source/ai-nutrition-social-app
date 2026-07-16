export const READONLY_RESOURCES = [
  "restaurant_public_published_nutrition_v1"
] as const;

export type ReadonlyResource = (typeof READONLY_RESOURCES)[number];

export const READONLY_RESOURCE_SET = new Set<string>(READONLY_RESOURCES);

export const READONLY_ORDER_FIELDS: Record<ReadonlyResource, readonly string[]> = {
  restaurant_public_published_nutrition_v1: ["menu_item_id", "nutrition_updated_at"]
};

export function assertReadonlyResource(resource: string): asserts resource is ReadonlyResource {
  if (!READONLY_RESOURCE_SET.has(resource)) {
    throw new Error(`Unsupported readonly resource: ${resource}`);
  }
}

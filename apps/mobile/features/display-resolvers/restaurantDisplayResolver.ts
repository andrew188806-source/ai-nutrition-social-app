import { mockMenuItems, mockRestaurantProfile } from "@haocu/shared";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { RestaurantDisplay, RestaurantMenuDisplay } from "./types";

type I18nRestaurant = (typeof zhTW.mobile.restaurants.list)[number];

export function resolveRestaurantDisplay(restaurantId: string): RestaurantDisplay | null {
  const sharedRestaurant = matchesRestaurantId(restaurantId, mockRestaurantProfile.id, mockRestaurantProfile.name) ? mockRestaurantProfile : null;
  const i18nRestaurant = findI18nRestaurant(restaurantId);

  if (!sharedRestaurant && !i18nRestaurant) {
    return null;
  }

  const restaurantName = sharedRestaurant?.name ?? i18nRestaurant?.name ?? restaurantId;
  const tags = uniqueStrings([...(i18nRestaurant?.tags ?? []), ...(sharedRestaurant?.tagIds ?? [])]);
  const dishes = sharedRestaurant ? menuItemsForRestaurant(sharedRestaurant.id) : [];

  return {
    restaurantName,
    location: i18nRestaurant?.distance ?? "",
    category: inferRestaurantCategory(tags),
    tags,
    dishes,
    nutritionData: dishes.filter(hasNutritionData)
  };
}

function findI18nRestaurant(restaurantId: string): I18nRestaurant | null {
  const directMatch = zhTW.mobile.restaurants.list.find((restaurant) => matchesRestaurantId(restaurantId, `restaurant-${restaurant.name}`, restaurant.name));
  if (directMatch) {
    return directMatch;
  }

  const candidateRestaurant = zhTW.mobile.refinedLogic.mealBuddyCard.candidates.find((candidate) => candidate.restaurantId === restaurantId);
  if (!candidateRestaurant?.restaurantName) {
    return null;
  }

  return zhTW.mobile.restaurants.list.find((restaurant) => matchesRestaurantId(candidateRestaurant.restaurantName, `restaurant-${restaurant.name}`, restaurant.name)) ?? null;
}

function menuItemsForRestaurant(restaurantId: string): RestaurantMenuDisplay[] {
  return mockMenuItems
    .filter((menuItem) => menuItem.restaurantId === restaurantId)
    .map((menuItem) => ({
      id: menuItem.id,
      name: menuItem.name,
      priceTwd: menuItem.priceTwd,
      tags: [...menuItem.tagIds],
      calories: menuItem.calories,
      proteinGrams: menuItem.proteinGrams,
      carbsGrams: menuItem.carbsGrams,
      fatGrams: menuItem.fatGrams,
      disclosureStatus: menuItem.disclosureStatus
    }));
}

function matchesRestaurantId(input: string, canonicalId: string, restaurantName: string) {
  const normalizedInput = normalizeId(input);
  return normalizedInput === normalizeId(canonicalId) || normalizedInput === normalizeId(restaurantName) || normalizedInput === normalizeId(`restaurant-${restaurantName}`);
}

function normalizeId(value: string) {
  return value.trim().toLowerCase();
}

function inferRestaurantCategory(tags: readonly string[]) {
  return tags[0] ?? "";
}

function hasNutritionData(menuItem: RestaurantMenuDisplay) {
  return typeof menuItem.calories === "number" || typeof menuItem.proteinGrams === "number" || typeof menuItem.carbsGrams === "number" || typeof menuItem.fatGrams === "number";
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

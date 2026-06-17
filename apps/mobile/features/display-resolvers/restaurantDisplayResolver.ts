import { getCanonicalRestaurantById } from "../restaurants";
import type { RestaurantDisplay, RestaurantMenuDisplay } from "./types";

export function resolveRestaurantDisplay(restaurantId: string): RestaurantDisplay | null {
  const restaurant = getCanonicalRestaurantById(restaurantId);
  if (!restaurant) {
    return null;
  }

  const dishes = restaurant.menuItems.map<RestaurantMenuDisplay>((menuItem) => ({
    id: menuItem.menuItemId,
    menuItemId: menuItem.menuItemId,
    name: menuItem.name,
    priceTwd: menuItem.price,
    tags: [...menuItem.tags],
    calories: menuItem.calories,
    proteinGrams: menuItem.protein,
    carbsGrams: menuItem.carbs,
    fatGrams: menuItem.fat,
    fiberGrams: menuItem.fiber,
    disclosureStatus: menuItem.verificationStatus
  }));

  return {
    restaurantName: restaurant.name,
    location: restaurant.distanceDisplay,
    category: restaurant.category,
    tags: [...restaurant.tags],
    dishes,
    nutritionData: dishes.filter(hasNutritionData)
  };
}

function hasNutritionData(menuItem: RestaurantMenuDisplay) {
  return typeof menuItem.calories === "number" || typeof menuItem.proteinGrams === "number" || typeof menuItem.carbsGrams === "number" || typeof menuItem.fatGrams === "number";
}

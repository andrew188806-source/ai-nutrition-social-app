import { restaurantRepository } from "../repositories/restaurant-repository";
import { mobileMenuItemService } from "./mobile-menu-item-service";
import type { MealBuddyRestaurantViewModel, RestaurantCardViewModel, RestaurantDetailViewModel } from "../view-models/restaurant-view-models";

const restaurantDisplayMeta: Record<string, { distanceDisplay: string; rating: string; score: string; aliases: string[] }> = {
  "restaurant-haochu-bowl": {
    distanceDisplay: "850m",
    rating: "4.8",
    score: "96%",
    aliases: ["rest-haochu", "rest-demo", "restaurant-demo"]
  },
  "restaurant-mori-veggie": {
    distanceDisplay: "1.2km",
    rating: "4.6",
    score: "88%",
    aliases: ["rest-mori", "restaurant-mori"]
  },
  "restaurant-mountain-protein": {
    distanceDisplay: "1.8km",
    rating: "4.7",
    score: "91%",
    aliases: ["rest-protein", "restaurant-protein"]
  },
  "restaurant-noodle-soup": {
    distanceDisplay: "1.4km",
    rating: "4.5",
    score: "82%",
    aliases: ["rest-noodle", "restaurant-noodle"]
  },
  "restaurant-cafe-balance": {
    distanceDisplay: "0.9km",
    rating: "4.6",
    score: "85%",
    aliases: ["rest-cafe", "restaurant-cafe"]
  }
};

export const mobileRestaurantService = {
  listRestaurantCards(): RestaurantCardViewModel[] {
    return restaurantRepository.listRestaurants().map((restaurant) => {
      const branch = restaurantRepository.getPrimaryBranch(restaurant.id);
      const menuItems = mobileMenuItemService.listMenuItemsForRestaurant(restaurant.id, branch?.id);
      const meta = restaurantDisplayMeta[restaurant.id] ?? {
        distanceDisplay: branch?.district ?? restaurant.city,
        rating: "4.6",
        score: "88%",
        aliases: []
      };

      return {
        id: restaurant.id,
        restaurantId: restaurant.id,
        branchId: branch?.id ?? menuItems[0]?.branchId,
        name: restaurant.name,
        location: branch?.district ?? restaurant.city,
        address: branch?.address,
        distanceDisplay: meta.distanceDisplay,
        category: restaurant.category,
        tags: [...restaurant.tags],
        priceRange: mobileMenuItemService.getPriceRangeForRestaurant(restaurant.id, branch?.id),
        rating: meta.rating,
        score: meta.score,
        aliases: meta.aliases,
        menuItems
      };
    });
  },

  findRestaurantById(restaurantId: string | undefined | null): RestaurantCardViewModel | null {
    if (!restaurantId) return null;
    return this.listRestaurantCards().find((restaurant) => restaurant.restaurantId === restaurantId || restaurant.aliases?.includes(restaurantId)) ?? null;
  },

  findRestaurantByName(name: string | undefined | null): RestaurantCardViewModel | null {
    if (!name) return null;
    return this.listRestaurantCards().find((restaurant) => restaurant.name === name || restaurant.aliases?.includes(name)) ?? null;
  },

  getRestaurantDetail(restaurantId: string | undefined | null): RestaurantDetailViewModel | null {
    const restaurant = this.findRestaurantById(restaurantId);
    if (!restaurant) return null;
    return {
      ...restaurant,
      branches: restaurantRepository.listBranches(restaurant.restaurantId)
    };
  },

  getDefaultRestaurantForProfileTags(tags: string[]): RestaurantCardViewModel {
    const restaurants = this.listRestaurantCards();
    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    const matched = restaurants.find((restaurant) => restaurant.tags.some((tag) => normalizedTags.some((profileTag) => tag.toLowerCase().includes(profileTag) || profileTag.includes(tag.toLowerCase()))));
    return matched ?? restaurants[0];
  },

  createMealBuddyRestaurantSnapshot(restaurantId: string, menuItemId?: string): MealBuddyRestaurantViewModel | null {
    const restaurant = this.findRestaurantById(restaurantId);
    if (!restaurant) return null;
    const item = menuItemId ? mobileMenuItemService.findMenuItemById(menuItemId) : mobileMenuItemService.getPrimaryMenuItemForRestaurant(restaurant.restaurantId);
    return {
      restaurantId: restaurant.restaurantId,
      branchId: restaurant.branchId,
      restaurantNameSnapshot: restaurant.name,
      branchNameSnapshot: restaurant.location,
      menuItemId: item?.menuItemId,
      menuItemNameSnapshot: item?.name,
      priceSnapshot: item?.price,
      nutritionSnapshot: item
        ? {
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            fiber: item.fiber
          }
        : undefined
    };
  }
};

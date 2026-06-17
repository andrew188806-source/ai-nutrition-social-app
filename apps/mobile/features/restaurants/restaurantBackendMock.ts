export type CanonicalRestaurantMenuItem = {
  menuItemId: string;
  restaurantId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  price: number;
  tags: string[];
  image?: string;
  emoji?: string;
  mealType?: string;
  source: "restaurant_menu" | "ai_user_uploaded";
  verificationStatus: "restaurant_verified" | "ai_estimated" | "pending_review";
};

export type CanonicalRestaurant = {
  restaurantId: string;
  name: string;
  location: string;
  distanceDisplay: string;
  category: string;
  tags: string[];
  priceRange: string;
  rating?: string;
  score: string;
  aliases?: string[];
  menuItems: CanonicalRestaurantMenuItem[];
};

export const canonicalRestaurants: CanonicalRestaurant[] = [
  {
    restaurantId: "restaurant-haochu-bowl",
    name: "好初健康碗",
    location: "信義區",
    distanceDisplay: "850m",
    category: "健康碗",
    tags: ["藍勾勾認證", "高蛋白", "均衡推薦"],
    priceRange: "NT$160-220",
    rating: "4.8",
    score: "96%",
    aliases: ["restaurant-好初健康碗", "rest-haochu", "rest-demo", "好食健康碗"],
    menuItems: [
      {
        menuItemId: "dish-haochu-1",
        restaurantId: "restaurant-haochu-bowl",
        name: "雞胸高蛋白碗",
        calories: 620,
        protein: 38,
        carbs: 55,
        fat: 14,
        fiber: 5,
        price: 185,
        tags: ["高蛋白", "均衡推薦"],
        emoji: "🍗",
        mealType: "午餐",
        source: "restaurant_menu",
        verificationStatus: "restaurant_verified"
      },
      {
        menuItemId: "dish-haochu-2",
        restaurantId: "restaurant-haochu-bowl",
        name: "高纖蔬食碗",
        calories: 480,
        protein: 16,
        carbs: 64,
        fat: 12,
        fiber: 11,
        price: 168,
        tags: ["高纖飲食", "蔬食選項", "低卡選項"],
        emoji: "🥗",
        mealType: "午餐",
        source: "restaurant_menu",
        verificationStatus: "restaurant_verified"
      },
      {
        menuItemId: "dish-haochu-3",
        restaurantId: "restaurant-haochu-bowl",
        name: "雞胸蔬菜早餐盤",
        calories: 390,
        protein: 24,
        carbs: 30,
        fat: 14,
        fiber: 6,
        price: 155,
        tags: ["高蛋白", "低卡選項"],
        emoji: "🍳",
        mealType: "早餐",
        source: "ai_user_uploaded",
        verificationStatus: "pending_review"
      }
    ]
  },
  {
    restaurantId: "restaurant-mori-veggie",
    name: "森日蔬食廚房",
    location: "大安森林公園",
    distanceDisplay: "1.2km",
    category: "蔬食",
    tags: ["蔬食選項", "低卡選項", "高蛋白"],
    priceRange: "NT$150-210",
    rating: "4.6",
    score: "88%",
    aliases: ["restaurant-森日蔬食廚房", "rest-mori", "小森健康食堂", "青葉食堂", "青葉壽司"],
    menuItems: [
      {
        menuItemId: "dish-mori-1",
        restaurantId: "restaurant-mori-veggie",
        name: "蔬食咖哩飯",
        calories: 540,
        protein: 14,
        carbs: 78,
        fat: 16,
        fiber: 9,
        price: 180,
        tags: ["蔬食選項", "高纖飲食"],
        emoji: "🍛",
        mealType: "午餐",
        source: "restaurant_menu",
        verificationStatus: "ai_estimated"
      },
      {
        menuItemId: "dish-mori-2",
        restaurantId: "restaurant-mori-veggie",
        name: "豆腐藜麥沙拉",
        calories: 460,
        protein: 17,
        carbs: 58,
        fat: 12,
        fiber: 8,
        price: 165,
        tags: ["低卡選項", "蔬食選項"],
        emoji: "🥙",
        mealType: "晚餐",
        source: "restaurant_menu",
        verificationStatus: "ai_estimated"
      },
      {
        menuItemId: "dish-mori-3",
        restaurantId: "restaurant-mori-veggie",
        name: "蔬食歐姆蛋早餐盤",
        calories: 420,
        protein: 22,
        carbs: 34,
        fat: 18,
        fiber: 5,
        price: 150,
        tags: ["高蛋白", "蔬食選項"],
        emoji: "🍳",
        mealType: "早餐",
        source: "ai_user_uploaded",
        verificationStatus: "pending_review"
      }
    ]
  },
  {
    restaurantId: "restaurant-mountain-protein",
    name: "山線蛋白餐盒",
    location: "松山區",
    distanceDisplay: "1.8km",
    category: "蛋白餐盒",
    tags: ["高蛋白", "運動餐", "均衡推薦"],
    priceRange: "NT$170-240",
    rating: "4.7",
    score: "91%",
    aliases: ["restaurant-山線蛋白餐盒", "rest-protein"],
    menuItems: [
      {
        menuItemId: "dish-mountain-1",
        restaurantId: "restaurant-mountain-protein",
        name: "瘦蛋白便當",
        calories: 610,
        protein: 42,
        carbs: 58,
        fat: 13,
        fiber: 6,
        price: 195,
        tags: ["高蛋白", "運動餐"],
        emoji: "🍱",
        mealType: "午餐",
        source: "restaurant_menu",
        verificationStatus: "restaurant_verified"
      },
      {
        menuItemId: "dish-mountain-2",
        restaurantId: "restaurant-mountain-protein",
        name: "雙重雞胸蛋白盤",
        calories: 680,
        protein: 52,
        carbs: 48,
        fat: 18,
        fiber: 5,
        price: 230,
        tags: ["高蛋白", "重訓友善"],
        emoji: "🥩",
        mealType: "晚餐",
        source: "restaurant_menu",
        verificationStatus: "restaurant_verified"
      },
      {
        menuItemId: "dish-mountain-3",
        restaurantId: "restaurant-mountain-protein",
        name: "蛋白魚塊餐盒",
        calories: 560,
        protein: 36,
        carbs: 52,
        fat: 15,
        fiber: 4,
        price: 205,
        tags: ["高蛋白", "均衡推薦"],
        emoji: "🐟",
        mealType: "午餐",
        source: "restaurant_menu",
        verificationStatus: "ai_estimated"
      }
    ]
  }
];

export function getCanonicalRestaurants() {
  return canonicalRestaurants;
}

export function getCanonicalRestaurantById(restaurantId: string | undefined | null) {
  if (!restaurantId) return null;
  return canonicalRestaurants.find((restaurant) => restaurant.restaurantId === restaurantId || restaurant.aliases?.includes(restaurantId)) ?? null;
}

export function getCanonicalRestaurantByName(name: string | undefined | null) {
  if (!name) return null;
  return canonicalRestaurants.find((restaurant) => restaurant.name === name || restaurant.aliases?.includes(name)) ?? null;
}

export function getCanonicalRestaurantMenuItems(restaurantId: string) {
  return getCanonicalRestaurantById(restaurantId)?.menuItems ?? [];
}

export function getCanonicalMenuItemById(menuItemId: string | undefined | null) {
  if (!menuItemId) return null;
  for (const restaurant of canonicalRestaurants) {
    const menuItem = restaurant.menuItems.find((item) => item.menuItemId === menuItemId);
    if (menuItem) return menuItem;
  }
  return null;
}

export function getPrimaryMenuItemForRestaurant(restaurantId: string | undefined | null) {
  if (!restaurantId) return null;
  return getCanonicalRestaurantMenuItems(restaurantId)[0] ?? null;
}

export function getDefaultRestaurantForProfileTags(tags: string[]) {
  if (tags.some((tag) => tag.includes("蔬") || tag.toLowerCase().includes("veggie"))) {
    return canonicalRestaurants[1];
  }
  if (tags.some((tag) => tag.includes("蛋白") || tag.toLowerCase().includes("protein"))) {
    return canonicalRestaurants[2];
  }
  return canonicalRestaurants[0];
}

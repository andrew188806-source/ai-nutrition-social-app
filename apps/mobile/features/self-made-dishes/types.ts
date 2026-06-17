// "我做的料理" (self-made dishes) — conceptually separate from restaurant-owned dishes.
//
// Restaurant dishes (see apps/mobile/features/restaurants/restaurantBackendMock.ts)
// belong to a restaurant via restaurantId and can appear in that restaurant's "均衡推薦"
// list. Self-made dishes belong to a user via userId and represent homemade / manually
// logged / AI-estimated meals that are NOT restaurant menu items. The two collections must
// never be mixed: a self-made dish must not be injected into canonical restaurant menus, and a
// restaurant dish must not be shown in a user's "我做的料理" area.
//
// Future placement once a dedicated UI exists:
// - 我的 (apps/mobile/app/me.tsx) — a "我做的料理" entry point alongside the existing
//   飲食手札 / 月評分 sections.
// - 美食日記 / 飲食手札 (apps/mobile/app/meal-log.tsx) — self-made dishes listed next to
//   restaurant meal records.
// - 自煮料理收藏 — a saved/favorited collection of the user's own SelfMadeDish entries.
// - manual input / AI analysis history (apps/mobile/app/meal-photo.tsx,
//   apps/mobile/features/analysis) — AI photo analysis or manual entry creates a
//   SelfMadeDish here when there is no restaurantId, instead of a canonical restaurant menu item.

// Source of a "Today Intake" (今日飲食) meal record. A meal record can wrap either a
// restaurant dish or a self-made dish, but its source must always be one of these.
export type MealSource = "restaurant" | "self_made" | "manual" | "ai_estimated";

export type SelfMadeDishSource = "self_made" | "manual" | "ai_estimated";
export type SelfMadeDishVerificationStatus = "user_created" | "ai_estimated";

export type SelfMadeDish = {
  id: string;
  userId: string;
  name: string;
  calories?: number;
  nutritionTags?: string[];
  mealType?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  // Only set when the user intentionally links a homemade dish to a restaurant context
  // (e.g. brought their own lunchbox while sitting at that restaurant's table). A
  // restaurantId here does NOT make this dish part of that restaurant's menu — it stays
  // out of canonical restaurant menus and out of that restaurant's "均衡推薦" list.
  restaurantId?: string;
  source: SelfMadeDishSource;
  verificationStatus: SelfMadeDishVerificationStatus;
};

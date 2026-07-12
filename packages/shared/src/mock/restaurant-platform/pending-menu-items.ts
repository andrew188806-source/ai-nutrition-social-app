import type { PendingMenuItem } from "../../domain/restaurantDomain";

export const canonicalPendingMenuItems: PendingMenuItem[] = [
  {
    id: "pending-overnight-oats",
    restaurantId: "restaurant-haochu-bowl",
    branchId: "branch-nanjing",
    userInputName: "莓果隔夜燕麥",
    normalizedInputName: "莓果隔夜燕麥",
    occurrenceCount: 18,
    lastSeenAt: "2026-07-09T16:30:00+08:00",
    photoUrl: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=400&q=80",
    aiCategoryGuess: "輕食 / 早餐",
    aiSuggestedMenuItemId: "dish-haochu-3",
    similarity: 0.62,
    status: "pending"
  },
  {
    id: "pending-tomato-beef-soup",
    restaurantId: "restaurant-haochu-bowl",
    branchId: "branch-beitou",
    userInputName: "番茄牛肉湯",
    normalizedInputName: "番茄牛肉湯",
    occurrenceCount: 9,
    lastSeenAt: "2026-07-08T21:15:00+08:00",
    photoUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=400&q=80",
    aiCategoryGuess: "主餐 / 湯品",
    aiSuggestedMenuItemId: "dish-haochu-5",
    similarity: 0.71,
    status: "needs_more_information"
  },
  {
    id: "pending-miso-chicken",
    restaurantId: "restaurant-haochu-bowl",
    branchId: "branch-xinyi",
    userInputName: "味噌雞肉便當",
    normalizedInputName: "味噌雞肉便當",
    occurrenceCount: 31,
    lastSeenAt: "2026-07-09T12:05:00+08:00",
    aiCategoryGuess: "均衡碗",
    aiSuggestedMenuItemId: "dish-haochu-1",
    similarity: 0.86,
    status: "matched_existing_item"
  }
];

import type { MealIdentificationCorrection, PrecisionMealCandidate } from "../types";

export const mockPrecisionMealCandidates: PrecisionMealCandidate[] = [
  {
    id: "candidate-haochu-chicken-bowl",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "menu-chicken-bowl",
    restaurantName: "Haochu Health Bowl",
    menuItemName: "Chicken Protein Bowl",
    district: "Xinyi",
    confidence: "medium",
    confidenceScore: 82,
    tagIds: ["tag-restaurant-verified", "tag-restaurant-high-protein", "tag-goal-calorie"],
    explanation: "photo_location_menu_memory_match"
  },
  {
    id: "candidate-veggie-bowl",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "menu-veggie-fiber-bowl",
    restaurantName: "Haochu Health Bowl",
    menuItemName: "High Fiber Veggie Bowl",
    district: "Xinyi",
    confidence: "medium",
    confidenceScore: 74,
    tagIds: ["tag-restaurant-vegetarian", "tag-goal-high-fiber", "tag-restaurant-nutrition"],
    explanation: "nearby_menu_tag_similarity"
  },
  {
    id: "candidate-protein-box",
    restaurantId: "restaurant-mountain-protein",
    menuItemId: "menu-protein-box",
    restaurantName: "Mountain Protein Box",
    menuItemName: "Lean Protein Bento",
    district: "Xinyi",
    confidence: "needs_confirmation",
    confidenceScore: 63,
    tagIds: ["tag-restaurant-high-protein", "tag-restaurant-fat-loss", "tag-social-lunch"],
    explanation: "nearby_high_protein_candidate"
  }
];

export const mockMealIdentificationCorrections: MealIdentificationCorrection[] = [
  {
    id: "correction-demo-1",
    userId: "user-demo-1",
    originalCandidateId: "candidate-veggie-bowl",
    correctedRestaurantName: "Haochu Health Bowl",
    correctedMealName: "Chicken Protein Bowl",
    correctedDistrict: "Xinyi",
    note: "similar_photo_corrected_to_chicken_bowl",
    createdAt: "2026-05-25T12:58:00+08:00"
  }
];

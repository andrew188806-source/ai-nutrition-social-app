import { listMenuItemIngredients, listMenuItemNutrition, listNutritionEstimates, listNutritionReviews } from "../repositories/nutrition-repository";

export type NutritionQueueStatus = "complete" | "missing_ingredients" | "missing_portion" | "ai_outlier" | "pending_review";

export function getNutritionStatus(menuItemId: string) {
  const nutrition = listMenuItemNutrition().find((item) => item.menuItemId === menuItemId);
  const ingredients = listMenuItemIngredients().filter((item) => item.menuItemId === menuItemId);
  const blockingIngredient = ingredients.find((item) => item.status !== "complete");

  if (blockingIngredient?.status) return blockingIngredient.status;
  if (!nutrition || nutrition.verifiedStatus === "pending_review") return "pending_review";
  return "complete";
}

export function getNutritionConsoleData() {
  return {
    nutrition: listMenuItemNutrition(),
    ingredients: listMenuItemIngredients(),
    estimates: listNutritionEstimates(),
    reviews: listNutritionReviews()
  };
}

export function getPendingNutritionItems() {
  const nutrition = listMenuItemNutrition();
  const ingredients = listMenuItemIngredients();
  return nutrition
    .map((item) => {
      const blockingIngredient = ingredients.find((ingredient) => ingredient.menuItemId === item.menuItemId && ingredient.status !== "complete");
      const status: NutritionQueueStatus = blockingIngredient?.status ?? (item.verifiedStatus === "pending_review" ? "pending_review" : "complete");
      return { ...item, ingredientsStatus: status };
    })
    .filter((item) => item.ingredientsStatus !== "complete");
}

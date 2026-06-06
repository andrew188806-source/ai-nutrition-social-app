import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { CorrectionSection, CorrectionSectionKey, NutritionSummary } from "./types";

type AddedSections = Record<CorrectionSectionKey, boolean>;

export function buildCorrectionSections(addedSections: AddedSections): CorrectionSection[] {
  return [
    {
      key: "ingredients",
      title: zhTW.mobile.analysis.estimatedIngredientsTitle,
      items: addedSections.ingredients ? [...zhTW.mobile.analysis.estimatedIngredients, `${zhTW.mobile.finalUx.addedIngredient.name} ${zhTW.mobile.finalUx.addedIngredient.portion}`] : zhTW.mobile.analysis.estimatedIngredients,
      fields: zhTW.mobile.finalUx.ingredientCorrectionFields
    },
    {
      key: "portions",
      title: zhTW.mobile.analysis.estimatedPortionsTitle,
      items: addedSections.portions ? [...zhTW.mobile.analysis.estimatedPortions, zhTW.mobile.finalUx.addedPortion] : zhTW.mobile.analysis.estimatedPortions,
      fields: zhTW.mobile.finalUx.portionCorrectionFields
    },
    {
      key: "cooking",
      title: zhTW.mobile.analysis.estimatedCookingTitle,
      items: addedSections.cooking ? [...zhTW.mobile.analysis.estimatedCooking, zhTW.mobile.finalUx.addedCooking] : zhTW.mobile.analysis.estimatedCooking,
      fields: zhTW.mobile.finalUx.cookingCorrectionFields
    }
  ];
}

export function getCorrectionMockValue(fieldIndex: number, item: string) {
  if (fieldIndex === 0) {
    return item;
  }

  return zhTW.mobile.finalUx.correctionInlineMockValues[fieldIndex] ?? zhTW.mobile.finalUx.correctionInlineMockValues[zhTW.mobile.finalUx.correctionInlineMockValues.length - 1];
}

export function buildNutritionSummary({
  addedSections,
  correctedRows,
  mealName,
  nutritionRefreshed,
  restaurantName
}: {
  addedSections: AddedSections;
  correctedRows: Record<string, boolean>;
  mealName: string;
  nutritionRefreshed: boolean;
  restaurantName: string;
}): NutritionSummary {
  const correctedCount = Object.keys(correctedRows).length;
  const addedCount = Object.values(addedSections).filter(Boolean).length;
  const manualTextBonus = restaurantName.trim().length === 0 || mealName.trim().length === 0 ? -20 : Math.min(30, restaurantName.length + mealName.length);
  const adjustment = nutritionRefreshed ? correctedCount * 18 + addedCount * 35 + manualTextBonus : 0;
  const calories = Math.max(420, 620 + adjustment);
  const protein = Math.max(24, 38 + correctedCount * 2 + addedCount * 3);
  const carbohydrates = Math.max(38, 58 + addedCount * 4);
  const fat = Math.max(12, 22 + correctedCount + addedCount * 2);
  const portionGrams = Math.max(320, 360 + correctedCount * 12 + addedCount * 45);
  const ingredients = buildCorrectionSections(addedSections)
    .find((section) => section.key === "ingredients")
    ?.items.join("、") ?? zhTW.mobile.analysis.estimatedIngredients.join("、");

  return {
    calories,
    protein,
    carbohydrates,
    fat,
    portion: `${portionGrams}g`,
    ingredientSummary: ingredients,
    balanceScore: Math.max(65, Math.min(92, 82 + addedCount * 2 - correctedCount))
  };
}

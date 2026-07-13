import type {
  CanonicalPlannedMealsRepositoryInput,
  ConsumerPlannedMeal,
  ConsumerPlannedMealsRepository,
  ConsumerPlannedMealsReadResult
} from "../types";

const mockPlannedMeals: ConsumerPlannedMeal[] = [
  {
    plannedMealId: "mock-planned-2026-07-13-dinner",
    plannedDate: "2026-07-13",
    plannedTime: "19:00",
    mealType: "dinner",
    title: "日式烤鮭魚便當",
    restaurantId: "restaurant-salmon-table",
    branchId: "branch-salmon-table-main",
    menuItemId: "menu-item-grilled-salmon-bento",
    restaurantName: "鮭魚食堂",
    estimatedNutrition: {
      calories: 520,
      protein: 34,
      carbohydrates: 58,
      fat: 16,
      fiber: 6
    },
    status: "planned",
    note: "預估營養，不計入已吃總量。",
    items: [
      {
        plannedMealItemId: "mock-planned-2026-07-13-dinner:salmon",
        restaurantId: "restaurant-salmon-table",
        branchId: "branch-salmon-table-main",
        menuItemId: "menu-item-grilled-salmon-bento",
        displayName: "日式烤鮭魚便當",
        estimatedNutrition: {
          calories: 520,
          protein: 34,
          carbohydrates: 58,
          fat: 16,
          fiber: 6
        }
      }
    ]
  },
  {
    plannedMealId: "mock-planned-2026-07-14-lunch",
    plannedDate: "2026-07-14",
    plannedTime: "12:30",
    mealType: "lunch",
    title: "雞胸藜麥沙拉",
    restaurantId: "restaurant-green-bowl",
    branchId: "branch-green-bowl-main",
    menuItemId: "menu-item-chicken-quinoa-salad",
    restaurantName: "綠碗沙拉",
    estimatedNutrition: {
      calories: 430,
      protein: 38,
      carbohydrates: 42,
      fat: 13,
      fiber: 8
    },
    status: "planned",
    note: "明日午餐計畫。",
    items: [
      {
        plannedMealItemId: "mock-planned-2026-07-14-lunch:salad",
        restaurantId: "restaurant-green-bowl",
        branchId: "branch-green-bowl-main",
        menuItemId: "menu-item-chicken-quinoa-salad",
        displayName: "雞胸藜麥沙拉",
        estimatedNutrition: {
          calories: 430,
          protein: 38,
          carbohydrates: 42,
          fat: 13,
          fiber: 8
        }
      }
    ]
  }
];

export class MockConsumerPlannedMealsRepository implements ConsumerPlannedMealsRepository {
  readonly source = "mock" as const;

  async getCurrentUserPlannedMeals(input: CanonicalPlannedMealsRepositoryInput): Promise<ConsumerPlannedMealsReadResult> {
    const meals = mockPlannedMeals
      .filter((meal) => meal.plannedDate === input.plannedDate)
      .map((meal) => ({ ...meal, items: meal.items.map((item) => ({ ...item })) }))
      .sort(comparePlannedMeals);

    return meals.length > 0
      ? { status: "available", plannedDate: input.plannedDate, meals }
      : { status: "empty", plannedDate: input.plannedDate, meals: [] };
  }
}

function comparePlannedMeals(left: ConsumerPlannedMeal, right: ConsumerPlannedMeal): number {
  return (
    left.plannedDate.localeCompare(right.plannedDate) ||
    (left.plannedTime ?? "").localeCompare(right.plannedTime ?? "") ||
    left.plannedMealId.localeCompare(right.plannedMealId)
  );
}

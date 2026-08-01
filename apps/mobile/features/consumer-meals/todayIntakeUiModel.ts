import { useCallback, useEffect, useMemo, useState } from "react";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { PlannedMeal } from "../planned-meal/types";
import { createConsumerTodayIntakeOverviewService } from "./factories";
import { getConsumerMealRuntimeFlags } from "./featureFlags";
import type { ConsumerTodayIntakeOverviewService } from "./consumerTodayIntakeOverviewService";
import type {
  ConsumerMealRecord,
  ConsumerMealRecordItem,
  ConsumerMealRuntimeFlags,
  ConsumerMealSourceType,
  ConsumerPlannedMeal,
  ConsumerTodayIntakeOverview
} from "./types";

const nutritionTargets = {
  calories: 1800,
  protein: 105,
  carbs: 180,
  fat: 55
} as const;

const mealSlotOptions = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions;
const emptyField = zhTW.mobile.refinedLogic.mealBuddyCard.emptyField;

export type TodayIntakeUiMealRecord = {
  mealId: string;
  date: string;
  mealPeriod: string;
  mealName: string;
  restaurantName: string;
  ingredients: string;
  portion: string;
  calories: number;
  actualCalories?: number;
  estimatedCalories?: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  source: ConsumerMealSourceType;
  restaurantId?: string;
};

export type TodayIntakeUiSummary = {
  records: TodayIntakeUiMealRecord[];
  mealCount: number;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  targets: typeof nutritionTargets;
  remainingCalories: number;
  proteinProgress: number;
  fatProgress: number;
  hasVegetable: boolean;
  reminders: { key: "lowProtein" | "lowVegetable" | "highSodium"; label: string }[];
  dataQuality: "complete" | "estimated";
  estimatedMealCount: number;
};

export type TodayIntakeUiMealSlot = {
  key: "breakfast" | "lunch" | "snack" | "dinner";
  label: string;
  period: string;
  record?: TodayIntakeUiMealRecord;
  planned?: PlannedMeal;
  isPending: boolean;
  itemsText: string;
};

export type TodayIntakeUiModel = {
  overview: ConsumerTodayIntakeOverview;
  summary: TodayIntakeUiSummary;
  mealRecords: TodayIntakeUiMealRecord[];
  mealSlots: TodayIntakeUiMealSlot[];
  lunchRecord: TodayIntakeUiMealRecord | null;
  plannedMeals: PlannedMeal[];
  dinnerPlanForDisplay: PlannedMeal | null;
};

export type TodayIntakeUiState =
  | { status: "loading"; model: TodayIntakeUiModel | null; error: null; refresh: () => void }
  | { status: "ready"; model: TodayIntakeUiModel; error: null; refresh: () => void }
  | { status: "error"; model: TodayIntakeUiModel | null; error: string; refresh: () => void };

export async function getCurrentUserTodayIntakeUiModel(input: {
  date?: string;
  overviewService?: ConsumerTodayIntakeOverviewService;
  plannedMealsLoader?: (plannedDate: string) => Promise<ConsumerPlannedMeal[]>;
} = {}): Promise<TodayIntakeUiModel> {
  const overviewService = input.overviewService ?? createLocalOverviewService();
  const overviewResult = await overviewService.getCurrentUserTodayIntakeOverview(input);
  if (!overviewResult.ok) throw overviewResult.error;
  const canonicalMeals = input.plannedMealsLoader ? await input.plannedMealsLoader(overviewResult.value.date) : [];
  return mapOverviewToUiModel(overviewResult.value, canonicalMeals);
}

export function useTodayIntakeUiModel(input: {
  date?: string;
  overviewService?: ConsumerTodayIntakeOverviewService | null;
  revision?: number;
  actorKey?: string | null;
  actorGeneration?: number;
  enabled?: boolean;
  plannedMealsLoader?: (plannedDate: string) => Promise<ConsumerPlannedMeal[]>;
} = {}): TodayIntakeUiState {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<TodayIntakeUiState, "refresh">>({
    status: "loading",
    model: null,
    error: null
  });
  const stableDate = input.date;
  const enabled = input.enabled ?? true;

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !input.overviewService || !input.actorKey) {
      setState((current) => ({ status: "error", model: current.model, error: "Today Intake requires an authenticated runtime." }));
      return () => { cancelled = true; };
    }
    setState((current) => ({ status: "loading", model: current.model, error: null }));
    getCurrentUserTodayIntakeUiModel({ date: stableDate, overviewService: input.overviewService, plannedMealsLoader: input.plannedMealsLoader })
      .then((model) => {
        if (!cancelled) setState({ status: "ready", model, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setState((current) => ({ status: "error", model: current.model, error: "Today Intake overview could not be loaded." }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, input.actorGeneration, input.actorKey, input.overviewService, input.plannedMealsLoader, input.revision, stableDate, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  return useMemo(() => ({ ...state, refresh }) as TodayIntakeUiState, [refresh, state]);
}

export function getUiMealCalories(meal: TodayIntakeUiMealRecord): number {
  return meal.actualCalories ?? meal.estimatedCalories ?? meal.calories;
}

function createLocalOverviewService() {
  const mealFlags = getConsumerMealRuntimeFlags();
  if (mealFlags.mealRecordsSource === "supabase-live" || mealFlags.dailyNutritionSource === "supabase-live") {
    throw new Error("Live Today Intake requires the shared Consumer Runtime composition.");
  }
  return createConsumerTodayIntakeOverviewService(mealFlags);
}

function mapOverviewToUiModel(overview: ConsumerTodayIntakeOverview, canonicalMeals: ConsumerPlannedMeal[]): TodayIntakeUiModel {
  const mealRecords = overview.meals.map(mapConsumerMealToUiMeal);
  const plannedMeals = overview.plannedMeals.map((meal) => mapOverviewPlannedMeal(meal, canonicalMeals.find((candidate) => candidate.plannedMealId === meal.plannedMealId)));
  const dinnerPlanForDisplay = plannedMeals.find((meal) => meal.mealTime === "晚餐" || meal.canonicalStatus === "planned") ?? plannedMeals[0] ?? null;
  const summary = mapOverviewToSummary(overview, mealRecords);
  const mealSlots = mapUiMealSlots(mealRecords, dinnerPlanForDisplay);
  const lunchRecord = mealRecords.find((meal) => meal.mealPeriod === mealSlotOptions[1]) ?? mealRecords[0] ?? null;

  return {
    overview,
    summary,
    mealRecords,
    mealSlots,
    lunchRecord,
    plannedMeals,
    dinnerPlanForDisplay
  };
}

function mapOverviewPlannedMeal(meal: ConsumerTodayIntakeOverview["plannedMeals"][number], canonical?: ConsumerPlannedMeal): PlannedMeal {
  const nutrition = meal.estimatedNutrition ?? {};
  return {
    plannedDate: meal.date,
    mealTime: canonical?.plannedTime ?? meal.mealTime ?? "時間未提供",
    plannedMealName: meal.title || "未命名預定餐",
    mealType: canonical?.mealCategory ?? canonical?.mealType ?? meal.mealType ?? "未分類",
    restaurantName: meal.restaurantName ?? "",
    calories: `${nutrition.calories ?? 0} kcal`,
    protein: `${nutrition.protein ?? 0}g`,
    carbs: `${nutrition.carbohydrates ?? 0}g`,
    fat: `${nutrition.fat ?? 0}g`,
    notes: meal.note ?? "",
    isSocialMeal: false,
    canonicalPlannedMealId: meal.plannedMealId,
    canonicalUpdatedAt: canonical?.updatedAt ?? null,
    canonicalStatus: canonical?.status ?? "planned"
  };
}

function mapOverviewToSummary(overview: ConsumerTodayIntakeOverview, mealRecords: TodayIntakeUiMealRecord[]): TodayIntakeUiSummary {
  const totals = {
    calories: overview.calculatedNutrition.calories,
    protein: overview.calculatedNutrition.protein,
    carbs: overview.calculatedNutrition.carbohydrates,
    fat: overview.calculatedNutrition.fat
  };
  const mealCount = overview.mealCount;
  const proteinProgress = totals.protein / nutritionTargets.protein;
  const fatProgress = totals.fat / nutritionTargets.fat;
  const hasVegetable = (overview.calculatedNutrition.fiber ?? 0) > 0;
  const reminders = buildReminders({ mealCount, proteinProgress, hasVegetable });

  return {
    records: mealRecords,
    mealCount,
    totals,
    targets: nutritionTargets,
    remainingCalories: Math.max(0, nutritionTargets.calories - totals.calories),
    proteinProgress,
    fatProgress,
    hasVegetable,
    reminders,
    dataQuality: overview.status === "complete" ? "complete" : "estimated",
    estimatedMealCount: overview.status === "complete" ? 0 : mealCount
  };
}

function mapUiMealSlots(records: TodayIntakeUiMealRecord[], plannedDinner?: PlannedMeal | null): TodayIntakeUiMealSlot[] {
  const slotDefs: TodayIntakeUiMealSlot[] = [
    { key: "breakfast", label: "\u65e9\u9910", period: mealSlotOptions[0], isPending: true, itemsText: emptyField },
    { key: "lunch", label: "\u5348\u9910", period: mealSlotOptions[1], isPending: true, itemsText: emptyField },
    { key: "snack", label: "\u9ede\u5fc3", period: mealSlotOptions[3], isPending: true, itemsText: emptyField },
    { key: "dinner", label: "\u665a\u9910", period: mealSlotOptions[2], isPending: true, itemsText: emptyField }
  ];

  return slotDefs.map((slot) => {
    const record = records.find((meal) => meal.mealPeriod === slot.period);
    const planned = !record && slot.key === "dinner" ? (plannedDinner ?? undefined) : undefined;
    return {
      ...slot,
      record,
      planned,
      isPending: !record,
      itemsText: record ? record.ingredients || record.mealName || emptyField : planned ? planned.plannedMealName : emptyField
    };
  });
}

function mapConsumerMealToUiMeal(meal: ConsumerMealRecord): TodayIntakeUiMealRecord {
  const nutrition = sumMealNutrition(meal.items);
  const firstItem = meal.items[0];
  const mealName = meal.title || firstItem?.displayName || emptyField;
  const ingredients = meal.note || meal.items.map((item) => item.displayName).filter(Boolean).join("\u3001");

  return {
    mealId: meal.mealRecordId,
    date: meal.mealDate,
    mealPeriod: mapMealTypeToPeriod(meal.mealType),
    mealName,
    // MI-E-C5-R7-A: this used to be `firstItem?.restaurantId ?? ""`, which assigned a canonical
    // IDENTITY to a display field. It stayed invisible only because restaurantId is currently always
    // null for the photo-analysis path — the moment R7-C starts persisting real ids, every row would
    // have rendered a raw UUID where the user expects a restaurant name.
    //
    // The canonical id keeps its own field below. A name is a catalog lookup, not an id, so until
    // R7-C adds that catalog composition to the Today Intake overview this reports "no resolvable
    // name" rather than inventing one. Historical rows with no restaurant context behave identically.
    restaurantName: "",
    ingredients,
    portion: firstItem?.portion ?? "",
    calories: nutrition.calories,
    actualCalories: nutrition.calories,
    estimatedCalories: nutrition.calories,
    protein: nutrition.protein,
    carbohydrates: nutrition.carbohydrates,
    fat: nutrition.fat,
    source: meal.source,
    restaurantId: firstItem?.restaurantId ?? undefined
  };
}

function sumMealNutrition(items: ConsumerMealRecordItem[]) {
  return items.reduce(
    (sum, item) => {
      const ratio = Number.isFinite(item.consumedRatio) ? item.consumedRatio : 1;
      return {
        calories: sum.calories + Math.round((item.nutrition.calories ?? 0) * ratio),
        protein: sum.protein + Math.round((item.nutrition.protein ?? 0) * ratio),
        carbohydrates: sum.carbohydrates + Math.round((item.nutrition.carbohydrates ?? 0) * ratio),
        fat: sum.fat + Math.round((item.nutrition.fat ?? 0) * ratio)
      };
    },
    { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
  );
}

function mapMealTypeToPeriod(mealType: ConsumerMealRecord["mealType"]): string {
  if (mealType === "breakfast") return mealSlotOptions[0];
  if (mealType === "lunch") return mealSlotOptions[1];
  if (mealType === "dinner") return mealSlotOptions[2];
  return mealSlotOptions[3];
}

function buildReminders(input: { mealCount: number; proteinProgress: number; hasVegetable: boolean }) {
  const reminderText = zhTW.mobile.todayNutritionSummary.reminders;
  const reminders: TodayIntakeUiSummary["reminders"] = [];
  if (input.mealCount > 0 && input.proteinProgress < 0.55) reminders.push({ key: "lowProtein", label: reminderText.lowProtein });
  if (input.mealCount > 0 && !input.hasVegetable) reminders.push({ key: "lowVegetable", label: reminderText.lowVegetable });
  if (input.mealCount >= 2 && reminders.length < 2) reminders.push({ key: "highSodium", label: reminderText.highSodium });
  return reminders.slice(0, 2);
}

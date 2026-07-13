import { useCallback, useEffect, useMemo, useState } from "react";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";
import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";
import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";
import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";
import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";
import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";
import {
  getAutoSettledPlannedDinnerRecord,
  getConfirmedDinnerRecord,
  getPlannedDinner
} from "../planned-meal/plannedMealStore";
import type { PlannedMeal } from "../planned-meal/types";
import { createConsumerTodayIntakeOverviewService } from "./factories";
import { getConsumerMealRuntimeFlags } from "./featureFlags";
import type { ConsumerTodayIntakeOverviewService } from "./consumerTodayIntakeOverviewService";
import type { SupabaseConsumerMealClientLike } from "./supabaseMealContracts";
import type {
  ConsumerMealRecord,
  ConsumerMealRecordItem,
  ConsumerMealRuntimeFlags,
  ConsumerMealSourceType,
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
  plannedDinner: PlannedMeal | null;
  confirmedDinner: PlannedMeal | null;
  autoSettledDinner: PlannedMeal | null;
  dinnerPlanForDisplay: PlannedMeal | null;
};

export type TodayIntakeUiState =
  | { status: "loading"; model: TodayIntakeUiModel | null; error: null; refresh: () => void }
  | { status: "ready"; model: TodayIntakeUiModel; error: null; refresh: () => void }
  | { status: "error"; model: TodayIntakeUiModel | null; error: string; refresh: () => void };

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export async function getCurrentUserTodayIntakeUiModel(input: { date?: string; overviewService?: ConsumerTodayIntakeOverviewService } = {}): Promise<TodayIntakeUiModel> {
  const overviewService = input.overviewService ?? createRuntimeOverviewService();
  const overviewResult = await overviewService.getCurrentUserTodayIntakeOverview(input);
  if (!overviewResult.ok) throw overviewResult.error;
  return mapOverviewToUiModel(overviewResult.value);
}

export function useTodayIntakeUiModel(input: { date?: string } = {}): TodayIntakeUiState {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<TodayIntakeUiState, "refresh">>({
    status: "loading",
    model: null,
    error: null
  });
  const stableDate = input.date;

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ status: "loading", model: current.model, error: null }));
    getCurrentUserTodayIntakeUiModel({ date: stableDate })
      .then((model) => {
        if (!cancelled) setState({ status: "ready", model, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Today Intake overview could not be loaded.";
          setState((current) => ({ status: "error", model: current.model, error: message }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stableDate, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  return useMemo(() => ({ ...state, refresh }) as TodayIntakeUiState, [refresh, state]);
}

export function getUiMealCalories(meal: TodayIntakeUiMealRecord): number {
  return meal.actualCalories ?? meal.estimatedCalories ?? meal.calories;
}

function createOverviewDependencies(mealFlags: ConsumerMealRuntimeFlags) {
  if (mealFlags.mealRecordsSource !== "supabase-live" && mealFlags.dailyNutritionSource !== "supabase-live") {
    return {
      plannedMealsRepository: {
        listCurrentUserPlannedMeals: async () => ({
          ok: true as const,
          value: getLocalPlannedMeals().map((plan) => ({
            plannedMealId: plan.mealTime ? `local-planned-${plan.mealTime}` : "local-planned-dinner",
            date: "",
            mealTime: plan.mealTime,
            mealType: plan.mealType,
            title: plan.plannedMealName,
            restaurantName: plan.restaurantName,
            note: plan.notes
          }))
        })
      }
    };
  }

  const authFlags = getConsumerRuntimeFlags();
  const storage = createAsyncStorageConsumerAuthStorage();
  const factory = new SupabaseConsumerClientFactory({
    env: getSupabaseConsumerEnvironment(readEnv()),
    flags: authFlags,
    storage,
    sdkLoader: createOfficialSupabaseConsumerSdkLoader()
  });
  const { client } = factory.getOrCreateClient();
  return {
    authPort: new SupabaseConsumerAuthAdapter({ authClient: client.auth, transportEnabled: true }),
    mealClient: client as unknown as SupabaseConsumerMealClientLike
  };
}

function createRuntimeOverviewService() {
  const mealFlags = getConsumerMealRuntimeFlags();
  return createConsumerTodayIntakeOverviewService(mealFlags, createOverviewDependencies(mealFlags));
}

function mapOverviewToUiModel(overview: ConsumerTodayIntakeOverview): TodayIntakeUiModel {
  const mealRecords = overview.meals.map(mapConsumerMealToUiMeal);
  const plannedDinner = getPlannedDinner();
  const confirmedDinner = getConfirmedDinnerRecord();
  const autoSettledDinner = getAutoSettledPlannedDinnerRecord();
  const dinnerPlanForDisplay = confirmedDinner ?? plannedDinner ?? autoSettledDinner;
  const summary = mapOverviewToSummary(overview, mealRecords);
  const mealSlots = mapUiMealSlots(mealRecords, dinnerPlanForDisplay);
  const lunchRecord = mealRecords.find((meal) => meal.mealPeriod === mealSlotOptions[1]) ?? mealRecords[0] ?? null;

  return {
    overview,
    summary,
    mealRecords,
    mealSlots,
    lunchRecord,
    plannedDinner,
    confirmedDinner,
    autoSettledDinner,
    dinnerPlanForDisplay
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
    restaurantName: firstItem?.restaurantId ?? "",
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

function getLocalPlannedMeals(): PlannedMeal[] {
  return [getConfirmedDinnerRecord(), getPlannedDinner(), getAutoSettledPlannedDinnerRecord()].filter((plan): plan is PlannedMeal => Boolean(plan));
}

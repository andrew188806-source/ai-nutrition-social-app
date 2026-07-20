import type {
  ConsumerCreateMealRecordInput,
  ConsumerMealType,
  ConsumerNutritionSnapshot
} from "../consumer-meals/types";
import { toDateKeyInTimeZone } from "../consumer-meals/mealDateTime";

export type TrustedConsumerMealIdentity = {
  restaurantId: string;
  branchId?: string | null;
  menuId?: string | null;
  menuItemId?: string | null;
};

export type ConsumerAnalysisMealWriteDraft = {
  selectedMealPeriod: string;
  mealName: string;
  originalDetectedName?: string | null;
  portion?: string | null;
  nutrition: ConsumerNutritionSnapshot;
  isSelfCooked: boolean;
  wasUserCorrected: boolean;
  trustedCanonicalIdentity?: TrustedConsumerMealIdentity | null;
};

export type MapConsumerAnalysisMealWriteInput = ConsumerAnalysisMealWriteDraft & {
  timezone: string;
  submittedAt: Date;
};

export function mapConsumerAnalysisMealWrite(input: MapConsumerAnalysisMealWriteInput): ConsumerCreateMealRecordInput {
  const mealName = requiredText(input.mealName, "mealName");
  const timezone = requiredText(input.timezone, "timezone");
  if (!(input.submittedAt instanceof Date) || Number.isNaN(input.submittedAt.getTime())) {
    throw new Error("Invalid submittedAt.");
  }
  const identity = normalizeTrustedIdentity(input.trustedCanonicalIdentity);
  const originalDetectedName = optionalText(input.originalDetectedName);
  const userEditedName = originalDetectedName && originalDetectedName !== mealName ? mealName : null;
  return {
    mealType: mapMealPeriod(input.selectedMealPeriod),
    occurredAt: input.submittedAt.toISOString(),
    mealDate: toDateKeyInTimeZone(input.submittedAt, timezone),
    timezone,
    title: mealName,
    note: null,
    source: input.isSelfCooked ? "self_made" : "ai_estimated",
    items: [
      {
        restaurantId: identity?.restaurantId ?? null,
        branchId: identity?.branchId ?? null,
        menuId: identity?.menuId ?? null,
        menuItemId: identity?.menuItemId ?? null,
        displayName: mealName,
        userEnteredName: userEditedName,
        aiDetectedName: originalDetectedName,
        normalizedName: null,
        portion: optionalText(input.portion),
        nutrition: { ...input.nutrition },
        nutritionSource: input.wasUserCorrected ? "user_corrected" : "ai_estimated",
        sourceEntityVersion: null,
        confidenceScore: null,
        consumedRatio: 1
      }
    ]
  };
}

function mapMealPeriod(value: string): ConsumerMealType {
  const normalized = value.trim();
  if (normalized.includes("早餐") || normalized.toLowerCase() === "breakfast") return "breakfast";
  if (normalized.includes("午餐") || normalized.toLowerCase() === "lunch") return "lunch";
  if (normalized.includes("晚餐") || normalized.toLowerCase() === "dinner") return "dinner";
  if (normalized.includes("點心") || normalized.toLowerCase() === "snack") return "snack";
  throw new Error("Unsupported meal period.");
}

function normalizeTrustedIdentity(value: TrustedConsumerMealIdentity | null | undefined): TrustedConsumerMealIdentity | null {
  if (!value) return null;
  const restaurantId = requiredText(value.restaurantId, "restaurantId");
  return {
    restaurantId,
    branchId: optionalText(value.branchId),
    menuId: optionalText(value.menuId),
    menuItemId: optionalText(value.menuItemId)
  };
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${label}.`);
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

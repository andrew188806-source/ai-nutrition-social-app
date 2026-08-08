import type { TasteProfileSnapshot, TasteProfileSourceState } from "../../../../packages/shared/src/domain/taste-similarity";

export const CONSUMER_TASTE_FOUNDATION_TABLE_ALLOWLIST = [
  "taste_profiles",
  "nutrition_goals",
  "dietary_restrictions"
] as const;

export type ConsumerTasteFoundationTable = typeof CONSUMER_TASTE_FOUNDATION_TABLE_ALLOWLIST[number];
export type ConsumerTasteFoundationSource = "supabase-prepared" | "injected-test";

export type ConsumerTasteProfileRow = {
  id: string;
  user_id: string;
  preferred_cuisine_tags: readonly string[];
  preferred_meal_types: readonly string[];
  disliked_tastes: readonly string[];
  spice_preference: string | null;
  dining_style: string | null;
  payment_preference: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsumerNutritionGoalRow = {
  id: string;
  user_id: string;
  goal_label: string;
  daily_calories_target: number | null;
  protein_target_g: number | null;
  carbohydrates_target_g: number | null;
  fat_target_g: number | null;
  fiber_target_g: number | null;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ConsumerDietaryRestrictionRow = {
  id: string;
  user_id: string;
  restriction_type: string;
  label: string;
  severity: string;
  visibility: string;
  created_at: string;
  updated_at: string;
};

export type ConsumerTasteFoundationReadResult<TRow> =
  | { status: "available"; rows: readonly TRow[] }
  | { status: "empty"; rows: readonly [] }
  | { status: "disabled"; reason: "source_disabled" }
  | { status: "unauthenticated"; reason: "authentication_required" }
  | { status: "failed"; failureCode: "source_read_failed" }
  | { status: "deferred"; reason: "acl_activation_pending" };

export type ConsumerTasteProfileActorContext = {
  actorKey: string;
  actorGeneration: number;
};

export type ConsumerTasteProfileReadRequest = {
  mealWindow: {
    startDate: string;
    endDate: string;
    limit: number;
  };
  favoritePageSize: number;
};

export type ConsumerTasteProfileReadResult =
  | { status: "available"; snapshot: TasteProfileSnapshot }
  | { status: "unauthenticated" }
  | { status: "stale" }
  | { status: "failed"; failureCode: "authentication_failed" | "invalid_request" };

export type ConsumerTasteProfileRuntimeFlags = {
  foundationSource: "supabase-prepared";
  foundationActivation: "deferred";
  liveFoundationReadsEnabled: false;
  sourceState: Extract<TasteProfileSourceState, { status: "deferred" }>;
  issues: readonly string[];
};

export type ConsumerTasteProfileClock = { now(): string };

export const SUPABASE_CONSUMER_NEXT_MEAL_CANDIDATES_VIEW =
  "consumer_public_next_meal_candidates_v1" as const;

export type SupabaseConsumerNextMealCandidateRow = {
  candidate_id: string;
  restaurant_id: string;
  branch_id: string;
  menu_item_id: string;
  meal_name: string;
  restaurant_name: string;
  branch_name: string;
  district: string | null;
  public_image_url: string | null;
  calories: number;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: number | null;
  nutrition_source_public: string;
  nutrition_updated_at: string;
  availability: string;
};

export type SupabaseRestaurantMenuQueryResponse = {
  data: SupabaseConsumerNextMealCandidateRow[] | null;
  error: { message: string; code?: string; status?: number } | null;
};

export type SupabaseRestaurantMenuClientLike = {
  from(
    view: typeof SUPABASE_CONSUMER_NEXT_MEAL_CANDIDATES_VIEW
  ): {
    select(columns: string): {
      limit(count: number): Promise<SupabaseRestaurantMenuQueryResponse>;
    };
  };
};

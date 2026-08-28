// TS-2D — the ONLY Supabase surface the taste foundation may touch.
//
// Three tables, SELECT only, and an explicit approved-column list per table. The column lists are
// the TS-2A-C frozen row contracts verbatim, which is what keeps two categories of data out of the
// snapshot by construction rather than by later filtering:
//
//   * denormalized favourite ids — `taste_profiles.favorite_restaurant_ids` and
//     `favorite_menu_item_ids` exist in the table but are NEVER selected. Favourites have their own
//     authoritative adapter; a denormalized copy on the profile row must never become a second
//     source of truth.
//   * anything not named here — additive or unknown DB columns simply are not requested, so a later
//     schema addition cannot silently widen what the snapshot reads.
//
// Owner scoping is NOT expressed here. It is enforced by the existing row level security policies
// (`auth.uid() = user_id`), which is why no query in this feature carries a user id filter and why
// no API accepts a user id argument.

export const SUPABASE_TASTE_PROFILES_TABLE = "taste_profiles" as const;
export const SUPABASE_NUTRITION_GOALS_TABLE = "nutrition_goals" as const;
export const SUPABASE_DIETARY_RESTRICTIONS_TABLE = "dietary_restrictions" as const;

export const SUPABASE_TASTE_PROFILE_SELECT_COLUMNS = [
  "id",
  "user_id",
  "preferred_cuisine_tags",
  "preferred_meal_types",
  "disliked_tastes",
  "spice_preference",
  "dining_style",
  "payment_preference",
  "created_at",
  "updated_at"
].join(",");

export const SUPABASE_NUTRITION_GOAL_SELECT_COLUMNS = [
  "id",
  "user_id",
  "goal_label",
  "daily_calories_target",
  "protein_target_g",
  "carbohydrates_target_g",
  "fat_target_g",
  "fiber_target_g",
  "starts_on",
  "ends_on",
  "is_active",
  "created_at",
  "updated_at"
].join(",");

export const SUPABASE_DIETARY_RESTRICTION_SELECT_COLUMNS = [
  "id",
  "user_id",
  "restriction_type",
  "label",
  "severity",
  "visibility",
  "created_at",
  "updated_at"
].join(",");

export type SupabaseTasteFoundationErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

export type SupabaseTasteFoundationQueryResponseLike<TRow> = {
  data: readonly TRow[] | null;
  error: SupabaseTasteFoundationErrorLike | null;
  status?: number;
};

export interface SupabaseTasteFoundationQueryBuilderLike<TRow>
  extends PromiseLike<SupabaseTasteFoundationQueryResponseLike<TRow>> {
  select(columns: string): this;
  is(column: string, value: null): this;
}

// Structural only — the live repository accepts the ALREADY CONSTRUCTED consumer Supabase client
// and never creates one, so there is exactly one client and one auth lifecycle in the app.
export interface SupabaseConsumerTasteFoundationClientLike {
  from<TRow>(table: string): SupabaseTasteFoundationQueryBuilderLike<TRow>;
}

// SR-1A — server-side private taste-foundation reader.
//
// WHY THIS EXISTS RATHER THAN REUSING THE MOBILE REPOSITORY. TS-2D's
// `SupabaseConsumerTasteFoundationRepository` issues `.select(columns)` with NO `user_id` predicate
// and delegates owner scoping entirely to row level security — correct for a session-scoped Mobile
// client, and catastrophic under any privileged server connection, where the same query would return
// every user's rows. SR-1 flagged this as the single most dangerous reuse trap in the round.
//
// Every query built here therefore carries an EXPLICIT owner predicate. Ownership is never inferred
// from the connection, never inherited from ambient auth, and never left to RLS alone. If a
// privileged connection is ever supplied, the predicate is still what bounds the read.
//
// This module performs NO authorization. It does not decide whether the caller may read the target
// user — SR-1B owns Candidate Authorization, and it does not exist yet. A trusted caller is
// responsible for having authorized the identity it passes in.
//
// The data source is INJECTED. Nothing here constructs a client, reads a secret, names an
// environment variable, or opens a network connection.

// The complete set of private sources this reader may ever touch. Fixed literals: no caller can
// widen it, and no dynamic table name can reach the transport.
export const SERVER_PRIVATE_SOURCES = [
  "taste_profiles",
  "nutrition_goals",
  "dietary_restrictions",
  "meal_records",
  "meal_record_items",
  "favorite_restaurants",
  "favorite_menu_items"
] as const;

export type ServerPrivateSource = (typeof SERVER_PRIVATE_SOURCES)[number];

// Column sets are frozen literals, minimized against what the frozen composition actually consumes.
//
// Deliberate exclusions, each a data-minimization decision rather than an oversight:
//   * nutrition_goals — all five macro target columns are absent. TS-3D reads only `goal_label` and
//     the validity fields; no frozen stage reads a macro target at all, and they are the most
//     sensitive numbers in the schema.
//   * meal_record_items — `nutrition_snapshot`, every name column, `portion_snapshot` and
//     `confidence_score` are absent. Recognition confidence was proven inert by TS-3B-R1 and
//     excluded outright by TS-4, so reading it would buy nothing.
//   * ratings tables do not appear in `SERVER_PRIVATE_SOURCES` at all — see the ratings note in
//     serverPairComparison.ts.
export const SERVER_TASTE_PROFILE_COLUMNS = [
  "id", "user_id", "preferred_cuisine_tags", "preferred_meal_types", "disliked_tastes",
  "spice_preference", "dining_style", "payment_preference", "created_at", "updated_at"
] as const;

export const SERVER_NUTRITION_GOAL_COLUMNS = [
  "id", "user_id", "goal_label", "starts_on", "ends_on", "is_active", "created_at", "updated_at"
] as const;

export const SERVER_DIETARY_RESTRICTION_COLUMNS = [
  "id", "user_id", "restriction_type", "label", "severity", "visibility", "created_at", "updated_at"
] as const;

export const SERVER_MEAL_RECORD_COLUMNS = [
  "id", "user_id", "meal_type", "occurred_at", "deleted_at"
] as const;

export const SERVER_MEAL_RECORD_ITEM_COLUMNS = [
  "id", "user_id", "meal_record_id", "restaurant_id", "branch_id", "menu_item_id",
  "occurred_at", "consumed_ratio"
] as const;

export const SERVER_FAVORITE_RESTAURANT_COLUMNS = [
  "id", "user_id", "restaurant_id", "created_at", "removed_at"
] as const;

export const SERVER_FAVORITE_MENU_ITEM_COLUMNS = [
  "id", "user_id", "restaurant_id", "menu_item_id", "created_at", "removed_at"
] as const;

// Every query carries its owner predicate as a required field, so a query that forgets to scope by
// owner is not merely a bug — it does not typecheck.
export type ServerPrivateQuery = {
  readonly source: ServerPrivateSource;
  readonly columns: readonly string[];
  readonly ownerColumn: "user_id";
  readonly ownerUserId: string;
  readonly orderBy?: { readonly column: string; readonly ascending: boolean };
  readonly limit?: number;
};

export type ServerPrivateReadOutcome<TRow> =
  | { readonly status: "available"; readonly rows: readonly TRow[] }
  | { readonly status: "empty"; readonly rows: readonly [] }
  | { readonly status: "failed"; readonly failureCode: "source_read_failed" };

// The injected transport. A future trusted caller supplies an implementation; SR-1A supplies only
// deterministic fixtures in its own suites.
export interface ServerPrivateRowSource {
  select<TRow>(query: ServerPrivateQuery): Promise<ServerPrivateReadOutcome<TRow>>;
}

export type ServerTasteFoundationReads = {
  readonly tasteProfiles: ServerPrivateReadOutcome<Record<string, unknown>>;
  readonly nutritionGoals: ServerPrivateReadOutcome<Record<string, unknown>>;
  readonly dietaryRestrictions: ServerPrivateReadOutcome<Record<string, unknown>>;
  readonly mealRecords: ServerPrivateReadOutcome<Record<string, unknown>>;
  readonly mealRecordItems: ServerPrivateReadOutcome<Record<string, unknown>>;
  readonly favoriteRestaurants: ServerPrivateReadOutcome<Record<string, unknown>>;
  readonly favoriteMenuItems: ServerPrivateReadOutcome<Record<string, unknown>>;
};

export type ServerMealHistoryWindow = {
  readonly requestedStartDate: string;
  readonly requestedEndDate: string;
  readonly requestedLimit: number;
  readonly favoritesLimit: number;
};

export class ServerTasteFoundationRepository {
  constructor(private readonly rowSource: ServerPrivateRowSource) {}

  // `targetUserId` is explicit and required. There is no "current user" overload, because a server
  // reader has no current user — it has whichever identity its trusted caller already authorized.
  async readForUser(targetUserId: string, window: ServerMealHistoryWindow): Promise<ServerTasteFoundationReads> {
    if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      throw new Error("Server taste foundation read requires an explicit target user id.");
    }
    const owned = (
      source: ServerPrivateSource,
      columns: readonly string[],
      extra: { orderBy?: { column: string; ascending: boolean }; limit?: number } = {}
    ): ServerPrivateQuery => ({
      source,
      columns,
      ownerColumn: "user_id",
      ownerUserId: targetUserId,
      ...extra
    });

    // Deterministic ordering and explicit limits on every bounded source, so truncation is a
    // measured fact rather than a guess.
    return {
      tasteProfiles: await this.rowSource.select(owned("taste_profiles", SERVER_TASTE_PROFILE_COLUMNS)),
      nutritionGoals: await this.rowSource.select(owned("nutrition_goals", SERVER_NUTRITION_GOAL_COLUMNS)),
      dietaryRestrictions: await this.rowSource.select(owned("dietary_restrictions", SERVER_DIETARY_RESTRICTION_COLUMNS)),
      mealRecords: await this.rowSource.select(owned("meal_records", SERVER_MEAL_RECORD_COLUMNS, {
        orderBy: { column: "occurred_at", ascending: false },
        limit: window.requestedLimit
      })),
      mealRecordItems: await this.rowSource.select(owned("meal_record_items", SERVER_MEAL_RECORD_ITEM_COLUMNS, {
        orderBy: { column: "occurred_at", ascending: false },
        limit: window.requestedLimit
      })),
      favoriteRestaurants: await this.rowSource.select(owned("favorite_restaurants", SERVER_FAVORITE_RESTAURANT_COLUMNS, {
        orderBy: { column: "created_at", ascending: false },
        limit: window.favoritesLimit
      })),
      favoriteMenuItems: await this.rowSource.select(owned("favorite_menu_items", SERVER_FAVORITE_MENU_ITEM_COLUMNS, {
        orderBy: { column: "created_at", ascending: false },
        limit: window.favoritesLimit
      }))
    };
  }
}

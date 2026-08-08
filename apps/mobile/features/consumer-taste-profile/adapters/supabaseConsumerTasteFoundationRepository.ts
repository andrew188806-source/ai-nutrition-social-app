import type { ConsumerTasteFoundationRepository } from "../ports";
import {
  SUPABASE_DIETARY_RESTRICTIONS_TABLE,
  SUPABASE_DIETARY_RESTRICTION_SELECT_COLUMNS,
  SUPABASE_NUTRITION_GOALS_TABLE,
  SUPABASE_NUTRITION_GOAL_SELECT_COLUMNS,
  SUPABASE_TASTE_PROFILES_TABLE,
  SUPABASE_TASTE_PROFILE_SELECT_COLUMNS,
  type SupabaseConsumerTasteFoundationClientLike
} from "../supabaseTasteFoundationContracts";
import type {
  ConsumerDietaryRestrictionRow,
  ConsumerNutritionGoalRow,
  ConsumerTasteFoundationReadResult,
  ConsumerTasteProfileRow
} from "../types";

// TS-2D live current-user taste foundation reads.
//
// This replaces the prepared/deferred seam once the authenticated SELECT grant exists. It is a READ
// path only: three SELECTs against three named tables, nothing else.
//
// Owner scoping is delegated entirely to row level security (`auth.uid() = user_id`), which is why
// no query here filters on a user id and no method takes a user id argument — there is no way to
// ask this repository for somebody else's rows. The client is INJECTED: this file never calls
// createClient, never reads a key, never opens a second auth lifecycle and never uses a service
// role, so it inherits exactly the session of the signed-in consumer.
//
// A read that fails is reported as `failed`, never as `empty`. That distinction matters: a revoked
// grant, an RLS change or a network fault would otherwise be indistinguishable from a user who
// genuinely has no rows, and the snapshot would silently understate its own coverage.
export class SupabaseConsumerTasteFoundationRepository implements ConsumerTasteFoundationRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly client: SupabaseConsumerTasteFoundationClientLike) {}

  async readCurrentUserTasteProfile(): Promise<ConsumerTasteFoundationReadResult<ConsumerTasteProfileRow>> {
    return this.read<ConsumerTasteProfileRow>(SUPABASE_TASTE_PROFILES_TABLE, SUPABASE_TASTE_PROFILE_SELECT_COLUMNS);
  }

  async readCurrentUserNutritionGoals(): Promise<ConsumerTasteFoundationReadResult<ConsumerNutritionGoalRow>> {
    return this.read<ConsumerNutritionGoalRow>(SUPABASE_NUTRITION_GOALS_TABLE, SUPABASE_NUTRITION_GOAL_SELECT_COLUMNS);
  }

  async readCurrentUserDietaryRestrictions(): Promise<ConsumerTasteFoundationReadResult<ConsumerDietaryRestrictionRow>> {
    return this.read<ConsumerDietaryRestrictionRow>(
      SUPABASE_DIETARY_RESTRICTIONS_TABLE,
      SUPABASE_DIETARY_RESTRICTION_SELECT_COLUMNS
    );
  }

  private async read<TRow>(table: string, columns: string): Promise<ConsumerTasteFoundationReadResult<TRow>> {
    try {
      const response = await this.client.from<TRow>(table).select(columns);
      // Any transport, privilege or query error is a FAILED read. Permission denied (42501) must
      // never be flattened into "this user has no rows".
      if (response.error) return { status: "failed", failureCode: "source_read_failed" };
      const rows = response.data;
      if (!Array.isArray(rows)) return { status: "failed", failureCode: "source_read_failed" };
      if (rows.length === 0) return { status: "empty", rows: [] };
      return { status: "available", rows };
    } catch {
      return { status: "failed", failureCode: "source_read_failed" };
    }
  }
}

import {
  ConsumerFavoriteAuthenticationRequiredError,
  ConsumerFavoriteDatabaseFailedError,
  ConsumerFavoritePermissionDeniedError,
  ConsumerFavoriteResponseMalformedError,
  ConsumerFavoriteTransportFailedError,
  type ConsumerFavoriteRuntimeError
} from "../errors";
import type { ConsumerFavoriteReadRepository } from "../ports";
import {
  SUPABASE_FAVORITE_MENU_ITEMS_TABLE,
  SUPABASE_FAVORITE_RESTAURANTS_TABLE,
  SUPABASE_MENU_ITEM_FAVORITE_SELECT_COLUMNS,
  SUPABASE_RESTAURANT_FAVORITE_SELECT_COLUMNS,
  type SupabaseConsumerFavoriteClientLike,
  type SupabaseFavoriteErrorLike,
  type SupabaseFavoriteQueryResponseLike,
  type SupabaseMenuItemFavoriteRow,
  type SupabaseRestaurantFavoriteRow
} from "../supabaseFavoriteContracts";
import {
  mapSupabaseMenuItemFavoriteRow,
  mapSupabaseRestaurantFavoriteRow
} from "../supabaseFavoriteMappers";
import type {
  ConsumerFavoriteListInput,
  ConsumerFavoriteListResult,
  ConsumerFavoriteReadResult,
  ConsumerFavoriteRecord,
  ConsumerFavoriteTarget
} from "../types";
import {
  encodeConsumerFavoriteCursor,
  validateConsumerFavoriteListInput,
  validateConsumerFavoriteTarget
} from "../validation";
import type { ConsumerFavoriteCursorTuple } from "../validation";

export class SupabaseConsumerFavoriteReadRepository implements ConsumerFavoriteReadRepository {
  readonly readSource = "supabase" as const;

  constructor(private readonly client: SupabaseConsumerFavoriteClientLike) {}

  async getCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteReadResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) {
      return { status: "invalid_target", source: this.readSource, error: validation.error };
    }
    return validation.value.kind === "restaurant"
      ? this.getRestaurantFavorite(validation.value)
      : this.getMenuItemFavorite(validation.value);
  }

  async listCurrentUserFavorites(input: ConsumerFavoriteListInput): Promise<ConsumerFavoriteListResult> {
    const validation = validateConsumerFavoriteListInput(input);
    if (!validation.ok) return { status: "read_failed", source: this.readSource, error: validation.error };
    return validation.value.entityType === "restaurant"
      ? this.listRestaurantFavorites(validation.value.pageSize, validation.value.cursor)
      : this.listMenuItemFavorites(validation.value.pageSize, validation.value.cursor);
  }

  private async getRestaurantFavorite(
    target: Extract<ConsumerFavoriteTarget, { kind: "restaurant" }>
  ): Promise<ConsumerFavoriteReadResult> {
    let response: SupabaseFavoriteQueryResponseLike<SupabaseRestaurantFavoriteRow>;
    try {
      response = await this.client
        .from(SUPABASE_FAVORITE_RESTAURANTS_TABLE)
        .select(SUPABASE_RESTAURANT_FAVORITE_SELECT_COLUMNS)
        .eq("restaurant_id", target.restaurantId)
        .is("removed_at", null)
        .maybeSingle();
    } catch {
      return transportRead();
    }
    if (isMissing(response)) return { status: "missing", target: { ...target }, source: this.readSource };
    const errorResult = readError(response.error, response.status);
    if (errorResult) return errorResult;
    if (!response.data || Array.isArray(response.data)) return malformedRead();
    try {
      const record = mapSupabaseRestaurantFavoriteRow(response.data);
      return record.target.kind === "restaurant" && record.target.restaurantId === target.restaurantId
        ? { status: "available", record, source: this.readSource }
        : malformedRead();
    } catch (error) {
      return malformedRead(error);
    }
  }

  private async getMenuItemFavorite(
    target: Extract<ConsumerFavoriteTarget, { kind: "menu_item" }>
  ): Promise<ConsumerFavoriteReadResult> {
    let response: SupabaseFavoriteQueryResponseLike<SupabaseMenuItemFavoriteRow>;
    try {
      response = await this.client
        .from(SUPABASE_FAVORITE_MENU_ITEMS_TABLE)
        .select(SUPABASE_MENU_ITEM_FAVORITE_SELECT_COLUMNS)
        .eq("restaurant_id", target.restaurantId)
        .eq("menu_item_id", target.menuItemId)
        .is("removed_at", null)
        .maybeSingle();
    } catch {
      return transportRead();
    }
    if (isMissing(response)) return { status: "missing", target: { ...target }, source: this.readSource };
    const errorResult = readError(response.error, response.status);
    if (errorResult) return errorResult;
    if (!response.data || Array.isArray(response.data)) return malformedRead();
    try {
      const record = mapSupabaseMenuItemFavoriteRow(response.data);
      return record.target.kind === "menu_item" &&
        record.target.restaurantId === target.restaurantId &&
        record.target.menuItemId === target.menuItemId
        ? { status: "available", record, source: this.readSource }
        : malformedRead();
    } catch (error) {
      return malformedRead(error);
    }
  }

  private async listRestaurantFavorites(
    pageSize: number,
    cursor: ConsumerFavoriteCursorTuple | null
  ): Promise<ConsumerFavoriteListResult> {
    let query = this.client
      .from(SUPABASE_FAVORITE_RESTAURANTS_TABLE)
      .select(SUPABASE_RESTAURANT_FAVORITE_SELECT_COLUMNS)
      .is("removed_at", null);
    if (cursor) query = query.or(cursorPredicate(cursor));
    let response: SupabaseFavoriteQueryResponseLike<SupabaseRestaurantFavoriteRow>;
    try {
      response = await query
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(pageSize + 1);
    } catch {
      return transportRead();
    }
    return mapListResponse(response, pageSize, mapSupabaseRestaurantFavoriteRow);
  }

  private async listMenuItemFavorites(
    pageSize: number,
    cursor: ConsumerFavoriteCursorTuple | null
  ): Promise<ConsumerFavoriteListResult> {
    let query = this.client
      .from(SUPABASE_FAVORITE_MENU_ITEMS_TABLE)
      .select(SUPABASE_MENU_ITEM_FAVORITE_SELECT_COLUMNS)
      .is("removed_at", null);
    if (cursor) query = query.or(cursorPredicate(cursor));
    let response: SupabaseFavoriteQueryResponseLike<SupabaseMenuItemFavoriteRow>;
    try {
      response = await query
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(pageSize + 1);
    } catch {
      return transportRead();
    }
    return mapListResponse(response, pageSize, mapSupabaseMenuItemFavoriteRow);
  }
}

function mapListResponse<Row>(
  response: SupabaseFavoriteQueryResponseLike<Row>,
  pageSize: number,
  mapper: (value: unknown) => ConsumerFavoriteRecord
): ConsumerFavoriteListResult {
  const errorResult = readError(response.error, response.status);
  if (errorResult) return errorResult;
  if (!Array.isArray(response.data)) return malformedRead();
  try {
    const records = response.data.map(mapper);
    const page = records.slice(0, pageSize);
    return {
      status: page.length ? "available" : "empty",
      records: page,
      nextCursor: records.length > page.length && page.length
        ? encodeConsumerFavoriteCursor(page[page.length - 1])
        : null,
      source: "supabase"
    };
  } catch (error) {
    return malformedRead(error);
  }
}

function cursorPredicate([sortOrder, createdAt, id]: ConsumerFavoriteCursorTuple): string {
  const created = postgrestLiteral(createdAt);
  const favoriteId = postgrestLiteral(id);
  if (sortOrder === null) {
    return [
      `and(sort_order.is.null,created_at.lt.${created})`,
      `and(sort_order.is.null,created_at.eq.${created},id.gt.${favoriteId})`
    ].join(",");
  }
  return [
    `sort_order.gt.${sortOrder}`,
    `and(sort_order.eq.${sortOrder},created_at.lt.${created})`,
    `and(sort_order.eq.${sortOrder},created_at.eq.${created},id.gt.${favoriteId})`,
    "sort_order.is.null"
  ].join(",");
}

function postgrestLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isMissing(response: SupabaseFavoriteQueryResponseLike<unknown>): boolean {
  return response.data === null && response.error === null;
}

type SupabaseReadFailure = Extract<
  ConsumerFavoriteListResult,
  { status: "unauthenticated" | "read_failed" }
>;

function readError(error: SupabaseFavoriteErrorLike | null, status?: number): SupabaseReadFailure | null {
  if (!error) return null;
  const mapped = mapOperationError(error, status);
  return mapped instanceof ConsumerFavoriteAuthenticationRequiredError
    ? { status: "unauthenticated", source: "supabase", error: mapped }
    : { status: "read_failed", source: "supabase", error: mapped };
}

function mapOperationError(error: SupabaseFavoriteErrorLike, status?: number): ConsumerFavoriteRuntimeError {
  const effectiveStatus = status ?? error.status ?? undefined;
  if (effectiveStatus === 401 || error.code === "28000") return new ConsumerFavoriteAuthenticationRequiredError();
  if (effectiveStatus === 403 || error.code === "42501") return new ConsumerFavoritePermissionDeniedError();
  if (error.code) return new ConsumerFavoriteDatabaseFailedError();
  return new ConsumerFavoriteTransportFailedError();
}

function malformedRead(error?: unknown): SupabaseReadFailure {
  return {
    status: "read_failed",
    source: "supabase",
    error: error instanceof ConsumerFavoriteResponseMalformedError
      ? error
      : new ConsumerFavoriteResponseMalformedError()
  };
}

function transportRead(): SupabaseReadFailure {
  return { status: "read_failed", source: "supabase", error: new ConsumerFavoriteTransportFailedError() };
}

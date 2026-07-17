import {
  ConsumerRatingAuthenticationRequiredError,
  ConsumerRatingDatabaseFailedError,
  ConsumerRatingPermissionDeniedError,
  ConsumerRatingResponseMalformedError,
  ConsumerRatingTransportFailedError,
  type ConsumerRatingRuntimeError
} from "../errors";
import type { ConsumerRatingReadRepository, ConsumerRatingWriteRepository } from "../ports";
import {
  SUPABASE_MENU_ITEM_RATING_SELECT_COLUMNS,
  SUPABASE_RESTAURANT_RATING_SELECT_COLUMNS,
  SUPABASE_SAVE_AUTHENTICATED_MENU_ITEM_RATING_FUNCTION,
  SUPABASE_SAVE_AUTHENTICATED_RESTAURANT_RATING_FUNCTION,
  SUPABASE_USER_MENU_ITEM_RATINGS_TABLE,
  SUPABASE_USER_RESTAURANT_RATINGS_TABLE,
  type SaveAuthenticatedMenuItemRatingArguments,
  type SaveAuthenticatedRestaurantRatingArguments,
  type SupabaseConsumerRatingClientLike,
  type SupabaseRatingErrorLike,
  type SupabaseMenuItemRatingRow,
  type SupabaseRatingQueryResponseLike,
  type SupabaseRatingRpcResponseLike,
  type SupabaseRestaurantRatingRow
} from "../supabaseRatingContracts";
import {
  mapSupabaseMenuItemRatingRow,
  mapSupabaseRatingRpcResponse,
  mapSupabaseRestaurantRatingRow
} from "../supabaseRatingMappers";
import type {
  ConsumerCreateOrReplaceMenuItemRatingInput,
  ConsumerCreateOrReplaceRatingInput,
  ConsumerCreateOrReplaceRestaurantRatingInput,
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRatingRecord,
  ConsumerCurrentRestaurantRatingRecord,
  ConsumerMenuItemRatingLookup,
  ConsumerRatingListResult,
  ConsumerRatingReadResult,
  ConsumerRatingWriteResult,
  ConsumerRestaurantRatingLookup
} from "../types";
import {
  ratingLookupKey,
  validateCreateOrReplaceRatingInput,
  validateMenuItemRatingLookup,
  validateRestaurantRatingLookup
} from "../validation";

export class SupabaseConsumerRatingRepository implements ConsumerRatingReadRepository, ConsumerRatingWriteRepository {
  readonly readSource = "supabase" as const;
  readonly writeSource = "supabase" as const;

  constructor(private readonly client: SupabaseConsumerRatingClientLike) {}

  async getCurrentUserRestaurantRating(
    lookup: ConsumerRestaurantRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentRestaurantRatingRecord>> {
    const validation = validateRestaurantRatingLookup(lookup);
    if (!validation.ok) return { status: "invalid_input", source: this.readSource, error: validation.error };
    let response: SupabaseRatingQueryResponseLike<SupabaseRestaurantRatingRow>;
    try {
      response = await this.client
        .from(SUPABASE_USER_RESTAURANT_RATINGS_TABLE)
        .select(SUPABASE_RESTAURANT_RATING_SELECT_COLUMNS)
        .eq("restaurant_id", lookup.restaurantId.trim())
        .eq("is_current", true)
        .maybeSingle();
    } catch {
      return transportRead();
    }
    if (isMissing(response)) return { status: "missing", lookup: { ...lookup }, source: this.readSource };
    const errorResult = readError(response.error, response.status);
    if (errorResult) return errorResult;
    if (!response.data || Array.isArray(response.data)) return malformedRead();
    try {
      return { status: "available", record: mapSupabaseRestaurantRatingRow(response.data), source: this.readSource };
    } catch (error) {
      return malformedRead(error);
    }
  }

  async getCurrentUserMenuItemRating(
    lookup: ConsumerMenuItemRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentMenuItemRatingRecord>> {
    const validation = validateMenuItemRatingLookup(lookup);
    if (!validation.ok) return { status: "invalid_input", source: this.readSource, error: validation.error };
    let response: SupabaseRatingQueryResponseLike<SupabaseMenuItemRatingRow>;
    try {
      response = await this.client
        .from(SUPABASE_USER_MENU_ITEM_RATINGS_TABLE)
        .select(SUPABASE_MENU_ITEM_RATING_SELECT_COLUMNS)
        .eq("menu_item_id", lookup.menuItemId.trim())
        .eq("is_current", true)
        .maybeSingle();
    } catch {
      return transportRead();
    }
    if (isMissing(response)) return { status: "missing", lookup: { ...lookup }, source: this.readSource };
    const errorResult = readError(response.error, response.status);
    if (errorResult) return errorResult;
    if (!response.data || Array.isArray(response.data)) return malformedRead();
    try {
      return { status: "available", record: mapSupabaseMenuItemRatingRow(response.data), source: this.readSource };
    } catch (error) {
      return malformedRead(error);
    }
  }

  async listCurrentUserRatings(): Promise<ConsumerRatingListResult> {
    let restaurantResponse: SupabaseRatingQueryResponseLike<SupabaseRestaurantRatingRow>;
    let menuItemResponse: SupabaseRatingQueryResponseLike<SupabaseMenuItemRatingRow>;
    try {
      [restaurantResponse, menuItemResponse] = await Promise.all([
        this.client
          .from(SUPABASE_USER_RESTAURANT_RATINGS_TABLE)
          .select(SUPABASE_RESTAURANT_RATING_SELECT_COLUMNS)
          .eq("is_current", true)
          .order("updated_at", { ascending: false }),
        this.client
          .from(SUPABASE_USER_MENU_ITEM_RATINGS_TABLE)
          .select(SUPABASE_MENU_ITEM_RATING_SELECT_COLUMNS)
          .eq("is_current", true)
          .order("updated_at", { ascending: false })
      ]);
    } catch {
      return transportRead();
    }
    const firstError = readError(restaurantResponse.error, restaurantResponse.status) ??
      readError(menuItemResponse.error, menuItemResponse.status);
    if (firstError) return firstError;
    if (!Array.isArray(restaurantResponse.data) || !Array.isArray(menuItemResponse.data)) return malformedRead();
    try {
      const records: ConsumerCurrentRatingRecord[] = [
        ...restaurantResponse.data.map(mapSupabaseRestaurantRatingRow),
        ...menuItemResponse.data.map(mapSupabaseMenuItemRatingRow)
      ];
      records.sort((left, right) => ratingLookupKey(left.target).localeCompare(ratingLookupKey(right.target)));
      return { status: "available", records, source: this.readSource };
    } catch (error) {
      return malformedRead(error);
    }
  }

  async createOrReplaceCurrentUserRating(input: ConsumerCreateOrReplaceRatingInput): Promise<ConsumerRatingWriteResult> {
    const validation = validateCreateOrReplaceRatingInput(input);
    if (!validation.ok) return { status: "invalid_input", source: this.writeSource, error: validation.error };
    let response: SupabaseRatingRpcResponseLike;
    try {
      response = input.target.kind === "restaurant"
        ? await this.client.rpc(
            SUPABASE_SAVE_AUTHENTICATED_RESTAURANT_RATING_FUNCTION,
            restaurantArguments(input as ConsumerCreateOrReplaceRestaurantRatingInput)
          )
        : await this.client.rpc(
            SUPABASE_SAVE_AUTHENTICATED_MENU_ITEM_RATING_FUNCTION,
            menuItemArguments(input as ConsumerCreateOrReplaceMenuItemRatingInput)
          );
    } catch {
      return transportWrite();
    }
    const errorResult = writeError(response.error, response.status);
    if (errorResult) return errorResult;
    try {
      const mapped = mapSupabaseRatingRpcResponse(response.data);
      if (!responseMatchesInput(mapped.record, input)) return malformedWrite();
      return {
        status: mapped.replacedPrevious ? "replaced" : "saved",
        record: mapped.record,
        source: this.writeSource
      };
    } catch (error) {
      return malformedWrite(error);
    }
  }
}

function restaurantArguments(input: ConsumerCreateOrReplaceRestaurantRatingInput): SaveAuthenticatedRestaurantRatingArguments {
  return {
    p_restaurant_id: input.target.restaurantId.trim(),
    p_private_rating: input.ratingValue,
    p_meal_record_id: input.target.mealRecordId ?? null,
    p_taste_feeling: input.tasteFeeling ?? null,
    p_portion_feeling: input.portionFeeling ?? null,
    p_price_feeling: input.priceFeeling ?? null,
    p_repurchase_intent: input.repurchaseIntent ?? null
  };
}

function menuItemArguments(input: ConsumerCreateOrReplaceMenuItemRatingInput): SaveAuthenticatedMenuItemRatingArguments {
  return {
    p_restaurant_id: input.target.restaurantId.trim(),
    p_menu_item_id: input.target.menuItemId.trim(),
    p_private_rating: input.ratingValue,
    p_branch_id: input.target.branchId ?? null,
    p_meal_record_item_id: input.target.mealRecordItemId ?? null,
    p_finished: input.finished ?? null,
    p_dislike_reasons: [...(input.dislikeReasons ?? [])],
    p_taste_feeling: input.tasteFeeling ?? null,
    p_portion_feeling: input.portionFeeling ?? null,
    p_price_feeling: input.priceFeeling ?? null,
    p_repurchase_intent: input.repurchaseIntent ?? null
  };
}

function isMissing(response: SupabaseRatingQueryResponseLike<unknown>): boolean {
  return response.data === null && (!response.error || response.status === 404);
}

type SupabaseReadFailure = Extract<ConsumerRatingListResult, { status: "unauthenticated" | "read_failed" }>;

function readError(error: SupabaseRatingErrorLike | null, status?: number): SupabaseReadFailure | null {
  if (!error) return null;
  const mapped = mapOperationError(error, status);
  return mapped instanceof ConsumerRatingAuthenticationRequiredError
    ? { status: "unauthenticated", source: "supabase", error: mapped }
    : { status: "read_failed", source: "supabase", error: mapped };
}

function writeError(error: SupabaseRatingErrorLike | null, status?: number): ConsumerRatingWriteResult | null {
  if (!error) return null;
  const mapped = mapOperationError(error, status);
  return mapped instanceof ConsumerRatingAuthenticationRequiredError
    ? { status: "unauthenticated", source: "supabase", error: mapped }
    : { status: "write_failed", source: "supabase", error: mapped };
}

function mapOperationError(error: SupabaseRatingErrorLike, status?: number): ConsumerRatingRuntimeError {
  const effectiveStatus = status ?? error.status ?? undefined;
  if (effectiveStatus === 401 || error.code === "28000") return new ConsumerRatingAuthenticationRequiredError();
  if (effectiveStatus === 403 || error.code === "42501") return new ConsumerRatingPermissionDeniedError();
  if (error.code) return new ConsumerRatingDatabaseFailedError();
  return new ConsumerRatingTransportFailedError();
}

function malformedRead(error?: unknown): SupabaseReadFailure {
  return {
    status: "read_failed",
    source: "supabase",
    error: error instanceof ConsumerRatingResponseMalformedError ? error : new ConsumerRatingResponseMalformedError()
  };
}

function malformedWrite(error?: unknown): ConsumerRatingWriteResult {
  return {
    status: "write_failed",
    source: "supabase",
    error: error instanceof ConsumerRatingResponseMalformedError ? error : new ConsumerRatingResponseMalformedError()
  };
}

function transportRead(): SupabaseReadFailure {
  return { status: "read_failed", source: "supabase", error: new ConsumerRatingTransportFailedError() };
}

function transportWrite(): ConsumerRatingWriteResult {
  return { status: "write_failed", source: "supabase", error: new ConsumerRatingTransportFailedError() };
}

function responseMatchesInput(
  record: ConsumerCurrentRatingRecord,
  input: ConsumerCreateOrReplaceRatingInput
): boolean {
  if (record.target.kind !== input.target.kind) return false;
  if (record.target.kind === "restaurant" && input.target.kind === "restaurant") {
    return record.target.restaurantId === input.target.restaurantId.trim() &&
      record.target.mealRecordId === (input.target.mealRecordId ?? null);
  }
  if (record.target.kind === "menu_item" && input.target.kind === "menu_item") {
    return record.target.restaurantId === input.target.restaurantId.trim() &&
      record.target.menuItemId === input.target.menuItemId.trim() &&
      record.target.branchId === (input.target.branchId ?? null) &&
      record.target.mealRecordItemId === (input.target.mealRecordItemId ?? null);
  }
  return false;
}

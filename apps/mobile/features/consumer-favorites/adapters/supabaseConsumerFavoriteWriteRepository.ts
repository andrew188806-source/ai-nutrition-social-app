import {
  ConsumerFavoriteAuthenticationRequiredError,
  ConsumerFavoriteDatabaseFailedError,
  ConsumerFavoritePermissionDeniedError,
  ConsumerFavoriteResponseMalformedError,
  ConsumerFavoriteTransportFailedError,
  type ConsumerFavoriteRuntimeError
} from "../errors";
import type { ConsumerFavoriteWriteRepository } from "../ports";
import {
  SUPABASE_ADD_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION,
  SUPABASE_ADD_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION,
  SUPABASE_REMOVE_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION,
  SUPABASE_REMOVE_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION,
  type SupabaseConsumerFavoriteWriteClientLike,
  type SupabaseFavoriteErrorLike,
  type SupabaseFavoriteRpcResponseLike
} from "../supabaseFavoriteContracts";
import { mapSupabaseFavoriteRpcResponse } from "../supabaseFavoriteMappers";
import type { ConsumerFavoriteTarget, ConsumerFavoriteWriteResult } from "../types";
import { validateConsumerFavoriteTarget } from "../validation";

export class SupabaseConsumerFavoriteWriteRepository implements ConsumerFavoriteWriteRepository {
  readonly writeSource = "supabase" as const;

  constructor(private readonly client: SupabaseConsumerFavoriteWriteClientLike) {}

  async addCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    return this.execute("add", target);
  }

  async removeCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    return this.execute("remove", target);
  }

  private async execute(
    action: "add" | "remove",
    target: ConsumerFavoriteTarget
  ): Promise<ConsumerFavoriteWriteResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) {
      return { status: "invalid_target", source: this.writeSource, error: validation.error };
    }
    let response: SupabaseFavoriteRpcResponseLike;
    try {
      response = validation.value.kind === "restaurant"
        ? await this.client.rpc(
            action === "add"
              ? SUPABASE_ADD_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION
              : SUPABASE_REMOVE_AUTHENTICATED_RESTAURANT_FAVORITE_FUNCTION,
            { p_restaurant_id: validation.value.restaurantId }
          )
        : await this.client.rpc(
            action === "add"
              ? SUPABASE_ADD_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION
              : SUPABASE_REMOVE_AUTHENTICATED_MENU_ITEM_FAVORITE_FUNCTION,
            {
              p_restaurant_id: validation.value.restaurantId,
              p_menu_item_id: validation.value.menuItemId
            }
          );
    } catch {
      return transportWrite();
    }
    const errorResult = writeError(response.error, response.status);
    if (errorResult) return errorResult;
    try {
      const mapped = mapSupabaseFavoriteRpcResponse(response.data);
      if (!targetMatches(mapped.status === "already_absent" ? mapped.target : mapped.record.target, validation.value)) {
        return malformedWrite();
      }
      return mapped.status === "already_absent"
        ? { status: mapped.status, target: mapped.target, source: this.writeSource }
        : { status: mapped.status, record: mapped.record, source: this.writeSource };
    } catch (error) {
      return malformedWrite(error);
    }
  }
}

function targetMatches(left: ConsumerFavoriteTarget, right: ConsumerFavoriteTarget): boolean {
  if (left.kind !== right.kind || left.restaurantId !== right.restaurantId) return false;
  return left.kind === "restaurant" ||
    (right.kind === "menu_item" && left.menuItemId === right.menuItemId);
}

function writeError(
  error: SupabaseFavoriteErrorLike | null,
  status?: number
): ConsumerFavoriteWriteResult | null {
  if (!error) return null;
  const mapped = mapOperationError(error, status);
  return mapped instanceof ConsumerFavoriteAuthenticationRequiredError
    ? { status: "unauthenticated", source: "supabase", error: mapped }
    : { status: "write_failed", source: "supabase", error: mapped };
}

function mapOperationError(error: SupabaseFavoriteErrorLike, status?: number): ConsumerFavoriteRuntimeError {
  const effectiveStatus = status ?? error.status ?? undefined;
  if (effectiveStatus === 401 || error.code === "28000") return new ConsumerFavoriteAuthenticationRequiredError();
  if (effectiveStatus === 403 || error.code === "42501") return new ConsumerFavoritePermissionDeniedError();
  if (error.code) return new ConsumerFavoriteDatabaseFailedError();
  return new ConsumerFavoriteTransportFailedError();
}

function malformedWrite(error?: unknown): ConsumerFavoriteWriteResult {
  return {
    status: "write_failed",
    source: "supabase",
    error: error instanceof ConsumerFavoriteResponseMalformedError
      ? error
      : new ConsumerFavoriteResponseMalformedError()
  };
}

function transportWrite(): ConsumerFavoriteWriteResult {
  return { status: "write_failed", source: "supabase", error: new ConsumerFavoriteTransportFailedError() };
}

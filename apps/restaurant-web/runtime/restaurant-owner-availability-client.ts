import {
  isRecord, parsePreviewResult, isAvailability, isDecimalVersion,
  type Availability, type RestaurantOwnerAvailabilityPreview,
  type RestaurantOwnerAvailabilityMutationRequest
} from "./restaurant-owner-availability";

export const availabilityLabels: Record<Availability, string> = {
  available: "正常供應", limited: "供應有限", unavailable: "暫停供應"
};
export const availabilityConsequences: Record<Availability, string> = {
  available: "符合其他上架、售完與營養等規則時，可出現在公開餐點與下一餐推薦中。",
  limited: "符合其他規則時仍可出現在公開餐點中，但不符合下一餐推薦資格。",
  unavailable: "暫不符合公開餐點與下一餐推薦資格；餐點不會被刪除，上架狀態不變。"
};
export const availabilityFailureCopy = {
  unauthenticated: "工作階段無法驗證，請重新登入。",
  permission_denied: "目前帳號沒有此餐點的供應管理權限。",
  invalid_request: "供應變更資料無效，請重新確認。",
  target_not_found: "找不到可管理的分店餐點。",
  stale_state: "餐點狀態已變更，已重新讀取，請依最新狀態重新確認。",
  no_change: "餐點已是指定狀態，請重新確認。",
  dependency_unavailable: "正式供應服務目前無法使用。",
  internal_failure: "正式供應回應未通過安全檢查。"
} as const;
const statuses = {
  unauthenticated: 401, permission_denied: 403, target_not_found: 404,
  stale_state: 409, no_change: 422, invalid_request: 400,
  dependency_unavailable: 503, internal_failure: 500
} as const;

function failure(value: unknown, status: number): Exclude<RestaurantOwnerAvailabilityPreview, { state: "ready" }> {
  if (isRecord(value) && Object.keys(value).length === 1 && typeof value.state === "string"
    && Object.hasOwn(statuses, value.state)
    && statuses[value.state as keyof typeof statuses] === status) {
    return { state: value.state as keyof typeof statuses };
  }
  return { state: "internal_failure" };
}

function endpoint(branchId: string, branchMenuItemId: string): string {
  return `/api/restaurant/branches/${encodeURIComponent(branchId)}/menu-items/${encodeURIComponent(branchMenuItemId)}/availability`;
}

export async function previewAvailability(branchId: string, branchMenuItemId: string): Promise<RestaurantOwnerAvailabilityPreview> {
  try {
    const response = await fetch(endpoint(branchId, branchMenuItemId), {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }
    });
    const data: unknown = await response.json();
    if (response.status !== 200) return failure(data, response.status);
    const parsed = parsePreviewResult(data);
    if (parsed?.state !== "ready" || parsed.branchId !== branchId || parsed.branchMenuItemId !== branchMenuItemId) {
      return { state: "internal_failure" };
    }
    return parsed;
  } catch { return { state: "dependency_unavailable" }; }
}

export type AvailabilityOutcome = Readonly<{
  preview: RestaurantOwnerAvailabilityPreview;
  notice: string;
}>;

// Exactly one POST per confirmed action. Every ambiguous outcome is reconciled by GET.
export async function changeAvailability(
  current: Extract<RestaurantOwnerAvailabilityPreview, { state: "ready" }>,
  nextAvailability: Availability
): Promise<AvailabilityOutcome> {
  if (!isAvailability(nextAvailability) || nextAvailability === current.availability) {
    return { preview: current, notice: availabilityFailureCopy.no_change };
  }
  const request: RestaurantOwnerAvailabilityMutationRequest = {
    expectedAvailability: current.availability, nextAvailability,
    expectedVersion: current.availabilityVersion
  };
  let state: "applied" | keyof typeof statuses = "dependency_unavailable";
  try {
    const response = await fetch(endpoint(current.branchId, current.branchMenuItemId), {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    const data: unknown = await response.json();
    if (response.status === 200 && isRecord(data)
      && JSON.stringify(Object.keys(data).sort()) === JSON.stringify(["availability", "availabilityVersion", "branchMenuItemId", "state"])
      && data.state === "ready" && data.branchMenuItemId === current.branchMenuItemId
      && data.availability === nextAvailability && isDecimalVersion(data.availabilityVersion)) {
      state = "applied";
    } else state = failure(data, response.status).state;
  } catch { /* A lost response says nothing about whether the transaction committed. */ }

  if (state === "unauthenticated" || state === "permission_denied" || state === "target_not_found") {
    return { preview: { state }, notice: availabilityFailureCopy[state] };
  }
  const preview = await previewAvailability(current.branchId, current.branchMenuItemId);
  if (state === "stale_state") return { preview, notice: availabilityFailureCopy.stale_state };
  if (state === "invalid_request" || state === "no_change") return { preview, notice: availabilityFailureCopy[state] };
  if (preview.state === "ready" && preview.availability === nextAvailability) {
    return { preview, notice: `已重新讀取正式狀態：${availabilityLabels[preview.availability]}。` };
  }
  return { preview, notice: "已嘗試重新讀取正式狀態。請確認最新狀態後再明確操作；系統不會自動重送。" };
}

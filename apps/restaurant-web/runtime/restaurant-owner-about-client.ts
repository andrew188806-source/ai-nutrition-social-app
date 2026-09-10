import {
  isRestaurantAboutRecord, parseRestaurantAboutApiMutation, parseRestaurantAboutPreview,
  type RestaurantAboutFailure, type RestaurantAboutInput, type RestaurantAboutPreview
} from "./restaurant-owner-about";

const status = { unauthenticated: 401, permission_denied: 403, invalid_request: 400,
  target_not_found: 404, stale_state: 409, no_change: 422,
  dependency_unavailable: 503, internal_failure: 500 } as const;
const endpoint = "/api/restaurant/settings/about";
export const restaurantAboutFailureCopy: Record<RestaurantAboutFailure, string> = {
  unauthenticated: "工作階段無法驗證,請重新登入。",
  permission_denied: "目前帳號沒有此餐廳的店家介紹管理權限。",
  invalid_request: "店家介紹內容無效。",
  target_not_found: "找不到可管理的餐廳。",
  stale_state: "店家介紹已變更,已重新讀取;請重新確認。",
  no_change: "店家介紹未變更。",
  dependency_unavailable: "店家介紹服務目前無法使用。",
  internal_failure: "店家介紹回應未通過安全檢查。"
};
function failure(value: unknown, responseStatus: number): Readonly<{ state: RestaurantAboutFailure }> {
  return isRestaurantAboutRecord(value) && Object.keys(value).length === 1
    && typeof value.state === "string" && Object.hasOwn(status, value.state)
    && status[value.state as RestaurantAboutFailure] === responseStatus
    ? { state: value.state as RestaurantAboutFailure } : { state: "internal_failure" };
}
export async function previewRestaurantAbout(): Promise<RestaurantAboutPreview> {
  try {
    const response = await fetch(endpoint, { method: "GET", cache: "no-store",
      credentials: "same-origin", redirect: "error", headers: { Accept: "application/json" } });
    const value: unknown = await response.json();
    if (response.status !== 200) return failure(value, response.status);
    return parseRestaurantAboutPreview(value) ?? { state: "internal_failure" };
  } catch { return { state: "dependency_unavailable" }; }
}
export async function changeRestaurantAbout(
  current: Extract<RestaurantAboutPreview, { state: "ready" }>,
  input: RestaurantAboutInput
): Promise<Readonly<{ preview: RestaurantAboutPreview; notice: string }>> {
  let outcome: "applied" | RestaurantAboutFailure = "dependency_unavailable";
  let received = false;
  try {
    const response = await fetch(endpoint, { method: "POST", cache: "no-store",
      credentials: "same-origin", redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input) });
    const value: unknown = await response.json();
    received = true;
    if (response.status === 200) {
      const parsed = parseRestaurantAboutApiMutation(value);
      outcome = parsed?.state === "applied" && parsed.restaurantId === current.restaurantId
        ? "applied" : "internal_failure";
    } else outcome = failure(value, response.status).state;
  } catch {
    // One explicit mutation only. The authoritative reread resolves an uncertain result.
  }
  const preview = await previewRestaurantAbout();
  if (received && outcome !== "applied") return { preview, notice: restaurantAboutFailureCopy[outcome] };
  const intended = input.operation === "clear" ? null : input.nextRestaurantAbout;
  if (preview.state === "ready" && preview.restaurantId === current.restaurantId
    && preview.restaurantAbout === intended) {
    return { preview, notice: "已重新讀取正式店家介紹。" };
  }
  return { preview, notice: "已重新讀取正式資料;系統不會自動重送。請確認最新內容後再明確操作。" };
}

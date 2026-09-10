import {
  isPublicWebsiteRecord, parsePublicWebsiteApiMutation, parsePublicWebsitePreview,
  type PublicWebsiteFailure, type PublicWebsiteInput, type PublicWebsitePreview
} from "./restaurant-owner-public-website";

const status = { unauthenticated: 401, permission_denied: 403, invalid_request: 400,
  target_not_found: 404, stale_state: 409, no_change: 422,
  dependency_unavailable: 503, internal_failure: 500 } as const;
const endpoint = "/api/restaurant/settings/public-website";
export const publicWebsiteFailureCopy: Record<PublicWebsiteFailure, string> = {
  unauthenticated: "工作階段無法驗證，請重新登入。",
  permission_denied: "目前帳號沒有此餐廳的公開網站管理權限。",
  invalid_request: "公開網站網址無效。",
  target_not_found: "找不到可管理的餐廳。",
  stale_state: "公開網站已變更，已重新讀取；請重新確認。",
  no_change: "公開網站未變更。",
  dependency_unavailable: "正式公開網站服務目前無法使用。",
  internal_failure: "正式公開網站回應未通過安全檢查。"
};
function failure(value: unknown, responseStatus: number): Readonly<{ state: PublicWebsiteFailure }> {
  return isPublicWebsiteRecord(value) && Object.keys(value).length === 1
    && typeof value.state === "string" && Object.hasOwn(status, value.state)
    && status[value.state as PublicWebsiteFailure] === responseStatus
    ? { state: value.state as PublicWebsiteFailure } : { state: "internal_failure" };
}
export async function previewPublicWebsite(): Promise<PublicWebsitePreview> {
  try {
    const response = await fetch(endpoint, { method: "GET", cache: "no-store",
      credentials: "same-origin", redirect: "error", headers: { Accept: "application/json" } });
    const value: unknown = await response.json();
    if (response.status !== 200) return failure(value, response.status);
    return parsePublicWebsitePreview(value) ?? { state: "internal_failure" };
  } catch { return { state: "dependency_unavailable" }; }
}
export async function changePublicWebsite(
  current: Extract<PublicWebsitePreview, { state: "ready" }>,
  input: PublicWebsiteInput
): Promise<Readonly<{ preview: PublicWebsitePreview; notice: string }>> {
  let outcome: "applied" | PublicWebsiteFailure = "dependency_unavailable";
  let received = false;
  try {
    const response = await fetch(endpoint, { method: "POST", cache: "no-store",
      credentials: "same-origin", redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input) });
    const value: unknown = await response.json();
    received = true;
    if (response.status === 200) {
      const parsed = parsePublicWebsiteApiMutation(value);
      outcome = parsed?.state === "applied" && parsed.restaurantId === current.restaurantId
        ? "applied" : "internal_failure";
    } else outcome = failure(value, response.status).state;
  } catch {
    // One explicit mutation only. The authoritative reread resolves an uncertain result.
  }
  const preview = await previewPublicWebsite();
  if (received && outcome !== "applied") return { preview, notice: publicWebsiteFailureCopy[outcome] };
  const intended = input.operation === "clear" ? null : input.nextPublicWebsiteUrl;
  if (preview.state === "ready" && preview.restaurantId === current.restaurantId
    && preview.publicWebsiteUrl === intended) {
    return { preview, notice: "已重新讀取正式公開網站。" };
  }
  return { preview, notice: "已重新讀取正式資料；系統不會自動重送。請確認最新網址後再明確操作。" };
}

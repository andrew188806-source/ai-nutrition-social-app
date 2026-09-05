import { isRecord, parseMutation, parsePreview, type Failure, type Input, type Preview } from "./restaurant-owner-menu-item-display-name";

const status = { unauthenticated: 401, permission_denied: 403, invalid_request: 400, target_not_found: 404, stale_state: 409, no_change: 422, dependency_unavailable: 503, internal_failure: 500 } as const;
const endpoint = (branchId: string, branchMenuItemId: string) => `/api/restaurant/branches/${encodeURIComponent(branchId)}/menu-items/${encodeURIComponent(branchMenuItemId)}/display-name`;
export const displayNameFailureCopy: Record<Failure, string> = {
  unauthenticated: "工作階段無法驗證，請重新登入。", permission_denied: "目前帳號沒有此菜品的顯示名稱管理權限。", invalid_request: "顯示名稱資料無效。", target_not_found: "找不到可管理的分店餐點。", stale_state: "菜品顯示名稱已變更，已重新讀取；請重新確認。", no_change: "顯示名稱未變更。", dependency_unavailable: "正式顯示名稱服務目前無法使用。", internal_failure: "正式顯示名稱回應未通過安全檢查。"
};
function failure(value: unknown, responseStatus: number): Readonly<{ state: Failure }> {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.state === "string" && Object.hasOwn(status, value.state) && status[value.state as Failure] === responseStatus ? { state: value.state as Failure } : { state: "internal_failure" };
}

export async function previewMenuItemDisplayName(branchId: string, branchMenuItemId: string): Promise<Preview> {
  try {
    const response = await fetch(endpoint(branchId, branchMenuItemId), { method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error", headers: { Accept: "application/json" } });
    const value: unknown = await response.json();
    if (response.status !== 200) return failure(value, response.status);
    const parsed = parsePreview(value);
    return parsed?.state === "ready" && parsed.branchId === branchId && parsed.branchMenuItemId === branchMenuItemId ? parsed : { state: "internal_failure" };
  } catch { return { state: "dependency_unavailable" }; }
}

export async function changeMenuItemDisplayName(current: Extract<Preview, { state: "ready" }>, input: Input): Promise<Readonly<{ preview: Preview; notice: string }>> {
  let outcome: "applied" | Failure = "dependency_unavailable";
  try {
    const response = await fetch(endpoint(current.branchId, current.branchMenuItemId), { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const value: unknown = await response.json();
    if (response.status === 200) {
      const parsed = parseMutation(value);
      outcome = parsed?.state === "applied" && parsed.branchMenuItemId === current.branchMenuItemId ? "applied" : "internal_failure";
    } else outcome = failure(value, response.status).state;
  } catch { /* one explicit POST only */ }
  const preview = await previewMenuItemDisplayName(current.branchId, current.branchMenuItemId);
  if (outcome === "stale_state") return { preview, notice: displayNameFailureCopy.stale_state };
  if (outcome === "no_change") return { preview, notice: displayNameFailureCopy.no_change };
  const intended = input.operation === "clear" ? null : input.nextDisplayName;
  if (preview.state === "ready" && preview.branchSpecificDisplayName === intended) return { preview, notice: "已重新讀取正式菜品顯示名稱。" };
  return { preview, notice: "已重新讀取正式資料；系統不會自動重送。請確認最新名稱後再明確操作。" };
}

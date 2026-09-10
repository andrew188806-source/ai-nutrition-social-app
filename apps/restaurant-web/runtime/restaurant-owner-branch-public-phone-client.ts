import {
  isPublicPhoneRecord,
  parsePublicPhoneApiMutation,
  parsePublicPhonePreview,
  type PublicPhoneFailure,
  type PublicPhoneInput,
  type PublicPhonePreview
} from "./restaurant-owner-branch-public-phone";

const status = {
  unauthenticated: 401,
  permission_denied: 403,
  invalid_request: 400,
  target_not_found: 404,
  stale_state: 409,
  no_change: 422,
  dependency_unavailable: 503,
  internal_failure: 500
} as const;

const endpoint = (branchId: string) =>
  `/api/restaurant/branches/${encodeURIComponent(branchId)}/public-phone`;

export const publicPhoneFailureCopy: Record<PublicPhoneFailure, string> = {
  unauthenticated: "工作階段無法驗證，請重新登入。",
  permission_denied: "目前帳號沒有此分店的公開電話管理權限。",
  invalid_request: "公開電話資料無效。",
  target_not_found: "找不到可管理的分店。",
  stale_state: "公開電話已變更，已重新讀取；請重新確認。",
  no_change: "公開電話未變更。",
  dependency_unavailable: "正式公開電話服務目前無法使用。",
  internal_failure: "正式公開電話回應未通過安全檢查。"
};

function failure(value: unknown, responseStatus: number): Readonly<{ state: PublicPhoneFailure }> {
  return isPublicPhoneRecord(value)
    && Object.keys(value).length === 1
    && typeof value.state === "string"
    && Object.hasOwn(status, value.state)
    && status[value.state as PublicPhoneFailure] === responseStatus
    ? { state: value.state as PublicPhoneFailure }
    : { state: "internal_failure" };
}

export async function previewBranchPublicPhone(branchId: string): Promise<PublicPhonePreview> {
  try {
    const response = await fetch(endpoint(branchId), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json" }
    });
    const value: unknown = await response.json();
    if (response.status !== 200) return failure(value, response.status);
    const parsed = parsePublicPhonePreview(value);
    return parsed?.state === "ready" && parsed.branchId === branchId
      ? parsed
      : { state: "internal_failure" };
  } catch {
    return { state: "dependency_unavailable" };
  }
}

export async function changeBranchPublicPhone(
  current: Extract<PublicPhonePreview, { state: "ready" }>,
  input: PublicPhoneInput
): Promise<Readonly<{ preview: PublicPhonePreview; notice: string }>> {
  let outcome: "applied" | PublicPhoneFailure = "dependency_unavailable";
  let receivedResponse = false;
  try {
    const response = await fetch(endpoint(current.branchId), {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const value: unknown = await response.json();
    receivedResponse = true;
    if (response.status === 200) {
      const parsed = parsePublicPhoneApiMutation(value);
      outcome = parsed?.state === "applied" && parsed.branchId === current.branchId
        ? "applied"
        : "internal_failure";
    } else {
      outcome = failure(value, response.status).state;
    }
  } catch {
    // Exactly one explicit mutation request; the authoritative reread below resolves uncertainty.
  }
  const preview = await previewBranchPublicPhone(current.branchId);
  if (receivedResponse && outcome !== "applied") {
    return { preview, notice: publicPhoneFailureCopy[outcome] };
  }
  const intended = input.operation === "clear" ? null : input.nextPublicPhone;
  if (preview.state === "ready" && preview.publicPhone === intended) {
    return { preview, notice: "已重新讀取正式公開電話。" };
  }
  return { preview, notice: "已重新讀取正式資料；系統不會自動重送。請確認最新電話後再明確操作。" };
}

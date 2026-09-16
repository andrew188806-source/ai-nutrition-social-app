"use client";

import { useCallback, useState } from "react";
import { StepUpCard } from "./StepUpCard";
import { isReasonValid, submitMutation } from "./adminMutationClient";

type Entitlement = Readonly<{
  entitlementId: string;
  permissionKey: string;
  sourceType: string;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}>;
type Delegation = Readonly<{
  delegationId: string;
  permissionKey: string;
  canGrant: boolean;
  canRevoke: boolean;
  canSetTemporary: boolean;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}>;
type PrivilegedGrant = Readonly<{
  privilegedPermissionGrantId: string;
  permissionKey: string;
  status: string;
  statusVersion: number;
  createdAt: string;
}>;
type ConsoleAdmission = Readonly<{
  consoleAdmissionGrantId: string;
  status: string;
  statusVersion: number;
  createdAt: string;
}>;

export type StaffAuthority = Readonly<{
  entitlements: readonly Entitlement[];
  delegationsHeld: readonly Delegation[];
  privilegedGrants: readonly PrivilegedGrant[];
  consoleAdmissions: readonly ConsoleAdmission[];
}> | null;

const OPERATIONS = [
  { value: "suspend_staff_account", label: "停用此人員帳號" },
  { value: "reactivate_staff_account", label: "恢復此人員帳號" },
  { value: "revoke_staff_account", label: "撤銷此人員帳號（終局狀態）" },
  { value: "grant_console_admission", label: "授予主控台存取" },
  { value: "revoke_console_admission", label: "撤銷主控台存取" },
  { value: "grant_permission_delegation", label: "授予委派權限" },
  { value: "revoke_permission_delegation", label: "撤銷委派權限" },
  { value: "grant_privileged_permission", label: "授予高權限" },
  { value: "revoke_privileged_permission", label: "撤銷高權限" }
] as const;
type OperationValue = (typeof OPERATIONS)[number]["value"];

const REASON_HINT = "只能用小寫英文字母、數字與底線，例如 quarterly_access_review";

export function StaffAuthorityPanel({
  staffAccountId,
  initialStatus,
  initialStatusVersion,
  authority
}: {
  staffAccountId: string;
  initialStatus: "active" | "suspended" | "revoked";
  initialStatusVersion: number;
  authority: StaffAuthority;
}) {
  const [operation, setOperation] = useState<OperationValue>("suspend_staff_account");
  const [reasonCode, setReasonCode] = useState("");
  const [permissionKey, setPermissionKey] = useState("");
  const [targetId, setTargetId] = useState("");
  const [canGrant, setCanGrant] = useState(false);
  const [canRevoke, setCanRevoke] = useState(true);
  const [canSetTemporary, setCanSetTemporary] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const needsConfirmation = operation === "grant_privileged_permission"
    && permissionKey === "admin.management.staff.permission.write";
  const expectedPhrase = `GRANT admin.management.staff.permission.write TO ${staffAccountId}`;

  const submit = useCallback(async () => {
    if (!isReasonValid(reasonCode)) { setResult("原因代碼格式不正確。"); return; }
    setBusy(true);
    setResult(null);
    const requestId = crypto.randomUUID();
    const base = { reasonCode, requestId };
    let args: Record<string, unknown>;
    switch (operation) {
      case "suspend_staff_account":
      case "reactivate_staff_account":
      case "revoke_staff_account":
        args = { ...base, targetStaffAccountId: staffAccountId, expectedStatusVersion: initialStatusVersion };
        break;
      case "grant_console_admission":
        args = { ...base, targetStaffAccountId: staffAccountId };
        break;
      case "revoke_console_admission": {
        const active = authority?.consoleAdmissions.find((entry) => entry.status === "active");
        if (!active) { setResult("此帳號目前沒有可撤銷的主控台授權。"); setBusy(false); return; }
        args = { ...base, consoleAdmissionGrantId: active.consoleAdmissionGrantId, expectedStatusVersion: active.statusVersion };
        break;
      }
      case "grant_permission_delegation":
        args = {
          ...base, delegateStaffAccountId: staffAccountId, permissionKey,
          canGrant, canRevoke, canSetTemporary,
          effectiveFrom: new Date().toISOString(), effectiveUntil: null
        };
        break;
      case "revoke_permission_delegation": {
        const active = authority?.delegationsHeld.find((entry) => entry.delegationId === targetId);
        args = { ...base, delegationId: targetId, expectedStatusVersion: active ? 0 : 0 };
        break;
      }
      case "grant_privileged_permission":
        args = { ...base, targetStaffAccountId: staffAccountId, permissionKey, effectiveFrom: null, effectiveUntil: null };
        break;
      default: {
        const active = authority?.privilegedGrants.find((entry) => entry.privilegedPermissionGrantId === targetId);
        args = { ...base, privilegedPermissionGrantId: targetId, expectedStatusVersion: active?.statusVersion ?? 0 };
      }
    }
    const confirmation = needsConfirmation
      ? { targetStaffAccountId: staffAccountId, permissionKey, phrase: confirmPhrase }
      : undefined;
    const outcome = await submitMutation(operation, args, confirmation);
    setBusy(false);
    if (outcome.kind === "applied") {
      setResult("成功：操作已套用。頁面將重新整理。");
      window.setTimeout(() => window.location.reload(), 1200);
    } else if (outcome.kind === "rejected") {
      setResult(`遭拒絕：${outcome.errorCode}`);
    } else if (outcome.kind === "step_up_required") {
      setResult("Step-Up 已逾期或尚未完成，請重新驗證後再試一次。");
    } else {
      setResult(`失敗：${outcome.error}`);
    }
  }, [operation, reasonCode, permissionKey, targetId, canGrant, canRevoke, canSetTemporary, confirmPhrase, needsConfirmation, staffAccountId, initialStatusVersion, authority]);

  return (
    <div className="space-y-5">
      <StepUpCard />
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">執行高權限操作</h2>
        <p className="mt-1 text-xs text-slate-500">目前帳號狀態：{initialStatus} ／ status_version {initialStatusVersion}。所有操作皆需先完成上方 Step-Up。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">
            操作類型
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setOperation(event.target.value as OperationValue)}
              value={operation}
            >
              {OPERATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            原因代碼
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setReasonCode(event.target.value)}
              placeholder={REASON_HINT}
              value={reasonCode}
            />
          </label>
          {["grant_permission_delegation", "grant_privileged_permission"].includes(operation) ? (
            <label className="text-xs font-bold text-slate-700 sm:col-span-2">
              權限鍵值 (permission_key)
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                onChange={(event) => setPermissionKey(event.target.value)}
                placeholder="例如 admin.management.staff.account.write"
                value={permissionKey}
              />
            </label>
          ) : null}
          {operation === "grant_permission_delegation" ? (
            <div className="flex items-center gap-4 text-xs font-bold text-slate-700 sm:col-span-2">
              <label className="flex items-center gap-1"><input checked={canGrant} onChange={(event) => setCanGrant(event.target.checked)} type="checkbox" /> 可再授予</label>
              <label className="flex items-center gap-1"><input checked={canRevoke} onChange={(event) => setCanRevoke(event.target.checked)} type="checkbox" /> 可撤銷</label>
              <label className="flex items-center gap-1"><input checked={canSetTemporary} onChange={(event) => setCanSetTemporary(event.target.checked)} type="checkbox" /> 可設定臨時窗口</label>
            </div>
          ) : null}
          {["revoke_permission_delegation", "revoke_privileged_permission"].includes(operation) ? (
            <label className="text-xs font-bold text-slate-700 sm:col-span-2">
              目標 ID（delegationId 或 privilegedPermissionGrantId）
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                onChange={(event) => setTargetId(event.target.value)}
                value={targetId}
              />
            </label>
          ) : null}
          {needsConfirmation ? (
            <label className="text-xs font-bold text-rose-700 sm:col-span-2">
              強制確認片語（需完全一致）：<span className="font-mono">{expectedPhrase}</span>
              <input
                className="mt-1 w-full rounded-lg border border-rose-300 px-3 py-2 text-sm font-mono"
                onChange={(event) => setConfirmPhrase(event.target.value)}
                value={confirmPhrase}
              />
            </label>
          ) : null}
        </div>
        <button
          className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => void submit()}
          type="button"
        >
          送出操作
        </button>
        {result ? <p className="mt-3 text-sm text-slate-700">{result}</p> : null}
      </section>
    </div>
  );
}

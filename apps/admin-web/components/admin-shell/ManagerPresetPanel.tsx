"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MANAGER_PRESETS,
  type ManagerPreset
} from "../../auth/admin-manager-presets";
import {
  applyManagerPreset,
  computeManagerPresetDiff,
  managerPresetConfirmation,
  type PresetApplyResult,
  type PresetCatalogRow,
  type PresetEntitlement,
  type PresetSnapshot,
  type PresetUnavailableReason
} from "../../auth/admin-manager-preset-flow";
import { StepUpCard } from "./StepUpCard";
import { postJson, submitMutation } from "./adminMutationClient";

const STATUS = { complete: "已完整套用", partial: "部分已套用", not_applied: "尚未套用" } as const;
const UNAVAILABLE: Record<PresetUnavailableReason, string> = {
  ordinary_grant_required: "此權限不屬 P3F；需先由既有一般授權路徑授予",
  catalog_unavailable: "即時目錄不含此 CURRENT／active 權限，停止套用",
  not_p3f_eligible: "即時目錄標示此權限不適用 P3F，停止套用"
};

async function readPresetSnapshot(staffAccountId: string): Promise<PresetSnapshot | null> {
  const response = await postJson("/api/admin/management/staff/preset-preview", { staffAccountId });
  if (response.status !== 200 || response.body.ok !== true
    || !Array.isArray(response.body.entitlements) || !Array.isArray(response.body.catalog)) return null;
  return {
    entitlements: response.body.entitlements as PresetEntitlement[],
    catalog: response.body.catalog as PresetCatalogRow[]
  };
}

function resultText(result: PresetApplyResult): string {
  if (result.kind === "complete") return "模板所需權限已逐項核對完成。";
  if (result.kind === "step_up_required") return "Step-Up 尚未完成或已逾期。重新驗證後可從尚缺的權限接續。";
  if (result.reason === "self_target_denied") return "不可為自己的帳號套用權限模板。";
  if (result.reason === "permission_write_required") return "目前帳號沒有 P3F 權限授予權，僅可預覽。";
  if (result.reason === "console_admission_write_required") return "缺少 P3E 主控台授權管理權；請先由具備該權限的管理員處理。";
  if (result.reason === "confirmation_required") return "確認片語需與畫面文字完全一致。";
  if (result.reason === "prerequisite_or_catalog_unavailable") return "有未滿足的授權前提或即時目錄不相容，已停止，請先處理下方「不可用」項目。";
  const failure = result.failedPermission ? `停在 ${result.failedPermission}：` : "已停止：";
  return `${failure}${result.reason ?? "未知錯誤"}。修正後重新執行會先讀取最新權限，不會重複授予已生效項目。`;
}

export function ManagerPresetPanel({ staffAccountId, actorCanWrite, actorCanConsoleAdmission, selfTarget }: {
  staffAccountId: string;
  actorCanWrite: boolean;
  actorCanConsoleAdmission: boolean;
  selfTarget: boolean;
}) {
  const [presetId, setPresetId] = useState(MANAGER_PRESETS[0].id);
  const [snapshot, setSnapshot] = useState<PresetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState<readonly string[]>([]);
  const selected: ManagerPreset = MANAGER_PRESETS.find((item) => item.id === presetId) ?? MANAGER_PRESETS[0];
  const expectedPhrase = managerPresetConfirmation(selected, staffAccountId);
  const diff = snapshot ? computeManagerPresetDiff(selected, snapshot) : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSnapshot(await readPresetSnapshot(staffAccountId)); }
    catch { setSnapshot(null); }
    setLoading(false);
  }, [staffAccountId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const apply = useCallback(async () => {
    setRunning(true);
    setMessage(null);
    setApplied([]);
    try {
      const result = await applyManagerPreset({
        preset: selected, staffAccountId, confirmation, actorCanWrite, actorCanConsoleAdmission, selfTarget
      }, {
        readSnapshot: async () => {
          const fresh = await readPresetSnapshot(staffAccountId);
          setSnapshot(fresh);
          return fresh;
        },
        hasFreshStepUp: async () => {
          const response = await postJson("/api/admin/step-up/status", {});
          return response.status === 200 && response.body.ok === true && response.body.active === true;
        },
        grantConsoleAdmission: async (reasonCode) => {
          const outcome = await submitMutation("grant_console_admission", {
            targetStaffAccountId: staffAccountId, reasonCode, requestId: crypto.randomUUID()
          });
          if (outcome.kind === "applied") return { kind: "applied" };
          if (outcome.kind === "rejected") return { kind: "rejected", errorCode: outcome.errorCode };
          if (outcome.kind === "step_up_required") return { kind: "step_up_required" };
          return { kind: "failed", error: outcome.error };
        },
        grantPrivileged: async (permissionKey, reasonCode) => {
          const outcome = await submitMutation("grant_privileged_permission", {
            targetStaffAccountId: staffAccountId, permissionKey,
            effectiveFrom: null, effectiveUntil: null,
            reasonCode, requestId: crypto.randomUUID()
          });
          if (outcome.kind === "applied") return { kind: "applied" };
          if (outcome.kind === "rejected") return { kind: "rejected", errorCode: outcome.errorCode };
          if (outcome.kind === "step_up_required") return { kind: "step_up_required" };
          return { kind: "failed", error: outcome.error };
        }
      });
      setApplied(result.applied);
      setMessage(resultText(result));
    } catch {
      setMessage("套用流程未完成；請重新整理權限差異後重試。先前成功的個別授權不會自動撤銷。");
    } finally { setRunning(false); }
  }, [selected, staffAccountId, confirmation, actorCanWrite, actorCanConsoleAdmission, selfTarget]);

  return (
    <section className="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-5">
      <div>
        <h2 className="text-lg font-bold text-slate-950">經理級權限模板</h2>
        <p className="mt-1 text-xs text-slate-700">
          V1 模板只是應用層的逐項授權清單，不是資料庫角色或 Primary 替代品。每項授權仍由 P3F／P3H 獨立驗證與稽核。
          一次有效的 TOTP Step-Up 可在原有期限內完成連續授權；不提供一鍵移除，撤銷仍使用既有逐項控制。
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {MANAGER_PRESETS.map((item) => {
          const state = snapshot ? computeManagerPresetDiff(item, snapshot).state : null;
          return (
            <button
              aria-pressed={selected.id === item.id}
              className={`rounded-lg border p-3 text-left ${selected.id === item.id ? "border-sky-500 bg-white" : "border-slate-200 bg-slate-50"}`}
              disabled={running}
              key={item.id}
              onClick={() => { setPresetId(item.id); setConfirmation(""); setMessage(null); setApplied([]); }}
              type="button"
            >
              <span className="block text-sm font-bold text-slate-950">{item.label}</span>
              <span className="block text-xs text-slate-600">{item.description}</span>
              <span className="mt-1 block text-[11px] text-slate-500">v{item.version} · {item.permissionKeys.length} 項 · {state ? STATUS[state] : "等待讀取"}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-950">{selected.label}：權限差異</h3>
          <button className="rounded border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 disabled:opacity-50"
            disabled={loading || running} onClick={() => void refresh()} type="button">重新讀取即時權限</button>
        </div>
        {loading ? <p className="mt-2 text-xs text-slate-600">正在讀取即時權限與目錄…</p> : !diff ? (
          <p className="mt-2 text-xs text-amber-900" role="alert">無法讀取目標有效權限或目錄；模板套用已停用。請確認管理唯讀權限。</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <div><p className="text-xs font-bold text-emerald-800">已持有 ({diff.held.length})</p>
              <ul className="mt-1 space-y-1">{diff.held.map((key) => <li className="break-all font-mono text-[11px]" key={key}>{key}</li>)}</ul></div>
            <div><p className="text-xs font-bold text-sky-800">將由 P3F 逐項授予 ({diff.missing.length})</p>
              <ul className="mt-1 space-y-1">{diff.missing.map((key) => <li className="break-all font-mono text-[11px]" key={key}>{key}</li>)}</ul></div>
            <div><p className="text-xs font-bold text-indigo-800">將由 P3E 主控台授權 ({diff.consoleAdmission.length})</p>
              <ul className="mt-1 space-y-1">{diff.consoleAdmission.map((key) => <li className="break-all font-mono text-[11px]" key={key}>{key}</li>)}</ul>
              {diff.consoleAdmission.length > 0 && !actorCanConsoleAdmission ? <p className="mt-1 text-[11px] text-amber-900">目前操作者沒有 P3E 授權管理權，需先由有權者處理。</p> : null}
            </div>
            <div><p className="text-xs font-bold text-amber-800">不可用／前提未滿足 ({diff.unavailable.length})</p>
              <ul className="mt-1 space-y-2">{diff.unavailable.map((item) => (
                <li className="text-[11px] text-amber-900" key={item.key}><span className="break-all font-mono">{item.key}</span><br />{UNAVAILABLE[item.reason]}</li>
              ))}</ul>
              {diff.prerequisite === "primary_required" ? <p className="mt-2 text-xs text-amber-900">此模板只供已建立的 Primary；請先完成既有 Primary Wizard。</p> : null}
            </div>
          </div>
        )}
      </div>
      <StepUpCard />
      <label className="block text-xs font-bold text-slate-800">
        明確確認片語：<span className="break-all font-mono">{expectedPhrase}</span>
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          disabled={running} onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
      </label>
      {!actorCanWrite ? <p className="text-xs text-amber-900">目前僅可預覽；套用需要既有 P3F 權限授予權與可讀取的目標資料。</p> : null}
      {selfTarget ? <p className="text-xs text-amber-900">不可將模板套用到自己的帳號；P3F 的 self_target_denied 保持有效。</p> : null}
      <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        disabled={running || loading || !actorCanWrite || selfTarget || !diff
          || (diff.missing.length === 0 && diff.consoleAdmission.length === 0)
          || (diff.consoleAdmission.length > 0 && !actorCanConsoleAdmission)
          || diff.unavailable.length > 0 || diff.prerequisite !== null || confirmation !== expectedPhrase}
        onClick={() => void apply()} type="button">{running ? "逐項授權中…" : "套用模板（逐項授權）"}</button>
      {applied.length ? <p className="text-xs text-emerald-900">本次已成功且各自留存稽核：{applied.join("、")}</p> : null}
      {message ? <p className="text-sm text-slate-800" role="status">{message}</p> : null}
    </section>
  );
}

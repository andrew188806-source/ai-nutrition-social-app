"use client";

import { useCallback, useEffect, useState } from "react";
import { StepUpCard } from "./StepUpCard";
import { postJson, submitMutation } from "./adminMutationClient";

export const PRIMARY_READY_KEYS = [
  "admin.management.read",
  "admin.management.staff.read",
  "admin.management.permissions.read",
  "admin.management.staff.account.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
  "admin_context.read"
] as const;

type StepDefinition = Readonly<{
  key: (typeof PRIMARY_READY_KEYS)[number];
  label: string;
  run: (staffAccountId: string) => Promise<Awaited<ReturnType<typeof submitMutation>>>;
}>;

type StepState = "pending" | "done" | "active" | "error";

function reasonFor(step: string): string {
  return `primary_wizard_${step}`;
}

async function grantPrivileged(staffAccountId: string, permissionKey: string, confirmation?: Record<string, unknown>) {
  return submitMutation(
    "grant_privileged_permission",
    {
      targetStaffAccountId: staffAccountId, permissionKey,
      effectiveFrom: null, effectiveUntil: null,
      reasonCode: reasonFor(permissionKey.replace(/\./g, "_")),
      requestId: crypto.randomUUID()
    },
    confirmation
  );
}

function buildSteps(confirmPhrase: string): readonly StepDefinition[] {
  return [
    { key: "admin.management.read", label: "授予 admin.management.read（進入平台管理工作區）",
      run: (id) => grantPrivileged(id, "admin.management.read") },
    { key: "admin.management.staff.read", label: "授予 admin.management.staff.read（人員清單／詳情）",
      run: (id) => grantPrivileged(id, "admin.management.staff.read") },
    { key: "admin.management.permissions.read", label: "授予 admin.management.permissions.read（權限目錄／安全稽核）",
      run: (id) => grantPrivileged(id, "admin.management.permissions.read") },
    { key: "admin.management.staff.account.write", label: "授予 admin.management.staff.account.write（人員生命週期）",
      run: (id) => grantPrivileged(id, "admin.management.staff.account.write") },
    { key: "admin.management.staff.delegation.write", label: "授予 admin.management.staff.delegation.write（委派管理）",
      run: (id) => grantPrivileged(id, "admin.management.staff.delegation.write") },
    { key: "admin.management.staff.console_admission.write", label: "授予 admin.management.staff.console_admission.write（主控台授權管理）",
      run: (id) => grantPrivileged(id, "admin.management.staff.console_admission.write") },
    { key: "admin.management.staff.permission.write", label: "授予 admin.management.staff.permission.write（高權限管理，需強制確認片語）",
      run: (id) => grantPrivileged(id, "admin.management.staff.permission.write", {
        targetStaffAccountId: id, permissionKey: "admin.management.staff.permission.write", phrase: confirmPhrase
      }) },
    { key: "admin_context.read", label: "透過主控台授權（P3E）授予 admin_context.read",
      run: (id) => submitMutation("grant_console_admission", {
        targetStaffAccountId: id, reasonCode: reasonFor("console_admission"), requestId: crypto.randomUUID()
      }) }
  ];
}

type AuthorityEntitlement = Readonly<{ permissionKey: string; status: string }>;
type AuthoritySnapshot = Readonly<{ entitlements: readonly AuthorityEntitlement[] }> | null;

async function fetchAuthority(staffAccountId: string): Promise<AuthoritySnapshot> {
  const result = await postJson("/api/admin/management/staff/authority", { staffAccountId });
  if (result.status !== 200 || !result.body.ok) return null;
  return (result.body.authority ?? null) as AuthoritySnapshot;
}

function effectiveKeys(snapshot: AuthoritySnapshot): ReadonlySet<string> {
  if (!snapshot) return new Set();
  return new Set(snapshot.entitlements.filter((item) => item.status === "active").map((item) => item.permissionKey));
}

export function PrimaryWizard({ staffAccountId }: { staffAccountId: string }) {
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [effective, setEffective] = useState<ReadonlySet<string>>(new Set());
  const [stepStates, setStepStates] = useState<Readonly<Record<string, StepState>>>({});
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refreshEffective = useCallback(async () => {
    const snapshot = await fetchAuthority(staffAccountId);
    setEffective(effectiveKeys(snapshot));
    setLoaded(true);
  }, [staffAccountId]);

  useEffect(() => { void refreshEffective(); }, [refreshEffective]);

  const steps = buildSteps(confirmPhrase);
  const ready = PRIMARY_READY_KEYS.every((key) => effective.has(key));

  const runFrom = useCallback(async () => {
    setRunning(true);
    setMessage(null);
    await refreshEffective();
    let currentEffective = effectiveKeys(await fetchAuthority(staffAccountId));
    for (const step of steps) {
      if (currentEffective.has(step.key)) {
        setStepStates((prev) => ({ ...prev, [step.key]: "done" }));
        continue;
      }
      setStepStates((prev) => ({ ...prev, [step.key]: "active" }));
      const outcome = await step.run(staffAccountId);
      if (outcome.kind === "applied") {
        setStepStates((prev) => ({ ...prev, [step.key]: "done" }));
        currentEffective = effectiveKeys(await fetchAuthority(staffAccountId));
        setEffective(currentEffective);
        continue;
      }
      setStepStates((prev) => ({ ...prev, [step.key]: "error" }));
      if (outcome.kind === "step_up_required") {
        setMessage(`已停在「${step.label}」：Step-Up 已逾期，請於上方重新驗證後再次點擊「繼續精靈」，會從這一步接續，不會重來。`);
      } else if (outcome.kind === "rejected") {
        setMessage(`已停在「${step.label}」：遭拒絕（${outcome.errorCode}）。修正後可重新點擊「繼續精靈」。`);
      } else {
        setMessage(`已停在「${step.label}」：失敗（${outcome.error}）。`);
      }
      setRunning(false);
      return;
    }
    setMessage("已完成全部步驟。");
    setRunning(false);
    await refreshEffective();
  }, [steps, staffAccountId, refreshEffective]);

  return (
    <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-950">精靈：建立 Primary Permission Manager</h2>
        {loaded ? (
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${ready ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-600"}`}>
            {ready ? "PRIMARY READY" : `${PRIMARY_READY_KEYS.filter((k) => effective.has(k)).length}/${PRIMARY_READY_KEYS.length} 已完成`}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-slate-600">
        依序透過既有的 P3B／P3C／P3E／P3F／P3H 正式操作，逐項授予此人員成為 Primary 所需的八項權限；不建立任何資料庫超級角色。
        若中途 Step-Up 逾期，重新驗證後點「繼續精靈」即可從中斷的那一步接續，不會重複已完成的授予。
      </p>
      <StepUpCard />
      <label className="block text-xs font-bold text-rose-700">
        高權限確認片語（用於最後一步 permission.write，需完全一致）：
        <span className="font-mono"> GRANT admin.management.staff.permission.write TO {staffAccountId}</span>
        <input
          className="mt-1 w-full rounded-lg border border-rose-300 px-3 py-2 text-sm font-mono"
          onChange={(event) => setConfirmPhrase(event.target.value)}
          value={confirmPhrase}
        />
      </label>
      <ol className="space-y-2">
        {steps.map((step, index) => {
          const state: StepState = stepStates[step.key] ?? (effective.has(step.key) ? "done" : "pending");
          const cls = state === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : state === "active" ? "border-sky-300 bg-sky-50 text-sky-900"
              : state === "error" ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-slate-200 bg-white text-slate-600";
          return (
            <li className={`rounded-lg border px-3 py-2 text-sm ${cls}`} key={step.key}>
              {index + 1}. {step.label}
              {state === "done" ? " — 已完成" : state === "active" ? " — 執行中…" : state === "error" ? " — 停在此步" : ""}
            </li>
          );
        })}
      </ol>
      <button
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        disabled={running || ready}
        onClick={() => void runFrom()}
        type="button"
      >
        {ready ? "已全部完成" : "繼續精靈"}
      </button>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}

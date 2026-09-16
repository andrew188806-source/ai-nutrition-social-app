export async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  let parsed: Record<string, unknown> = {};
  try { parsed = await response.json(); } catch { /* non-JSON error body */ }
  return { status: response.status, body: parsed };
}

export function isReasonValid(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,79}$/.test(value);
}

export type MutationOutcome =
  | Readonly<{ kind: "applied"; result: Record<string, unknown> }>
  | Readonly<{ kind: "rejected"; errorCode: string; result: Record<string, unknown> }>
  | Readonly<{ kind: "step_up_required" }>
  | Readonly<{ kind: "failed"; error: string }>;

export async function submitMutation(
  operation: string,
  args: Record<string, unknown>,
  confirmation?: Record<string, unknown>
): Promise<MutationOutcome> {
  const payload: Record<string, unknown> = { operation, arguments: args };
  if (confirmation) payload.confirmation = confirmation;
  const response = await postJson("/api/admin/management/staff/mutations", payload);
  if (response.status === 403 && response.body.error === "step_up_required") {
    return { kind: "step_up_required" };
  }
  if (response.status !== 200 || !response.body.ok) {
    return { kind: "failed", error: String(response.body.error ?? "unknown_error") };
  }
  const inner = (response.body.result as Record<string, unknown> | undefined) ?? {};
  if (inner.outcome === "applied") return { kind: "applied", result: inner };
  const errorCode = String(inner.errorCode ?? "rejected");
  if (errorCode.startsWith("step_up_")) return { kind: "step_up_required" };
  return { kind: "rejected", errorCode, result: inner };
}

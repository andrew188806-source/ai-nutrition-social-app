import type { BillingEnvironment, NormalizedObservation } from "./types.ts";

// Strict structural validation of an adapter-produced observation. Unknown keys are rejected (nothing like a token, e-mail or raw payload can ride along); an unsupported KIND is NOT a validation failure here
// (it is quarantined with evidence by the database); a malformed observation is a contract violation by the adapter and is refused.
const KEYS = ["namespace", "environment", "deliveryId", "subjectRef", "payloadDigest", "kind", "periodStartMs", "periodEndMs", "signedAtMs", "bindingHash", "reasonCode"] as const;
const NAMESPACE = /^[a-z][a-z0-9_.-]{2,63}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const MIN_MS = Date.UTC(1, 0, 2);
const MAX_MS = Date.UTC(9999, 0, 1);

export type ValidationResult = { ok: true; value: NormalizedObservation } | { ok: false; code: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function validMs(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= MIN_MS && v <= MAX_MS;
}
function boundedText(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim() !== "" && v.length <= max;
}

export function validateObservation(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return { ok: false, code: "not_an_object" };
  const keys = Object.keys(raw);
  if (keys.length !== KEYS.length || !KEYS.every((k) => Object.prototype.hasOwnProperty.call(raw, k)) || keys.some((k) => !(KEYS as readonly string[]).includes(k))) {
    return { ok: false, code: "unexpected_shape" };
  }
  if (typeof raw.namespace !== "string" || !NAMESPACE.test(raw.namespace)) return { ok: false, code: "namespace_invalid" };
  if (raw.environment !== "sandbox" && raw.environment !== "production") return { ok: false, code: "environment_invalid" };
  if (!boundedText(raw.deliveryId, 200)) return { ok: false, code: "delivery_id_invalid" };
  if (!boundedText(raw.subjectRef, 200)) return { ok: false, code: "subject_ref_invalid" };
  if (typeof raw.payloadDigest !== "string" || !HEX64.test(raw.payloadDigest)) return { ok: false, code: "payload_digest_invalid" };
  if (!boundedText(raw.kind, 64)) return { ok: false, code: "kind_invalid" };
  const startNull = raw.periodStartMs === null, endNull = raw.periodEndMs === null;
  if (startNull !== endNull) return { ok: false, code: "period_pair_invalid" };
  if (!startNull) {
    if (!validMs(raw.periodStartMs) || !validMs(raw.periodEndMs)) return { ok: false, code: "period_not_whole_milliseconds" };
    if ((raw.periodEndMs as number) <= (raw.periodStartMs as number)) return { ok: false, code: "period_order_invalid" };
  }
  if (!validMs(raw.signedAtMs)) return { ok: false, code: "signed_at_invalid" };
  if (raw.bindingHash !== null && (typeof raw.bindingHash !== "string" || !HEX64.test(raw.bindingHash))) return { ok: false, code: "binding_hash_invalid" };
  if (raw.reasonCode !== null && (typeof raw.reasonCode !== "string" || raw.reasonCode.length > 64)) return { ok: false, code: "reason_code_invalid" };
  return {
    ok: true,
    value: Object.freeze({
      namespace: raw.namespace, environment: raw.environment as BillingEnvironment, deliveryId: raw.deliveryId as string, subjectRef: raw.subjectRef as string,
      payloadDigest: raw.payloadDigest, kind: raw.kind as string, periodStartMs: raw.periodStartMs as number | null, periodEndMs: raw.periodEndMs as number | null,
      signedAtMs: raw.signedAtMs as number, bindingHash: raw.bindingHash as string | null, reasonCode: raw.reasonCode as string | null
    })
  };
}

// Provider timestamps may carry finer precision than ENT0 accepts; the adapter floors BOTH bounds (so adjacent periods that share a boundary still meet). Exposed so every adapter uses the one rule.
export function floorToMs(valueMs: number): number {
  return Math.floor(valueMs);
}

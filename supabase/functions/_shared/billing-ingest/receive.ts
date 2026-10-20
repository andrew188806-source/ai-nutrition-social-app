import { classifyDbFailure, validateObservation } from "../billing-core/index.ts";
import type { NormalizedObservation } from "../billing-core/index.ts";
import type { BillingTransport, IngestConfig, Mapper, Verifier } from "./types.ts";

export type ReceiveDependencies = Readonly<{ config: IngestConfig; verify: Verifier; map: Mapper; transport: BillingTransport }>;

function reply(status: number, code: string): Response {
  // Generic bodies only: no echo of the payload, subject, owner or internal state.
  return new Response(JSON.stringify({ status: code }), { status, headers: { "content-type": "application/json" } });
}

async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

class RollbackSignal extends Error {}

// Ack-after-commit: a 2xx is returned only after every item of the delivery is durably stored in ONE transaction. Verification failure, a malformed observation or a disabled/unknown namespace store nothing.
// A repeated delivery id with different content keeps the first item, appends evidence (committed) and answers 409.
export async function receiveDelivery(request: Request, deps: ReceiveDependencies): Promise<Response> {
  if (request.method !== "POST") return reply(405, "method_not_allowed");
  if (!deps.config.enabled) return reply(503, "unavailable");
  const raw = await readCapped(request, deps.config.maxBodyBytes);
  if (raw === null) return reply(413, "payload_too_large");
  let verified;
  try { verified = await deps.verify(raw, request.headers); } catch { return reply(401, "unauthorized"); }
  if (!verified.ok) return reply(401, "unauthorized");
  let mapped: readonly NormalizedObservation[] | null;
  try { mapped = await deps.map(raw, verified.namespace); } catch { return reply(400, "unprocessable"); }
  if (mapped === null || mapped.length === 0) return reply(400, "unprocessable");
  const items: NormalizedObservation[] = [];
  for (const candidate of mapped) {
    const v = validateObservation(candidate);
    // the namespace is decided by the verification key/endpoint, never by the payload
    if (!v.ok || v.value.namespace !== verified.namespace) return reply(422, "unprocessable");
    items.push(v.value);
  }
  // deterministic order: concurrent deliveries that touch the same unique keys always lock them in the same order
  items.sort((a, b) => (a.subjectRef < b.subjectRef ? -1 : a.subjectRef > b.subjectRef ? 1 : a.deliveryId < b.deliveryId ? -1 : a.deliveryId > b.deliveryId ? 1 : 0));
  try {
    const outcomes = await deps.transport.transaction(async (tx) => {
      const seen: string[] = [];
      for (const item of items) {
        const r = await tx.ingestDelivery(item);
        if (r.outcome === "disabled" || r.outcome === "unknown_namespace") throw new RollbackSignal(r.outcome);
        seen.push(r.outcome);
      }
      return seen;
    });
    if (outcomes.includes("delivery_conflict")) return reply(409, "conflict");
    return reply(200, "received");
  } catch (e) {
    if (e instanceof RollbackSignal) return reply(503, "unavailable");
    const d = classifyDbFailure(e as { code?: string; message?: string });
    return reply(d.failure === "contract_violation" ? 500 : 503, "unavailable");
  }
}

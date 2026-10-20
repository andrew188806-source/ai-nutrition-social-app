import type { BillingTransport, Sha256Hex } from "./types.ts";

export type LinkDependencies = Readonly<{
  enabled: boolean;
  namespace: string;
  // Returns the verified actor (the caller's identity from the platform authentication, never from the request body) or null.
  authenticate: (request: Request) => Promise<{ userId: string } | null>;
  randomBindingValue: () => string; // server-issued, unguessable
  sha256Hex: Sha256Hex;
  now: () => number;
  ttlMs: number;
  transport: BillingTransport;
}>;

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Creates a purchase intent for the VERIFIED actor. The request may carry nothing: any body content (in particular an owner or a binding value) is refused, so a client can never choose the owner or the binding.
// The raw binding value is returned once to the caller for use in the purchase; only its hash is stored.
export async function createPurchaseIntent(request: Request, deps: LinkDependencies): Promise<Response> {
  if (request.method !== "POST") return reply(405, { status: "method_not_allowed" });
  if (!deps.enabled) return reply(503, { status: "unavailable" });
  const body = await request.text();
  if (body.trim() !== "" && body.trim() !== "{}") return reply(422, { status: "unprocessable" });
  const actor = await deps.authenticate(request);
  if (!actor || typeof actor.userId !== "string" || actor.userId === "") return reply(401, { status: "unauthorized" });
  const binding = deps.randomBindingValue();
  if (typeof binding !== "string" || binding.length < 32) return reply(500, { status: "unavailable" });
  try {
    const r = await deps.transport.transaction((tx) => tx.createLinkIntent(deps.namespace, actor.userId, deps.sha256Hex(binding), deps.now() + deps.ttlMs));
    if (r.outcome === "created") return reply(200, { status: "created", binding });
    return reply(r.outcome === "conflict" ? 409 : 503, { status: r.outcome === "conflict" ? "conflict" : "unavailable" });
  } catch {
    return reply(503, { status: "unavailable" });
  }
}

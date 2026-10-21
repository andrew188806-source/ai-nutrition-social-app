import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, randomBytes } from "node:crypto";

import { createPurchaseIntent } from "../_shared/billing-ingest/index.ts";
import type { BillingTransport } from "../_shared/billing-ingest/index.ts";
import { createDenoBillingTransport } from "../_shared/billing-transport/denoPostgresBillingTransport.ts";
import { jsonResponse, readCappedBody, unavailableResponse } from "../_shared/billing-transport/http.ts";
import type { ClosableBillingTransport } from "../_shared/billing-transport/sql.ts";
import { loadBillingLinkConfigFromEnvironment, type BillingLinkConfig, type BillingLinkConfigOutcome } from "./config.ts";

// The request may carry nothing but an empty JSON object, so a small hard cap on the ACTUAL body is enough and bounds what the library below may read.
export const BILLING_LINK_BODY_LIMIT = 256;

export type BillingLinkDependencies = Readonly<{
  loadConfig: () => BillingLinkConfigOutcome;
  // Returns the user verified by the platform authentication (never a value read from the request body) or null.
  authenticate: (request: Request, config: Pick<BillingLinkConfig, "supabaseUrl" | "supabaseAnonKey">) => Promise<{ userId: string } | null>;
  createTransport: (connectionUrl: string) => ClosableBillingTransport;
  randomBindingValue: () => string;
  sha256Hex: (utf8: string) => string;
  now: () => number;
}>;

// The ONLY identity this endpoint establishes is "the platform says this signed-in user is asking". That is NOT proof that the user owns any external payment subject: the purchase intent is a server-issued, hashed
// binding that a later provider package must see echoed by the provider before an identity link can ever activate. No provider binding mechanism is invented here.
async function authenticateWithPlatform(request: Request, config: Pick<BillingLinkConfig, "supabaseUrl" | "supabaseAnonKey">): Promise<{ userId: string } | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

export function createDefaultBillingLinkDependencies(): BillingLinkDependencies {
  return Object.freeze({
    loadConfig: loadBillingLinkConfigFromEnvironment,
    authenticate: authenticateWithPlatform,
    createTransport: createDenoBillingTransport,
    randomBindingValue: () => randomBytes(32).toString("hex"),
    sha256Hex: (utf8: string) => createHash("sha256").update(utf8, "utf8").digest("hex"),
    now: () => Date.now()
  });
}

// Order of refusals: not configured -> 503 (no body read, no authentication, no database); method; the ACTUAL body cap; the library's own checks (any body content is refused, so a client can never choose an owner or a
// binding); platform authentication; only then a database connection (lazy), closed again in every case.
export async function processBillingLinkRequest(request: Request, dependencies: BillingLinkDependencies): Promise<Response> {
  const config = dependencies.loadConfig();
  if (!config.ok) return unavailableResponse();
  if (request.method !== "POST") return jsonResponse(405, { status: "method_not_allowed" });
  const raw = await readCappedBody(request, BILLING_LINK_BODY_LIMIT);
  if (raw === null) return jsonResponse(413, { status: "payload_too_large" });
  // The library receives a request that carries only the (bounded) text it needs to refuse non-empty bodies; the original request is kept for its Authorization header.
  const bounded = new Request("http://billing.invalid/link", { method: "POST", body: new TextDecoder().decode(raw) });

  let created: ClosableBillingTransport | null = null;
  const lazy: BillingTransport = {
    transaction(fn) {
      created ??= dependencies.createTransport(config.value.ingressDbUrl);
      return created.transaction(fn);
    }
  };
  try {
    return await createPurchaseIntent(bounded, {
      enabled: true,
      namespace: config.value.namespace,
      authenticate: () => dependencies.authenticate(request, config.value),
      randomBindingValue: dependencies.randomBindingValue,
      sha256Hex: dependencies.sha256Hex,
      now: dependencies.now,
      ttlMs: config.value.ttlMs,
      transport: lazy
    });
  } catch {
    return unavailableResponse();
  } finally {
    if (created !== null) await (created as ClosableBillingTransport).close().catch(() => undefined);
  }
}

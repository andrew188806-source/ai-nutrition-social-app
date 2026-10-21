import { receiveDelivery } from "../_shared/billing-ingest/index.ts";
import type { BillingTransport, Mapper, Verifier } from "../_shared/billing-ingest/index.ts";
import { createDenoBillingTransport } from "../_shared/billing-transport/denoPostgresBillingTransport.ts";
import { unavailableResponse } from "../_shared/billing-transport/http.ts";
import type { ClosableBillingTransport } from "../_shared/billing-transport/sql.ts";
import { loadBillingWebhookConfigFromEnvironment, type BillingWebhookConfigOutcome } from "./config.ts";

// The provider boundary. A later package supplies a REAL adapter (signature scheme, field mapping, environment decision); this package ships none. The default production composition has NO adapter, so the
// entrypoint can never ingest anything; a synthetic adapter can only be handed to processBillingWebhookRequest by a test. There is no environment switch, header or code path that selects a verifier at runtime.
export type BillingWebhookAdapter = Readonly<{ verify: Verifier; map: Mapper }>;

export type BillingWebhookDependencies = Readonly<{
  loadConfig: () => BillingWebhookConfigOutcome;
  createTransport: (connectionUrl: string) => ClosableBillingTransport;
  adapter: BillingWebhookAdapter | null;
}>;

export function createDefaultBillingWebhookDependencies(): BillingWebhookDependencies {
  return Object.freeze({
    loadConfig: loadBillingWebhookConfigFromEnvironment,
    createTransport: createDenoBillingTransport,
    adapter: null
  });
}

// Order of refusals (each happens BEFORE the next resource is touched):
//   1. not configured / disabled -> 503   (no body read, no verifier, no database)
//   2. no adapter available      -> 503   (no body read, no database)
//   3. method, then the ACTUAL body size cap, then verification of the RAW bytes, mapping and validation (receiveDelivery)
//   4. only now a database connection is opened (lazily, on the first statement) and closed again in every case
// A 2xx is returned only after the delivery transaction is confirmed committed; a commit whose outcome is unknown is a 503, so the supplier redelivers and the database de-duplicates.
export async function processBillingWebhookRequest(request: Request, dependencies: BillingWebhookDependencies): Promise<Response> {
  const config = dependencies.loadConfig();
  if (!config.ok) return unavailableResponse();
  const adapter = dependencies.adapter;
  if (adapter === null) return unavailableResponse();

  let created: ClosableBillingTransport | null = null;
  const lazy: BillingTransport = {
    transaction(fn) {
      created ??= dependencies.createTransport(config.value.ingressDbUrl);
      return created.transaction(fn);
    }
  };
  try {
    return await receiveDelivery(request, { config: { enabled: true, maxBodyBytes: config.value.maxBodyBytes }, verify: adapter.verify, map: adapter.map, transport: lazy });
  } catch {
    return unavailableResponse();
  } finally {
    if (created !== null) await (created as ClosableBillingTransport).close().catch(() => undefined);
  }
}

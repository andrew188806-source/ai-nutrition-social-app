import {
  BILLING_ENV, MAX_BODY_BYTES_LIMIT, readBoundedInteger, readDatabaseUrl, readEnabled, unavailable,
  type ConfigOutcome, type ReadEnvironment
} from "../_shared/billing-transport/config.ts";

export type BillingWebhookConfig = Readonly<{ maxBodyBytes: number; ingressDbUrl: string }>;
export type BillingWebhookConfigOutcome = ConfigOutcome<BillingWebhookConfig>;

// ENT-F2: the webhook is closed unless EVERY value below is configured. Nothing here has a default: a missing switch, payload limit or database URL means "not configured" and the entrypoint answers 503 without touching
// the request body, a verifier or the database.
export function loadBillingWebhookConfig(read: ReadEnvironment): BillingWebhookConfigOutcome {
  if (!readEnabled(read)) return unavailable;
  const maxBodyBytes = readBoundedInteger(read, BILLING_ENV.maxBodyBytes, 1, MAX_BODY_BYTES_LIMIT);
  const ingressDbUrl = readDatabaseUrl(read, BILLING_ENV.ingressDbUrl);
  if (maxBodyBytes === null || ingressDbUrl === null) return unavailable;
  return { ok: true, value: Object.freeze({ maxBodyBytes, ingressDbUrl }) };
}

export function loadBillingWebhookConfigFromEnvironment(): BillingWebhookConfigOutcome {
  return loadBillingWebhookConfig((name) => Deno.env.get(name));
}

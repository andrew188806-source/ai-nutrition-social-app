import {
  BILLING_ENV, readDatabaseUrl, readEnabled, readNamespace, readText, unavailable,
  type ConfigOutcome, type ReadEnvironment
} from "../_shared/billing-transport/config.ts";

export const BILLING_PROCESS_SECRET_HEADER = "x-billing-process-secret" as const;
// Operational bound on one drain (not a policy value): the same kind of constant the push dispatcher uses.
export const BILLING_PROCESS_ITEM_LIMIT = 10 as const;
export const BILLING_PROCESS_SECRET_MIN_LENGTH = 32 as const;

export type BillingProcessConfig = Readonly<{ namespace: string; producerDbUrl: string; processSecret: string }>;
export type BillingProcessConfigOutcome = ConfigOutcome<BillingProcessConfig>;

// Closed unless every value is configured. The shared secret authenticates the scheduler (this is operational machinery, not a user endpoint); a missing or short secret closes the endpoint entirely.
export function loadBillingProcessConfig(read: ReadEnvironment): BillingProcessConfigOutcome {
  if (!readEnabled(read)) return unavailable;
  const namespace = readNamespace(read);
  const producerDbUrl = readDatabaseUrl(read, BILLING_ENV.producerDbUrl);
  const processSecret = readText(read, BILLING_ENV.processSecret);
  if (namespace === null || producerDbUrl === null || processSecret === null || processSecret.length < BILLING_PROCESS_SECRET_MIN_LENGTH) return unavailable;
  return { ok: true, value: Object.freeze({ namespace, producerDbUrl, processSecret }) };
}

export function loadBillingProcessConfigFromEnvironment(): BillingProcessConfigOutcome {
  return loadBillingProcessConfig((name) => Deno.env.get(name));
}

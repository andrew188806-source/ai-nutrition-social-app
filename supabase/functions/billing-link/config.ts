import {
  BILLING_ENV, LINK_TTL_SECONDS_LIMIT, PLATFORM_ENV, readBoundedInteger, readDatabaseUrl, readEnabled, readNamespace, readText, unavailable,
  type ConfigOutcome, type ReadEnvironment
} from "../_shared/billing-transport/config.ts";

export type BillingLinkConfig = Readonly<{
  namespace: string;
  ttlMs: number;
  ingressDbUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}>;
export type BillingLinkConfigOutcome = ConfigOutcome<BillingLinkConfig>;

// Closed unless every value is configured; no default for the switch, the namespace or the purchase-intent lifetime (the lifetime is a policy value the Owner/provider package decides; the bounds below are only structural).
export function loadBillingLinkConfig(read: ReadEnvironment): BillingLinkConfigOutcome {
  if (!readEnabled(read)) return unavailable;
  const namespace = readNamespace(read);
  const ttlSeconds = readBoundedInteger(read, BILLING_ENV.linkTtlSeconds, 1, LINK_TTL_SECONDS_LIMIT);
  const ingressDbUrl = readDatabaseUrl(read, BILLING_ENV.ingressDbUrl);
  const supabaseUrl = readText(read, PLATFORM_ENV.supabaseUrl);
  const supabaseAnonKey = readText(read, PLATFORM_ENV.supabaseAnonKey);
  if (namespace === null || ttlSeconds === null || ingressDbUrl === null || supabaseUrl === null || supabaseAnonKey === null) return unavailable;
  return { ok: true, value: Object.freeze({ namespace, ttlMs: ttlSeconds * 1000, ingressDbUrl, supabaseUrl, supabaseAnonKey }) };
}

export function loadBillingLinkConfigFromEnvironment(): BillingLinkConfigOutcome {
  return loadBillingLinkConfig((name) => Deno.env.get(name));
}

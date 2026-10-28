import { readDatabaseUrl, readText, unavailable, type ConfigOutcome, type ReadEnvironment } from "../_shared/billing-transport/config.ts";

// ENT-W1 environment. Only names are defined here; values live in deployment state. An absent or invalid value closes the endpoint (503) before any secret comparison or database connection.
export const RETENTION_RESOLVE_ENV = Object.freeze({
  enabled: "RETENTION_RESOLVE_ENABLED",
  resolverDbUrl: "RETENTION_RESOLVER_DB_URL",
  secret: "RETENTION_RESOLVE_SECRET"
} as const);
export const RETENTION_RESOLVE_SECRET_HEADER = "x-retention-resolve-secret" as const;
export const RETENTION_RESOLVE_SECRET_MIN_LENGTH = 32 as const;

export type RetentionResolveConfig = Readonly<{ resolverDbUrl: string; secret: string }>;
export type RetentionResolveConfigOutcome = ConfigOutcome<RetentionResolveConfig>;

// Only the exact text "true" enables.
export function loadRetentionResolveConfig(read: ReadEnvironment): RetentionResolveConfigOutcome {
  if (read(RETENTION_RESOLVE_ENV.enabled)?.trim() !== "true") return unavailable;
  const resolverDbUrl = readDatabaseUrl(read, RETENTION_RESOLVE_ENV.resolverDbUrl);
  const secret = readText(read, RETENTION_RESOLVE_ENV.secret);
  if (resolverDbUrl === null || secret === null || secret.length < RETENTION_RESOLVE_SECRET_MIN_LENGTH) return unavailable;
  return { ok: true, value: Object.freeze({ resolverDbUrl, secret }) };
}

export function loadRetentionResolveConfigFromEnvironment(): RetentionResolveConfigOutcome {
  return loadRetentionResolveConfig((name) => Deno.env.get(name));
}

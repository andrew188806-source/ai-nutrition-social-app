// ENT-F2 environment configuration primitives. Credential material and every switch live in deployment state; this module only NAMES the variables and validates what it is given. It never logs, echoes or returns a
// decomposed secret, and it applies no default for anything that is a policy decision (the switch, the namespace, the purchase-intent lifetime, the payload limit): an absent value means "not configured".
export const BILLING_ENV = Object.freeze({
  enabled: "BILLING_INGEST_ENABLED",
  namespace: "BILLING_NAMESPACE",
  maxBodyBytes: "BILLING_MAX_BODY_BYTES",
  ingressDbUrl: "BILLING_INGRESS_DB_URL",
  producerDbUrl: "BILLING_PRODUCER_DB_URL",
  processSecret: "BILLING_PROCESS_SECRET",
  linkTtlSeconds: "BILLING_LINK_TTL_SECONDS"
} as const);
// Provided by the platform to every Edge Function (the same names the other Consumer functions read).
export const PLATFORM_ENV = Object.freeze({ supabaseUrl: "SUPABASE_URL", supabaseAnonKey: "SUPABASE_ANON_KEY" } as const);

export type ReadEnvironment = (name: string) => string | undefined;
export type ConfigOutcome<T> = { ok: true; value: T } | { ok: false; errorCode: "server_unavailable" };
export const unavailable = { ok: false, errorCode: "server_unavailable" } as const;

export function readText(read: ReadEnvironment, name: string): string | null {
  const value = read(name)?.trim();
  return value ? value : null;
}
// Only the exact text "true" enables. Anything else (absent, empty, "1", "TRUE", "yes") is disabled.
export function readEnabled(read: ReadEnvironment): boolean {
  return read(BILLING_ENV.enabled)?.trim() === "true";
}
const NAMESPACE = /^[a-z][a-z0-9_.-]{2,63}$/;
export function readNamespace(read: ReadEnvironment): string | null {
  const v = readText(read, BILLING_ENV.namespace);
  return v !== null && NAMESPACE.test(v) ? v : null;
}
export function readBoundedInteger(read: ReadEnvironment, name: string, min: number, max: number): number | null {
  const v = readText(read, name);
  if (v === null || !/^[1-9][0-9]{0,9}$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
// A direct PostgreSQL connection for ONE dedicated database login role. Only the shape is checked here (scheme, user, password, host); which role it is, and what that role may do, is decided by the database.
export function readDatabaseUrl(read: ReadEnvironment, name: string): string | null {
  const raw = readText(read, name);
  if (raw === null) return null;
  try {
    const u = new URL(raw);
    const ok = (u.protocol === "postgres:" || u.protocol === "postgresql:") && decodeURIComponent(u.username) !== "" && u.password !== "" && u.hostname !== "" && u.hash === "";
    return ok ? raw : null;
  } catch { return null; }
}
export const MAX_BODY_BYTES_LIMIT = 1048576;
export const LINK_TTL_SECONDS_LIMIT = 604800;

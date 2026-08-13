// SR-1B-D2-B3 — Development-only Supavisor transaction transport configuration.
// Credential material remains deployment state. This module validates it without logging or
// returning any decomposed password field.

export const SOCIAL_RUNTIME_EXECUTOR_TRANSACTION_URL_ENV =
  "SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL" as const;
export const SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF = "msbgnnoorsoefuiwluye" as const;
export const SOCIAL_RUNTIME_SUPAVISOR_TRANSACTION_PORT = "6543" as const;

export type SocialRuntimeExecutorTransportConfig = Readonly<{
  connectionUrl: string;
}>;

export type SocialRuntimeExecutorTransportConfigOutcome =
  | { ok: true; value: SocialRuntimeExecutorTransportConfig }
  | {
      ok: false;
      errorCode:
        | "executor_transaction_url_missing"
        | "executor_transaction_url_invalid";
    };

export function loadSocialRuntimeExecutorTransportConfig(
  readEnvironment: (name: string) => string | undefined
): SocialRuntimeExecutorTransportConfigOutcome {
  const raw = readEnvironment(SOCIAL_RUNTIME_EXECUTOR_TRANSACTION_URL_ENV)?.trim();
  if (!raw) return { ok: false, errorCode: "executor_transaction_url_missing" };

  try {
    const parsed = new URL(raw);
    const username = decodeURIComponent(parsed.username);
    const expectedUsername = `social_runtime_executor.${SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF}`;
    const valid =
      (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") &&
      parsed.hostname.endsWith(".pooler.supabase.com") &&
      parsed.hostname !== "pooler.supabase.com" &&
      parsed.port === SOCIAL_RUNTIME_SUPAVISOR_TRANSACTION_PORT &&
      username === expectedUsername &&
      parsed.password.length > 0 &&
      parsed.pathname === "/postgres" &&
      parsed.hash === "" &&
      parsed.search === "";

    if (!valid) return { ok: false, errorCode: "executor_transaction_url_invalid" };
    return { ok: true, value: Object.freeze({ connectionUrl: raw }) };
  } catch {
    return { ok: false, errorCode: "executor_transaction_url_invalid" };
  }
}

// Postgres.js 3.4.7 consults these while parsing options, before it opens any connection, so the live
// command has to grant --allow-env for each of them. Derived from the driver source rather than
// guessed: eight come from `env['PG' + key.toUpperCase()]` over the defaults this adapter does not
// pin, plus PGAPPNAME (read unconditionally) and PGTARGETSESSIONATTRS (read by tsa(), spelled without
// underscores and distinct from PGTARGET_SESSION_ATTRS). Connection-authority names — PGHOST, PGPORT,
// PGUSER, PGUSERNAME, PGPASSWORD, PGDATABASE — are deliberately absent: the URL supplies every one of
// them, so the driver short-circuits before reading the environment.
export const SOCIAL_RUNTIME_POSTGRES_AMBIENT_ENV_NAMES = Object.freeze([
  "PGAPPNAME",
  "PGBACKOFF",
  "PGDEBUG",
  "PGFETCH_TYPES",
  "PGKEEP_ALIVE",
  "PGMAX_LIFETIME",
  "PGMAX_PIPELINE",
  "PGPUBLICATIONS",
  "PGTARGETSESSIONATTRS",
  "PGTARGET_SESSION_ATTRS"
] as const);

export type SocialRuntimeAmbientPgEnvironmentOutcome =
  | { ok: true }
  | {
      ok: false;
      errorCode: "ambient_pg_environment_present";
      presentNames: readonly string[];
    };

// Permission to READ a variable must never make it configuration authority. This fails closed on any
// ambient PG tuning variable so the sole connection authority stays the validated URL plus the frozen
// adapter options. It reports names only — never values.
export function assertNoAmbientPgEnvironment(
  readEnvironment: (name: string) => string | undefined
): SocialRuntimeAmbientPgEnvironmentOutcome {
  const presentNames = SOCIAL_RUNTIME_POSTGRES_AMBIENT_ENV_NAMES
    .filter((name) => (readEnvironment(name) ?? "").trim().length > 0);
  if (presentNames.length > 0) {
    return { ok: false, errorCode: "ambient_pg_environment_present", presentNames };
  }
  return { ok: true };
}

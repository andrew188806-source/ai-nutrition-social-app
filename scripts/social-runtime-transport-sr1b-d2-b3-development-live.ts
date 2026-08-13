// SR-1B-D2-B3 Development-only live acceptance. Run only through the dedicated package command;
// it receives the executor Supavisor URL from Deno.env and never prints the value or raw errors.
import {
  SocialRuntimeTransactionAbortedError,
  defineSocialRuntimeExecutorStatement
} from "../supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts";
import { createDenoSocialRuntimeExecutorTransport } from
  "../supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import { SOCIAL_RUNTIME_POSTGRES_OPTIONS } from
  "../supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import { assertNoAmbientPgEnvironment } from
  "../supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts";

type IdentityRow = {
  session_user: string;
  current_user: string;
  current_role: string;
  is_superuser: boolean;
  bypass_rls: boolean;
  inherits: boolean;
};
type MembershipRow = { social_authority: boolean; social_pair_read_authority: boolean };
type ValueRow = { value: unknown };

const IDENTITY = defineSocialRuntimeExecutorStatement<IdentityRow>`
  select session_user::text as session_user,
         current_user::text as current_user,
         current_role::text as current_role,
         role.rolsuper as is_superuser,
         role.rolbypassrls as bypass_rls,
         role.rolinherit as inherits
  from pg_catalog.pg_roles as role
  where role.rolname = current_user
`;
const MEMBERSHIPS = defineSocialRuntimeExecutorStatement<MembershipRow>`
  select pg_catalog.pg_has_role(current_user, 'social_authority', 'MEMBER') as social_authority,
         pg_catalog.pg_has_role(current_user, 'social_pair_read_authority', 'MEMBER') as social_pair_read_authority
`;
const ORDINARY = defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value`;
const SET_LOCAL_PROBE = defineSocialRuntimeExecutorStatement<ValueRow>`
  select pg_catalog.set_config('social_runtime.b3_probe', 'transaction-local-marker', true) as value
`;
const READ_LOCAL_PROBE = defineSocialRuntimeExecutorStatement<ValueRow>`
  select pg_catalog.current_setting('social_runtime.b3_probe', true) as value
`;
const FORCED_FAILURE = defineSocialRuntimeExecutorStatement<ValueRow>`select 1 / 0 as value`;

const protectedSelects = [
  { table: "taste_profiles", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.taste_profiles limit 1` },
  { table: "nutrition_goals", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.nutrition_goals limit 1` },
  { table: "dietary_restrictions", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.dietary_restrictions limit 1` },
  { table: "meal_records", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.meal_records limit 1` },
  { table: "meal_record_items", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.meal_record_items limit 1` },
  { table: "favorite_restaurants", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.favorite_restaurants limit 1` },
  { table: "favorite_menu_items", statement: defineSocialRuntimeExecutorStatement<ValueRow>`select 1 as value from public.favorite_menu_items limit 1` }
] as const;
const D1 = defineSocialRuntimeExecutorStatement<ValueRow>`
  select * from social_internal.authorized_candidates(null::uuid, '{}'::uuid[])
`;
const B1 = defineSocialRuntimeExecutorStatement<ValueRow>`
  select social_internal.authorized_pair_sources(null::uuid, '{}'::uuid[], 0, 0) as value
`;

const checks: Array<{ name: string; pass: boolean }> = [];
const record = (name: string, pass: boolean) => checks.push({ name, pass });
// The live command must grant --allow-env for the PG names Postgres.js reads while parsing options.
// Read permission is not configuration authority: this fails closed on any ambient PG variable BEFORE
// a driver exists, so the connection can only ever come from the validated URL plus the frozen adapter
// options. Reports names only, never values, and needs no transport close because none was built.
const ambientPgEnvironment = assertNoAmbientPgEnvironment((name) => Deno.env.get(name));
if (!ambientPgEnvironment.ok) {
  console.error(JSON.stringify({
    suite: "social-runtime-transport-sr1b-d2-b3-development-live",
    status: "failed",
    errorCode: ambientPgEnvironment.errorCode,
    ambientPgNamesPresent: ambientPgEnvironment.presentNames,
    ambientPgValuesPrinted: false,
    credentialValuePrinted: false,
    rawErrorPrinted: false,
    productionTouched: false
  }));
  Deno.exit(1);
}

const transport = createDenoSocialRuntimeExecutorTransport();
let fatalErrorCode: string | null = null;

async function denied(statement: typeof D1): Promise<boolean> {
  try {
    await transport.withTransaction((transaction) => transaction.query(statement));
    return false;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error &&
      (error as { code?: unknown }).code === "42501";
  }
}

try {
  const identity = (await transport.withTransaction((transaction) => transaction.query(IDENTITY)))[0];
  record("A. Supavisor transaction connection succeeds", Boolean(identity));
  record("B. session_user is social_runtime_executor", identity?.session_user === "social_runtime_executor");
  record("B2. current_user is the executor baseline", identity?.current_user === "social_runtime_executor");
  record("B3. current_role is the executor baseline", identity?.current_role === "social_runtime_executor");
  record("C. executor is not superuser", identity?.is_superuser === false);
  record("D. executor is not BYPASSRLS", identity?.bypass_rls === false);
  record("E. executor is NOINHERIT", identity?.inherits === false);

  const membership = (await transport.withTransaction((transaction) => transaction.query(MEMBERSHIPS)))[0];
  record("F. no social_authority membership", membership?.social_authority === false);
  record("G. no social_pair_read_authority membership", membership?.social_pair_read_authority === false);

  for (const probe of protectedSelects) {
    record(`H. direct SELECT denied: ${probe.table}`, await denied(probe.statement));
  }
  record("I. protected D1 invocation is denied", await denied(D1));
  record("J. protected D2-B1 invocation is denied", await denied(B1));

  const ordinary = await transport.withTransaction((transaction) => transaction.query(ORDINARY));
  record("K. ordinary transaction succeeds", ordinary[0]?.value === 1);

  let explicitRollback = false;
  try {
    await transport.withTransaction(async (transaction) => {
      await transaction.query(SET_LOCAL_PROBE);
      transaction.abort("development_explicit_rollback_probe");
    });
  } catch (error) {
    explicitRollback = error instanceof SocialRuntimeTransactionAbortedError;
  }
  record("L. explicit rollback is observed as an error", explicitRollback);
  const afterExplicit = (await transport.withTransaction((transaction) => transaction.query(READ_LOCAL_PROBE)))[0];
  record("L2. explicit rollback leaves no transaction-local marker", afterExplicit?.value !== "transaction-local-marker");

  let queryFailure = false;
  try {
    await transport.withTransaction(async (transaction) => {
      await transaction.query(SET_LOCAL_PROBE);
      await transaction.query(FORCED_FAILURE);
    });
  } catch {
    queryFailure = true;
  }
  record("M. query failure escapes and rolls back", queryFailure);
  const afterFailure = await transport.withTransaction(async (transaction) => ({
    identity: (await transaction.query(IDENTITY))[0],
    marker: (await transaction.query(READ_LOCAL_PROBE))[0]
  }));
  record("M2. pooled transport remains usable after failure", afterFailure.identity?.current_user === "social_runtime_executor");
  record("N. pooled transaction inherits no failed local marker", afterFailure.marker?.value !== "transaction-local-marker");

  await transport.withTransaction(async (transaction) => {
    await transaction.query(SET_LOCAL_PROBE);
  });
  const repeated = await transport.withTransaction(async (transaction) => ({
    identity: (await transaction.query(IDENTITY))[0],
    marker: (await transaction.query(READ_LOCAL_PROBE))[0]
  }));
  record("O. committed transaction-local state does not survive reuse", repeated.marker?.value !== "transaction-local-marker");
  record("O2. repeated transaction returns to executor identity", repeated.identity?.current_user === "social_runtime_executor");
  record("P. loaded adapter disables prepared statements for transaction pooling",
    SOCIAL_RUNTIME_POSTGRES_OPTIONS.prepare === false && SOCIAL_RUNTIME_POSTGRES_OPTIONS.max === 1);

} catch {
  fatalErrorCode = "development_acceptance_failed";
} finally {
  try {
    await transport.close();
  } catch {
    fatalErrorCode = "development_transport_close_failed";
  }
}

if (fatalErrorCode) {
  console.error(JSON.stringify({
    suite: "social-runtime-transport-sr1b-d2-b3-development-live",
    status: "failed",
    errorCode: fatalErrorCode,
    credentialValuePrinted: false,
    rawErrorPrinted: false,
    productionTouched: false
  }));
  Deno.exit(1);
}

const failures = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "social-runtime-transport-sr1b-d2-b3-development-live",
  status: failures.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((entry) => entry.name),
  target: "Development",
  transport: "Supavisor transaction mode",
  databaseIdentity: "social_runtime_executor",
  credentialValuePrinted: false,
  rawErrorPrinted: false,
  productionTouched: false
}, null, 2));
Deno.exit(failures.length ? 1 : 0);

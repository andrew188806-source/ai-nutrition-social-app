// ENT-W1 under the REAL Deno runtime, no database and NO network permission (run with --allow-env for the three ENT-W1 names only): any attempt to open a connection is refused by the runtime itself.
// Imports are the actual product modules of the isolated clone and the pinned npm:postgres@3.4.7 (loaded from the local Deno cache with --cached-only). Prints one JSON line `RESULT {...}`; exit 0 only if every check passes.
import postgres from "npm:postgres@3.4.7";
import { BillingCommitPhaseError } from "../../supabase/functions/_shared/billing-transport/executor.ts";
import { createDenoBillingDriver } from "../../supabase/functions/_shared/billing-transport/denoPostgresBillingTransport.ts";
import { AcquisitionCommitOutcomeUnknownError, AcquisitionShapeError, inAcquisitionTransaction, resolveItem } from "../../supabase/functions/_shared/acquisition-resolve/sql.ts";
import { ACQUISITION_SWEEP_LIMITS, runAcquisitionSweep } from "../../supabase/functions/_shared/acquisition-resolve/worker.ts";
import { RETENTION_RESOLVE_ENV, RETENTION_RESOLVE_SECRET_HEADER } from "../../supabase/functions/retention-acquisition-resolve/config.ts";
import { createDefaultRetentionResolveDependencies, processRetentionResolveRequest, type RetentionResolveDependencies } from "../../supabase/functions/retention-acquisition-resolve/handler.ts";

const checks: Record<string, { pass: boolean; observed: unknown }> = {};
const check = (id: string, pass: boolean, observed: unknown) => { checks[id] = { pass, observed }; };
const errInfo = (e: unknown) => ({ name: (e as Error)?.name ?? null, ctor: (e as object)?.constructor?.name ?? null, code: (e as { code?: unknown })?.code ?? null, message: String((e as Error)?.message ?? e).slice(0, 160) });
const SECRET = "s".repeat(40);
const URL_ = "postgres://w:pw@127.0.0.1:5999/x";
const setEnv = (v: Partial<Record<keyof typeof RETENTION_RESOLVE_ENV, string>>) => {
  for (const k of Object.keys(RETENTION_RESOLVE_ENV) as (keyof typeof RETENTION_RESOLVE_ENV)[]) { const name = RETENTION_RESOLVE_ENV[k]; if (v[k] === undefined) Deno.env.delete(name); else Deno.env.set(name, v[k] as string); }
};
// default dependencies, with createDriver/close counted around the REAL Deno driver
function countedDefaults() {
  const base = createDefaultRetentionResolveDependencies();
  const c = { created: 0, closed: 0, lastError: null as unknown };
  const deps: RetentionResolveDependencies = { ...base, createDriver: (url: string) => {
    c.created++; const d = base.createDriver(url);
    return { withTransaction: async (fn) => { try { return await d.withTransaction(fn); } catch (e) { c.lastError = e; throw e; } }, close: async () => { c.closed++; await d.close(); } };
  } };
  return { deps, c };
}
const call = async (method: string, secret: string | null) => {
  const { deps, c } = countedDefaults();
  const headers: Record<string, string> = {}; if (secret !== null) headers[RETENTION_RESOLVE_SECRET_HEADER] = secret;
  const res = await processRetentionResolveRequest(new Request("http://x/r", { method, headers }), deps);
  return { status: res.status, body: await res.json(), created: c.created, closed: c.closed, lastError: c.lastError === null ? null : errInfo(c.lastError) };
};

check("D01_RUNTIME_AND_PINNED_DRIVER", typeof postgres === "function" && typeof (postgres as unknown as { PostgresError?: unknown }).PostgresError === "function",
  { deno: Deno.version, postgresJs: "npm:postgres@3.4.7", hasPostgresError: typeof (postgres as unknown as { PostgresError?: unknown }).PostgresError });

// network permission state (the evidence that "no connection" below is enforced by the runtime, not only by the code path)
const netState = (await Deno.permissions.query({ name: "net", host: "127.0.0.1:5999" })).state;
check("D02_NO_NETWORK_PERMISSION", netState !== "granted", { net127_5999: netState });

setEnv({});
const off = await call("POST", SECRET);
setEnv({ enabled: "TRUE", resolverDbUrl: URL_, secret: SECRET });
const offCase = await call("POST", SECRET);
setEnv({ enabled: "true", resolverDbUrl: "", secret: SECRET });
const noUrl = await call("POST", SECRET);
setEnv({ enabled: "true", resolverDbUrl: URL_, secret: "short" });
const shortSecret = await call("POST", SECRET);
check("D03_DEFAULT_DISABLED_AND_UNCONFIGURED_CREATE_NO_DRIVER", [off, offCase, noUrl, shortSecret].every((x) => x.status === 503 && x.body.status === "unavailable" && x.created === 0),
  { off, offCase, noUrl, shortSecret });

setEnv({ enabled: "true", resolverDbUrl: URL_, secret: SECRET });
const wrong = await call("POST", "x".repeat(40));
const none = await call("POST", null);
const get = await call("GET", SECRET);
check("D04_WRONG_OR_MISSING_SECRET_AND_METHOD_CREATE_NO_DRIVER", wrong.status === 401 && none.status === 401 && get.status === 405 && [wrong, none, get].every((x) => x.created === 0), { wrong, none, get });

// the correct secret: exactly one REAL driver is created and closed; its first connection attempt is refused by the runtime (no net permission) BEFORE any COMMIT => an ordinary failure ('failed'), never 'unknown'
const ok = await call("POST", SECRET);
check("D05_CONNECTION_ONLY_AFTER_THE_SECRET_AND_A_PRE_COMMIT_FAILURE_IS_NOT_UNKNOWN",
  ok.created === 1 && ok.closed === 1 && ok.status === 503 && ok.body.status === "failed" && ok.body.commitOutcomeUnknown === false && ok.lastError !== null && !(ok.lastError as { name: string }).name.includes("Commit"),
  ok);
check("D06_RESPONSE_CARRIES_NO_ID_SECRET_OR_ERROR_TEXT", ![off, wrong, ok].some((x) => /[0-9a-f]{8}-[0-9a-f]{4}-|sssss|NotCapable|127\.0\.0\.1/.test(JSON.stringify(x.body))), { bodies: [off.body, wrong.body, ok.body] });

// the acquisition error types joined with the ENT-F2 commit-phase type, in this runtime (stub drivers only; the real-driver joins are the PG half)
const through = async (thrower: () => never) => { try { await inAcquisitionTransaction({ withTransaction: async () => thrower(), close: async () => {} }, async () => 1); return { threw: false } as const; } catch (e) { return { threw: true, e } as const; } };
const raw23505 = new Error("dup"); const rawEpipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" }); const body = new Error("body");
const definite = await through(() => { throw new BillingCommitPhaseError(raw23505, { code: "23505", severity: "ERROR" }); });
const unattested = await through(() => { throw new BillingCommitPhaseError(rawEpipe, null); });
const fatal = await through(() => { throw new BillingCommitPhaseError(raw23505, { code: "57P01", severity: "FATAL" }); });
const bodyErr = await through(() => { throw body; });
let shape: unknown = null; try { await resolveItem({ query: async () => [{ s: { outcome: "free", resource_id: "x", receipt: null } }] }, "x"); } catch (e) { shape = e; }
check("D07_ACQUISITION_ERROR_TYPES_JOIN_THE_ENT_F2_COMMIT_PHASE",
  definite.threw && definite.e === raw23505 && unattested.threw && unattested.e instanceof AcquisitionCommitOutcomeUnknownError && (unattested.e as AcquisitionCommitOutcomeUnknownError).commitFailure === rawEpipe
    && fatal.threw && fatal.e instanceof AcquisitionCommitOutcomeUnknownError && bodyErr.threw && bodyErr.e === body && shape instanceof AcquisitionShapeError,
  { definite: definite.threw ? errInfo(definite.e) : null, unattested: unattested.threw ? errInfo(unattested.e) : null, fatal: fatal.threw ? errInfo(fatal.e) : null, body: bodyErr.threw ? errInfo(bodyErr.e) : null, shape: errInfo(shape) });

// the real driver constructed directly: construction opens nothing; the sweep's first transaction fails before any COMMIT
const direct = createDenoBillingDriver(URL_);
const s = await runAcquisitionSweep(direct, ACQUISITION_SWEEP_LIMITS, () => Date.now());
await direct.close();
check("D08_REAL_DRIVER_SWEEP_WITHOUT_NETWORK_FAILS_DEFINITELY", s.status === "failed" && s.commitOutcomeUnknown === false && s.claims === 0, s);

setEnv({});
const all = Object.values(checks).every((c) => c.pass);
console.log("RESULT " + JSON.stringify({ status: all ? "PASS" : "FAIL", passed: Object.values(checks).filter((c) => c.pass).length, total: Object.keys(checks).length, checks }));
Deno.exit(all ? 0 : 1);

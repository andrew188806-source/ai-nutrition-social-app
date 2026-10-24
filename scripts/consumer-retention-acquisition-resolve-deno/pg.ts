// ENT-W1 sweep under the REAL Deno runtime with the REAL ENT-F2 driver (createDenoBillingDriver -> npm:postgres@3.4.7, ssl:'require') against the local test PostgreSQL. The orchestrator
// (tests/entw1-deno-pg.mjs, Node) prepares the database and checks the committed truth on an independent connection; this script only runs ONE sweep and reports what the product saw.
// Scenarios: normal | commit_abort | body_rollback (the database decides) | fatal_at_commit (an observer terminates the worker backend while its COMMIT runs) | transport_after_commit (a byte-level TCP proxy
// in front of PostgreSQL drops the client side of the connection while the COMMIT runs; the server finishes the COMMIT).
// usage: deno run --allow-net=127.0.0.1 --allow-env entw1-deno-pg.ts <scenario> <workerUrl> <adminUrl> <workerRole> <pgPort>
import postgres from "npm:postgres@3.4.7";
import { BillingCommitPhaseError, type BillingDriver } from "../../supabase/functions/_shared/billing-transport/executor.ts";
import { createDenoBillingDriver } from "../../supabase/functions/_shared/billing-transport/denoPostgresBillingTransport.ts";
import { runAcquisitionSweep } from "../../supabase/functions/_shared/acquisition-resolve/worker.ts";

const [scenario, workerUrlIn, adminUrl, workerRole, pgPort] = Deno.args;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const observed: Record<string, unknown> = {};

// byte-level proxy (TLS passes through untouched); kill() closes only the CLIENT side, the server side stays open until later so the server is not told anything while its COMMIT runs
type Pair = { client: Deno.Conn; upstream: Deno.Conn };
const pairs: Pair[] = [];
let proxy: Deno.Listener | null = null;
async function startProxy(): Promise<number> {
  proxy = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  (async () => { for await (const client of proxy!) { const upstream = await Deno.connect({ hostname: "127.0.0.1", port: Number(pgPort) }); pairs.push({ client, upstream });
    client.readable.pipeTo(upstream.writable).catch(() => {}); upstream.readable.pipeTo(client.writable).catch(() => {}); } })().catch(() => {});
  return (proxy.addr as Deno.NetAddr).port;
}
let workerUrl = workerUrlIn;
if (scenario === "transport_after_commit") { const p = await startProxy(); const u = new URL(workerUrlIn); u.port = String(p); workerUrl = u.toString(); observed.proxyPort = p; }

// the observer (superuser, plain TCP, test-only connection): waits for the worker's backend to be inside COMMIT, then acts
const admin = postgres(adminUrl, { ssl: false, max: 1, prepare: false, onnotice: () => {} });
let stopObserver = false;
const observer = (async () => {
  const seenSsl = new Set<string>();
  while (!stopObserver) {
    const rows = await admin.unsafe("select a.pid, a.state, a.query, s.ssl from pg_stat_activity a left join pg_stat_ssl s on s.pid = a.pid where a.usename = $1", [workerRole]).catch(() => []);
    for (const r of rows as unknown as { pid: number; state: string; query: string; ssl: boolean | null }[]) {
      seenSsl.add(String(r.ssl));
      if (r.state === "active" && /^\s*commit/i.test(r.query ?? "")) {
        if (scenario === "fatal_at_commit" && observed.terminated === undefined) { observed.terminated = (await admin.unsafe("select pg_terminate_backend($1) t", [r.pid]))[0]; observed.terminatedPid = r.pid; }
        if (scenario === "transport_after_commit" && observed.proxyKilled === undefined) { for (const p of pairs) { try { p.client.close(); } catch { /* closed */ } } observed.proxyKilled = { pairs: pairs.length, at: new Date().toISOString(), pid: r.pid }; }
      }
    }
    observed.sslSeen = [...seenSsl];
    await sleep(50);
  }
})();

// the product driver, with transaction count and commit-phase details recorded at the port boundary (nothing is changed)
const real = createDenoBillingDriver(workerUrl);
const commitFailures: unknown[] = [];
let transactions = 0;
const driver: BillingDriver = {
  async withTransaction(fn) { transactions++; try { return await real.withTransaction(fn); } catch (e) {
    if (e instanceof BillingCommitPhaseError) { const f = e.commitFailure as { constructor?: { name?: string }; code?: unknown; severity?: unknown; message?: unknown };
      commitFailures.push({ ctor: f?.constructor?.name ?? null, isPostgresError: f instanceof (postgres as unknown as { PostgresError: new () => Error }).PostgresError, code: f?.code ?? null, severity: f?.severity ?? null, message: String(f?.message ?? "").slice(0, 160), serverAnswer: e.serverAnswer }); }
    else observed.nonCommitError = { ctor: (e as object)?.constructor?.name ?? null, code: (e as { code?: unknown })?.code ?? null, message: String((e as Error)?.message ?? e).slice(0, 160) };
    throw e; } },
  close: () => real.close()
};
const started = Date.now();
const summary = await runAcquisitionSweep(driver, Object.freeze({ pageSize: 20, examine: 1000, maxItems: 50, maxClaims: 10, budgetMs: 60000 }), () => Date.now());
const ms = Date.now() - started;
await driver.close().catch((e) => { observed.closeError = String(e?.message ?? e); });
stopObserver = true; await observer;
await admin.end({ timeout: 2 });
if (proxy) { await sleep(8000); for (const p of pairs) { try { p.upstream.close(); } catch { /* closed */ } } (proxy as Deno.Listener).close(); }
console.log("RESULT " + JSON.stringify({ scenario, deno: Deno.version.deno, ms, transactions, summary, commitFailures, observed }));
Deno.exit(0);

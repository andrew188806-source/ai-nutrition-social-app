// ENT-F2 Deno/Postgres.js binding of the billing driver port. This is the ONLY driver-specific file: it is a thin binding with no logic of its own, and it has NOT been executed under Deno in this package (no Deno runtime
// was available): its behaviour is UNVERIFIED. The transaction/commit semantics that matter are defined by the port (executor.ts) and executed by the Node driver in the smoke against a real PostgreSQL.
//
// Postgres.js is loaded through the npm: convention already used by this repository's Edge Functions. Supavisor transaction mode cannot use prepared statements, so `prepare:false` is an invariant. One connection per
// request-scoped transport (`max: 1`); the connection is opened lazily by the first statement, never by construction.
import postgres from "npm:postgres@3.4.7";

import { BillingCommitPhaseError, type BillingDriver, type BillingSession } from "./executor.ts";
import { createBillingTransport, type ClosableBillingTransport } from "./sql.ts";

export const BILLING_POSTGRES_OPTIONS = Object.freeze({
  max: 1,
  prepare: false,
  ssl: "require" as const,
  connect_timeout: 10,
  idle_timeout: 20
});

export function createDenoBillingDriver(connectionUrl: string): BillingDriver {
  const sql = postgres(connectionUrl, BILLING_POSTGRES_OPTIONS);
  return {
    async withTransaction<T>(fn: (session: BillingSession) => Promise<T>): Promise<T> {
      let bodyFinished = false;
      try {
        // Postgres.js sends BEGIN, runs the callback, then COMMIT; it sends ROLLBACK when the callback or the commit throws. A failure AFTER the callback returned is a commit-phase failure.
        return (await sql.begin(async (transactionSql) => {
          const result = await fn({
            async query(text: string, parameters: readonly unknown[]): Promise<readonly Record<string, unknown>[]> {
              // `unsafe` takes explicit SQL text; all values stay separate protocol parameters and only the constant statements of sql.ts reach it.
              return (await transactionSql.unsafe(text, parameters as never[])) as unknown as readonly Record<string, unknown>[];
            }
          });
          bodyFinished = true;
          return result;
        })) as T;
      } catch (e) {
        if (bodyFinished) throw new BillingCommitPhaseError(e);
        throw e;
      }
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    }
  };
}

export function createDenoBillingTransport(connectionUrl: string): ClosableBillingTransport {
  return createBillingTransport(createDenoBillingDriver(connectionUrl));
}

// SR-1B-D2-B3 — Deno/Postgres.js binding for the server-only executor transaction substrate.
//
// Postgres.js is loaded through the same npm: convention already used by this repository's Edge
// Function. Supavisor transaction mode cannot use prepared statements, so `prepare: false` is an
// invariant rather than a performance preference. A one-connection application pool makes the live
// acceptance exercise actual reuse while Supavisor remains responsible for backend pooling.
import postgres from "npm:postgres@3.4.7";

import {
  SocialRuntimeExecutorTransport,
  type SocialRuntimeExecutorDriverTransaction,
  type SocialRuntimeExecutorTransactionDriver
} from "./executorTransactionTransport.ts";
import {
  loadSocialRuntimeExecutorTransportConfig,
  type SocialRuntimeExecutorTransportConfig
} from "./executorTransportConfig.ts";

export const SOCIAL_RUNTIME_POSTGRES_OPTIONS = Object.freeze({
  max: 1,
  prepare: false,
  ssl: "require" as const,
  connect_timeout: 10,
  idle_timeout: 20
});

function createDriver(config: SocialRuntimeExecutorTransportConfig): SocialRuntimeExecutorTransactionDriver {
  const sql = postgres(config.connectionUrl, SOCIAL_RUNTIME_POSTGRES_OPTIONS);

  return {
    async withTransaction<TResult>(
      operation: (transaction: SocialRuntimeExecutorDriverTransaction) => Promise<TResult>
    ): Promise<TResult> {
      // Postgres.js reserves one connection for this callback. It sends BEGIN before the callback,
      // COMMIT on success, ROLLBACK on every thrown query/callback/commit failure, then releases the
      // connection. Errors are deliberately allowed to escape unchanged.
      return await sql.begin(async (transactionSql) => {
        const transaction: SocialRuntimeExecutorDriverTransaction = {
          async queryObject<TRow extends Record<string, unknown>>(
            text: string,
            parameters: readonly unknown[]
          ): Promise<readonly TRow[]> {
            // `unsafe` here means the SQL text is supplied explicitly rather than as a JS template;
            // it is safe at this boundary because only opaque static statements can reach it and all
            // values remain separate protocol parameters. prepare:false prevents statement caching.
            const rows = await transactionSql.unsafe(text, parameters as never[]);
            return rows as unknown as readonly TRow[];
          }
        };
        return await operation(transaction);
      }) as TResult;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    }
  };
}

export function createDenoSocialRuntimeExecutorTransport(): SocialRuntimeExecutorTransport {
  const outcome = loadSocialRuntimeExecutorTransportConfig((name) => Deno.env.get(name));
  if (!outcome.ok) throw new Error(outcome.errorCode);
  return new SocialRuntimeExecutorTransport(createDriver(outcome.value));
}

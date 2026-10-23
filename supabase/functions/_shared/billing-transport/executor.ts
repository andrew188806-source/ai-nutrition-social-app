// ENT-F2 port between the billing SQL transport and a concrete Postgres driver. Nothing in this module knows a driver, an environment variable or a provider.
// The port exists so that the SQL text, the parameter mapping and the transaction/commit classification (sql.ts) can be executed against a real PostgreSQL by a Node driver, while the Deno driver stays a thin binding.
export interface BillingSession {
  // One statement with explicit parameters (an unnamed statement: the transport never relies on a server-side prepared statement). Rows come back as plain objects.
  query(text: string, parameters: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
}

export interface BillingDriver {
  // Runs BEGIN, `fn`, COMMIT on ONE connection.
  //  - `fn` throws: ROLLBACK is attempted and the SAME error is rethrown (the transaction is certainly not committed).
  //  - `fn` returned and the COMMIT step then failed for ANY reason: throw BillingCommitPhaseError(cause, serverAnswer). The driver cannot know whether the server committed unless the server itself answered the COMMIT
  //    with an error; only then does it pass `serverAnswer`.
  withTransaction<T>(fn: (session: BillingSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// The database server's own ErrorResponse to the COMMIT, as attested by the DRIVER from its own server-error type (never derived from the shape of an error object: a Node/socket error such as EPIPE or EBADF also
// carries a five-character code).
export type BillingServerCommitAnswer = Readonly<{ code: string; severity: string }>;

// Thrown by a driver when the failure happened at or after the COMMIT message was sent. It carries the original failure and, only when the driver recognised the failure as the server's ErrorResponse to the COMMIT,
// that answer. Without an attested server answer the transport treats the outcome as UNKNOWN (the database may have committed).
export class BillingCommitPhaseError extends Error {
  readonly commitFailure: unknown;
  readonly serverAnswer: BillingServerCommitAnswer | null;
  constructor(commitFailure: unknown, serverAnswer: BillingServerCommitAnswer | null = null) {
    super("BILLING_COMMIT_PHASE_FAILURE");
    this.name = "BillingCommitPhaseError";
    this.commitFailure = commitFailure;
    this.serverAnswer = serverAnswer === null ? null : Object.freeze({ code: serverAnswer.code, severity: serverAnswer.severity });
  }
}

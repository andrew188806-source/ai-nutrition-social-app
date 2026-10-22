// ENT-F2 port between the billing SQL transport and a concrete Postgres driver. Nothing in this module knows a driver, an environment variable or a provider.
// The port exists so that the SQL text, the parameter mapping and the transaction/commit classification (sql.ts) can be executed against a real PostgreSQL by a Node driver, while the Deno driver stays a thin binding.
export interface BillingSession {
  // One statement with explicit parameters (an unnamed statement: the transport never relies on a server-side prepared statement). Rows come back as plain objects.
  query(text: string, parameters: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
}

export interface BillingDriver {
  // Runs BEGIN, `fn`, COMMIT on ONE connection.
  //  - `fn` throws: ROLLBACK is attempted and the SAME error is rethrown (the transaction is certainly not committed).
  //  - `fn` returned and the COMMIT step then failed for ANY reason: throw BillingCommitPhaseError(cause). The driver cannot know whether the server committed.
  withTransaction<T>(fn: (session: BillingSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Thrown by a driver when the failure happened at or after the COMMIT message was sent. It carries the original failure so the transport can tell "the server answered the COMMIT with an error" (a definite abort)
// from "no answer" (the outcome is unknown).
export class BillingCommitPhaseError extends Error {
  readonly commitFailure: unknown;
  constructor(commitFailure: unknown) {
    super("BILLING_COMMIT_PHASE_FAILURE");
    this.name = "BillingCommitPhaseError";
    this.commitFailure = commitFailure;
  }
}

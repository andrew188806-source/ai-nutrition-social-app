// SR-1B-D2-B3 — server-only Social runtime transaction substrate.
//
// This module has no HTTP surface, Auth behavior, candidate input, Social authority activation or
// private-Taste query. It owns only a transaction callback boundary over the Development executor
// transport. A later server-only integration must add its own fixed statements and authorization;
// Mobile/application code must never import this module.

// The opaque statement constructor accepts one static template literal and no interpolations. This
// prevents request data from becoming SQL text and keeps every future statement visible to source
// review. Values travel separately as protocol parameters.
const executorStatementBrand: unique symbol = Symbol("social_runtime_executor_statement");
declare const executorStatementRows: unique symbol;

export type SocialRuntimeExecutorStatement<TRow extends Record<string, unknown>> = Readonly<{
  text: string;
  [executorStatementBrand]: true;
  [executorStatementRows]?: TRow;
}>;

export function defineSocialRuntimeExecutorStatement<TRow extends Record<string, unknown>>(
  parts: TemplateStringsArray
): SocialRuntimeExecutorStatement<TRow> {
  if (parts.length !== 1 || !Array.isArray(parts.raw) || !Object.isFrozen(parts) || !Object.isFrozen(parts.raw)) {
    throw new Error("social_runtime_executor_statement_must_be_static");
  }

  const text = parts[0].trim();
  if (text.length === 0 || text.includes("\0")) {
    throw new Error("social_runtime_executor_statement_invalid");
  }

  const withoutOptionalTerminator = text.endsWith(";") ? text.slice(0, -1) : text;
  if (withoutOptionalTerminator.includes(";")) {
    throw new Error("social_runtime_executor_statement_must_be_single");
  }

  return Object.freeze({ text, [executorStatementBrand]: true }) as SocialRuntimeExecutorStatement<TRow>;
}

export interface SocialRuntimeExecutorDriverTransaction {
  queryObject<TRow extends Record<string, unknown>>(
    text: string,
    parameters: readonly unknown[]
  ): Promise<readonly TRow[]>;
}

export interface SocialRuntimeExecutorTransactionDriver {
  // The driver contract is load-bearing: success commits, while a thrown callback/query/commit
  // error rolls the transaction back before the reserved pooled connection is released.
  withTransaction<TResult>(
    operation: (transaction: SocialRuntimeExecutorDriverTransaction) => Promise<TResult>
  ): Promise<TResult>;
  close(): Promise<void>;
}

export interface SocialRuntimeExecutorTransaction {
  query<TRow extends Record<string, unknown>>(
    statement: SocialRuntimeExecutorStatement<TRow>,
    parameters?: readonly unknown[]
  ): Promise<readonly TRow[]>;
  abort(reason?: string): never;
}

export class SocialRuntimeTransactionAbortedError extends Error {
  constructor(reason = "social_runtime_transaction_aborted") {
    super(reason);
    this.name = "SocialRuntimeTransactionAbortedError";
  }
}

export class SocialRuntimeExecutorTransport {
  readonly #driver: SocialRuntimeExecutorTransactionDriver;
  #activeTransactions = 0;
  #closed = false;

  constructor(driver: SocialRuntimeExecutorTransactionDriver) {
    this.#driver = driver;
  }

  async withTransaction<TResult>(
    operation: (transaction: SocialRuntimeExecutorTransaction) => Promise<TResult>
  ): Promise<TResult> {
    if (this.#closed) throw new Error("social_runtime_executor_transport_closed");
    if (typeof operation !== "function") throw new Error("social_runtime_executor_operation_required");

    this.#activeTransactions += 1;
    try {
      return await this.#driver.withTransaction(async (driverTransaction) => {
        let scopeActive = true;
        const transaction: SocialRuntimeExecutorTransaction = Object.freeze({
          query: async <TRow extends Record<string, unknown>>(
            statement: SocialRuntimeExecutorStatement<TRow>,
            parameters: readonly unknown[] = []
          ): Promise<readonly TRow[]> => {
            if (!scopeActive) throw new Error("social_runtime_executor_transaction_scope_closed");
            if (
              !statement ||
              typeof statement.text !== "string" ||
              statement[executorStatementBrand] !== true
            ) {
              throw new Error("social_runtime_executor_statement_required");
            }
            return await driverTransaction.queryObject<TRow>(statement.text, parameters);
          },
          abort: (reason?: string): never => {
            if (!scopeActive) throw new Error("social_runtime_executor_transaction_scope_closed");
            throw new SocialRuntimeTransactionAbortedError(reason);
          }
        });

        try {
          return await operation(transaction);
        } finally {
          // A captured callback scope cannot be reused after commit or rollback, even if the Deno
          // isolate and application-side pool both remain warm.
          scopeActive = false;
        }
      });
    } finally {
      this.#activeTransactions -= 1;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    if (this.#activeTransactions !== 0) {
      throw new Error("social_runtime_executor_transport_busy");
    }
    this.#closed = true;
    await this.#driver.close();
  }
}

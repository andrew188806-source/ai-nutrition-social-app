import "server-only";

type QueryResult<Row> = Readonly<{ rows: Row[] }>;
type PgPool = Readonly<{
  query: <Row>(text: string, values: readonly unknown[]) => Promise<QueryResult<Row>>;
}>;
type PoolConstructor = new (options: Readonly<Record<string, unknown>>) => PgPool;

const { Pool } = require("pg") as Readonly<{ Pool: PoolConstructor }>;

const BROKER_ENV = "TASTKIND_P3H_BROKER_DATABASE_URL" as const;
const OPERATION_CLASS = "staff_high_privilege_management_v1" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

let cached: Readonly<{ url: string; pool: PgPool }> | null = null;

function poolFor(env: NodeJS.ProcessEnv): PgPool | null {
  const url = env[BROKER_ENV]?.trim();
  if (!url) return null;
  if (cached?.url === url) return cached.pool;
  const pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    query_timeout: 5_000,
    options: "-c statement_timeout=5000 -c lock_timeout=3000"
  });
  cached = Object.freeze({ url, pool });
  return pool;
}

export type BrokerReceiptMetadata = Readonly<{
  receiptId: string;
  issuedAt: string;
  expiresAt: string;
  operationClass: typeof OPERATION_CLASS;
  stepUpMethod: "totp";
}>;

export type BrokerResult<T> =
  | Readonly<{ state: "ready"; value: T }>
  | Readonly<{ state: "unavailable" }>;

function validUuid(value: string): boolean { return UUID.test(value); }

// Read the same clock domain used by the receipt issuer immediately after the
// Auth TOTP challenge succeeds. A fast application clock must not place the
// verification timestamp in the database's future.
export async function readAdminStepUpDatabaseTime(
  env: NodeJS.ProcessEnv = process.env
): Promise<BrokerResult<string>> {
  const pool = poolFor(env);
  if (!pool) return Object.freeze({ state: "unavailable" as const });
  try {
    const result = await pool.query<{ verified_at: Date | string }>(
      "select pg_catalog.clock_timestamp() as verified_at", []
    );
    const timestamp = new Date(result.rows[0]?.verified_at);
    if (!Number.isFinite(timestamp.getTime())) return Object.freeze({ state: "unavailable" as const });
    return Object.freeze({ state: "ready" as const, value: timestamp.toISOString() });
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
}

export async function issueAdminStepUpReceipt(
  input: Readonly<{
    actorId: string;
    sessionId: string;
    secretHash: string;
    factorIdentifierHash: string;
    verifiedAt: string;
    requestId: string;
  }>,
  env: NodeJS.ProcessEnv = process.env
): Promise<BrokerResult<BrokerReceiptMetadata>> {
  const pool = poolFor(env);
  if (!pool || !validUuid(input.actorId) || !validUuid(input.sessionId)
    || !validUuid(input.requestId) || !HASH.test(input.secretHash)
    || !HASH.test(input.factorIdentifierHash)) return Object.freeze({ state: "unavailable" as const });
  try {
    const result = await pool.query<{
      receipt_id: string; issued_at: Date | string; expires_at: Date | string;
      operation_class: string; step_up_method: string;
    }>(
      "select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)",
      [input.actorId, input.sessionId, input.secretHash, input.factorIdentifierHash,
        input.verifiedAt, input.requestId]
    );
    const row = result.rows[0];
    if (!row || !validUuid(row.receipt_id)
      || row.operation_class !== OPERATION_CLASS || row.step_up_method !== "totp") {
      return Object.freeze({ state: "unavailable" as const });
    }
    return Object.freeze({ state: "ready" as const, value: Object.freeze({
      receiptId: row.receipt_id,
      issuedAt: new Date(row.issued_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      operationClass: OPERATION_CLASS,
      stepUpMethod: "totp" as const
    }) });
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
}

export async function readAdminStepUpReceiptStatus(
  input: Readonly<{ receiptId: string; actorId: string; sessionId: string; proofHash: string }>,
  env: NodeJS.ProcessEnv = process.env
): Promise<BrokerResult<Readonly<{ active: boolean; expiresAt: string | null; operationClass: string | null; stepUpMethod: string | null }>>> {
  const pool = poolFor(env);
  if (!pool || !validUuid(input.receiptId) || !validUuid(input.actorId)
    || !validUuid(input.sessionId) || !HASH.test(input.proofHash)) {
    return Object.freeze({ state: "unavailable" as const });
  }
  try {
    const result = await pool.query<{
      active: boolean; expires_at: Date | string | null;
      operation_class: string | null; step_up_method: string | null;
    }>("select * from admin_internal.staff_step_up_receipt_status_v1($1,$2,$3,$4)",
      [input.receiptId, input.actorId, input.sessionId, input.proofHash]);
    const row = result.rows[0];
    if (!row) return Object.freeze({ state: "unavailable" as const });
    return Object.freeze({ state: "ready" as const, value: Object.freeze({
      active: row.active === true,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      operationClass: row.operation_class,
      stepUpMethod: row.step_up_method
    }) });
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
}

export async function revokeAdminStepUpReceipt(
  input: Readonly<{ receiptId: string; actorId: string; sessionId: string }>,
  env: NodeJS.ProcessEnv = process.env
): Promise<BrokerResult<boolean>> {
  const pool = poolFor(env);
  if (!pool || !validUuid(input.receiptId) || !validUuid(input.actorId) || !validUuid(input.sessionId)) {
    return Object.freeze({ state: "unavailable" as const });
  }
  try {
    const result = await pool.query<{ revoked: boolean }>(
      "select admin_internal.staff_step_up_revoke_receipt_v1($1,$2,$3) revoked",
      [input.receiptId, input.actorId, input.sessionId]
    );
    return Object.freeze({ state: "ready" as const, value: result.rows[0]?.revoked === true });
  } catch {
    return Object.freeze({ state: "unavailable" as const });
  }
}

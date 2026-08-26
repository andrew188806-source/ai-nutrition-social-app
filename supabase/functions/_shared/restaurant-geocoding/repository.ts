import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type { GeocodeCompletionOutcome, GeocodeWorkItem } from "./types.ts";

// GEO-1C-P0 repository — the only path to the sealed resolution authority.
//
// Every method delegates to `geo_internal`. There is no coordinate arithmetic here, no staleness
// decision and no retry policy: the database owns all three, and re-deriving any of them in
// TypeScript would create a second answer that drifts from the one the CHECK constraints enforce.
const CLAIM = defineSocialRuntimeExecutorStatement<{ branch_id: string; source_address: string | null; address_fingerprint: string | null }>`select branch_id::text, source_address::text, address_fingerprint::text from geo_internal.claim_branch_geocodes($1::integer, $2::integer)`;
const COMPLETE = defineSocialRuntimeExecutorStatement<{ outcome: string }>`select geo_internal.complete_branch_geocode($1::text, $2::text, $3::numeric, $4::numeric, $5::text, $6::text) as outcome`;
const FAIL = defineSocialRuntimeExecutorStatement<{ outcome: string }>`select geo_internal.fail_branch_geocode($1::text, $2::text, $3::text) as outcome`;

const OUTCOMES: readonly GeocodeCompletionOutcome[] = Object.freeze([
  "resolved", "failed", "rejected_stale", "rejected_invalid", "not_found"
]);
const parseOutcome = (value: unknown): GeocodeCompletionOutcome =>
  typeof value === "string" && (OUTCOMES as readonly string[]).includes(value)
    ? value as GeocodeCompletionOutcome : "rejected_invalid";

export interface RestaurantGeocodeRepository {
  claim(limit: number, maxAttempts: number): Promise<readonly GeocodeWorkItem[]>;
  complete(item: GeocodeWorkItem, latitude: number, longitude: number, provider: string, providerRef: string | null): Promise<GeocodeCompletionOutcome>;
  fail(item: GeocodeWorkItem, errorCode: string): Promise<GeocodeCompletionOutcome>;
}

export class ExecutorRestaurantGeocodeRepository implements RestaurantGeocodeRepository {
  constructor(private readonly transport: SocialRuntimeExecutorTransport) {}

  async claim(limit: number, maxAttempts: number): Promise<readonly GeocodeWorkItem[]> {
    return await this.transport.withTransaction(async (tx) => {
      const rows = await tx.query(CLAIM, [limit, maxAttempts]);
      const items: GeocodeWorkItem[] = [];
      for (const row of rows) {
        // A claim with no address or no fingerprint is incoherent rather than resolvable: the
        // database only claims rows that have both, so anything else is dropped rather than guessed.
        if (!row.branch_id || !row.source_address || !row.address_fingerprint) continue;
        items.push(Object.freeze({
          branchId: row.branch_id,
          sourceAddress: row.source_address,
          addressFingerprint: row.address_fingerprint
        }));
      }
      return Object.freeze(items);
    });
  }

  async complete(item: GeocodeWorkItem, latitude: number, longitude: number, provider: string, providerRef: string | null) {
    return await this.transport.withTransaction(async (tx) => {
      // The fingerprint claimed alongside the address is presented back unchanged. The database
      // compares it against the row's CURRENT fingerprint and writes nothing if the address moved.
      const rows = await tx.query(COMPLETE, [
        item.branchId, item.addressFingerprint, latitude, longitude, provider, providerRef
      ]);
      return rows.length === 1 ? parseOutcome(rows[0].outcome) : "rejected_invalid";
    });
  }

  async fail(item: GeocodeWorkItem, errorCode: string) {
    return await this.transport.withTransaction(async (tx) => {
      const rows = await tx.query(FAIL, [item.branchId, item.addressFingerprint, errorCode]);
      return rows.length === 1 ? parseOutcome(rows[0].outcome) : "rejected_invalid";
    });
  }
}

import type { NormalizedObservation } from "../billing-core/index.ts";

// Dependency-injected boundary of the ingestion pipeline. NO Edge entrypoint, no config.toml entry and no public endpoint exist in this package: these functions are libraries driven by tests and, later, by a
// provider package that supplies a real Verifier/Mapper and a transport. Nothing in this module knows a provider.
export type VerifyOutcome = { ok: true; namespace: string } | { ok: false; reason: string };
// Receives the RAW request bytes and headers; must verify authenticity (signature, timestamp window, environment) BEFORE any parsing and must have no side effects.
export type Verifier = (raw: Uint8Array, headers: Headers) => Promise<VerifyOutcome>;
// Turns a verified payload into normalized observations (one per subject). null = unparsable.
export type Mapper = (raw: Uint8Array, namespace: string) => Promise<readonly NormalizedObservation[] | null>;

export type IngestResult = Readonly<{ outcome: string; item_id: string | null }>;
export type LinkResult = Readonly<{ outcome: string; link_id: string | null }>;
export type ProcessResult = Readonly<{ outcome: string; item_id: string | null; reason?: string | null }>;

// One database transaction. Every method runs inside the same BEGIN/COMMIT; a thrown error rolls the whole transaction back.
export interface BillingTx {
  ingestDelivery(o: NormalizedObservation): Promise<IngestResult>;
  createLinkIntent(namespace: string, ownerUserId: string, bindingHash: string, expiresAtMs: number): Promise<LinkResult>;
  nextCandidate(namespace: string): Promise<string | null>;
  processItem(itemId: string): Promise<ProcessResult>;
  recordAttempt(itemId: string, reason: string): Promise<ProcessResult>;
}
export interface BillingTransport {
  transaction<T>(fn: (tx: BillingTx) => Promise<T>): Promise<T>;
}

export type IngestConfig = Readonly<{ enabled: boolean; maxBodyBytes: number }>;
export type Sha256Hex = (utf8: string) => string;

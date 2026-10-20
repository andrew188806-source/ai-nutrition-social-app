// ENT-F1 provider-neutral core (pure: no I/O, no clock, no provider knowledge). An adapter (a later package) turns a VERIFIED provider payload into NormalizedObservation values; everything here only
// reasons about those values. What counts as Paid (grace, refund, trial ownership) is decided by the adapter and the Owner, never by this module.
export const OBSERVATION_KINDS = ["paid_period", "trial_period", "revocation", "non_entitling"] as const;
export type SupportedObservationKind = (typeof OBSERVATION_KINDS)[number];
export type BillingEnvironment = "sandbox" | "production";
export type LedgerClass = "paid" | "trial";

// kind is a free string on purpose: an unsupported kind must reach the database so it can be quarantined WITH evidence instead of being dropped here.
export type NormalizedObservation = Readonly<{
  namespace: string;
  environment: BillingEnvironment;
  deliveryId: string;
  subjectRef: string;
  payloadDigest: string; // sha-256 hex of the verified raw payload (never the payload)
  kind: string;
  periodStartMs: number | null;
  periodEndMs: number | null;
  signedAtMs: number;
  bindingHash: string | null; // sha-256 hex of a server-issued binding value, when the provider echoes one
  reasonCode: string | null;
}>;

// Half-open millisecond interval [start, end).
export type Interval = readonly [number, number];

export type NamespaceConfig = Readonly<{
  namespace: string;
  environment: BillingEnvironment;
  registeredAtMs: number; // copy of the ENT0 registry value recorded by the operator
  maxPeriodMs: number; // no default: the operator/adapter supplies it
}>;

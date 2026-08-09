// TS-6 — the SHARED TASTE ADAPTER authority.
//
// This layer adapts. It projects three frozen results into one minimal, privacy-safe,
// consumer-neutral shape and computes nothing: no similarity, no compatibility, no evidence support,
// no evidence readiness, no eligibility. Every number it emits was produced by a frozen layer and is
// copied through unchanged.
//
// It also decides nothing. Whether a pair should be surfaced, suppressed, ordered or acted on is
// consumer policy belonging to a runtime well above this contract, and no field here may stand in
// for that judgement.
//
// Independent version line. It owns the PROJECTION SHAPE — field grouping, which safe reason
// channels are exposed, and the input-coherence contract — and owns no scoring semantics whatsoever.
// A later change to the projection bumps this version alone.
export const SHARED_TASTE_ADAPTER_POLICY_VERSION = "shared-taste-adapter-v1" as const;

// Neutral adapter outcome. `adapted` says the three inputs cohered and were projected; it says
// nothing about the pair. There is deliberately no third value that a caller could read as approval.
export const SHARED_TASTE_ADAPTER_STATUSES = ["adapted", "unsupported"] as const;

// Why a projection could not be produced. These describe the ADAPTER'S OWN contract state — an
// uninterpretable snapshot, or three inputs that disagree about which policies produced them. They
// are not explanations about the pair, and no explanation vocabulary is invented here: every reason
// describing the users themselves is projected verbatim from a frozen layer.
export const SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS = [
  "unsupported_snapshot_schema",
  "policy_version_mismatch"
] as const;

export type SharedTasteAdapterStatusName = (typeof SHARED_TASTE_ADAPTER_STATUSES)[number];
export type SharedTasteAdapterUnsupportedReason = (typeof SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS)[number];
